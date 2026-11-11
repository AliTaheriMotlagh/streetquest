// Story scenarios in the 3D city: the six starters, the admin editor's API (validation with the field
// each problem is about, switch on/off, delete), and the server's side of a run — the places it was
// started with, the time and distance it claims, one reward per window and the run history.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type Scn = { id: string; enabled: boolean; steps: { type: string }[]; reward: { coins: number; xp: number }; title: { fa: string; en: string }; done?: boolean };
type Issue = { path: string; message: string };
type Finished = { status: string; reward: { xp: number; coins: number } | null; message: string };

const L = (s: string) => ({ fa: s, en: s });
/** A scenario that is only a clock: it needs no places, so a test can play it in a few seconds. */
const clock = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: L(`Test ${id}`), brief: L("Wait it out."), emoji: "⏱️", difficulty: 1, giver: { name: L("Tester"), at: { at: "start" } },
  steps: [{ type: "survive", seconds: 5 }], reward: { coins: 40, xp: 25 }, enabled: true, ...over,
});
const uid = () => `e2e-${Math.random().toString(36).slice(2, 9)}`;
const ll = (p: LatLng) => ({ lat: p.lat, lng: p.lng });

test.describe("scenarios", () => {
  test("the six starters are there, with every step type between them", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const { scenarios } = expectOk<{ scenarios: Scn[] }>(await p.get("/api/scenarios")).data;
    const ids = scenarios.map((s) => s.id);
    for (const id of ["midnight-getaway", "bazaar-run", "debt-collector", "cold-trail", "postcard", "last-stand"]) expect(ids).toContain(id);
    const types = new Set(scenarios.flatMap((s) => s.steps.map((x) => x.type)));
    for (const k of ["goto", "car", "pickup", "deliver", "chase", "evade", "survive", "hostiles", "photo", "drift"]) expect(types.has(k)).toBe(true);
  });

  test("only admins edit; the editor says which field is wrong", async ({ baseURL }) => {
    const [admin, p] = await Promise.all([adminPlayer(baseURL!), Player.create(baseURL!)]);
    expect((await p.get("/api/admin/scenarios")).status).toBe(403);
    expect((await p.post("/api/admin/scenarios", { action: "save", scenario: clock(uid()) })).status).toBe(403);

    const bad = await admin.post<{ issues: Issue[] }>("/api/admin/scenarios", { action: "save", scenario: clock(uid(), { title: { fa: "", en: "x" }, steps: [{ type: "survive", seconds: 0 }, { type: "deliver", at: { at: "fixed", lat: 99, lng: 0 } }] }) });
    expect(bad.status).toBe(400);
    const paths = bad.data.issues.map((i) => i.path);
    for (const want of ["title", "steps.0.seconds", "steps.1", "steps.1.at.lat"]) expect(paths).toContain(want);
    expect(bad.data.issues.every((i) => i.message.length > 0)).toBe(true);
    // The same check without saving.
    expect((await admin.post("/api/admin/scenarios", { action: "validate", scenario: clock(uid()) })).status).toBe(200);
  });

  test("create, switch off and on, change a starter, delete", async ({ baseURL }) => {
    const [admin, p] = await Promise.all([adminPlayer(baseURL!), Player.create(baseURL!)]);
    const id = uid();
    expectOk(await admin.post("/api/admin/scenarios", { action: "save", scenario: clock(id) }));
    const listed = async () => (expectOk<{ scenarios: Scn[] }>(await p.get("/api/scenarios")).data.scenarios.find((s) => s.id === id));
    expect(await listed()).toBeTruthy();

    const row = (expectOk<{ scenarios: Scn[] }>(await admin.get("/api/admin/scenarios")).data.scenarios).find((s) => s.id === id)!;
    expectOk(await admin.post("/api/admin/scenarios", { action: "enable", scenario: row, enabled: false }));
    expect(await listed()).toBeUndefined();
    // An admin can still open it to try it.
    const test = expectOk<{ scenarios: Scn[] }>(await admin.get(`/api/scenarios?test=${id}`)).data.scenarios;
    expect(test.some((s) => s.id === id)).toBe(true);
    expectOk(await admin.post("/api/admin/scenarios", { action: "enable", scenario: row, enabled: true }));
    expect(await listed()).toBeTruthy();

    // A starter can be changed (the row replaces it) and reset.
    const starters = expectOk<{ scenarios: Scn[] }>(await admin.get("/api/admin/scenarios")).data.scenarios;
    const postcard = starters.find((s) => s.id === "postcard")!;
    expectOk(await admin.post("/api/admin/scenarios", { action: "save", scenario: { ...postcard, reward: { coins: 777, xp: 11 } } }));
    expect((await p.get<{ scenarios: Scn[] }>("/api/scenarios")).data.scenarios.find((s) => s.id === "postcard")!.reward.coins).toBe(777);
    expectOk(await admin.post("/api/admin/scenarios", { action: "delete", id: "postcard" }));
    expect((await p.get<{ scenarios: Scn[] }>("/api/scenarios")).data.scenarios.find((s) => s.id === "postcard")!.reward.coins).not.toBe(777);

    expectOk(await admin.post("/api/admin/scenarios", { action: "delete", id }));
    expect(await listed()).toBeUndefined();
  });

  test("a run: started with fitting places, judged on time, paid once per window, kept in the history", async ({ baseURL }) => {
    const [admin, p] = await Promise.all([adminPlayer(baseURL!), Player.create(baseURL!)]);
    const id = uid();
    expectOk(await admin.post("/api/admin/scenarios", { action: "save", scenario: clock(id) }));
    const here = randomSpot();
    await p.goTo(here);
    const start = () => p.post<{ runId: string }>("/api/scenarios", { action: "start", id, giver: ll(here), places: [null] });
    const finish = (runId: string, over: Record<string, unknown> = {}) => p.post<Finished>("/api/scenarios", { action: "finish", runId, result: "won", elapsedS: 5, travelledM: 0, ...over });

    // Places that don't fit the scenario (one where it has no place; a giver across the world) are refused.
    expect((await p.post("/api/scenarios", { action: "start", id, giver: ll(here), places: [ll(here)] })).status).toBe(400);
    expect((await p.post("/api/scenarios", { action: "start", id: "nope-nope", giver: ll(here), places: [null] })).status).toBe(404);

    // Claiming a win in less time than the steps take: refused, and the run is over.
    const a = expectOk(await start()).data.runId;
    expect((await finish(a, { elapsedS: 0.5 })).status).toBe(400);
    expect((await finish(a)).status).toBe(404);

    // A claim longer than the real clock is refused too.
    const b = expectOk(await start()).data.runId;
    expect((await finish(b, { elapsedS: 60 })).status).toBe(400);

    const before = await p.me();
    const c = expectOk(await start()).data.runId;
    const won = expectOk(await finish(c)).data;
    expect(won.status).toBe("WON");
    expect(won.reward?.coins).toBeGreaterThan(0);
    const after = await p.me();
    expect(after.coins).toBeGreaterThan(before.coins);
    expect(after.xp).toBeGreaterThan(before.xp);
    // Finishing it again does nothing.
    expect((await finish(c)).status).toBe(404);

    // Playing it again inside the window is allowed but pays nothing.
    const d = expectOk(await start()).data.runId;
    const again = expectOk(await finish(d)).data;
    expect(again.status).toBe("WON");
    expect(again.reward).toBeNull();
    expect((await p.me()).coins).toBe(after.coins);

    // A failure is recorded and pays nothing; starting a new run abandons an unfinished one.
    const e = expectOk(await start()).data.runId;
    expect(expectOk<Finished>(await p.post("/api/scenarios", { action: "finish", runId: e, result: "failed", elapsedS: 3, travelledM: 0, reason: "time" })).data.status).toBe("FAILED");
    const f = expectOk(await start()).data.runId;
    const g = expectOk(await start()).data.runId;
    expect(g).not.toBe(f);
    expect((await finish(f)).status).toBe(404);
    expectOk(await p.post("/api/scenarios", { action: "abandon", runId: g }));

    const hist = expectOk<{ history: { scenarioId: string; status: string }[]; scenarios: Scn[] }>(await p.get("/api/scenarios")).data;
    const mine = hist.history.filter((h) => h.scenarioId === id).map((h) => h.status);
    expect(mine).toEqual(expect.arrayContaining(["WON", "FAILED", "ABANDONED"]));
    expect(hist.scenarios.find((s) => s.id === id)?.done).toBe(true);
    await admin.post("/api/admin/scenarios", { action: "delete", id });
  });

  test("a placed scenario: the pinned place must be where the admin pinned it, and the end must be where the player is", async ({ baseURL }) => {
    const [admin, p] = await Promise.all([adminPlayer(baseURL!), Player.create(baseURL!)]);
    const id = uid();
    const here = randomSpot();
    const spot = offset(here, 0, 300);
    expectOk(await admin.post("/api/admin/scenarios", { action: "save", scenario: clock(id, { steps: [{ type: "goto", at: { at: "fixed", ...ll(spot) }, radius: 30 }] }) }));
    await p.goTo(here);
    const wrong = offset(spot, 400, 0);
    expect((await p.post("/api/scenarios", { action: "start", id, giver: ll(here), places: [ll(wrong)] })).status).toBe(400);
    const run = expectOk(await p.post<{ runId: string }>("/api/scenarios", { action: "start", id, giver: ll(here), places: [ll(spot)] })).data.runId;
    // Claiming the trip from far too fast, or while still at the start, is refused.
    expect((await p.post("/api/scenarios", { action: "finish", runId: run, result: "won", elapsedS: 1, travelledM: 300 })).status).toBe(400);
    await admin.post("/api/admin/scenarios", { action: "delete", id });
  });
});
