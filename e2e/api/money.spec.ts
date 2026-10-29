// Money on the map (toman): picking it up, what each way of playing pays, the map's
// item cap, admin drops on a spot or along a street, and cash-outs.
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { adminPlayer, expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";
import { E2E_DB } from "../../playwright.config";

type Money = LatLng & { id: string; amount: number; tier: number; drop: { label: string; sponsor: string | null } | null };
type World = { money: Money[]; places: unknown[]; businesses: unknown[] };
const world = (p: Player, at: LatLng) => p.get<World>(`/api/world?lat=${at.lat}&lng=${at.lng}`).then((r) => r.data);
/** A real GPS report (not test mode), so pickups pay real toman. */
const gps = (p: Player, at: LatLng) => p.post("/api/loc", { ...at, acc: 8 });
const metres = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

test.describe("money on the map", () => {
  test("the map shows at most 14 things, nearest first", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const here = randomSpot();
    await p.goTo(here);
    const w = await world(p, here);
    expect(w.money.length).toBeGreaterThan(0);
    expect(w.money.length + w.places.length + w.businesses.length).toBeLessThanOrEqual(14);
    // The world call no longer sends the war layers.
    expect(w).not.toHaveProperty("bases");
    expect(w).not.toHaveProperty("spawns");
    await p.dispose();
  });

  test("walking around one spot keeps the same things on the map (no markers vanishing)", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const here = randomSpot();
    const ids = async (at: { lat: number; lng: number }) =>
      expectOk(await p.get<{ money: { id: string }[] }>(`/api/world?lat=${at.lat}&lng=${at.lng}&alat=${here.lat}&alng=${here.lng}`)).data.money.map((m) => m.id).sort();
    // Ranked from the same anchor: a short walk doesn't reshuffle which few are shown.
    expect(await ids(offset(here, 120, -60))).toEqual(await ids(here));
    await p.dispose();
  });

  test("walking there on GPS pays 10,000 toman, once, and never from afar", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const here = randomSpot();
    // The map can be read anywhere; a fresh player's first GPS fix is accepted wherever it is.
    const [m, far] = (await world(p, here)).money.sort((x, y) => metres(here, x) - metres(here, y)).filter((x, i, all) => i === 0 || metres(all[0], x) > 200);
    expect(m.amount).toBe(10_000);
    expectOk(await gps(p, m));
    if (far) {
      const r = await p.post("/api/money", { id: far.id });
      expect(r.status).toBe(400);
      expect(r.data.error).toMatch(/within/i);
    }
    const both = await Promise.all([p.post("/api/money", { id: m.id }), p.post("/api/money", { id: m.id })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await p.me()).toman).toBe(10_000);
    // Gone from the map.
    expect((await world(p, m)).money.some((x) => x.id === m.id)).toBe(false);
    await p.dispose();
  });

  test("from home a pickup pays 1,000; test mode pays nothing", async ({ baseURL }) => {
    const home = await Player.create(baseURL!);
    expectOk(await home.post("/api/me", { remotePlay: true }, "PATCH"));
    const at = randomSpot();
    const hm = (await world(home, at)).money[0];
    expect(hm.amount).toBe(1_000);
    await home.goTo(hm); // the first position from home is wherever you start
    expectOk(await home.post("/api/money", { id: hm.id }));
    expect((await home.me()).toman).toBe(1_000);

    const sim = await Player.create(baseURL!);
    const sm = (await world(sim, randomSpot())).money[0];
    await sim.goTo(sm);
    const r = expectOk(await sim.post<{ toman: number }>("/api/money", { id: sm.id }));
    expect(r.data.toman).toBe(0);
    expect((await sim.me()).toman).toBe(0);
    await Promise.all([home.dispose(), sim.dispose()]);
  });

  test("forged and expired money ids are refused", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    await p.goTo(randomSpot());
    expect((await p.post("/api/money", { id: "$1.2_3.0" })).status).toBe(410);
    expect((await p.post("/api/money", { id: "garbage" })).status).toBe(410);
    expect((await p.post("/api/money", { id: "$d:does-not-exist" })).status).toBe(410);
    await p.dispose();
  });
});

