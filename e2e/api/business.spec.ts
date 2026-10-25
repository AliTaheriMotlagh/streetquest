// Businesses: claiming a real store on the spot, campaigns and plan limits, players
// checking in, coupons redeemed at the till — and the races that must never pay twice.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot, uploadPlaces } from "../helpers";

type Dash = { businesses: { id: string; plan: string; stats: { visitsMonth: number; redeemedMonth: number; customers: number }; campaigns: { id: string; visits: number; redeemed: number }[] }[]; claimable: { id: string; name: string }[] };
type World = { businesses: { id: string; name: string; campaigns: { id: string; visited: boolean; code: string | null }[] }[] };

async function store(baseURL: string) {
  const admin = await adminPlayer(baseURL);
  const tile = await uploadPlaces(admin, randomSpot(), 6);
  const shop = tile.places[0];
  const owner = await Player.create(baseURL);
  await owner.goTo(shop);
  return { admin, owner, shop, tile };
}

test.describe("businesses", () => {
  test("claim a real place from the store, once", async ({ baseURL }) => {
    const { admin, owner, shop } = await store(baseURL!);
    const dash = (await owner.get<Dash>("/api/business")).data;
    expect(dash.claimable.some((p) => p.id === shop.id)).toBe(true);
    // Claiming that place from across town: refused (it isn't around you).
    await owner.goTo(offset(shop, 2000));
    expect((await owner.post("/api/business", { action: "create", osmId: shop.id, name: shop.name, category: "cafe" })).status).toBe(404);
    await owner.goTo(shop);
    expectOk(await owner.post("/api/business", { action: "create", osmId: shop.id, name: shop.name, category: "cafe" }));
    // One location on the free plan; and nobody else can claim the same place.
    expect((await owner.post("/api/business", { action: "create", name: "Second", category: "cafe" })).status).toBe(400);
    const rival = await Player.create(baseURL!);
    await rival.goTo(shop);
    expect((await rival.post("/api/business", { action: "create", osmId: shop.id, name: "Mine now", category: "cafe" })).status).toBe(409);
    expect((await rival.get<Dash>("/api/business")).data.claimable.some((p) => p.id === shop.id)).toBe(false);
    await Promise.all([admin.dispose(), owner.dispose(), rival.dispose()]);
  });

  test("campaign → check-in → coupon redeemed at the till", async ({ baseURL }) => {
    const { admin, owner, shop } = await store(baseURL!);
    const { data } = expectOk(await owner.post<{ id: string }>("/api/business", { action: "create", osmId: shop.id, name: shop.name, category: "cafe" }));
    const bid = data.id;
    const camp = { action: "campaign", businessId: bid, title: "Free cookie", kind: "coupon", offer: "a free cookie", rewardCoins: 40, bonusCoins: 60, maxVisits: 50, days: 7 };
    // Coupons need a paid plan: the free trial unlocks them (once).
    expect((await owner.post("/api/business", camp)).status).toBe(400);
    expectOk(await owner.post("/api/business", { action: "trial", businessId: bid }));
    expect((await owner.post("/api/business", { action: "trial", businessId: bid })).status).toBe(400);
    expectOk(await owner.post("/api/business", camp));
    // Real money without Stripe configured: a clear refusal, nothing charged.
    expect((await owner.post("/api/business", { action: "checkout", businessId: bid, plan: "pro" })).status).toBe(503);

    const fan = await Player.create(baseURL!);
    await fan.goTo(offset(shop, 500));
    const w = (await fan.get<World>(`/api/world?lat=${shop.lat}&lng=${shop.lng}`)).data;
    const b = w.businesses.find((x) => x.id === bid)!;
    expect(b.name).toBe(shop.name);
    const cid = b.campaigns[0].id;
    expect((await fan.post("/api/business", { action: "checkin", campaignId: cid })).status).toBe(400); // too far
    await fan.goTo(shop);
    const before = await fan.me();
    const both = await Promise.all([fan.post<{ code: string }>("/api/business", { action: "checkin", campaignId: cid }), fan.post<{ code: string }>("/api/business", { action: "checkin", campaignId: cid })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const code = both.find((r) => r.status === 200)!.data.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const mid = await fan.me();
    expect(mid.coins).toBe(before.coins + 40);
    // The owner can't farm their own campaign.
    expect((await owner.post("/api/business", { action: "checkin", campaignId: cid })).status).toBe(400);

    // At the till: wrong code, right code (any case), never twice — even at once.
    expect((await owner.post("/api/business", { action: "redeem", businessId: bid, code: "ZZZZZZ" })).status).toBe(404);
    const redeem = await Promise.all([owner.post("/api/business", { action: "redeem", businessId: bid, code: code.toLowerCase() }), owner.post("/api/business", { action: "redeem", businessId: bid, code })]);
    expect(redeem.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await fan.me()).coins).toBe(mid.coins + 60);
    // Another owner can't redeem this business's codes.
    const other = await Player.create(baseURL!);
    expect((await other.post("/api/business", { action: "redeem", businessId: bid, code })).status).toBe(404);

    const dash = (await owner.get<Dash>("/api/business")).data.businesses[0];
    expect(dash.plan).toBe("starter");
    expect(dash.stats).toMatchObject({ visitsMonth: 1, redeemedMonth: 1, customers: 1 });
    expect(dash.campaigns[0]).toMatchObject({ visits: 1, redeemed: 1 });
    await Promise.all([admin.dispose(), owner.dispose(), fan.dispose(), other.dispose()]);
  });

  test("plan limits: missions running at once", async ({ baseURL }) => {
    const { admin, owner, shop } = await store(baseURL!);
    const bid = expectOk(await owner.post<{ id: string }>("/api/business", { action: "create", name: shop.name, category: "cafe" })).data.id;
    const camp = (title: string) => ({ action: "campaign", businessId: bid, title, kind: "visit", rewardCoins: 10, maxVisits: 10, days: 3 });
    expectOk(await owner.post("/api/business", camp("First")));
    expect((await owner.post("/api/business", camp("Second"))).status).toBe(400); // free: 1 at a time
    // An admin upgrade lifts it.
    expectOk(await admin.post("/api/business", { action: "admin", businessId: bid, plan: "pro", days: 30 }));
    expectOk(await owner.post("/api/business", camp("Second")));
    expect((await owner.post("/api/business", { action: "admin", businessId: bid, plan: "chain" })).status).toBe(403);
    await Promise.all([admin.dispose(), owner.dispose()]);
  });
});
