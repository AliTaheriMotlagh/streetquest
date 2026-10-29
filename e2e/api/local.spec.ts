// Store menus and prices from other sites: the server reads Snappfood / Torob / Divar from
// a stub this file serves (SNAPPFOOD_URL / TOROB_URL / DIVAR_URL in playwright.config.ts),
// matches vendors to real places by name and position, lets owners pin their own links,
// shows a place's contacts from the map, and pins Divar ads on neighbourhoods.
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { STUB_PORT } from "../../playwright.config";
import { adminPlayer, expectOk, fund, offset, Player, randomSpot, uploadPlaces, type LatLng } from "../helpers";

/** `unlisted`: missing from the area's vendor list, so only Snappfood's search finds it. */
type StubVendor = { code: string; title: string; lat: number; lon: number; type: string; unlisted?: boolean; items: { title: string; price: number; discount?: number }[] };
const vendors: StubVendor[] = [];
type StubShop = { id: number; name: string; products: string[]; address?: string; phone?: string };
const shops: StubShop[] = [];
/**
 * Torob's walk-in stores, on its map of sellers: two in Stubtown (500 m apart) and one
 * 55 km away. Fixed, at 60°S where no random test spot lands, because the server keeps
 * the map for a day and the e2e database is never wiped.
 */
const STUBTOWN = { lat: -60, lng: 100 };
const walkIns = [
  { id: 900001, name: "Stub Mobile", ...STUBTOWN, address: "Stub street 9, by the park", phone: "02155550001", products: ["Phone X", "Phone Y case"] },
  { id: 900002, name: "Stub Shoes", ...offset(STUBTOWN, 0, 500), address: "Stub square 2", phone: "02155550002", products: ["Running shoe"] },
  { id: 900003, name: "Far Away Shop", lat: -60, lng: 101, address: "Elsewhere 1", phone: "", products: ["Thing"] },
];
shops.push(...walkIns);
/** Torob's hours table: Saturday–Thursday 09:00–20:30 (in Persian digits, as Torob writes them), Friday closed. */
const torobWeek = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"].map((title, i) => ({ title, text: i < 6 ? "۰۹:۰۰ - ۲۰:۳۰" : "تعطیل" }));
/**
 * Divar: one city, and a fixed row of neighbourhoods at 75°N, where no random test spot
 * lands. Fixed because the server keeps Divar's neighbourhood list for a week and the e2e
 * database is never wiped: each run picks its own pair in the row (see the Divar test).
 * Pair k: "A" at 75°N, (−170 + 0.3k)°E, and "B" 1.2 km east of it; the next pair is ~8 km on.
 */