test.describe("money levels", () => {
  test("bigger money shows only once its level is bought from the wallet, in order", async ({ baseURL }) => {
    const db = new PrismaClient({ datasourceUrl: E2E_DB });
    const [p, other] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
    const here = randomSpot();
    // A fresh player sees only the free 10,000 toman money and can't buy without toman.
    expect((await world(p, here)).money.every((m) => m.tier === 0 && m.amount === 10_000)).toBe(true);
    expect((await p.post("/api/money/tier")).status).toBe(400);

    const me = await p.me();
    await db.user.update({ where: { id: me.id }, data: { toman: 100_000 } });
    const both = await Promise.all([p.post("/api/money/tier"), p.post("/api/money/tier")]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    const after = await p.me();
    expect(after.toman).toBe(0);
    expect((after as unknown as { moneyTier: number }).moneyTier).toBe(1);
    // The next level costs more than what's left.
    expect((await p.post("/api/money/tier")).status).toBe(400);

    const big = (await world(p, here)).money.filter((m) => m.tier === 1);
    expect(big.length).toBeGreaterThan(0);
    expect(big.every((m) => m.amount === 20_000)).toBe(true);
    // Someone without the level can't pick it up, even standing on it.
    expectOk(await gps(other, big[0]));
    expect((await other.post("/api/money", { id: big[0].id })).status).toBe(403);
    expectOk(await gps(p, big[0]));
    expect(expectOk(await p.post<{ toman: number }>("/api/money", { id: big[0].id })).data.toman).toBe(20_000);
    await Promise.all([p.dispose(), other.dispose(), db.$disconnect()]);
  });
});

test.describe("admin money drops", () => {
  test("a street drop lays a row of gold money that shows first and keeps to its budget", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const a = randomSpot();
    const b = offset(a, 300, 300);
    const now = Date.now();
    const r = expectOk(await admin.post<{ dropped: number; batch: string }>("/api/admin", {
      action: "dropMoney", label: "Grand opening", sponsor: "Test Café", points: [a, b], count: 5, amount: 50_000, maxClaims: 5,
      activeFrom: new Date(now - 60_000).toISOString(), activeTo: new Date(now + 3600_000).toISOString(),
    }));
    expect(r.data.dropped).toBe(5);
    // Players can't drop money.
    const p = await Player.create(baseURL!);
    expect((await p.post("/api/admin", { action: "dropMoney", label: "x", points: [a], count: 1, amount: 1000, activeFrom: new Date().toISOString(), activeTo: new Date(now + 1000).toISOString() })).status).toBe(403);

    const w = await world(p, a);
    const drops = w.money.filter((m) => m.drop?.label === "Grand opening");
    expect(drops.length).toBeGreaterThan(0);
    expect(w.money[0].drop?.sponsor).toBe("Test Café");
    expect(drops[0].amount).toBe(50_000);
    const first = drops.sort((x, y) => metres(a, x) - metres(a, y))[0];
    expectOk(await gps(p, first));
    expectOk(await p.post("/api/money", { id: first.id }));
    expect((await p.me()).toman).toBe(50_000);

    // Ending the drop takes it off the map.
    expectOk(await admin.post("/api/admin", { action: "deleteDrop", batch: r.data.batch }));
    expect((await world(p, a)).money.some((m) => m.drop?.label === "Grand opening")).toBe(false);
    await Promise.all([admin.dispose(), p.dispose()]);
  });
});

test.describe("cash-out", () => {
  const form = { fullName: "Test Player", phone: "09120000000", account: "6037 9911 2233 4455" };

  test("needs the minimum, takes the money once, and a declined request refunds it", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const p = await Player.create(baseURL!);
    const id = (await p.me()).id;
    expect((await p.post("/api/cashout", { amount: 1_000_000, ...form })).status).toBe(400); // empty wallet
    expectOk(await admin.post("/api/admin", { action: "grantToman", userId: id, toman: 1_500_000 }));
    expect((await p.post("/api/cashout", { amount: 500_000, ...form })).status).toBe(400); // under the minimum
    expect((await p.post("/api/cashout", { amount: 1_000_000, ...form, account: "1234" })).status).toBe(400);

    const both = await Promise.all([p.post("/api/cashout", { amount: 1_000_000, ...form }), p.post("/api/cashout", { amount: 1_000_000, ...form })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    let me = await p.me();
    expect(me.toman).toBe(500_000);
    expect(me.cashoutPending).toBe(1_000_000);

    // The admin sees it with the full account number; the player only a masked one.
    const list = (await admin.get<{ money: { cashouts: { id: string; user: string; account: string; status: string }[] } }>("/api/admin")).data.money.cashouts;
    const req = list.find((c) => c.user === p.username)!;
    expect(req.account).toBe("6037991122334455");
    const mine = (await p.get<{ requests: { account: string }[] }>("/api/cashout")).data.requests[0];
    expect(mine.account).not.toContain("99112233");

    // Players can't approve their own.
    expect((await p.post("/api/admin", { action: "cashout", id: req.id, paid: true })).status).toBe(403);
    expectOk(await admin.post("/api/admin", { action: "cashout", id: req.id, paid: false, note: "Name doesn't match" }));
    expect((await admin.post("/api/admin", { action: "cashout", id: req.id, paid: true })).status).toBe(400); // already handled
    me = await p.me();
    expect(me.toman).toBe(1_500_000);
    expect(me.cashoutPending).toBe(0);

    // Ask again; this time it's paid and stays paid.
    const again = expectOk(await p.post<{ id: string }>("/api/cashout", { amount: 1_200_000, ...form }));
    expectOk(await admin.post("/api/admin", { action: "cashout", id: again.data.id, paid: true, note: "REF-123" }));
    me = await p.me();
    expect(me.toman).toBe(300_000);
    expect((await p.get<{ requests: { status: string }[] }>("/api/cashout")).data.requests[0].status).toBe("PAID");
    await Promise.all([admin.dispose(), p.dispose()]);
  });
});
