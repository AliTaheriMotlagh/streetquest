// Player shops: products of every kind (lib/shopKinds.ts) priced in coins or toman, the seller's contact for toman
// products, one-field updates that keep everything else, and the private buyer ↔ shop chat.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player, randomSpot } from "../helpers";

type Product = { id: string; title: string; description: string; kind: string; details: Record<string, unknown>; currency: string; price: number; stock: number; discountPct: number; featured: boolean; over: boolean; review?: string };
type Shop = { id: string; name: string; tagline: string; about: string; phone: string; payLink: string; open: boolean; products: Product[] };
type Mine = { shop: Shop | null; chats: { room: string; buyer: { username: string }; last: string; fromBuyer: boolean }[] };

async function openShop(baseURL: string) {
  const admin = await adminPlayer(baseURL);
  const seller = await Player.create(baseURL);
  const buyer = await Player.create(baseURL);
  const spot = randomSpot();
  await seller.goTo(spot);
  await buyer.goTo(spot);
  await fund(admin, (await seller.me()).id, 5000);
  await fund(admin, (await buyer.me()).id, 5000);
  // A payment link that isn't https is refused; a messy phone is cleaned.
  expect((await seller.post("/api/shops", { action: "create", name: "Sara's Corner", payLink: "http://zarinp.al/sara" })).status).toBe(400);
  expect((await seller.post("/api/shops", { action: "create", name: "Sara's Corner", phone: "call me" })).status).toBe(400);
  expectOk(await seller.post("/api/shops", { action: "create", name: "Sara's Corner", tagline: "Fresh every day", about: "Pickup at the door", phone: "۰۹۱۲ ۱۲۳ ۴۵۶۷", payLink: "https://zarinp.al/sara" }));
  const shop = expectOk(await seller.get<Mine>("/api/shops/mine")).data.shop!;
  expect(shop.phone).toBe("09121234567");
  expect(shop.payLink).toBe("https://zarinp.al/sara");
  return { admin, seller, buyer, shop };
}
const add = (p: Player, fields: Record<string, unknown>) => p.post<{ product: Product }>("/api/shops/products", { action: "create", title: "Thing", price: 10, stock: 5, ...fields });
/** A new seller's first listings wait for a moderator (lib/stores/moderation.ts): the admin lets this one through. */
async function live(admin: Player, r: Awaited<ReturnType<typeof add>>) {
  const res = expectOk(r);
  if (res.data.product.review === "pending") expectOk(await admin.post("/api/admin/listings", { action: "decide", productId: res.data.product.id, approve: true }));
  return res;
}

