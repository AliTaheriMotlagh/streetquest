// The map: position reports, spawns, claims, mini-game lobbies, timed runs and the
// play-from-home speed cap.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type Spawn = LatLng & { id: string; kind: string; claimed: boolean; item?: { key: string } };
type World = { spawns: Spawn[]; players: unknown[]; bases: unknown[]; serverTime: number; phase: string };

/** A random spot that has a spawn of this kind nearby (spawns are deterministic per cell). */
async function findSpawn(p: Player, kind: string, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const here = randomSpot();
    await p.goTo(here);
    const w = (await p.get<World>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
    const s = w.spawns.find((x) => x.kind === kind && !x.claimed);
    if (s) return s;
  }
  throw new Error(`no ${kind} spawn found`);
}

test.describe("map & location", () => {
  test("world loads around the player", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const here = randomSpot();
    await p.goTo(here);
    const w = await p.get<World>(`/api/world?lat=${here.lat}&lng=${here.lng}`);
    expect(w.status).toBe(200);
    expect(w.data.spawns.length).toBeGreaterThan(0);
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

  test("collect a spawn: in reach once, never twice, never from afar", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const s = await findSpawn(p, "item");
    await p.goTo(offset(s, 400));
    const far = await p.post("/api/claim", { spawnId: s.id });
    expect(far.status).toBe(400);
    expect(far.data.error).toMatch(/within/i);

    await p.goTo(s);
    const before = await p.me();
    const both = await Promise.all([p.post("/api/claim", { spawnId: s.id }), p.post("/api/claim", { spawnId: s.id })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await p.me();
    expect(after.xp).toBeGreaterThan(before.xp);
    expect(after.inventory.some((i) => i.key === s.item!.key)).toBe(true);
    // The map shows it as collected now.
    const w = (await p.get<World>(`/api/world?lat=${s.lat}&lng=${s.lng}`)).data;
    expect(w.spawns.find((x) => x.id === s.id)?.claimed).toBe(true);
    await p.dispose();
  });

  test("forged or expired spawn ids are rejected", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    await p.goTo(randomSpot());
    expect((await p.post("/api/claim", { spawnId: "1.2_3.4" })).status).toBe(410);
    expect((await p.post("/api/claim", { spawnId: "garbage" })).status).toBe(410);
    expect((await p.post("/api/claim", { spawnId: "m:does-not-exist" })).status).toBe(404);
    await p.dispose();
  });

  test("chests are won through the mini-game, not claimed directly", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const s = await findSpawn(p, "chest");
    await p.goTo(s);
    const r = await p.post("/api/claim", { spawnId: s.id });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/mini-game/i);
    await p.dispose();
  });

  test("solo shooting range: open → start → score → paid once", async ({ baseURL }) => {
    test.slow();
    const p = await Player.create(baseURL!);
    const s = await findSpawn(p, "arcade");
    await p.goTo(s);
    type L = { lobby: { id: string; status: string; startsAt: number | null; players: { userId: string; score: number | null; reward: string | null }[] }; now: number };
    const open = expectOk(await p.post<L>("/api/lobby", { action: "open", spawnId: s.id })).data as L;
    expect(open.lobby.status).toBe("OPEN");
    const started = expectOk(await p.post<L>("/api/lobby", { action: "start", lobbyId: open.lobby.id })).data as L;
    expect(started.lobby.status).toBe("LIVE");
    // Scores before the countdown ends are refused.
    expect((await p.post("/api/lobby", { action: "score", lobbyId: open.lobby.id, score: 40 })).status).toBe(400);
    await new Promise((r) => setTimeout(r, Math.max(0, started.lobby.startsAt! - started.now) + 200));
    const coins = (await p.me()).coins;
    const done = expectOk(await p.post<L>("/api/lobby", { action: "score", lobbyId: open.lobby.id, score: 40 })).data as L;
    expect(done.lobby.status).toBe("ENDED");
    expect(done.lobby.players[0].reward).toBeTruthy();
    expect((await p.me()).coins).toBeGreaterThan(coins);
    expect((await p.post("/api/lobby", { action: "score", lobbyId: open.lobby.id, score: 40 })).status).toBe(400);
    // The arcade is done for this player.
    expect((await p.post("/api/lobby", { action: "open", spawnId: s.id })).status).toBe(409);
    await p.dispose();
  });

  test("timed run: start, can't finish away from the target, abandon", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const s = await findSpawn(p, "run");
    await p.goTo(s);
    expectOk(await p.post("/api/claim", { spawnId: s.id }));
    const run = (await p.get<{ activeRun: { id: string; targetLat: number; targetLng: number } | null }>("/api/me")).data.activeRun!;
    expect(run).toBeTruthy();
    const early = await p.post("/api/runs", { runId: run.id, action: "complete" });
    expect(early.status).toBe(400);
    expectOk(await p.post("/api/runs", { runId: run.id, action: "abandon" }));
    expect((await p.get<{ activeRun: unknown }>("/api/me")).data.activeRun).toBeNull();
    await p.dispose();
  });

  test("timed run completes at the target", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const s = await findSpawn(p, "run");
    await p.goTo(s);
    expectOk(await p.post("/api/claim", { spawnId: s.id }));
    const run = (await p.get<{ activeRun: { id: string; targetLat: number; targetLng: number } }>("/api/me")).data.activeRun;
    await p.goTo({ lat: run.targetLat, lng: run.targetLng });
    const coins = (await p.me()).coins;
    const done = await Promise.all([p.post("/api/runs", { runId: run.id, action: "complete" }), p.post("/api/runs", { runId: run.id, action: "complete" })]);
    expect(done.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await p.me()).coins).toBeGreaterThan(coins);
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
