// Vasatyab: the party's meeting point from where its members are, pinned as the gather point.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type Mid = {
  none?: boolean;
  point: LatLng | null;
  members: { userId: string; me: boolean; lat: number | null; distM: number | null }[];
  maxM: number;
  places: unknown[];
  meet: (LatLng & { name: string }) | null;
};

async function homePlayer(baseURL: string, at: LatLng) {
  const p = await Player.create(baseURL);
  expectOk(await p.post("/api/me", { remotePlay: true }, "PATCH"));
  await p.goTo(at);
  expectOk(await p.post("/api/drive", { ...at, yaw: 0, speed: 0, vehicle: "car" }));
  return p;
}

test.describe("Vasatyab", () => {
  test("not in a party: nothing to find", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const r = await p.get<Mid>("/api/party/midpoint");
    expect(r.status).toBe(200);
    expect(r.data.none).toBe(true);
    expect((await p.post("/api/party/midpoint", { action: "set", lat: 1, lng: 1 })).status).toBe(400);
    await p.dispose();
  });

  test("the middle of three members, per-member distances, gather point shared with the party", async ({ baseURL }) => {
    const here = randomSpot();
    const [a, b, c] = await Promise.all([homePlayer(baseURL!, here), homePlayer(baseURL!, offset(here, 0, 1000)), homePlayer(baseURL!, offset(here, 800, 500))]);
    expectOk(await a.post("/api/party", { action: "create", sim: true }));
    const code = (await a.get<{ party: { code: string } }>("/api/party")).data.party.code;
    expectOk(await b.post("/api/party", { action: "join", code, sim: true }));
    expectOk(await c.post("/api/party", { action: "join", code, sim: true }));

    for (const method of ["median", "centroid", "fairest"]) {
      const r = await a.get<Mid>(`/api/party/midpoint?method=${method}`);
      expect(r.status).toBe(200);
      expect(r.data.members).toHaveLength(3);
      expect(r.data.point).toBeTruthy();
      expect(r.data.members.every((m) => m.distM != null && m.distM < 1200)).toBe(true);
      expect(r.data.maxM).toBeGreaterThan(0);
    }
    // The lite poll leaves out the places.
    expect((await a.get<Mid>("/api/party/midpoint?lite=1")).data.places).toEqual([]);

    const mid = (await a.get<Mid>("/api/party/midpoint")).data.point!;
    expect((await b.post("/api/party/midpoint", { action: "set", lat: mid.lat, lng: mid.lng, name: "Test Café" })).status).toBe(200);
    const seen = (await c.get<Mid>("/api/party/midpoint")).data;
    expect(seen.meet?.name).toBe("Test Café");
    expect(seen.meet?.lat).toBeCloseTo(mid.lat, 5);

    // Gather: my game position moves to the point.
    const g = await c.post<{ at: LatLng }>("/api/party/midpoint", { action: "gather", sim: true });
    expect(g.status).toBe(200);
    expect(Math.abs(g.data.at.lat - mid.lat)).toBeLessThan(0.002);

    expect((await a.post("/api/party/midpoint", { action: "set", lat: 100, lng: 0 })).status).toBe(400);
    expectOk(await a.post("/api/party/midpoint", { action: "clear" }));
    expect((await b.get<Mid>("/api/party/midpoint")).data.meet).toBeNull();
    expect((await b.post("/api/party/midpoint", { action: "gather", sim: true })).status).toBe(409);
    await Promise.all([a.dispose(), b.dispose(), c.dispose()]);
  });
});
