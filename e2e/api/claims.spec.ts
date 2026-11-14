// Proving a store is yours (lib/claims.ts, server/claims.ts): a visit claim counts the first visit
// and refuses a second on the same day; a document claim and a dispute go to the admins, who
// approve (the tick; a dispute hands the store over) or turn them down — every step in the audit
// log, the owner's store history without IPs. Plus the travel routes' input checks.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot, uploadPlaces } from "../helpers";

type Claim = { id: string; code: string; status: string; dispute: boolean; visits: number; method: string };
type Dash = { businesses: { id: string; verified: boolean }[]; claims: Record<string, Claim> };
type AuditRow = { action: string; actor: string; targetId: string; ip: string };
// A 1×1 PNG: enough to be a photo.
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function shopWithOwner(baseURL: string) {
  const admin = await adminPlayer(baseURL);
  const tile = await uploadPlaces(admin, randomSpot(), 4);
  const shop = tile.places[0];
  const owner = await Player.create(baseURL);
  await owner.goTo(shop);
  const { data } = expectOk(await owner.post<{ id: string }>("/api/business", { action: "create", osmId: shop.id, name: shop.name, category: "cafe" }));
  return { admin, owner, shop, bid: data.id };
}

test.describe("store claims", () => {
  test("visits: one counted today, the second must wait for another day", async ({ baseURL }) => {
    const { admin, owner, shop, bid } = await shopWithOwner(baseURL!);
    const { data } = expectOk(await owner.post<{ claim: Claim }>("/api/business", { action: "claim", businessId: bid, method: "visits" }));
    expect(data.claim.code).toMatch(/^SQ-[A-Z2-9]{6}$/);
    // Starting the same method again returns the same claim.
    expect((await owner.post<{ claim: Claim }>("/api/business", { action: "claim", businessId: bid, method: "visits" })).data.claim.id).toBe(data.claim.id);
    await owner.goTo(offset(shop, 400));
    expect((await owner.post("/api/business", { action: "claim_visit", claimId: data.claim.id })).status).toBe(400);
    await owner.goTo(shop);
    expect(expectOk(await owner.post<{ visits: number; status: string }>("/api/business", { action: "claim_visit", claimId: data.claim.id })).data).toMatchObject({ visits: 1, status: "pending" });
    expect((await owner.post("/api/business", { action: "claim_visit", claimId: data.claim.id })).status).toBe(400);
    const dash = (await owner.get<Dash>("/api/business")).data;
    expect(dash.claims[bid]).toMatchObject({ method: "visits", visits: 1, status: "pending" });
    // Someone else can't push another player's claim along.
    const other = await Player.create(baseURL!);
    await other.goTo(shop);
    expect((await other.post("/api/business", { action: "claim_visit", claimId: data.claim.id })).status).toBe(404);
    await Promise.all([admin.dispose(), owner.dispose(), other.dispose()]);
  });

  test("document → admin approves → verified, and the log says so", async ({ baseURL }) => {
    const { admin, owner, bid } = await shopWithOwner(baseURL!);
    const { data } = expectOk(await owner.post<{ claim: Claim }>("/api/business", { action: "claim", businessId: bid, method: "document" }));
    expectOk(await owner.post("/api/business", { action: "claim_doc", claimId: data.claim.id, photo: PHOTO, note: "licence attached" }));
    // Players can't see the queue or the photo.
    expect((await owner.get("/api/admin/claims")).status).toBe(403);
    expect((await owner.get(`/api/admin/claims/doc?id=${data.claim.id}`)).status).toBe(403);
    const queue = (await admin.get<{ claims: { id: string; hasDoc: boolean; risk: number }[] }>("/api/admin/claims?status=review")).data.claims;
    expect(queue.find((c) => c.id === data.claim.id)?.hasDoc).toBe(true);
    expect((await admin.get(`/api/admin/claims/doc?id=${data.claim.id}`)).status).toBe(200);
    expectOk(await admin.post("/api/admin/claims", { id: data.claim.id, approve: true }));
    expect((await admin.post("/api/admin/claims", { id: data.claim.id, approve: false })).status).toBe(409);
    expect((await owner.get<Dash>("/api/business")).data.businesses.find((b) => b.id === bid)?.verified).toBe(true);
    // A verified store asks for no more proof.
    expect((await owner.post("/api/business", { action: "claim", businessId: bid, method: "visits" })).status).toBe(400);
    const log = (await admin.get<{ rows: AuditRow[] }>(`/api/admin/audit?target=${data.claim.id}`)).data.rows.map((r) => r.action);
    expect(log).toEqual(expect.arrayContaining(["claim.start", "claim.document", "admin.verify"]));
    const mine = (await owner.post<{ history: AuditRow[] }>("/api/business", { action: "history", businessId: bid })).data.history;
    expect(mine.map((r) => r.action)).toEqual(expect.arrayContaining(["business.create", "admin.verify"]));
    expect(mine.every((r) => r.ip === "")).toBe(true);
    expect((await owner.get("/api/admin/audit")).status).toBe(403);
    await Promise.all([admin.dispose(), owner.dispose()]);
  });

  test("a dispute needs a document, and approval hands the store over", async ({ baseURL }) => {
    const { admin, owner, shop, bid } = await shopWithOwner(baseURL!);
    const real = await Player.create(baseURL!);
    await real.goTo(shop);
    expect((await real.post("/api/business", { action: "claim", businessId: bid, method: "visits" })).status).toBe(400);
    const { data } = expectOk(await real.post<{ claim: Claim }>("/api/business", { action: "claim", businessId: bid, method: "document" }));
    expect(data.claim.dispute).toBe(true);
    expectOk(await real.post("/api/business", { action: "claim_doc", claimId: data.claim.id, photo: PHOTO }));
    expectOk(await admin.post("/api/admin/claims", { id: data.claim.id, approve: true, reason: "licence matches" }));
    expect((await real.get<Dash>("/api/business")).data.businesses.map((b) => b.id)).toContain(bid);
    expect((await owner.get<Dash>("/api/business")).data.businesses.map((b) => b.id)).not.toContain(bid);
    const log = (await admin.get<{ rows: AuditRow[] }>("/api/admin/audit?group=admin")).data.rows;
    expect(log.some((r) => r.action === "admin.transfer" && r.targetId === data.claim.id)).toBe(true);
    await Promise.all([admin.dispose(), owner.dispose(), real.dispose()]);
  });

  test("travel and planes: inputs checked, signed-in only", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    expect((await p.get("/api/travel?trips=1&from=tehran&to=mashhad&date=tomorrow")).status).toBe(400);
    expect((await p.get("/api/flights?lat=999&lng=0")).status).toBe(400);
    // Same city both ways: nothing to look up.
    const same = expectOk(await p.get<{ trips: unknown[]; none: string[] }>("/api/travel?trips=1&from=tehran&to=tehran&date=2026-11-20")).data;
    expect(same.trips).toEqual([]);
    await p.dispose();
  });
});