const pairAt = (k: number) => ({ lat: 75, lng: -170 + 0.3 * k });
const districts = Array.from({ length: 1000 }, (_, k) => [
  { id: 2 * k + 1, name: `A${k}`, ...pairAt(k) },
  { id: 2 * k + 2, name: `B${k}`, ...offset(pairAt(k), 0, 1200) },
]).flat();
/** `district` 0: a whole town's ads (Smalltown has no neighbourhoods). */
const ads: { district: number; cat: string; title: string }[] = [{ district: 0, cat: "home-kitchen", title: "Old sofa" }];
const SMALLTOWN = { latitude: -75, longitude: 20 };
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
      // Like the real one: everyone delivering here, `count` of them, in pages.
      const at = { lat: Number(u.searchParams.get("lat")), lng: Number(u.searchParams.get("long")) };
      const all = vendors.filter((v) => near(at, v) && !v.unlisted);
      const size = Number(u.searchParams.get("page_size")), from = Number(u.searchParams.get("page")) * size;
      return send({ status: true, data: { count: all.length, finalResult: all.slice(from, from + size).map((v) => ({ type: "VENDOR", data: vendorJson(v) })) } });
    }
    // Northville (neighbourhoods along 75°N) and Smalltown (none) far from every random spot.
    if (u.pathname === "/dv/v8/places/cities") return send({ cities: [{ id: 1, name: "Northville", slug: "northville", centroid: { latitude: 75, longitude: 0 }, radius: 3_000_000 }, { id: 2, name: "Smalltown", slug: "smalltown", centroid: SMALLTOWN, radius: 3000 }] });
    if (u.pathname === "/dv/v8/places/cities/2/districts") return send({ districts: [] });
    if (u.pathname === "/dv/v8/places/cities/1/districts") return send({ districts: districts.map((d) => ({ id: d.id, name: d.name, slug: `d${d.id}`, centroid: { latitude: d.lat, longitude: d.lng } })) });
    if (u.pathname === "/dv/v8/postlist/w/search" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const data = JSON.parse(raw).search_data.form_data.data;
        const cat = data.category.str.value, d = Number(data.districts?.repeated_string.value[0] ?? 0);
        const rows = ads.filter((a) => a.district === d && (cat === "ROOT" || a.cat === cat));
        send({ list_widgets: rows.map((a, i) => ({ widget_type: "POST_ROW", data: { title: a.title, token: `t${d}x${i}${a.cat}`, image_url: "", middle_description_text: "۱,۰۰۰ تومان", bottom_description_text: "در محله" } })) });
      });
      return;
    }
    if (u.pathname === "/sf/mobile/v2/restaurant/details/dynamic") {
      const v = vendors.find((x) => x.code === u.searchParams.get("vendorCode"));
      if (!v) return (res.statusCode = 404), res.end();
      // Saturday (1) … Thursday (6) lunch and dinner, closed on Friday (7).
      const schedules = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, allDay: false, startHour: "11:30", stopHour: "15:30" }, { weekday, allDay: false, startHour: "19:00", stopHour: "23:30" }]);
      const vendor = { ...vendorJson(v), coverPath: "", address: "Stub street 1", schedules, customerPhone: "02112345678", area: "Stubville", commentCount: 2, reviewStars: { one: 0, two: 0, three: 10, four: 30, five: 60 }, minOrder: 500_000, deliveryFee: 150_000 };
      return send({ status: true, data: { vendor, menus: [{ category: "Popular", products: v.items.map((p, i) => ({ id: i + 1, ...p, description: "", images: [] })) }] } });
    }
    if (u.pathname === "/sf/mobile/v1/restaurant/vendor-comment") {
      // Two reviews on the first page, then none.
      const first = u.searchParams.get("page") === "0";
      const comments = first
        ? [
            { commentId: 11, sender: "Mina", date: "۱۴۰۵/۰۸/۰۶", rate: 10, commentText: "Great kebab", foods: [{ title: "Kebab" }], replies: [{ commentText: "Thank you!" }] },
            { commentId: 12, sender: "", date: "۱۴۰۵/۰۸/۰۵", rate: 3, commentText: "Cold food", foods: [], replies: [] },
          ]
        : [];
      return send({ status: true, data: { count: 2, pageSize: 10, comments } });
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
      return send({ id: s.id, name: s.name, logo_512: "", address: s.address ?? "", phone: s.phone ?? "", city: "Stubtown", shop_images: s.address ? [`https://example.com/${s.id}.jpg`] : [] });
    }
    if (u.pathname === "/tr/v4/base-product/map/sellers/") {
      // Every walk-in seller of a product, wherever they are: listing "b" only has the first.
      const list = u.searchParams.get("prk") === "walkin-b" ? walkIns.slice(0, 1) : walkIns;
      return send({ count: list.length, result: list.map((w) => ({ shop_id: w.id, shop_name: w.name, shop_name2: "Stubtown", name1: `${w.address.slice(0, 8)}...`, location: { lat: w.lat, lon: w.lng }, media: [{ type: "image", url: `https://example.com/${w.id}-front.jpg` }], working_hours: { type: "schedule", schedule: torobWeek } })) });
    }
    if (u.pathname === "/tr/v4/base-product/search/") {
      const q = u.searchParams.get("q") ?? "";
      // "Has a walk-in seller": two listings for any product.
      if (u.searchParams.get("shop_type") === "offline") return send({ results: [{ name1: q, random_key: "walkin-a" }, { name1: `${q} 2`, random_key: "walkin-b" }] });
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

test.describe("store hours, reviews and walk-in stores", () => {
  test("a vendor's card: hours, phone, delivery terms, star shares and its reviews", async ({ baseURL }) => {
    const spot = randomSpot();
    const v = { code: code(), title: "Hours Test Kebab", lat: spot.lat, lon: spot.lng, type: "RESTAURANT", items: [{ title: "Kebab", price: 2_000_000 }] };
    vendors.push(v);
    const p = await Player.create(baseURL!);
    const menu = expectOk(await p.get<{ menu: { week: number[][][]; phone: string; area: string; reviews: number; stars: number[]; minOrder: number; deliveryFee: number } }>(`/api/local?menu=${v.code}`)).data.menu;
    // Saturday first: lunch and dinner every day but Friday; 23:30 stays the same day.
    expect(menu.week[0]).toEqual([[690, 930], [1140, 1410]]);
    expect(menu.week[6]).toEqual([]);
    expect(menu).toMatchObject({ phone: "02112345678", area: "Stubville", reviews: 2, stars: [0, 0, 10, 30, 60], minOrder: 50_000, deliveryFee: 15_000 });

    const page = expectOk(await p.get<{ reviews: { count: number; reviews: { who: string; rate: number; text: string; foods: string[]; reply: string }[] } }>(`/api/local?reviews=${v.code}`)).data.reviews;
    expect(page.count).toBe(2);
    // Out of 10 on Snappfood, out of 5 here.
    expect(page.reviews[0]).toMatchObject({ who: "Mina", rate: 5, text: "Great kebab", foods: ["Kebab"], reply: "Thank you!" });
    expect(page.reviews[1]).toMatchObject({ rate: 2, foods: [], reply: "" });
    expect(expectOk(await p.get<{ reviews: { reviews: unknown[] } }>(`/api/local?reviews=${v.code}&page=1`)).data.reviews.reviews).toEqual([]);
    expect((await p.get(`/api/local?reviews=NOT-A-CODE`)).status).toBe(400);
    await p.dispose();
  });

  test("a place spelled without the space still finds its menu, and the map's hours become a week", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const tag = Math.random().toString(36).slice(2, 6);
    const { places } = await uploadPlaces(admin, randomSpot(), 2, (i) => (i === 0 ? { name: `چلوکباب جوان${tag}`, cat: "restaurant", info: { hours: "Sa-Th 11:00-23:00; Fr off", phone: "021 5555 0101" } } : {}));
    const place = places[0];
    // Snappfood spells it with a space, 60 m away.
    const v = { code: code(), title: `چلو کباب جوان${tag}`, ...((q) => ({ lat: q.lat, lon: q.lng }))(offset(place, 60)), type: "RESTAURANT", items: [{ title: "Chelo kebab", price: 1_500_000 }] };
    vendors.push(v);
    const p = await Player.create(baseURL!);
    const d = expectOk(await p.get<{ menu: { vendor: { code: string } } | null; about: { week: number[][][] | null; phone: string }; links: { kind: string }[] }>(`/api/local?store=place&id=${place.id}&name=${encodeURIComponent(place.name)}&lat=${place.lat}&lng=${place.lng}&cat=restaurant`)).data;
    expect(d.menu?.vendor.code).toBe(v.code);
    // The map's own hours win over Snappfood's, read as a week.
    expect(d.about.week?.[0]).toEqual([[660, 1380]]);
    expect(d.about.week?.[6]).toEqual([]);
    expect(d.about.phone).toBe("021 5555 0101");
    expect(d.links.map((l) => l.kind)).toEqual(expect.arrayContaining(["snappfood", "phone"]));
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("Torob's walk-in stores: on the map around you, each with its own catalog and page", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    await p.goTo(STUBTOWN);
    // The first look builds the store map from Torob's sellers of a few products (waited for once).
    const near = expectOk(await p.get<{ shops: { id: number; name: string; address: string; photo: string; week: number[][][]; sells: string[] }[] }>(`/api/local?torobNear=1&lat=${STUBTOWN.lat}&lng=${STUBTOWN.lng}`)).data.shops;
    // Nearest first (within 4 km); the one 55 km away isn't "around".
    expect(near.map((s) => s.id)).toEqual([900001, 900002]);
    // Torob cuts its map addresses short ("…"); the trailing dots go.
    expect(near[0]).toMatchObject({ name: "Stub Mobile", address: "Stub str", photo: "https://example.com/900001-front.jpg" });
    expect(near[0].week[0]).toEqual([[540, 1230]]);
    expect(near[0].week[6]).toEqual([]);
    expect(near[0].sells).toContain("📱");

    // Its card: the full address and phone from its page, and its own catalog.
    const card = expectOk(await p.get<{ info: { address: string; phone: string; photos: string[]; url: string }; items: { title: string }[] }>(`/api/local?torobPlace=900001`)).data;
    expect(card.info).toMatchObject({ address: "Stub street 9, by the park", phone: "02155550001", url: "https://torob.com/shop/900001/" });
    expect(card.info.photos).toEqual(["https://example.com/900001.jpg"]);
    expect(card.items.map((i) => i.title)).toEqual(["Phone X", "Phone Y case"]);
    expect((await p.get(`/api/local?torobPlace=-3`)).status).toBe(400);

    // Built once: the next look doesn't ask Torob again.
    const before = calls;
    expectOk(await p.get(`/api/local?torobNear=1&lat=${STUBTOWN.lat}&lng=${STUBTOWN.lng}`));
    expect(calls).toBe(before);
    await p.dispose();
  });

  test("the health check says whether this server can reach each store site", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const r = await p.get<{ external: Record<"snappfood" | "torob" | "divar", { ok: boolean; status: string }> }>("/api/health?ext=1");
    expect(r.data.external.snappfood).toMatchObject({ ok: true, status: "200" });
    expect(r.data.external.torob.ok).toBe(true);
    expect(r.data.external.divar.ok).toBe(true);
    await p.dispose();
  });
});

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
    // The store's phone comes from its Snappfood page (it has none on the map).
    expect(seen.links.map((l) => l.kind)).toEqual(["snappfood", "torob", "divar", "phone"]);
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

