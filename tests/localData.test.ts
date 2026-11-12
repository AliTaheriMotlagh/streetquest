// Store data that other sites give us, read into one shape: opening hours from Snappfood,
// Torob and OpenStreetMap, open-now in the store's time zone, and store-name matching.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clockOf, latinDigits, MAX_STOCK, mergeTorobPlace, nameScore, oneEach, openState, sameName, sameStore, snappfoodCode, snappfoodMenuUrl, stockOf, weekFromOsm, weekFromSnappfood, weekFromTorob, zoneOf, type TorobPlace } from "@/lib/localData";

const TEHRAN = { lat: 35.73, lng: 51.53 };
/** A Tehran wall-clock moment (Iran has kept +03:30 all year since 2022). */
const tehran = (iso: string) => new Date(`${iso}+03:30`);

describe("opening hours", () => {
  it("reads Snappfood's schedule, Saturday first, spans in order", () => {
    const week = weekFromSnappfood([
      { weekday: 1, startHour: "19:00", stopHour: "22:00" },
      { weekday: 1, startHour: "11:30", stopHour: "15:30" },
      { weekday: 7, allDay: true },
      { weekday: 9, startHour: "10:00", stopHour: "11:00" },
    ]);
    assert.deepEqual(week?.[0], [[690, 930], [1140, 1320]]);
    assert.deepEqual(week?.[6], [[0, 1440]]);
    assert.deepEqual(week?.[1], []);
    assert.equal(weekFromSnappfood([]), null);
  });

  it("runs a span that closes after midnight into the next day", () => {
    assert.deepEqual(weekFromSnappfood([{ weekday: 3, startHour: "18:00", stopHour: "02:00" }])?.[2], [[1080, 1560]]);
  });

  it("reads Torob's table in Persian digits, closed days and 24-hour stores", () => {
    const rows = ["۰۹:۰۰ - ۱۳:۳۰ | ۱۷:۰۰ - ۲۱:۳۰", "۲۴ ساعته", "تعطیل", "", "۱۰:۰۰ - ۲۰:۰۰", "۱۰:۰۰ - ۲۰:۰۰", "تعطیل"].map((text) => ({ text }));
    const week = weekFromTorob(rows)!;
    assert.deepEqual(week[0], [[540, 810], [1020, 1290]]);
    assert.deepEqual(week[1], [[0, 1440]]);
    assert.deepEqual(week[2], []);
    assert.equal(weekFromTorob(rows.slice(1)), null, "not a whole week");
    assert.equal(weekFromTorob(Array.from({ length: 7 }, () => ({ text: "تعطیل" }))), null, "closed every day says nothing");
  });

  it("reads the usual OpenStreetMap shapes and gives up on the rest", () => {
    assert.deepEqual(weekFromOsm("24/7")?.[3], [[0, 1440]]);
    const iran = weekFromOsm("Sa-Th 08:00-13:00,16:00-21:00; Fr off")!;
    assert.deepEqual(iran[0], [[480, 780], [960, 1260]]);
    assert.deepEqual(iran[5], [[480, 780], [960, 1260]]);
    assert.deepEqual(iran[6], []);
    // A range that wraps the week (Fr-Mo), and a later rule overriding an earlier one.
    const wrap = weekFromOsm("Fr-Mo 10:00-18:00; Su 12:00-14:00")!;
    assert.deepEqual([wrap[6], wrap[0], wrap[1], wrap[2], wrap[3]], [[[600, 1080]], [[600, 1080]], [[720, 840]], [[600, 1080]], []]);
    assert.deepEqual(weekFromOsm("09:00-17:00")?.[4], [[540, 1020]], "no days = every day");
    assert.equal(weekFromOsm("Mo-Fr 09:00-17:00; PH off"), null);
    assert.equal(weekFromOsm("sunrise-sunset"), null);
    assert.equal(weekFromOsm(""), null);
  });

  it("says open or closed, and the next change today, in the store's own time zone", () => {
    const week = weekFromSnappfood([1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startHour: "11:30", stopHour: "15:30" }, { weekday, startHour: "19:00", stopHour: "01:00" }]))!;
    const zone = zoneOf(TEHRAN);
    assert.equal(zone, "Asia/Tehran");
    // Thursday 29 Oct 2026: closed at 07:00 (opens 11:30), open at 12:00 until 15:30.
    assert.deepEqual(openState(week, tehran("2026-10-29T07:00:00"), zone), { open: false, next: 690 });
    assert.deepEqual(openState(week, tehran("2026-10-29T12:00:00"), zone), { open: true, next: 930 });
    // Friday 00:30: Thursday's dinner is still running, though Friday itself is closed.
    assert.deepEqual(openState(week, tehran("2026-10-30T00:30:00"), zone), { open: true, next: 60 });
    assert.deepEqual(openState(week, tehran("2026-10-30T12:00:00"), zone), { open: false, next: null });
    assert.equal(zoneOf({ lat: 51.5, lng: -0.1 }), undefined);
  });

  it("prints clock times, with midnight as 24:00 at the end of a day", () => {
    assert.equal(clockOf(570), "09:30");
    assert.equal(clockOf(1440), "24:00");
    assert.equal(clockOf(1500), "01:00");
    assert.equal(latinDigits("۱۲:۳۰ و ٤٥"), "12:30 و 45");
  });
});

