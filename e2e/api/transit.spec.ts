import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { STUB_PORT } from "../../playwright.config";
import { expectOk, Player } from "../helpers";

// Buses and the metro (/api/transit, server/transit.ts) and the public data API (/api/v1) over
// the same data. The stops are the real ones built from OpenStreetMap (src/data/transit); IETT's
// live feed (Istanbul) answers from a stub here.
type Stop = { id: string; lat: number; lng: number; lines: string[] };
const net = (city: string) => JSON.parse(readFileSync(join(process.cwd(), `src/data/transit/${city}-bus.json`), "utf8")) as { stops: Stop[] };
const tehranStop = net("tehran").stops.find((s) => s.lines.length >= 2)!;
const istanbulStop = net("istanbul").stops.find((s) => s.lines.length >= 1)!;
const LINE = istanbulStop.lines[0];

let server: Server;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!req.url?.startsWith("/iett/iett/FiloDurum/SeferGerceklesme.asmx")) return void ((res.statusCode = 404), res.end());
      const method = /<(GetFiloAracKonum_json|GetHatOtoKonum_json)\b/.exec(body)?.[1];
      // A bus of the stop's first line ~1 km north of it, fresh.
      const now = new Date(Date.now() + 3 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
      const rows = method === "GetHatOtoKonum_json"
        ? [{ kapino: "T-100", enlem: String(istanbulStop.lat + 0.009), boylam: String(istanbulStop.lng), hatkodu: LINE, yon: "TEST", son_konum_zamani: now }]
        : [{ KapiNo: "T-100", Enlem: istanbulStop.lat + 0.009, Boylam: istanbulStop.lng, Hiz: 20, Saat: now.slice(11) }];
      const json = JSON.stringify(rows).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      res.setHeader("content-type", "text/xml");
      res.end(`<soap:Envelope><soap:Body><${method}Response><${method}Result>${json}</${method}Result></${method}Response></soap:Body></soap:Envelope>`);
    });
  });
  await new Promise<void>((ok) => server.listen(STUB_PORT, ok));
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

test.describe.configure({ mode: "serial" });

test("bus stops round a point with their lines; outside the cities there are none", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const r = expectOk(await p.get<{ city: string; stops: Stop[]; lines: Record<string, { headway: number }> }>(`/api/transit?stops=1&lat=${tehranStop.lat}&lng=${tehranStop.lng}`)).data;
  expect(r.city).toBe("tehran");
  expect(r.stops[0].id).toBe(tehranStop.id);
  for (const l of tehranStop.lines) expect(r.lines[l]?.headway).toBeGreaterThan(0);
  expect(expectOk(await p.get<{ stops: Stop[] }>("/api/transit?stops=1&lat=52.5&lng=13.4")).data.stops).toEqual([]);
  expect((await p.get("/api/transit?stops=1&lat=abc&lng=1")).status).toBe(400);
  await p.dispose();
});

test("a Tehran stop: each line about every N minutes (no live feed in Iran)", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const r = expectOk(await p.get<{ live: boolean; arrivals: { line: string; minutes: number | null; headway: number }[] }>(`/api/transit?stop=${tehranStop.id}&lat=${tehranStop.lat}&lng=${tehranStop.lng}`)).data;
  expect(r.live).toBe(false);
  expect(r.arrivals.map((a) => a.line).sort()).toEqual([...tehranStop.lines].sort());
  expect(r.arrivals.every((a) => a.minutes === null && a.headway > 0)).toBe(true);
  await p.dispose();
});

test("Istanbul: the buses live, and a stop's next bus from the nearest one of its line", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const live = expectOk(await p.get<{ live: boolean; buses: { id: string; lat: number }[] }>(`/api/transit?buses=1&lat=${istanbulStop.lat}&lng=${istanbulStop.lng}`)).data;
  expect(live.live).toBe(true);
  expect(live.buses.map((b) => b.id)).toContain("T-100");
  const r = expectOk(await p.get<{ live: boolean; arrivals: { line: string; minutes: number | null; live: boolean; towards?: string }[] }>(`/api/transit?stop=${istanbulStop.id}&lat=${istanbulStop.lat}&lng=${istanbulStop.lng}`)).data;
  expect(r.live).toBe(true);
  const a = r.arrivals.find((x) => x.line === LINE)!;
  // ~1 km ×1.4 at 17–20 km/h: 4–6 minutes.
  expect(a).toMatchObject({ live: true, towards: "TEST" });
  expect(a.minutes).toBeGreaterThanOrEqual(3);
  expect(a.minutes).toBeLessThanOrEqual(6);
  // Live buses are Istanbul's only: none in Tehran.
  expect(expectOk(await p.get<{ live: boolean; buses: unknown[] }>(`/api/transit?buses=1&lat=${tehranStop.lat}&lng=${tehranStop.lng}`)).data).toEqual({ live: false, buses: [] });
  await p.dispose();
});

test("the public data API: a key, its limit headers, the metro and stops, credited", async ({ baseURL, request }) => {
  const p = await Player.create(baseURL!);
  // No key: refused (the document and the source list are open).
  expect((await request.get("/api/v1/metro/tehran")).status()).toBe(401);
  expect((await request.get("/api/v1/openapi.json")).status()).toBe(200);
  const made = expectOk(await p.post<{ key: string; row: { id: string } }>("/api/developer", { name: "e2e" })).data;
  expect(made.key).toMatch(/^sq_live_/);
  const auth = { authorization: `Bearer ${made.key}` };
  const metro = await request.get("/api/v1/metro/tehran", { headers: auth });
  expect(metro.status()).toBe(200);
  expect(metro.headers()["x-ratelimit-limit"]).toBe("60");
  expect(metro.headers()["access-control-allow-origin"]).toBe("*");
  const m = (await metro.json()) as { data: { lines: { ref: string }[]; stations: unknown[] }; meta: { sources: { id: string }[] } };
  expect(m.data.lines.length).toBeGreaterThanOrEqual(5);
  expect(m.meta.sources.map((s) => s.id)).toEqual(["osm"]);
  const stops = (await (await request.get(`/api/v1/transit/stops?lat=${tehranStop.lat}&lng=${tehranStop.lng}&limit=5`, { headers: { "x-api-key": made.key } })).json()) as { data: { stops: Stop[] } };
  expect(stops.data.stops[0].id).toBe(tehranStop.id);
  expect((await request.get("/api/v1/metro/paris", { headers: auth })).status()).toBe(404);
  // Revoked: refused at once.
  expect((await p.ctx.delete(`/api/developer?id=${made.row.id}`)).status()).toBe(200);
  expect((await request.get("/api/v1/metro/tehran", { headers: auth })).status()).toBe(401);
  await p.dispose();
});