test.describe("the map's own data", () => {
  test("a real place's contacts, hours and photo come from the map", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const info = { phone: "+98 21 7700 0000", web: "https://shop.example/", ig: "test.shop", hours: "Sa-Th 09:00-22:00", addr: "Farjam St 12", img: "https://img.example/front.jpg" };
    const { places } = await uploadPlaces(admin, randomSpot(), 2, (i) => (i === 1 ? { info } : {}));
    const shop = places[1];
    const p = await Player.create(baseURL!);
    type D = { links: { kind: string; url: string; label: string }[]; about: { photo: string; logo: string; address: string; hours: string; week: number[][][] | null; phone: string } };
    const { data } = expectOk(await p.get<D>(`/api/local?store=place&id=${shop.id}&name=${encodeURIComponent(shop.name)}&lat=${shop.lat}&lng=${shop.lng}&cat=grocery`));
    // The map's hours also come as a week, Saturday first: 09:00–22:00 but Friday.
    const open = [[540, 1320]];
    expect(data.about).toEqual({ photo: info.img, logo: "https://shop.example/favicon.ico", address: info.addr, hours: info.hours, week: [open, open, open, open, open, open, []], phone: info.phone });
    expect(data.links.map((l) => [l.kind, l.url])).toEqual([["website", info.web], ["instagram", "https://instagram.com/test.shop"], ["phone", "tel:+982177000000"]]);
    // The map itself carries every place, without the contacts (the card asks for them).
    const w = expectOk(await p.get<{ spots: { id: string; info?: unknown }[] }>(`/api/world?lat=${shop.lat}&lng=${shop.lng}`)).data;
    expect(w.spots.map((s) => s.id)).toEqual(expect.arrayContaining(places.map((x) => x.id)));
    expect(w.spots.find((s) => s.id === shop.id)?.info).toBeUndefined();
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("Divar: the neighbourhoods around you, their latest ads, by category", async ({ baseURL }) => {
    // A pair of our own in the row, 300 m north of its "A"; the next pair is ~8 km away.
    const k = Math.floor(Math.random() * 998);
    const here = offset(pairAt(k), 300);
    const [mine, next, far] = [districts[2 * k], districts[2 * k + 1], districts[2 * k + 2]];
    ads.push({ district: mine.id, cat: "vehicles", title: "Pride 131" }, { district: mine.id, cat: "real-estate", title: "2-room flat" }, { district: next.id, cat: "jobs", title: "Courier wanted" }, { district: far.id, cat: "jobs", title: "Too far" });
    const p = await Player.create(baseURL!);
    type A = { areas: { id: number; city: number; name: string; distanceM: number; posts: { title: string; url: string; price: string }[] }[] };
    const { data } = expectOk(await p.get<A>(`/api/local?divar=1&lat=${here.lat}&lng=${here.lng}`));
    // Nearest first; a neighbourhood 9 km away isn't "around".
    expect(data.areas.map((a) => a.name)).toEqual([mine.name, next.name]);
    expect(data.areas[0].posts.map((x) => x.title).sort()).toEqual(["2-room flat", "Pride 131"]);
    expect(data.areas[0].posts[0]).toMatchObject({ price: "۱,۰۰۰ تومان", url: expect.stringMatching(/^https:\/\/divar\.ir\/v\//) });
    // The card's tabs: one category at a time.
    const cars = expectOk(await p.get<{ posts: { title: string }[] }>(`/api/local?divar=${mine.id}&city=1&cat=vehicles`)).data.posts;
    expect(cars.map((x) => x.title)).toEqual(["Pride 131"]);
    expect((await p.get(`/api/local?divar=${mine.id}&city=1&cat=nope`)).status).toBe(400);
    // A town with no neighbourhoods: its own ads, on its centre.
    const town = expectOk(await p.get<A>(`/api/local?divar=1&lat=${SMALLTOWN.latitude + 0.01}&lng=${SMALLTOWN.longitude}`)).data.areas;
    expect(town).toEqual([expect.objectContaining({ id: 0, city: 2, name: "Smalltown", posts: [expect.objectContaining({ title: "Old sofa" })] })]);
    // Nowhere near a neighbourhood Divar knows: nothing to pin.
    const nowhere = randomSpot();
    expect(expectOk(await p.get<A>(`/api/local?divar=1&lat=${nowhere.lat}&lng=${nowhere.lng}`)).data.areas).toEqual([]);
    await p.dispose();
  });
});