describe("store names", () => {
  it("matches Persian names however the words are spaced", () => {
    assert.equal(nameScore("چلوکباب جوان", "چلو کباب جوان"), 1);
    assert.equal(nameScore("رستوران چلو‌کباب جوان", "چلو کباب جوان"), 1, "the zero-width non-joiner and the filler word go");
    assert.equal(nameScore("ستاره شرق", "ستاره شرق ۲"), 1, "a branch number");
    assert.ok(nameScore("کافه گلد", "شیرینی سیب") < 0.5);
    assert.ok(sameName("چلوکباب جوان", "چلو کباب جوان"));
    assert.ok(!sameName("جوان", "چلو کباب جوان"), "one shared word isn't the same shop");
  });

  it("calls a map place and a vendor the same store only when close and similarly named", () => {
    const place = { name: "چلوکباب جوان", lat: 35.7167, lng: 51.4976 };
    assert.ok(sameStore(place, { title: "چلو کباب جوان", lat: 35.7172, lng: 51.4976 }, 60));
    assert.ok(!sameStore(place, { title: "چلو کباب جوان", lat: 35.75, lng: 51.4976 }, 3700));
    assert.ok(!sameStore(place, { title: "پیتزا رومی", lat: 35.7168, lng: 51.4976 }, 10));
  });

  it("takes a Snappfood code from a menu link or the code itself", () => {
    assert.equal(snappfoodCode("https://snappfood.ir/restaurant/menu/%DA%86%D9%84%D9%88-r-0q5252/?from_list=1"), "0q5252");
    assert.equal(snappfoodCode("https://snappfood.ir/restaurant/menu/0q5252/javan"), "0q5252");
    assert.equal(snappfoodCode("0q5252"), "0q5252");
    assert.equal(snappfoodCode("https://example.com/x"), null);
  });

  it("links a vendor to the menu page that opens (its own menuUrl 404s), and back to the same code", () => {
    // …/menu/<code>/<slug>?… redirects to a 404; …/menu/<code>/ redirects to the real page.
    assert.equal(snappfoodMenuUrl("p6d6n6"), "https://snappfood.ir/restaurant/menu/p6d6n6/");
    assert.equal(snappfoodCode(snappfoodMenuUrl("0q5252")), "0q5252");
  });
});

