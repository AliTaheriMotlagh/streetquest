// Player ads (server/houseAds.ts): bought with coins, checked like listings (banned text refused, a new
// advertiser's first ads wait), approved ones fill /api/ads/slot and count views and clicks; turned down = coins back.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player } from "../helpers";

type Mine = { ads: { id: string; review: string; shown: number; clicks: number }[]; per100: number; enabled: boolean };
type Slot = { chain: string[]; house: { id: string; title: string; link: boolean } | null };

test("buy, hold, approve, serve, click; a turned-down ad gives the coins back", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const p = await Player.create(baseURL!);
  const me = await p.me();
  await fund(admin, me.id, 10_000);
  const buy = (fields: Record<string, unknown>) => p.post<{ ad: { id: string; review: string } }>("/api/ads/house", { action: "buy", emoji: "🍕", views: 100, ...fields });

  expect((await buy({ title: "Vodka night" })).status).toBe(400); // banned goods
  expect((await buy({ title: "Pizza place", url: "http://plain.example" })).status).toBe(400); // https only
  expect((await buy({ title: "Pizza place", views: 150 })).status).toBe(400); // whole hundreds

  const before = (await p.me()).coins;
  const ad = expectOk(await buy({ title: `Pizza ${Date.now()}`, body: "Hot slices", url: "https://pizza.example/" })).data.ad;
  const per100 = expectOk(await p.get<Mine>("/api/ads/house")).data.per100;
  expect((await p.me()).coins).toBe(before - per100);
  expect(ad.review).toBe("pending");

  // Approved → it fills slots (each fill is a view) and a click goes on to the link.
  expectOk(await admin.post("/api/admin/listings", { action: "decideAd", id: ad.id, approve: true }));
  let served = false;
  for (let i = 0; i < 40 && !served; i++) served = expectOk(await p.get<Slot>("/api/ads/slot")).data.house?.id === ad.id;
  expect(served).toBe(true);
  const go = await p.ctx.get(`/api/ads/go?id=${ad.id}`, { maxRedirects: 0 });
  expect(go.status()).toBe(302);
  expect(go.headers().location).toBe("https://pizza.example/");
  const mine = expectOk(await p.get<Mine>("/api/ads/house")).data.ads.find((a) => a.id === ad.id)!;
  expect(mine.shown).toBeGreaterThan(0);
  expect(mine.clicks).toBe(1);

  // Turned down → coins back.
  const second = expectOk(await buy({ title: `Bakery ${Date.now()}` })).data.ad;
  const mid = (await p.me()).coins;
  expectOk(await admin.post("/api/admin/listings", { action: "decideAd", id: second.id, approve: false, note: "No" }));
  expect((await p.me()).coins).toBe(mid + per100);

  // Unknown ids just go home.
  expect((await p.ctx.get("/api/ads/go?id=nope", { maxRedirects: 0 })).headers().location).toMatch(/\/$/);
  for (const x of [admin, p]) await x.dispose();
});
