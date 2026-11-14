// Iran's store sites on the map (/api/stores): Bilbooard, Irangaah and Okala answer from a stub this
// file serves (BILBOOARD_URL / IRANGAAH_URL / OKALA_URL / BASALAM_URL in playwright.config.ts). The
// stores round a point come back merged (one store listed twice is one marker) and typed, a store's
// page reads in full, Basalam's sellers in the player's city come first, and a page on another
// site is refused. Netbarg and Sheypoor are unit-tested (tests/storeDirectory.test.ts): their
// neighbourhoods come from Divar, whose stub belongs to local.spec.ts.
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { STUB_PORT } from "../../playwright.config";
import { expectOk, offset, Player } from "../helpers";

/**
 * "Tehran" for this test, in south-east Iran where no random test spot lands: fixed, because the server keeps
 * the city list for a week and each site's cells for a day, and the e2e database is never wiped.
 */
// In Iran (the store sites are asked only there), in empty south-east Baluchestan, away from every other test spot.
const CITY = { lat: 26.4, lng: 60.6 };
const cafe = { ...offset(CITY, 100, 100) };
const twin = { ...offset(CITY, 110, 105) };
const doctor = { ...offset(CITY, -300, 200) };
const far = { ...offset(CITY, 6000, 0) };

let server: Server;
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://stub");
    const send = (body: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)));
    const html = (body: string) => (res.setHeader("content-type", "text/html"), res.end(body));
    // Irangaah: its cities, the index's manifest, and the city's index.
    if (u.pathname === "/ig/data/cities.json") return send({ v: 1, c: [["tehran", "تهران", "تهران", CITY.lat, CITY.lng]] });
    if (u.pathname === "/ig/map-data/manifest.json") return send({ places: { search: { dir: "search-test/" } } });
    if (u.pathname === "/ig/map-data/search-test/tehran.json")
      return send([
        ["دکتر آزمون", doctor.lat, doctor.lng, 0, "/dr/dentist/test-doctor", "02177001100"],
        ["کافه تست", twin.lat, twin.lng, 5, "/business/food/test-cafe", "02177001122"],
        ["ایستگاه", cafe.lat, cafe.lng, 9, "/places/bus-stops/x", ""],
        ["دور", far.lat, far.lng, 5, "/business/stores/far", ""],
      ]);
    // Bilbooard: the businesses in the box asked for.
    if (u.pathname === "/bb/tehran/businesses/map") {
      const box = { s: Number(u.searchParams.get("sw_lat")), w: Number(u.searchParams.get("sw_lng")), n: Number(u.searchParams.get("ne_lat")), e: Number(u.searchParams.get("ne_lng")) };
      const all = [{ id: 1, name: "کافه تست", slug: "test-cafe", url: "https://bilbooard.ir/tehran/b/test-cafe", latitude: cafe.lat, longitude: cafe.lng, average_rating: "4.50", category: "کافه", image: "https://bilbooard.ir/storage/1.webp" }];
      return send({ capped: false, businesses: all.filter((b) => b.latitude >= box.s && b.latitude <= box.n && b.longitude >= box.w && b.longitude <= box.e) });
    }
    if (u.pathname === "/bb/tehran/b/test-cafe")
      return html(`<script type="application/ld+json">${JSON.stringify({ "@type": "CafeOrCoffeeShop", name: "کافه تست", description: "یک کافه برای آزمون", image: ["https://bilbooard.ir/a.webp", "https://bilbooard.ir/b.webp"], address: { streetAddress: "خیابان آزمون ۱" }, geo: { latitude: cafe.lat, longitude: cafe.lng }, openingHoursSpecification: [{ dayOfWeek: ["Saturday"], opens: "08:00", closes: "22:00" }] })}</script>`);
    // Okala: one supermarket nearby, its details and reviews.
    if (u.pathname === "/ok/opex/v4/stores/nearby") return send({ success: true, data: { stores: [{ storeId: 777, storeName: "آزمون", storeCategoryName: "افق کوروش", rate: 4.4 }] } });
    if (u.pathname === "/ok/opex/v2/stores/details")
      return send({ data: { storeId: 777, storeName: "آزمون", storeCategoryName: "افق کوروش", storeLat: offset(CITY, -100, -100).lat, storeLng: offset(CITY, -100, -100).lng, rate: 4.4, minimumOrder: 3000000, earliestSlot: { caption: "60 دقیقه" }, logo: "https://asset.okala.com/l.png" } });
    if (u.pathname === "/ok/review/v1/stores/777/reviews") return send({ data: { items: [{ reviewerName: "نیوشا", vendorRate: 5, comment: "عالی بود", submittedAt: "2026-11-09T21:10:48" }] } });
    // Basalam: two sellers, one in the player's city.
    if (u.pathname === "/ba/ai-engine/api/v2.0/product/search")
      return send({ products: [{ id: 1, name: "عسل اردبیل", price: 7000000, rating: { average: 4.5, count: 10 }, vendor: { name: "زنبوردار", owner: { city: "اردبیل" } } }, { id: 2, name: "عسل تهران", price: 5000000, rating: { average: 4, count: 3 }, vendor: { name: "عسل‌فروش", owner: { city: "تهران" } } }] });
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((ok) => server.listen(STUB_PORT, ok));
});
test.afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