describe("walk-in stores: only what each store sells", () => {
  // A listing (the product) and a row of its map of sellers (one store), as Torob sends them.
  const listing = { name1: "گوشی سامسونگ A17 4G | حافظه 128 رم 6 گیگابایت", image_url: "https://image.torob.com/a.webp", web_client_absolute_url: "/p/823f/galaxy-a17/" };
  const row = { price: 52_000_000, name2: "گارانتی ۱۸ ماهه شرکتی", last_price_change_date: "۱ ماه و ۸ روز پیش" };
  const place = (id: number, stock: TorobPlace["stock"], sells = ["📱"]): TorobPlace => ({ id, name: "Stub", lat: 35.7, lng: 51.4, city: "تهران", address: "", photo: "", week: null, sells, stock });

  it("reads a seller row as the product at that store's own price", () => {
    assert.deepEqual(stockOf(listing, row), {
      title: listing.name1,
      price: 52_000_000,
      photo: listing.image_url,
      url: "https://torob.com/p/823f/galaxy-a17/",
      note: "گارانتی ۱۸ ماهه شرکتی",
      when: "۱ ماه و ۸ روز پیش",
    });
    // No price means "ask in the store"; no product page, nothing to show.
    assert.equal(stockOf(listing, {})?.price, 0);
    assert.equal(stockOf({ name1: "x" }, row), null);
    assert.equal(stockOf({ ...listing, web_client_absolute_url: "https://elsewhere.example/p" }, row), null);
  });

  it("merges two sightings of one store: kinds and products once each, capped", () => {
    const a = stockOf(listing, row)!;
    const b = { ...a, title: "قاب گوشی", url: "https://torob.com/p/case/" };
    const m = mergeTorobPlace(place(1, [a]), place(1, [a, b], ["📱", "🎧"]));
    assert.deepEqual(m.sells, ["📱", "🎧"]);
    assert.deepEqual(m.stock?.map((s) => s.url), [a.url, b.url]);
    const many = Array.from({ length: 20 }, (_, i) => ({ ...a, url: `https://torob.com/p/${i}/` }));
    assert.equal(mergeTorobPlace(place(1, many), place(1, many)).stock?.length, MAX_STOCK);
    // A map built before stock was kept merges too.
    assert.deepEqual(mergeTorobPlace(place(1, undefined), place(1, [a])).stock, [a]);
  });
});

it("store phones: Snappfood's call centre is never a restaurant's number", async () => {
  const { storePhone, isPlatformPhone } = await import("../src/lib/localData");
  assert.equal(storePhone("02196612"), "");
  assert.equal(storePhone("021-96612"), "");
  assert.equal(storePhone("+98 21 96612"), "");
  assert.equal(isPlatformPhone("۰۲۱۹۶۶۱۲"), true);
  assert.equal(storePhone("۰۲۱ ۸۸۰۲ ۳۶۴۹"), "021 8802 3649");
  assert.equal(storePhone("tel://02188023649"), "02188023649");
  assert.equal(storePhone("call us"), "");
});

it("Balad: the place that is this store, by name and position", async () => {
  const { pickBaladPoi, baladPhoneOf } = await import("../src/lib/localData");
  const store = { name: "پیتزا میلاد", lat: 35.7285, lng: 51.4072 };
  const feat = (name: string, lat: number, lng: number) => ({ geometry: { coordinates: [lng, lat] }, properties: { name } });
  const r = {
    "poi-tokens": ["far", "other", "me"],
    geojson: { features: [feat("پیتزا میلاد", 35.74, 51.4072), feat("پیتزا مدبر", 35.7286, 51.4072), feat("پیتزا میلاد", 35.7286, 51.4073)] },
  };
  assert.equal(pickBaladPoi(r, store), "me");
  assert.equal(pickBaladPoi({ "poi-tokens": ["x"], geojson: { features: [feat("کبابی رضا", 35.7285, 51.4072)] } }, store), null);
  assert.equal(pickBaladPoi(null, store), null);
  assert.equal(baladPhoneOf({ seo_details: { schemas: [{ telephone: "02188023649" }] } }), "02188023649");
  assert.equal(baladPhoneOf({ phone_link: "tel://02133334444" }), "02133334444");
  assert.equal(baladPhoneOf({ seo_details: { schemas: [{ telephone: "02196612" }] } }), "");
});

