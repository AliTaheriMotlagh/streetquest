// Store menus and prices from other sites: the server reads Snappfood / Torob from a stub
// this file serves (SNAPPFOOD_URL / TOROB_URL in playwright.config.ts), matches vendors to
// real places by name and position, and lets owners pin their own links.
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { STUB_PORT } from "../../playwright.config";
import { adminPlayer, expectOk, fund, offset, Player, randomSpot, uploadPlaces, type LatLng } from "../helpers";

/** `unlisted`: missing from the area's vendor list, so only Snappfood's search finds it. */
type StubVendor = { code: string; title: string; lat: number; lon: number; type: string; unlisted?: boolean; items: { title: string; price: number; discount?: number }[] };
const vendors: StubVendor[] = [];
type StubShop = { id: number; name: string; products: string[] };
const shops: StubShop[] = [];
let server: Server;
let calls = 0;

const near = (a: LatLng, b: { lat: number; lon: number }) => Math.abs(a.lat - b.lat) < 0.03 && Math.abs(a.lng - b.lon) < 0.03;
const vendorJson = (v: StubVendor) => ({ vendorCode: v.code, title: v.title, childType: v.type, lat: v.lat, lon: v.lon, rating: 8.7, logo: "", menuUrl: `https://snappfood.ir/restaurant/menu/${v.code}/x`, isOpen: true, description: "" });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    calls++;
    const u = new URL(req.url ?? "/", "http://stub");
    const send = (body: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)));
    if (u.pathname === "/sf/mobile/v3/restaurant/vendors-list") {
      const at = { lat: Number(u.searchParams.get("lat")), lng: Number(u.searchParams.get("long")) };
      const page = u.searchParams.get("page") === "0" ? vendors.filter((v) => near(at, v) && !v.unlisted) : [];
      return send({ status: true, data: { finalResult: page.map((v) => ({ type: "VENDOR", data: vendorJson(v) })) } });
    }
    if (u.pathname === "/sf/mobile/v2/restaurant/details/dynamic") {
      const v = vendors.find((x) => x.code === u.searchParams.get("vendorCode"));
      if (!v) return (res.statusCode = 404), res.end();
      return send({ status: true, data: { vendor: { ...vendorJson(v), coverPath: "", address: "Stub street 1" }, menus: [{ category: "Popular", products: v.items.map((p, i) => ({ id: i + 1, ...p, description: "", images: [] })) }] } });
    }
    if (u.pathname === "/sf/search/api/v1/desktop/search") {
      // Like the real one: by name only, anywhere in the country, no positions.
      const q = u.searchParams.get("query") ?? "";
      const hits = vendors.filter((v) => q.split(" ").some((w) => w.length > 2 && v.title.includes(w)));
      return send({ data: { vendor: { total: hits.length, items: hits.map((v) => ({ code: v.code, title: v.title, type: "VENDOR" })) } } });
    }
    if (u.pathname === "/tr/v4/internet-shop/details/") {
      const s = shops.find((x) => x.id === Number(u.searchParams.get("id")));
      if (!s) return (res.statusCode = 404), res.end();
      return send({ id: s.id, name: s.name, logo_512: "" });
    }
    if (u.pathname === "/tr/v4/base-product/search/") {
      const q = u.searchParams.get("q") ?? "";
      const inShop = shops.find((x) => x.id === Number(u.searchParams.get("shop_id")));
      if (inShop) {
        const items = inShop.products.filter((n) => n.includes(q));
        return send({ results: items.map((n, i) => ({ name1: n, price: 50_000 + i, price_prefix: "cheapest", shop_text: "در ۳ فروشگاه", image_url: "", web_client_absolute_url: `/p/${inShop.id}-${i}/` })) });
      }
      const named = shops.find((x) => x.name === q);
      if (named) return send({ results: [], business_profile_result: { internet_shops: [{ shop_id: named.id, name: named.name, logo_512: "", num_bases: named.products.length }] } });
      return send({ results: [
        { name1: `${q} phone case`, price: 120_000, shop_text: `در ${q}`, image_url: "", web_client_absolute_url: "/p/1/case/" },
        { name1: `${q} charger`, price: 90_000, shop_text: "در Someone Else", image_url: "", web_client_absolute_url: "/p/2/charger/" },
      ] });
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((ok) => server.listen(STUB_PORT, ok));
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

const code = () => Math.random().toString(36).slice(2, 8).padEnd(6, "x");

test.describe("store menus & prices", () => {
  test("a real café shows its Snappfood menu, matched by name and place", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const { places } = await uploadPlaces(admin, randomSpot(), 4);
    const cafe = places[0];
    const tag = cafe.name.split(" ").pop()!;
    // Its Snappfood page (a few metres off, "کافه" in front), and another place next door.
    const v = { code: code(), title: `کافه Test Café ${tag}`, ...((p) => ({ lat: p.lat, lon: p.lng }))(offset(cafe, 15)), type: "CAFFE", items: [{ title: "Latte", price: 1_200_000, discount: 200_000 }] };
    const other = { code: code(), title: "Pizza Rival", ...((p) => ({ lat: p.lat, lon: p.lng }))(offset(cafe, 20, 10)), type: "RESTAURANT", items: [{ title: "Pizza", price: 3_000_000 }] };
    vendors.push(v, other);

    const p = await Player.create(baseURL!);
    await p.goTo(cafe);
    const q = `store=place&id=${cafe.id}&name=${encodeURIComponent(cafe.name)}&lat=${cafe.lat}&lng=${cafe.lng}&cat=cafe`;
    const { data } = expectOk(await p.get<{ menu: { vendor: { code: string; kind: string }; sections: { items: { title: string; price: number; priceNow: number }[] }[] } | null; links: { kind: string }[] }>(`/api/local?${q}`));
    expect(data.menu?.vendor.code).toBe(v.code);
    expect(data.menu?.vendor.kind).toBe("cafe");
    // Rial → toman, discount applied.
    expect(data.menu?.sections[0].items[0]).toMatchObject({ title: "Latte", price: 120_000, priceNow: 100_000 });
    expect(data.links.map((l) => l.kind)).toContain("snappfood");

    // The map layer lists both, nearest first; the menu opens by code.
    const near = expectOk(await p.get<{ vendors: { code: string }[] }>(`/api/local?near=1&lat=${cafe.lat}&lng=${cafe.lng}`)).data.vendors.map((x) => x.code);
    expect(near.slice(0, 2)).toEqual([v.code, other.code]);
    expect(expectOk(await p.get<{ menu: { vendor: { title: string } } }>(`/api/local?menu=${other.code}`)).data.menu.vendor.title).toBe("Pizza Rival");

    // A grocery with no Snappfood page of its own isn't given the pizza place's menu.
    const shop = places[1];
    const none = expectOk(await p.get<{ menu: unknown }>(`/api/local?store=place&id=${shop.id}&name=${encodeURIComponent(shop.name)}&lat=${shop.lat}&lng=${shop.lng}&cat=grocery`)).data;
    expect(none.menu).toBeNull();

    // Cached: asking again doesn't call the site again.
    const before = calls;
    expectOk(await p.get(`/api/local?${q}`));
    expect(calls).toBe(before);
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("owners pin their own Snappfood, Torob and Divar links", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const { places } = await uploadPlaces(admin, randomSpot(), 2);
    const place = places[0];
    const mine = { code: code(), title: "Totally Different Name", ...((p) => ({ lat: p.lat, lon: p.lng }))(offset(place, 400)), type: "RESTAURANT", items: [{ title: "Kebab", price: 2_500_000 }] };
    vendors.push(mine);
    const owner = await Player.create(baseURL!);
    await owner.goTo(place);
    const base = { action: "create", osmId: place.id, name: place.name, category: "cafe" };
    // Links must point at the site they're for.
    expect((await owner.post("/api/business", { ...base, snappfood: "https://evil.example/menu/abcdef" })).status).toBe(400);
    expect((await owner.post("/api/business", { ...base, torob: "https://torob.com.evil.example/shop/1" })).status).toBe(400);
    expect((await owner.post("/api/business", { ...base, divar: "http://divar.ir/v/x" })).status).toBe(400);
    const { data } = expectOk(await owner.post<{ id: string }>("/api/business", { ...base, snappfood: `https://snappfood.ir/restaurant/menu/${mine.code}/kebab`, torob: "https://torob.com/shop/123/my-shop/", divar: "https://divar.ir/v/my-ad/AbCd" }));

    const fan = await Player.create(baseURL!);
    await fan.goTo(place);
    const seen = expectOk(await fan.get<{ menu: { vendor: { code: string } } | null; links: { kind: string; url: string }[] }>(`/api/local?store=biz&id=${data.id}`)).data;
    expect(seen.menu?.vendor.code).toBe(mine.code);
    expect(seen.links.map((l) => l.kind)).toEqual(["snappfood", "torob", "divar"]);
    // The claimed place's card uses the owner's links too.
    const viaPlace = expectOk(await fan.get<{ menu: { vendor: { code: string } } | null }>(`/api/local?store=place&id=${place.id}&name=x&lat=${place.lat}&lng=${place.lng}&cat=cafe`)).data;
    expect(viaPlace.menu?.vendor.code).toBe(mine.code);
    // The dashboard gives them back for editing.
    const dash = (await owner.get<{ businesses: { snappfood: string; divar: string }[] }>("/api/business")).data;
    expect(dash.businesses[0]).toMatchObject({ divar: "https://divar.ir/v/my-ad/AbCd" });
    await Promise.all([admin.dispose(), owner.dispose(), fan.dispose()]);
  });

  test("a Market shop: its own Torob listings and a price search", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const seller = await Player.create(baseURL!);
    await fund(admin, (await seller.me()).id, 5000);
    await seller.goTo(randomSpot());
    const name = `Gadget ${Math.random().toString(36).slice(2, 7)}`;
    expectOk(await seller.post("/api/shops", { action: "create", name, category: "tech", divar: "https://divar.ir/v/gadgets/XyZ" }));
    const shopId = (await seller.get<{ shop: { id: string; divar: string } }>("/api/shops/mine")).data.shop.id;
    expect((await seller.post("/api/shops", { action: "update", torob: "not a link" })).status).toBe(400);

    const buyer = await Player.create(baseURL!);
    const d = expectOk(await buyer.get<{ menu: unknown; torob: { title: string; shop: string; url: string }[]; links: { kind: string }[] }>(`/api/local?store=shop&id=${shopId}`)).data;
    expect(d.menu).toBeNull();
    // Only the listing sold by this shop, not "Someone Else"'s.
    expect(d.torob).toEqual([expect.objectContaining({ title: `${name} phone case`, shop: name, url: "https://torob.com/p/1/case/" })]);
    expect(d.links.map((l) => l.kind)).toEqual(["divar"]);
    const s = expectOk(await buyer.get<{ items: { price: number }[] }>(`/api/local?torob=${encodeURIComponent("usb cable")}`)).data;
    expect(s.items.map((i) => i.price)).toEqual([120_000, 90_000]);
    await Promise.all([admin.dispose(), seller.dispose(), buyer.dispose()]);
  });

  test("a café missing from the area's list is found by Snappfood's search, checked by position", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const { places } = await uploadPlaces(admin, randomSpot(), 2);
    const cafe = places[0];
    const tag = cafe.name.split(" ").pop()!;
    // Same name in another city (the search lists it first), then the real one next door.
    const far = { code: code(), title: `Test Café ${tag}`, lat: cafe.lat + 3, lon: cafe.lng, type: "CAFFE", unlisted: true, items: [{ title: "Wrong", price: 10_000 }] };
    const here = { code: code(), title: `کافه Test Café ${tag}`, ...((p) => ({ lat: p.lat, lon: p.lng }))(offset(cafe, 20)), type: "CAFFE", unlisted: true, items: [{ title: "Espresso", price: 900_000 }] };
    vendors.push(far, here);
    const p = await Player.create(baseURL!);
    const q = `store=place&id=${cafe.id}&name=${encodeURIComponent(cafe.name)}&lat=${cafe.lat}&lng=${cafe.lng}&cat=cafe`;
    const { data } = expectOk(await p.get<{ menu: { vendor: { code: string }; sections: { items: { title: string }[] }[] } | null }>(`/api/local?${q}`));
    expect(data.menu?.vendor.code).toBe(here.code);
    expect(data.menu?.sections[0].items[0].title).toBe("Espresso");
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("a store with its own Torob shop shows that shop's catalog and searches inside it", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const seller = await Player.create(baseURL!);
    await fund(admin, (await seller.me()).id, 5000);
    await seller.goTo(randomSpot());
    const name = `Phonix ${Math.random().toString(36).slice(2, 7)}`;
    const shop = { id: 1000 + Math.floor(Math.random() * 1e6), name, products: ["Galaxy charger", "iPhone case", "USB cable"] };
    shops.push(shop);
    expectOk(await seller.post("/api/shops", { action: "create", name, category: "tech" }));
    const shopId = (await seller.get<{ shop: { id: string } }>("/api/shops/mine")).data.shop.id;

    const buyer = await Player.create(baseURL!);
    type D = { torobShop: { id: number; name: string; url: string; count: number } | null; torob: { title: string; from: boolean }[]; links: { kind: string; url: string }[] };
    const d = expectOk(await buyer.get<D>(`/api/local?store=shop&id=${shopId}`)).data;
    expect(d.torobShop).toMatchObject({ id: shop.id, name, url: `https://torob.com/shop/${shop.id}/`, count: 3 });
    expect(d.torob.map((i) => i.title)).toEqual(shop.products);
    expect(d.torob[0].from).toBe(true);
    expect(d.links).toEqual([expect.objectContaining({ kind: "torob", url: `https://torob.com/shop/${shop.id}/` })]);
    // Searching inside the shop, and the shop's whole catalog with an empty query.
    expect(expectOk(await buyer.get<{ items: { title: string }[] }>(`/api/local?torob=case&shop=${shop.id}`)).data.items.map((i) => i.title)).toEqual(["iPhone case"]);
    expect(expectOk(await buyer.get<{ items: unknown[] }>(`/api/local?torob=&shop=${shop.id}`)).data.items).toHaveLength(3);
    expect((await buyer.get(`/api/local?torob=x`)).status).toBe(400);

    // An owner's torob.com/shop/<id> link picks the shop, whatever the store is called.
    const other = { id: shop.id + 1, name: "Some Torob Name", products: ["Laptop stand"] };
    shops.push(other);
    expectOk(await seller.post("/api/shops", { action: "update", torob: `https://torob.com/shop/${other.id}/some-torob-name/` }));
    const d2 = expectOk(await buyer.get<D>(`/api/local?store=shop&id=${shopId}`)).data;
    expect(d2.torobShop?.name).toBe("Some Torob Name");
    expect(d2.torob.map((i) => i.title)).toEqual(["Laptop stand"]);
    await Promise.all([admin.dispose(), seller.dispose(), buyer.dispose()]);
  });
});