type Store = { id: string; site: string; name: string; type: string; rating: number; phone?: string; also?: string[]; url: string };

test("the stores round you: merged across sites, typed, nearest first, far ones left out", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const { data } = expectOk(await p.get<{ stores: Store[]; city: string | null; pending: boolean }>(`/api/stores?near=1&lat=${CITY.lat}&lng=${CITY.lng}&sites=bilbooard,irangaah,okala`));
  expect(data.city).toBe("tehran");
  // The café is on Bilbooard and Irangaah: one marker, Bilbooard's card, Irangaah's phone.
  const c = data.stores.find((s) => s.name === "کافه تست")!;
  expect(c).toMatchObject({ site: "bilbooard", type: "cafe", rating: 4.5, phone: "02177001122", also: ["irangaah"] });
  expect(data.stores.filter((s) => s.name === "کافه تست")).toHaveLength(1);
  expect(data.stores.find((s) => s.site === "irangaah" && s.name === "دکتر آزمون")?.type).toBe("doctor");
  expect(data.stores.find((s) => s.site === "okala")).toMatchObject({ name: "افق کوروش آزمون", type: "grocery", url: "https://www.okala.com/store/777" });
  // A bus stop isn't a store; a store 6 km away isn't "around".
  expect(data.stores.map((s) => s.name)).not.toContain("ایستگاه");
  expect(data.stores.map((s) => s.name)).not.toContain("دور");
  // Only the sites asked for.
  const only = expectOk(await p.get<{ stores: Store[] }>(`/api/stores?near=1&lat=${CITY.lat}&lng=${CITY.lng}&sites=okala`)).data;
  expect(only.stores.map((s) => s.site)).toEqual(["okala"]);
  await p.dispose();
});

test("a store's page in full: photos, hours, address; Okala's delivery and reviews", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  type D = { detail: { name: string; photos: string[]; address: string; description: string; week: number[][][] | null; eta?: string; minOrder?: number; reviews?: { name: string; text: string }[] } | null };
  const bb = expectOk(await p.get<D>(`/api/stores?detail=bilbooard:1&url=${encodeURIComponent("https://bilbooard.ir/tehran/b/test-cafe")}&lat=${cafe.lat}&lng=${cafe.lng}`)).data.detail!;
  expect(bb).toMatchObject({ name: "کافه تست", address: "خیابان آزمون ۱", description: "یک کافه برای آزمون", photos: ["https://bilbooard.ir/a.webp", "https://bilbooard.ir/b.webp"] });
  expect(bb.week?.[0]).toEqual([[480, 1320]]);
  const ok = expectOk(await p.get<D>(`/api/stores?detail=okala:777&url=${encodeURIComponent("https://www.okala.com/store/777")}&lat=${CITY.lat}&lng=${CITY.lng}`)).data.detail!;
  expect(ok).toMatchObject({ name: "افق کوروش آزمون", eta: "60 دقیقه", minOrder: 300000 });
  expect(ok.reviews).toEqual([{ name: "نیوشا", rate: 5, text: "عالی بود", at: "2026-11-09T21:10:48" }]);
  // A page on another site than the store's is never fetched.
  const evil = expectOk(await p.get<D>(`/api/stores?detail=bilbooard:1&url=${encodeURIComponent("https://evil.example/tehran/b/test-cafe")}`)).data;
  expect(evil.detail).toBeNull();
  await p.dispose();
});

test("Basalam: sellers in your city first, prices in toman; the services list knows your city", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const { data } = expectOk(await p.get<{ products: { name: string; price: number; city: string; url: string }[] }>(`/api/stores?basalam=${encodeURIComponent("عسل")}&city=${encodeURIComponent("تهران")}`));
  expect(data.products.map((x) => [x.name, x.price, x.city])).toEqual([["عسل تهران", 500000, "تهران"], ["عسل اردبیل", 700000, "اردبیل"]]);
  expect(data.products[0].url).toBe("https://basalam.com/p/2");
  const city = expectOk(await p.get<{ city: string | null; sites: Record<string, boolean> }>(`/api/stores?city=1&lat=${CITY.lat}&lng=${CITY.lng}`)).data;
  expect(city.city).toBe("tehran");
  expect(city.sites).toMatchObject({ bilbooard: true, irangaah: true, okala: true, basalam: true });
  await p.dispose();
});

test("a 2D or 3D store card shows the store's directory pages and their phone", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  type D = { links: { kind: string; url: string }[]; about: { phones: { number: string; source: string }[] } };
  const { data } = expectOk(await p.get<D>(`/api/local?store=place&name=${encodeURIComponent("کافه تست")}&lat=${cafe.lat}&lng=${cafe.lng}&cat=cafe`));
  expect(data.links.filter((l) => l.kind === "directory").map((l) => l.url).sort()).toEqual(["https://bilbooard.ir/tehran/b/test-cafe", "https://irangaah.ir/business/food/test-cafe"]);
  expect(data.about.phones).toContainEqual({ number: "02177001122", source: "irangaah" });
  await p.dispose();
});