it("Google Places: the phone of the place that is this store", async () => {
  const { googlePhoneOf } = await import("../src/lib/localData");
  const store = { name: "پیتزا میلاد", lat: 35.7285, lng: 51.4072 };
  const pl = (name: string, lat: number, lng: number, nationalPhoneNumber?: string) => ({ displayName: { text: name }, location: { latitude: lat, longitude: lng }, nationalPhoneNumber });
  assert.equal(googlePhoneOf({ places: [pl("پیتزا مدبر", 35.7285, 51.4072, "021 1111 1111"), pl("Pizza Milad پیتزا میلاد", 35.7286, 51.4073, "021 8802 3649")] }, store), "021 8802 3649");
  assert.equal(googlePhoneOf({ places: [pl("پیتزا میلاد", 35.75, 51.4072, "021 8802 3649")] }, store), "", "2 km away is another branch");
  assert.equal(googlePhoneOf({ places: [pl("پیتزا میلاد", 35.7285, 51.4072, "021 96612")] }, store), "", "a platform's number");
  assert.equal(googlePhoneOf(null, store), "");
});

it("store phones: with no number anywhere, the card links a search for it", async () => {
  const { phoneSearchLinks } = await import("../src/lib/localData");
  const l = phoneSearchLinks("پیتزا شیلا (پونک)", "تهران");
  assert.equal(decodeURIComponent(l.balad.split("query=")[1]), "پیتزا شیلا");
  assert.equal(decodeURIComponent(l.web.split("q=")[1]), "پیتزا شیلا تهران تلفن");
  assert.equal(decodeURIComponent(phoneSearchLinks("Cafe X").web.split("q=")[1]), "Cafe X تلفن");
});

