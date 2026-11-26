// Listings moderation (lib/stores/moderation.ts, server/moderation.ts): banned goods are refused, a new seller's
// first listings wait for a moderator, an admin lets them through or turns them down, and reports from three
// players hide a live product until a moderator looks again.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player, randomSpot } from "../helpers";

type Product = { id: string; title: string; review: string; reviewNote: string };
type Queue = { pending: { id: string }[]; reports: { shopId: string; target: string; n: number; reasons: Record<string, number> }[] };

const add = (p: Player, title: string, extra: Record<string, unknown> = {}) =>
  p.post<{ product: Product; message: string }>("/api/shops/products", { action: "create", title, price: 50, stock: 5, ...extra });
const visible = async (p: Player, shopId: string) => expectOk(await p.get<{ shop: { products: { id: string }[] } }>(`/api/shops/${shopId}`)).data.shop.products.map((x) => x.id);

test("refuse, hold, approve, reject, and three reports hide a product", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const seller = await Player.create(baseURL!);
  const buyers = [await Player.create(baseURL!), await Player.create(baseURL!), await Player.create(baseURL!)];
  const spot = randomSpot();
  await seller.goTo(spot);
  await fund(admin, (await seller.me()).id, 5000);
  expectOk(await seller.post("/api/shops", { action: "create", name: "Checked Corner" }));
  const shopId = expectOk(await seller.get<{ shop: { id: string } }>("/api/shops/mine")).data.shop.id;

  // Banned goods never save (Persian and English).
  expect((await add(seller, "اسلحه کمری")).status).toBe(400);
  expect((await add(seller, "Vodka 1L")).status).toBe(400);

  // A new seller's first listing waits; buyers don't see it; the seller does, marked pending.
  const cup = expectOk(await add(seller, "Clay cup")).data.product;
  expect(cup.review).toBe("pending");
  expect(await visible(buyers[0], shopId)).not.toContain(cup.id);
  const queue = expectOk(await admin.get<Queue>("/api/admin/listings")).data;
  expect(queue.pending.map((p) => p.id)).toContain(cup.id);
  // Only admins work the queue.
  expect((await buyers[0].get("/api/admin/listings")).status).toBe(403);

  // Approved → visible to buyers.
  expectOk(await admin.post("/api/admin/listings", { action: "decide", productId: cup.id, approve: true }));
  expect(await visible(buyers[0], shopId)).toContain(cup.id);

  // Turned down → hidden, the reason is kept for the seller; an edit puts it back in the queue.
  const mug = expectOk(await add(seller, "Tea mug")).data.product;
  expectOk(await admin.post("/api/admin/listings", { action: "decide", productId: mug.id, approve: false, note: "Blurry title" }));
  const mine = () => seller.get<{ shop: { products: Product[] } }>("/api/shops/mine");
  expect(expectOk(await mine()).data.shop.products.find((p) => p.id === mug.id)).toMatchObject({ review: "rejected", reviewNote: "Blurry title" });
  expectOk(await seller.post("/api/shops/products", { action: "update", productId: mug.id, title: "Glazed tea mug" }));
  expect(expectOk(await mine()).data.shop.products.find((p) => p.id === mug.id)?.review).toBe("pending");

  // The owner can't report their own shop; a bad reason is refused.
  expect((await seller.post("/api/shops/report", { shopId, productId: cup.id, reason: "scam" })).status).toBe(400);
  expect((await buyers[0].post("/api/shops/report", { shopId, productId: cup.id, reason: "because" })).status).toBe(400);

  // Three different players report the live cup → it's hidden and back in the queue with its reports.
  for (const [i, b] of buyers.entries()) {
    await b.goTo(spot);
    expectOk(await b.post("/api/shops/report", { shopId, productId: cup.id, reason: i ? "scam" : "wrongPrice", note: "?" }));
    // Reporting twice counts once.
    if (!i) expectOk(await b.post("/api/shops/report", { shopId, productId: cup.id, reason: "wrongPrice" }));
  }
  expect(await visible(admin, shopId)).not.toContain(cup.id);
  const q2 = expectOk(await admin.get<Queue>("/api/admin/listings")).data;
  expect(q2.pending.map((p) => p.id)).toContain(cup.id);
  expect(q2.reports.find((r) => r.target === cup.id)).toMatchObject({ n: 3, reasons: { scam: 2, wrongPrice: 1 } });

  // A shop report can be dismissed.
  expectOk(await buyers[0].post("/api/shops/report", { shopId, reason: "spam" }));
  expectOk(await admin.post("/api/admin/listings", { action: "dismiss", shopId, target: "shop" }));
  expect(expectOk(await admin.get<Queue>("/api/admin/listings")).data.reports.find((r) => r.shopId === shopId && r.target === "shop")).toBeUndefined();

  for (const p of [admin, seller, ...buyers]) await p.dispose();
});
