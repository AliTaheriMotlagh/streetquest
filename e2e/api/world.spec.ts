// The map: position reports, the play-from-home speed cap, and players near each other.
// (Money on the map has its own spec: money.spec.ts.)
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type World = { money: unknown[]; players: unknown[]; serverTime: number; phase: string };

test.describe("map & location", () => {
  test("world loads around the player", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const here = randomSpot();
    await p.goTo(here);
    const w = await p.get<World>(`/api/world?lat=${here.lat}&lng=${here.lng}`);
    expect(w.status).toBe(200);
    expect(w.data.money.length).toBeGreaterThan(0);
    expect(["night", "dawn", "day", "dusk"]).toContain(w.data.phase);
    expect((await p.get("/api/world")).status).toBe(400);
    await p.dispose();
  });

  test("position reports validate coordinates", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    expect((await p.post("/api/loc", { lat: 91, lng: 0 })).status).toBe(400);
    expect((await p.post("/api/loc", { lat: "x", lng: 0 })).status).toBe(400);
    expect((await p.post("/api/loc", { lat: 10, lng: 10, sim: true })).status).toBe(200);
    await p.dispose();
  });
});

test.describe("play from home", () => {
  test("travel is speed-capped, and a refused jump doesn't lock the player in place", async ({ baseURL }) => {
    test.slow();
    const p = await Player.create(baseURL!);
    expectOk(await p.post("/api/me", { remotePlay: true }, "PATCH"));
    const start = randomSpot();
    await p.goTo(start);
    // 120 m in an instant is faster than the commander can travel.
    const jump = offset(start, 120);
    const refused = await p.post("/api/loc", { ...jump, sim: true });
    expect(refused.status).toBe(409);
    // Keep asking (the client resends on every heartbeat). Once enough time has passed
    // since the last *accepted* position, the same spot is reachable — the refusals in
    // between must not keep resetting the clock.
    let status = 409;
    const until = Date.now() + 20_000;
    while (status === 409 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1000));
      status = (await p.post("/api/loc", { ...jump, sim: true })).status;
    }
    expect(status).toBe(200);
    const me = await p.get<{ lastPos: LatLng }>("/api/me");
    expect(me.data.lastPos.lat).toBeCloseTo(jump.lat, 5);
    // Back to GPS: the couch position is forgotten so the next real fix is accepted anywhere.
    expectOk(await p.post("/api/me", { remotePlay: false }, "PATCH"));
    expect((await p.get<{ lastPos: LatLng | null }>("/api/me")).data.lastPos).toBeNull();
    await p.dispose();
  });
});

test.describe("players near each other", () => {
  type Near = { id: string; lat: number; lng: number; at: number };
  type Loc = { near: Near[]; serverTime: number };
  type WorldP = { players: (LatLng & { id: string })[] };
  const metres = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
  /** A real GPS report (not test mode). */
  const gps = (p: Player, at: LatLng) => p.post<Loc>("/api/loc", { ...at, acc: 8 });

  test("two players together (same car) see each other exactly and live", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    const here = randomSpot();
    const bAt = offset(here, 6, 3);
    expectOk(await gps(a, here));
    expectOk(await gps(b, bAt));
    const bId = (await b.me()).id;
    const aId = (await a.me()).id;

    // B's report already sees A; A's next report sees B — exact, with a timestamp.
    expect((await gps(b, bAt)).data.near.map((n) => n.id)).toContain(aId);
    const r = await gps(a, here);
    const seen = r.data.near.find((n) => n.id === bId)!;
    expect(seen).toBeTruthy();
    expect(metres(seen, bAt)).toBeLessThan(1);
    expect(seen.at).toBeLessThanOrEqual(r.data.serverTime);

    // The slower world list agrees with the live one for a player right next to us, so the
    // marker never jumps 60–150 m when the live list lapses for a moment.
    const w = (await a.get<WorldP>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
    expect(metres(w.players.find((p) => p.id === bId)!, bAt)).toBeLessThan(1);
    await a.dispose();
    await b.dispose();
  });

  test("walking up to a stranger: exact within 250 m, fuzzed beyond", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    const here = randomSpot();
    const bAt = offset(here, 200);
    expectOk(await gps(b, bAt));
    const bId = (await b.me()).id;
    // 200 m apart, both on real GPS (even a rough indoor fix): exact, live and in the world list.
    expect((await a.post<Loc>("/api/loc", { ...here, acc: 120 })).data.near.map((n) => n.id)).toContain(bId);
    const w = (await a.get<WorldP>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
    expect(metres(w.players.find((p) => p.id === bId)!, bAt)).toBeLessThan(1);
    // 1 km apart: the world list keeps strangers fuzzed (60–150 m), not reversible from the id.
    const c = await Player.create(baseURL!);
    const far = offset(bAt, 1000);
    expectOk(await gps(c, far));
    const w2 = (await c.get<WorldP>(`/api/world?lat=${far.lat}&lng=${far.lng}`)).data;
    const fuzzed = w2.players.find((p) => p.id === bId)!;
    expect(metres(fuzzed, bAt)).toBeGreaterThan(55);
    expect(metres(fuzzed, bAt)).toBeLessThan(160);
    await a.dispose();
    await b.dispose();
    await c.dispose();
  });

  test("nobody is pinpointed from afar or from test mode", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    const here = randomSpot();
    expectOk(await gps(b, here));
    const bId = (await b.me()).id;
    // 400 m away: not "near".
    expect((await gps(a, offset(here, 400))).data.near.map((n) => n.id)).not.toContain(bId);
    // Teleporting next to them in test mode reveals nothing.
    const sim = await a.post<Loc>("/api/loc", { ...offset(here, 5), sim: true });
    expect(sim.status).toBe(200);
    expect(sim.data.near).toEqual([]);
    // …nor does the world list: test mode isn't a real spot.
    const w = (await a.get<WorldP>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
    const seen = w.players.find((p) => p.id === bId);
    if (seen) expect(metres(seen, here)).toBeGreaterThan(55);
    await a.dispose();
    await b.dispose();
  });
});