test.describe("player shops", () => {
  test("kinds and currencies: details cleaned, tickets need a date, toman is paid to the seller", async ({ baseURL }) => {
    const { admin, seller, buyer, shop } = await openShop(baseURL!);

    // Coins need a price of at least 1; toman may be 0 ("ask the seller").
    expect((await add(seller, { price: 0 })).status).toBe(400);
    const ad = (await live(admin, await add(seller, { title: "Pride 131, 1399", kind: "ad", currency: "toman", price: 0, details: { category: "vehicle", negotiable: true, facts: [{ k: "Km", v: "80,000" }], phone: "0935 000 1111", junk: "x" } }))).data.product;
    expect(ad.kind).toBe("ad");
    expect(ad.currency).toBe("toman");
    expect(ad.details).toEqual({ category: "vehicle", negotiable: true, facts: [{ k: "Km", v: "80,000" }], phone: "09350001111" });

    // A ticket without its date is refused; one in the past is listed as over and can't be bought.
    expect((await add(seller, { title: "Concert", kind: "ticket", details: { venue: "Milad" } })).status).toBe(400);
    const past = (await live(admin, await add(seller, { title: "Last week's show", kind: "ticket", details: { when: Date.now() - 7 * 86_400_000 } }))).data.product;
    expect(past.over).toBe(true);
    const item = (await live(admin, await add(seller, { title: "Scarf", price: 120, details: { brand: "Hand-made", condition: "new" } }))).data.product;

    const seen = expectOk(await buyer.get<{ shop: Shop }>(`/api/shops/${shop.id}`)).data.shop;
    expect(seen.phone).toBe("09121234567");
    expect(seen.products.find((p) => p.id === ad.id)?.details.phone).toBe("09350001111");

    // Toman: never bought through the game. Over: refused. Coins: bought as before.
    expect((await buyer.post("/api/shops/orders", { action: "buy", productId: ad.id, qty: 1 })).status).toBe(400);
    expect((await buyer.post("/api/shops/orders", { action: "buy", productId: past.id, qty: 1 })).status).toBe(400);
    const before = (await buyer.me()).coins;
    expectOk(await buyer.post("/api/shops/orders", { action: "buy", productId: item.id, qty: 1, price: 120 }));
    expect((await buyer.me()).coins).toBe(before - 120);
    for (const p of [admin, seller, buyer]) await p.dispose();
  });

  test("a one-field update (⭐, pause) keeps every other field", async ({ baseURL }) => {
    const { admin, seller, buyer, shop } = await openShop(baseURL!);
    const p = expectOk(await add(seller, { title: "Pizza", description: "Thin crust", kind: "food", price: 50, stock: 7, discountPct: 20, details: { section: "Pizzas", veg: true } })).data.product;
    expectOk(await seller.post("/api/shops/products", { action: "update", productId: p.id, featured: true }));
    const after = expectOk(await seller.get<Mine>("/api/shops/mine")).data.shop!.products.find((x) => x.id === p.id)!;
    expect(after).toMatchObject({ featured: true, description: "Thin crust", kind: "food", stock: 7, discountPct: 20, currency: "coins", details: { section: "Pizzas", veg: true } });

    // Switching it to toman alone is checked against its price; the details stay.
    expectOk(await seller.post("/api/shops/products", { action: "update", productId: p.id, currency: "toman" }));
    expect(expectOk(await seller.get<Mine>("/api/shops/mine")).data.shop!.products.find((x) => x.id === p.id)!.details).toEqual({ section: "Pizzas", veg: true });

    expectOk(await seller.post("/api/shops", { action: "update", open: false }));
    const paused = expectOk(await seller.get<Mine>("/api/shops/mine")).data.shop!;
    expect(paused).toMatchObject({ open: false, name: shop.name, tagline: "Fresh every day", about: "Pickup at the door", phone: "09121234567", payLink: "https://zarinp.al/sara" });
    for (const x of [admin, seller, buyer]) await x.dispose();
  });

  test("buyer ↔ shop chat: just the two of them, listed in the seller's inbox", async ({ baseURL }) => {
    const { admin, seller, buyer, shop } = await openShop(baseURL!);
    const stranger = await Player.create(baseURL!);
    const buyerId = (await buyer.me()).id;
    const room = `shop:${shop.id}:${buyerId}`;

    // The owner can't open a "buyer" chat with their own shop, and nobody can make one up for someone else.
    const sellerId = (await seller.me()).id;
    expect((await seller.post("/api/chat", { room: `shop:${shop.id}:${sellerId}`, body: "hi" })).status).toBe(403);
    expect((await stranger.post("/api/chat", { room: `shop:${shop.id}:${buyerId}x`, body: "hi" })).status).toBe(403);

    expectOk(await buyer.post("/api/chat", { room, body: "Is the price negotiable?" }));
    await new Promise((r) => setTimeout(r, 800)); // keep the two messages in order
    expectOk(await seller.post("/api/chat", { room, body: "A little — come by" }));
    expect((await stranger.post("/api/chat", { room, body: "hi" })).status).toBe(403);
    expect((await stranger.get(`/api/chat?room=${encodeURIComponent(room)}`)).status).toBe(403);

    const msgs = expectOk(await buyer.get<{ messages: { body: string }[] }>(`/api/chat?room=${encodeURIComponent(room)}`)).data.messages;
    expect(msgs.map((m) => m.body)).toEqual(["Is the price negotiable?", "A little — come by"]);
    const chats = expectOk(await seller.get<Mine>("/api/shops/mine")).data.chats;
    expect(chats).toEqual([expect.objectContaining({ room, last: "A little — come by", fromBuyer: false, buyer: expect.objectContaining({ username: buyer.username }) })]);
    for (const x of [admin, seller, buyer, stranger]) await x.dispose();
  });
});

test.describe("a shop's public page", () => {
  test("/s/<id>: the shop and its products, Store JSON-LD with toman offers, in the sitemap; unknown ids 404", async ({ baseURL }) => {
    const { admin, seller, buyer, shop } = await openShop(baseURL!);
    await live(admin, await add(seller, { title: "Pride 131 </script><b>x", kind: "ad", currency: "toman", price: 285_000_000 }));
    await live(admin, await add(seller, { title: "Scarf", price: 120 }));
    const r = await buyer.ctx.get(`/s/${shop.id}?lang=en`);
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toContain("Sara&#x27;s Corner");
    expect(html).toContain('"@type":"Store"');
    expect(html).toContain('"priceCurrency":"IRR"');
    expect(html).not.toContain("</script><b>x"); // user text can't break out of the JSON-LD
    expect(html).toMatch(new RegExp(`rel="canonical" href="[^"]*/s/${shop.id}\\?lang=en"`));
    expect(html).toContain(`/play?shop=${shop.id}`);
    expect(await (await buyer.ctx.get("/sitemap.xml")).text()).toContain(`/s/${shop.id}`);
    expect((await buyer.ctx.get("/s/nope")).status()).toBe(404);
    for (const p of [admin, seller, buyer]) await p.dispose();
  });
});
