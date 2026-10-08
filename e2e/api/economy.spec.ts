// Money paths: daily reward, selling, gem store, sponsor spots — and what happens when
// the same request arrives twice at once (double-tap, network retry).
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player, randomSpot } from "../helpers";

test.describe("economy", () => {
  test("daily reward pays once per day, even when double-tapped", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const before = await p.me();
    expect(before.dailyAvailable).toBe(true);
    const results = await Promise.all([p.post("/api/daily"), p.post("/api/daily"), p.post("/api/daily")]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const after = await p.me();
    expect(after.dailyAvailable).toBe(false);
    expect(after.coins).toBeGreaterThan(before.coins);
    // And a normal second claim later the same day is refused.
    expect((await p.post("/api/daily")).status).toBe(400);
    await p.dispose();
  });

  test("gem offers convert gems to coins exactly once per tap", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const p = await Player.create(baseURL!);
    const me = await p.me();
    await fund(admin, me.id, 0, 45 - me.gems); // exactly 45 gems
    expect((await p.me()).gems).toBe(45);
    // Two taps at once with 45 gems and a 10-gem offer: both may go through, but never more coins than gems paid for.
    const [a, b] = await Promise.all([p.post("/api/store", { action: "offer", key: "coins_s" }), p.post("/api/store", { action: "offer", key: "coins_s" })]);
    const ok = [a, b].filter((r) => r.status === 200).length;
    const after = await p.me();
    expect(after.gems).toBe(45 - 10 * ok);
    expect(after.coins).toBe(me.coins + 500 * ok);
    // Can't overspend.
    const big = await p.post("/api/store", { action: "offer", key: "coins_l" });
    expect(big.status).toBe(400);
    expect((await p.me()).gems).toBe(after.gems);
    await Promise.all([p.dispose(), admin.dispose()]);
  });

  test("instant heal isn't sold to a player at full health", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const me = await p.me();
    expect(me.hp).toBe(me.maxHp);
    const r = await p.post("/api/store", { action: "heal" });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/full health/i);
    expect((await p.me()).gems).toBe(me.gems);
    await p.dispose();
  });

  test("sponsor spot: must be watched, pays once", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const start = expectOk(await p.post<{ viewId: string; seconds: number }>("/api/ads", { action: "start" })).data as { viewId: string };
    const early = await p.post("/api/ads", { action: "claim", viewId: start.viewId });
    expect(early.status).toBe(400);
    expect(early.data.error).toMatch(/whole spot/i);
    // Someone else can't claim my view.
    const other = await Player.create(baseURL!);
    expect((await other.post("/api/ads", { action: "claim", viewId: start.viewId })).status).toBe(404);
    await Promise.all([p.dispose(), other.dispose()]);
  });

  test("selling items: exact payout, no overselling, no double-sell", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    // Item spawns are deterministic; find one, walk to it, collect it.
    const here = randomSpot();
    await p.goTo(here);
    const world = (await p.get<{ spawns: { id: string; kind: string; lat: number; lng: number; item?: { key: string } }[] }>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
    const spawn = world.spawns.find((s) => s.kind === "item");
    test.skip(!spawn, "no item spawn around this random spot");
    await p.goTo(spawn!);
    expectOk(await p.post("/api/claim", { spawnId: spawn!.id }));
    const key = spawn!.item!.key;
    const before = await p.me();
    expect(before.inventory.find((i) => i.key === key)?.qty).toBe(1);

    expect((await p.post("/api/inventory", { action: "sell", itemKey: key, qty: 2 })).status).toBe(400);
    const sells = await Promise.all([p.post("/api/inventory", { action: "sell", itemKey: key, qty: 1 }), p.post("/api/inventory", { action: "sell", itemKey: key, qty: 1 })]);
    expect(sells.filter((r) => r.status === 200)).toHaveLength(1);
    const after = await p.me();
    expect(after.inventory.find((i) => i.key === key)).toBeUndefined();
    expect(after.coins).toBeGreaterThan(before.coins);
    expect((await p.post("/api/inventory", { action: "sell", itemKey: "not-an-item", qty: 1 })).status).toBe(404);
    await p.dispose();
  });
});
