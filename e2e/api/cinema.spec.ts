// Cinemas from cinematicket.org (server/cinema.ts) — read here from a stub (CINEMATICKET_URL
// in playwright.config.ts): the whole list in pages, the nearest first, each cinema's films
// and sessions today and tomorrow in toman; and /api/tts only ever speaks the game's own
// lines (with no speech service set up, it says so).
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { STUB_PORT } from "../../playwright.config";
import { BARKS, barkKey } from "../../src/lib/street/barks";
import { expectOk, Player } from "../helpers";

// Fixed and far from every random test spot (the server keeps the list a day; the e2e database is never wiped).
const HERE = { lat: 27.105, lng: 60.905 };
const inH = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().replace("Z", "+00:00");
let server: Server;
let sessionCalls = 0;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://stub");
    const send = (body: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)));
    if (u.pathname === "/ct/cinematicket/home/cinemas/") {
      // Two pages: the second has the nearest one; one cinema has no position (left out).
      if (!u.searchParams.get("cursor"))
        return send({
          next: `http://localhost:${STUB_PORT}/ct/cinematicket/home/cinemas/?cursor=p2&page_size=100`,
          results: [
            { id: 9001, name_fa: "سینما دور", address: "far", rate: 3.4, rate_count: 10, location: `SRID=4326;POINT (${HERE.lng + 0.1} ${HERE.lat})` },
            { id: 9002, name_fa: "سینما بی‌جا", address: "", location: null },
          ],
        });
      return send({ next: null, results: [{ id: 9003, name_fa: "سینما نزدیک", address: "near", rate: 4.1, rate_count: 99, location: { lat: HERE.lat + 0.001, long: HERE.lng } }] });
    }
    if (u.pathname === "/ct/movie/sessions/" && u.searchParams.get("cinema") === "9003") {
      sessionCalls++;
      return send({
        results: [
          { movie: { id: 1, name: "فیلم اول", poster: { desktop_url: "https://example.com/p1.jpg" } }, start_at: inH(3), cinema_hall: { name: "سالن ۱" }, min_price: 900000, session_type: "phy" },
          { movie: { id: 1, name: "فیلم اول", poster: null }, start_at: inH(2), cinema_hall: { name: "سالن VIP" }, min_price: 3600000, session_type: "phy" },
          { movie: { id: 2, name: "فیلم آنلاین", poster: null }, start_at: inH(2), cinema_hall: { name: "" }, min_price: 100000, session_type: "online" },
          { movie: { id: 3, name: "تمام شده", poster: null }, start_at: inH(-3), cinema_hall: { name: "سالن ۲" }, min_price: 900000, session_type: "phy" },
        ],
      });
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((ok) => server.listen(STUB_PORT, ok));
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

test.describe("cinemas", () => {
  test("the nearest cinemas from every page of the list; one without a position is left out", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const near = expectOk(await p.get<{ cinemas: { id: number; name: string; rate: number }[] }>(`/api/cinema?near=1&lat=${HERE.lat}&lng=${HERE.lng}`)).data.cinemas;
    expect(near.map((c) => c.id)).toEqual([9003, 9001]);
    expect(near[0]).toMatchObject({ name: "سینما نزدیک", rate: 4.1 });
  });

  test("a cinema's films: soonest first, in toman, VIP halls marked, nothing past or online — and cached", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const r = expectOk(await p.get<{ cinema: { id: number } | null; films: { id: number; name: string; showings: { hall: string; toman: number; vip: boolean }[] }[] }>("/api/cinema?id=9003")).data;
    expect(r.cinema?.id).toBe(9003);
    expect(r.films.map((f) => f.id)).toEqual([1]);
    expect(r.films[0].showings).toEqual([
      expect.objectContaining({ hall: "سالن VIP", toman: 360000, vip: true }),
      expect.objectContaining({ hall: "سالن ۱", toman: 90000, vip: false }),
    ]);
    const calls = sessionCalls;
    expectOk(await p.get("/api/cinema?id=9003"));
    expect(sessionCalls).toBe(calls);
  });

  test("bad questions are refused; signed out, nothing", async ({ baseURL, request }) => {
    const p = await Player.create(baseURL!);
    expect((await p.get("/api/cinema?id=abc")).status).toBe(400);
    expect((await request.get(`${baseURL}/api/cinema?id=9003`)).status()).toBe(401);
  });
});

test.describe("spoken lines", () => {
  test("only the game's own lines, at their own address; no speech service: a short-lived no", async ({ request, baseURL }) => {
    const b = BARKS[0];
    expect((await request.get(`${baseURL}/api/tts?id=${b.id}&v=m&k=wrong`)).status()).toBe(400);
    expect((await request.get(`${baseURL}/api/tts?id=nope&v=m&k=x`)).status()).toBe(400);
    expect((await request.get(`${baseURL}/api/tts?id=copStop-1&v=f&k=${barkKey(BARKS.find((x) => x.id === "copStop-1")!, "f")}`)).status()).toBe(400);
    const r = await request.get(`${baseURL}/api/tts?id=${b.id}&v=m&k=${barkKey(b, "m")}`);
    // (Its cache header — a short-lived no, a year for a spoken line — only shows in production: next dev sends no-store.)
    expect(r.status()).toBe(404);
  });
});
