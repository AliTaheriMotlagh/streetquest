// Live traffic from players' GPS, and the 3D city's map data (city packs, elevation).
import { expect, test } from "@playwright/test";
import { offset, Player, randomSpot } from "../helpers";

type Traffic = { cells: [number, number, number, number][]; neshan: string };

test.describe("live traffic", () => {
  test("a street two players drove shows their speed; one player's trip never shows", async ({ baseURL }) => {
    const start = randomSpot();
    const end = offset(start, 0, 100); // 100 m east
    const lone = offset(start, 3000);
    const drivers = await Promise.all([1, 2, 3].map(() => Player.create(baseURL!)));
    const solo = await Player.create(baseURL!);
    const loc = (p: Player, at: { lat: number; lng: number }) => p.post("/api/loc", { ...at, acc: 8 });
    await Promise.all([...drivers.map((p) => loc(p, start)), loc(solo, lone)]);
    await new Promise((r) => setTimeout(r, 8000)); // ~45 km/h
    await Promise.all([...drivers.map((p) => loc(p, end)), loc(solo, offset(lone, 0, 100))]);
    await expect
      .poll(async () => (await drivers[0].get<Traffic>(`/api/traffic?lat=${start.lat}&lng=${start.lng}`)).data.cells, { timeout: 10_000 })
      .not.toHaveLength(0);
    const { data } = await drivers[0].get<Traffic>(`/api/traffic?lat=${start.lat}&lng=${start.lng}`);
    expect(data.neshan).toBe("off");
    for (const [, , dir, kmh] of data.cells) {
      expect(dir).toBe(2); // east
      expect(kmh).toBeGreaterThan(35);
      expect(kmh).toBeLessThan(55);
    }
    expect((await solo.get<Traffic>(`/api/traffic?lat=${lone.lat}&lng=${lone.lng}`)).data.cells).toEqual([]);
    expect((await solo.get("/api/traffic?lat=x&lng=1")).status).toBe(400);
    await Promise.all([...drivers, solo].map((p) => p.dispose()));
  });

  test("walking pace and test-mode moves don't count as traffic", async ({ baseURL }) => {
    const start = randomSpot();
    const ps = await Promise.all([1, 2].map(() => Player.create(baseURL!)));
    await Promise.all(ps.map((p) => p.post("/api/loc", { ...start, acc: 8 })));
    await new Promise((r) => setTimeout(r, 8000));
    // One walks 10 m (4.5 km/h), the other teleports in test mode.
    await ps[0].post("/api/loc", { ...offset(start, 10), acc: 8 });
    await ps[1].post("/api/loc", { ...offset(start, 100), sim: true });
    await new Promise((r) => setTimeout(r, 1000));
    expect((await ps[0].get<Traffic>(`/api/traffic?lat=${start.lat}&lng=${start.lng}`)).data.cells).toEqual([]);
    await Promise.all(ps.map((p) => p.dispose()));
  });
});

test.describe("city packs", () => {
  test("street detail is public and answers per cell", async ({ request }) => {
    const r = await request.get("/api/city/detail?keys=1_1,2_2");
    expect(r.status()).toBe(200);
    expect(Object.keys((await r.json()).cells).sort()).toEqual(["1_1", "2_2"]);
    expect((await request.get("/api/city/detail?keys=nope")).status()).toBe(400);
  });

  test("elevation tiles for the skyline: only coarse zooms inside the world", async ({ request }) => {
    for (const path of ["/api/dem/14/1/1", "/api/dem/6/1/1", "/api/dem/9/512/1", "/api/dem/9/-1/1", "/api/dem/9/1/x"]) expect((await request.get(path)).status(), path).toBe(400);
  });
});