describe("every phone number of a store", () => {
  it("reads all of a field's numbers and merges sources, each number once", async () => {
    const { storePhones, phonesFrom, mergePhones, phoneKey, MAX_PHONES } = await import("../src/lib/localData");
    assert.deepEqual(storePhones("021 8802 3649; 0912 345 6789"), ["021 8802 3649", "0912 345 6789"]);
    assert.deepEqual(storePhones("۰۲۱۸۸۰۲۳۶۴۹ - ۰۲۱۸۸۰۲۳۶۵۰"), ["02188023649", "02188023650"]);
    assert.deepEqual(storePhones("021-8802-3649"), ["021-8802-3649"], "dashes inside one number");
    assert.deepEqual(storePhones("02196612, call us"), [], "a platform's number and junk");
    assert.equal(phoneKey("+98 21 8802 3649"), phoneKey("021-88023649"));
    assert.equal(phoneKey("0098 912 345 6789"), phoneKey("09123456789"));
    const all = mergePhones(phonesFrom("torob", "02188023649", "09123456789"), phonesFrom("map", "+98 21 8802 3649"), phonesFrom("balad", "02188023650", "0912 345 6789"));
    assert.deepEqual(all, [
      { number: "02188023649", source: "torob" },
      { number: "09123456789", source: "torob" },
      { number: "02188023650", source: "balad" },
    ]);
    assert.deepEqual(mergePhones(null, undefined, []), []);
    const many = phonesFrom("balad", ...Array.from({ length: 10 }, (_, i) => `0218802360${i}`));
    assert.equal(many.length, MAX_PHONES);
  });

  it("takes every number on a Balad page: its phone rows, schema and call link", async () => {
    const { baladPhonesOf, baladPhoneOf } = await import("../src/lib/localData");
    const page = {
      phone_link: "tel://02188825583",
      fields: [{ icon: "gps", text: "تهران" }, { icon: "phone", text: "02188825583" }, { icon: "phone", text: "۰۲۱۸۸۳۰۸۳۸۵" }, { icon: "instagram", text: "pizza" }],
      seo_details: { schemas: [{ telephone: "02188825583" }] },
    };
    assert.deepEqual(baladPhonesOf(page), ["02188825583", "02188308385"]);
    assert.equal(baladPhoneOf(page), "02188825583");
    assert.deepEqual(baladPhonesOf({ fields: "?" }), []);
    assert.deepEqual(baladPhonesOf(null), []);
  });

  it("asks Balad for the name, then for the name without what-it-is words", async () => {
    const { baladQueries } = await import("../src/lib/localData");
    assert.deepEqual(baladQueries("پیتزا پرپروک (تهرانپارس)"), ["پیتزا پرپروک", "پرپروک"]);
    assert.deepEqual(baladQueries("هریک"), ["هریک"]);
    assert.deepEqual(baladQueries("کافه برگر"), ["کافه برگر"], "nothing left to ask without the kind");
  });

  it("matches a store on another map by name and distance, never another kind of place", async () => {
    const { placeMatch, pickBaladPoi, nameScore } = await import("../src/lib/localData");
    const at = { lat: 35.7285, lng: 51.4072 };
    const feat = (name: string, lat: number, lng: number) => ({ geometry: { coordinates: [lng, lat] }, properties: { name } });
    // One name written two ways, though "برگر" alone only says what the place is.
    assert.equal(nameScore("برگر لند", "برگرلند (تهرانپارس)"), 1);
    // "ایران برگر" is "ایران" without the kind: the insurance office next door is not it.
    const burger = { name: "ایران برگر (تهرانپارس)", ...at };
    assert.equal(placeMatch({ name: "بیمه ایران", lat: at.lat, lng: at.lng }, burger), null);
    assert.equal(
      pickBaladPoi({ "poi-tokens": ["ins", "me"], geojson: { features: [feat("بیمه ایران", at.lat, at.lng), feat("ایران برگر تهرانپارس", at.lat + 0.0003, at.lng)] } }, burger),
      "me",
    );
    // A name of its own with no kind word still matches a longer name.
    assert.ok(placeMatch({ name: "ساندویچی موبیدیک", ...at }, { name: "موبیدیک (شعبه تهرانپارس)", ...at }) != null);
    assert.ok(placeMatch({ name: "فست فود شیلا", ...at }, { name: "پیتزا شیلا (هفت تیر)", ...at }) != null);
    // Word for word the same name is the store even 600 m off (Snappfood's pin wanders); 2 km is another branch.
    const far = (m: number) => ({ name: "کترینگ ابوالفضل", lat: at.lat + m / 111_320, lng: at.lng });
    assert.ok(placeMatch(far(600), { name: "کترینگ ابوالفضل", ...at }) != null);
    assert.equal(placeMatch(far(2000), { name: "کترینگ ابوالفضل", ...at }), null);
    assert.equal(placeMatch({ name: "رستوران ابوالفضل", lat: far(600).lat, lng: at.lng }, { name: "کترینگ ابوالفضل", ...at }), null);
  });
});

describe("one marker per store on the map", () => {
  const at = (m: number) => ({ lat: 35.7 + m / 111_320, lng: 51.4 });
  it("hides a place another layer already marks, and the map's own second copy — not a branch down the road", () => {
    const places = [
      { id: "p1", name: "پیتزا بلوط", ...at(0) },
      { id: "p1b", name: "پیتزا بلوط", ...at(12) }, // the same shop mapped twice
      { id: "p2", name: "پیتزا بلوط", ...at(900) }, // another branch
      { id: "p3", name: "داروخانه دکتر رضایی", ...at(30) },
      { id: "p4", name: "کافه لمیز", ...at(60) },
      { id: "p5", name: "", ...at(0) },
      { id: "p6", name: "", ...at(1) },
    ];
    // A Snappfood vendor 40 m off with the café's name: the café's own marker goes.
    const taken = [{ name: "کافه لمیز (تهرانپارس)", ...at(100) }];
    assert.deepEqual(oneEach(places, (p) => p.name, taken).map((p) => p.id), ["p1", "p2", "p3", "p5", "p6"]);
    assert.deepEqual(oneEach(places, (p) => p.name).map((p) => p.id), ["p1", "p2", "p3", "p4", "p5", "p6"]);
    assert.deepEqual(oneEach([], (p: { name: string; lat: number; lng: number }) => p.name, taken), []);
  });
});
