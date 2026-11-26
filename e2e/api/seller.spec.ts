// The Seller center (/api/seller, server/seller.ts): a seller's shop and real businesses in one place, the to-do
// list, and linking a verified business to the shop — which the shop then shows as "Verified store".
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player, uploadPlaces, randomSpot } from "../helpers";

const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
type Overview = { shop: { id: string; businessId: string | null } | null; businesses: { id: string; verified: boolean; linked: boolean }[]; todos: { key: string; action: string }[] };

test.describe("seller center", () => {
  test("to-dos, linking only a verified business of your own, one shop per business, the badge", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const tile = await uploadPlaces(admin, randomSpot(), 4);
    const place = tile.places[0];
    const owner = await Player.create(baseURL!);
    const rival = await Player.create(baseURL!);
    await owner.goTo(place);
    await rival.goTo(place);

    // Nothing yet: open a shop.
    let o = expectOk(await owner.get<Overview>("/api/seller")).data;
    expect(o.shop).toBeNull();
    expect(o.todos.map((x) => x.key)).toContain("start");

    const bid = expectOk(await owner.post<{ id: string }>("/api/business", { action: "create", osmId: place.id, name: place.name, category: "cafe" })).data.id;
    await fund(admin, (await owner.me()).id, 5000);
    expectOk(await owner.post("/api/shops", { action: "create", name: "Corner" }));
    o = expectOk(await owner.get<Overview>("/api/seller")).data;
    expect(o.todos.map((x) => x.key)).toEqual(expect.arrayContaining(["empty", `verify:${bid}`]));

    // Not verified yet: refused. Someone else's: not found.
    expect((await owner.post("/api/seller", { businessId: bid })).status).toBe(409);
    expect((await rival.post("/api/seller", { businessId: bid })).status).toBe(409); // the rival has no shop yet

    // Verified by document → linkable, and the shop wears the badge.
    const claim = expectOk(await owner.post<{ claim: { id: string } }>("/api/business", { action: "claim", businessId: bid, method: "document" })).data.claim;
    expectOk(await owner.post("/api/business", { action: "claim_doc", claimId: claim.id, photo: PHOTO }));
    expectOk(await admin.post("/api/admin/claims", { id: claim.id, approve: true }));
    o = expectOk(await owner.get<Overview>("/api/seller")).data;
    expect(o.todos.map((x) => x.key)).toContain(`link:${bid}`);
    expectOk(await owner.post("/api/seller", { businessId: bid }));
    expect((await owner.post("/api/seller", { businessId: bid })).status).toBe(409); // already
    o = expectOk(await owner.get<Overview>("/api/seller")).data;
    expect(o.shop!.businessId).toBe(bid);
    expect(o.businesses.find((b) => b.id === bid)?.linked).toBe(true);
    const seen = expectOk(await rival.get<{ shop: { verifiedStore: string | null } }>(`/api/shops/${o.shop!.id}`)).data.shop;
    expect(seen.verifiedStore).toBe(place.name);

    // A rival's shop can't take the same business.
    await fund(admin, (await rival.me()).id, 5000);
    expectOk(await rival.post("/api/shops", { action: "create", name: "Rival" }));
    expect((await rival.post("/api/seller", { businessId: bid })).status).toBe(404);

    // Unlink: the badge goes.
    expectOk(await owner.post("/api/seller", { businessId: null }));
    expect(expectOk(await rival.get<{ shop: { verifiedStore: string | null } }>(`/api/shops/${o.shop!.id}`)).data.shop.verifiedStore).toBeNull();
    await Promise.all([admin.dispose(), owner.dispose(), rival.dispose()]);
  });

  test("limits: the 31st new product within an hour is refused with how long to wait", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const seller = await Player.create(baseURL!);
    await seller.goTo(randomSpot());
    await fund(admin, (await seller.me()).id, 5000);
    expectOk(await seller.post("/api/shops", { action: "create", name: "Busy" }));
    for (let i = 0; i < 30; i++) expectOk(await seller.post("/api/shops/products", { action: "create", title: `Thing ${i}`, price: 10 + i, stock: 1 }));
    const r = await seller.post<{ error: string }>("/api/shops/products", { action: "create", title: "One too many", price: 99, stock: 1 });
    expect(r.status).toBe(429);
    expect(r.data.error).toMatch(/\d/);
    await Promise.all([admin.dispose(), seller.dispose()]);
  });
});

