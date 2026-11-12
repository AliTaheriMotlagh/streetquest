// Iran's store sites (lib/stores/directory.ts): what each site sends becomes stores on the map with
// the game's store types, one store listed by two sites becomes one marker, deal / ad / product pages
// read right, and a link out says which site it opens. Fixtures are trimmed from real responses
// (probed 2026-11-12).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adAreaName, adAreas, bboxAround, bilbooardCity, detailFromLd, findTwin, fromBasalam, fromBilbooard, fromIrangaah, fromNetbargDeal, fromOkala,
  leaveInfo, mergeStores, nearestCity, netbargDealLinks, placeCatOf, productSearchLinks, serviceUrl, SERVICES, sheypoorListings, SITE_IDS, SITES,
  STORE_TYPE_KEYS, STORE_TYPES, typeOf, weekFromLd, type DirStore,
} from "@/lib/stores/directory";

const TEHRANPARS = { lat: 35.735, lng: 51.515 };

describe("store types", () => {
  it("reads each site's category words", () => {
    assert.equal(typeOf("فست فود"), "food");
    assert.equal(typeOf("کافه"), "cafe");
    assert.equal(typeOf("داروخانه"), "pharmacy");
    assert.equal(typeOf("دندانپزشک"), "doctor");
    assert.equal(typeOf("آرایشگاه زنانه"), "beauty");
    assert.equal(typeOf("لوازم یدکی خودرو"), "auto");
    assert.equal(typeOf("مشاور املاک و بنگاه"), "realestate");
    assert.equal(typeOf("سوپرمیوه"), "fruit");
    assert.equal(typeOf("افق کوروش"), "grocery");
    assert.equal(typeOf("نانوایی"), "bakery");
    assert.equal(typeOf("chain-stores"), "grocery");
    assert.equal(typeOf("طلا و جواهر"), "gifts");
    assert.equal(typeOf("گل‌فروشی"), "gifts");
    assert.equal(typeOf("پت شاپ و لوازم حیوانات"), "pets");
    assert.equal(typeOf("قالیشویی"), "services");
    assert.equal(typeOf("مرکز خرید و پاساژ"), "other");
  });
  it("every type has a label, an emoji and a place category", () => {
    for (const k of STORE_TYPE_KEYS) {
      assert.ok(STORE_TYPES[k].label && STORE_TYPES[k].emoji && /^#[0-9a-f]{6}$/i.test(STORE_TYPES[k].color), k);
      assert.ok(placeCatOf(k));
    }
    assert.equal(placeCatOf("food"), "restaurant");
    assert.equal(placeCatOf("digital"), "tech");
  });
});

describe("Bilbooard", () => {
  const json = {
    capped: true,
    businesses: [
      { id: 66902, name: "گالری طلای صادقی", slug: "sadeghi", url: "https://bilbooard.ir/tehran/b/sadeghi", latitude: 35.732, longitude: 51.5, average_rating: "0.00", category: "طلا و جواهر", image: "https://bilbooard.ir/storage/1.webp" },
      { id: 7, name: "کافه آکاژو", slug: "akajou", url: "https://bilbooard.ir/tehran/b/akajou", latitude: 35.7729, longitude: 51.4838, average_rating: "4.50", category: "کافه", image: null },
      { id: 8, name: "no position", url: "https://bilbooard.ir/tehran/b/x", latitude: 0, longitude: 0, category: "کافه" },
      { id: 9, name: "elsewhere", url: "https://evil.example/x", latitude: 35.7, longitude: 51.4, category: "کافه" },
    ],
  };
  it("keeps businesses with a position and a Bilbooard page", () => {
    const s = fromBilbooard(json);
    assert.equal(s.length, 2);
    assert.deepEqual(
      { id: s[1].id, type: s[1].type, rating: s[1].rating, img: s[1].img },
      { id: "bilbooard:7", type: "cafe", rating: 4.5, img: undefined },
    );
    assert.deepEqual(fromBilbooard(null), []);
  });
  it("knows its cities (Irangaah's slugs, one spelt differently)", () => {
    assert.equal(bilbooardCity("tehran"), "tehran");
    assert.equal(bilbooardCity("hamedan"), "hamadan");
    assert.equal(bilbooardCity("eslamshahr"), null);
  });
});

describe("Irangaah", () => {
  const rows = [
    ["اپتومتریست سارا", 35.7305, 51.5276, 0, "/dr/optometrist/sara", "02177296874"],
    ["بازار روز نمونه", 35.7353, 51.515, 5, "/business/food/bazar", "021-77568982"],
    ["ایستگاه اتوبوس", 35.735, 51.515, 9, "/places/bus-stops/x", ""],
    ["far away", 36.3, 59.6, 5, "/business/stores/y", ""],
  ];
  it("keeps the stores and doctors inside the box, with their phones", () => {
    const s = fromIrangaah(rows, bboxAround(TEHRANPARS, 1500));
    assert.deepEqual(s.map((x) => [x.name, x.type]), [["اپتومتریست سارا", "doctor"], ["بازار روز نمونه", "food"]]);
    assert.equal(s[0].phone, "02177296874");
    assert.equal(s[1].url, "https://irangaah.ir/business/food/bazar");
  });
  it("finds the city a point is in", () => {
    const cities = { v: 1, c: [["tehran", "تهران", "تهران", 35.6892, 51.389], ["mashhad", "مشهد", "خراسان رضوی", 36.2971, 59.6056]] };
    assert.equal(nearestCity(cities, TEHRANPARS), "tehran");
    assert.equal(nearestCity(cities, { lat: 29.6, lng: 52.5 }), null);
    // A suburb whose centre is nearer than the big city's: the big city's index covers the spot.
    const withSuburb = { c: [...cities.c, ["shemiranat", "شمیرانات", "تهران", 35.76, 51.55]] };
    assert.equal(nearestCity(withSuburb, TEHRANPARS), "tehran");
  });
});

describe("Okala", () => {
  it("names a chain's branch by its chain, and takes the position from the details", () => {
    const s = fromOkala({ storeId: 53862, storeName: "نارمک رودباری", storeCategoryName: "افق کوروش", rate: 4.3 }, { storeLat: 35.73, storeLng: 51.5, logo: "https://asset.okala.com/l.png" });
    assert.equal(s?.name, "افق کوروش نارمک رودباری");
    assert.equal(s?.type, "grocery");
    assert.equal(s?.url, "https://www.okala.com/store/53862");
    assert.equal(fromOkala({ storeId: 1, storeName: "x", storeCategoryName: "نانوایی" }, {}), null);
    assert.equal(fromOkala({ storeId: 2, storeName: "سنگک سبحان", storeCategoryName: "نانوایی" }, { storeLat: 35.7, storeLng: 51.4 })?.name, "سنگک سبحان");
  });
});

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

describe("a store's page (JSON-LD)", () => {
  it("reads the business, its photos, hours and phone", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "کافه رستوران آکاژو",
      description: "یک کافه‌رستوران در حسین‌آباد",
      image: ["https://bilbooard.ir/a.webp", "http://insecure/b.jpg"],
      address: { "@type": "PostalAddress", streetAddress: "حسین آباد، خ مفتوحی" },
      geo: { "@type": "GeoCoordinates", latitude: 35.772966, longitude: 51.483868 },
      telephone: "۰۲۱۷۷۵۶۸۹۸۲",
      sameAs: ["https://www.instagram.com/akajo_food"],
      aggregateRating: { ratingValue: 8, bestRating: 10, ratingCount: 40 },
      openingHoursSpecification: [
        { dayOfWeek: ["Saturday", "Sunday"], opens: "12:00", closes: "23:59" },
        { dayOfWeek: "https://schema.org/Friday", opens: "18:00", closes: "02:00" },
      ],
    });
    const d = detailFromLd(html, { id: "bilbooard:7", site: "bilbooard", url: "https://bilbooard.ir/tehran/b/akajou" })!;
    assert.equal(d.name, "کافه رستوران آکاژو");
    assert.deepEqual(d.photos, ["https://bilbooard.ir/a.webp"]);
    assert.equal(d.address, "حسین آباد، خ مفتوحی");
    assert.equal(d.phones[0].number, "02177568982");
    assert.equal(d.rating, 4);
    assert.equal(d.ratingCount, 40);
    assert.deepEqual(d.week?.[0], [[720, 1440]]);
    assert.deepEqual(d.week?.[6], [[1080, 1560]]);
    assert.deepEqual(d.week?.[3], []);
    assert.equal(d.links[0].label, "Instagram");
  });
  it("finds the business in a @graph, and says nothing about a page without one", () => {
    const html = ld({ "@graph": [{ "@type": "WebSite" }, { "@type": "FoodEstablishment", name: "بازار", geo: { latitude: 35.7, longitude: 51.4 } }] });
    assert.equal(detailFromLd(html, { id: "irangaah:x", site: "irangaah", url: "u" })?.name, "بازار");
    assert.equal(detailFromLd("<html></html>", { id: "x", site: "irangaah", url: "u" }), null);
    assert.equal(weekFromLd(undefined), null);
  });
});

describe("Netbarg", () => {
  const link = { id: 92174, cat: "restaurant", url: "https://netbarg.com/tehran/d/c:restaurant/92174/x/" };
  const page = (availability: string, pin = true) =>
    `${pin ? "var myCenter = new google.maps.LatLng(35.7435,51.531);" : ""}` +
    ld({ "@type": "LocalBusiness", name: "کافه سنتی دنج", address: { streetAddress: "تهرانپارس، خیابان ۱۹۶" }, telephone: "02176702001", aggregateRating: { ratingValue: 4, bestRating: "5", ratingCount: 149 } }) +
    ld({ "@type": "Product", name: "سرویس چای سنتی دو نفره", offers: { price: 5400000, priceCurrency: "IRR", availability: `https://schema.org/${availability}` } }) +
    "<p>با 10% تخفیف و پرداخت تنها 540.000 تومان بجای 600.000 تومان</p>";
  it("lists a neighbourhood's deals once each", () => {
    const html = `<a href="/tehran/d/c:restaurant/92174/a/">x</a><a href="/tehran/d/c:restaurant/92174/a/">y</a><a href="/tehran/d/c:entertainment/5/b/">z</a><a href="/area/x/">no</a>`;
    assert.deepEqual(netbargDealLinks(html).map((l) => [l.id, l.cat]), [[92174, "restaurant"], [5, "entertainment"]]);
  });
  it("reads a deal on sale: store, position, price in toman and what's off", () => {
    const r = fromNetbargDeal(page("InStock"), link)!;
    assert.equal(r.store.name, "کافه سنتی دنج");
    assert.deepEqual([r.store.lat, r.store.lng], [35.7435, 51.531]);
    assert.equal(r.store.type, "cafe");
    assert.deepEqual(r.detail.offer, { title: "سرویس چای سنتی دو نفره", price: 540000, was: 600000, off: 10, available: true });
    assert.equal(r.detail.phones[0].source, "netbarg");
  });
  it("keeps an ended deal's store (no badge), drops one with no pin, and pins a live one on its neighbourhood", () => {
    const ended = fromNetbargDeal(page("OutOfStock"), link)!;
    assert.equal(ended.store.name, "کافه سنتی دنج");
    assert.equal(ended.store.off, undefined);
    assert.equal(ended.detail.offer?.available, false);
    assert.equal(fromNetbargDeal(page("OutOfStock", false), link, { lat: 35.74, lng: 51.52 }), null);
    assert.equal(fromNetbargDeal(page("InStock", false), link), null);
    assert.equal(fromNetbargDeal(page("InStock", false), link, { lat: 35.74, lng: 51.52 })?.store.lat, 35.74);
  });
});

describe("Sheypoor", () => {
  const listing = (id: string, location: string, geo = "null") =>
    `{"id":"${id}","type":"normal","attributes":{"title":"گاز کابینتی","location":"${location}","bump":false,"url":"https://www.sheypoor.com/v/x-${id}.html","timePassedLabel":"لحظاتی پیش","price":[{"label":"","amount":"5,000,000","currency":"تومان"}],"images":{"thumbnails":{"round":"https://cdn.sheypoor.com/r.webp","landscape":"https://cdn.sheypoor.com/l.webp"}},"categories":[{"name":"لوازم خانگی","id":"43608"},{"name":"ظروف آشپزخانه","id":"43610"}]},"description":"x","geo":${geo}}`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(`[${listing("469153019", "تهران، نارمک")},${listing("469153020", "تهران", '{"lat":35.7,"lon":51.4}')},${listing("469153019", "تهران، نارمک")}]`)}])</script>`;
  it("reads the listings in the page's streamed data, each once", () => {
    const ads = sheypoorListings(html);
    assert.equal(ads.length, 2);
    assert.deepEqual(
      { title: ads[0].title, area: ads[0].area, price: ads[0].price, img: ads[0].img, cat: ads[0].cat },
      { title: "گاز کابینتی", area: "تهران، نارمک", price: "5,000,000 تومان", img: "https://cdn.sheypoor.com/l.webp", cat: "ظروف آشپزخانه" },
    );
    assert.deepEqual([ads[1].lat, ads[1].lng], [35.7, 51.4]);
  });
  it("pins ads on the neighbourhood they name", () => {
    assert.equal(adAreaName("تهران، نارمک"), "نارمک");
    assert.equal(adAreaName("سراسر ایران"), "");
    const areas = adAreas(sheypoorListings(html), [{ id: "75", name: "نارمك", lat: 35.74, lng: 51.5 }, { id: "76", name: "تهرانپارس", lat: 35.73, lng: 51.53 }]);
    assert.deepEqual(areas.map((a) => [a.id, a.ads.length]), [["75", 1]]);
  });
});

describe("Basalam", () => {
  it("reads products in toman with their seller's city", () => {
    const p = fromBasalam({ products: [{ id: 4984581, name: "عسل کوهستان", price: 6380580.0, photo: { MEDIUM: "https://statics.basalam.com/m.jpg" }, rating: { average: 4.5, count: 3714 }, vendor: { name: "عسل بالچی", owner: { city: "اردبیل" } } }, { id: 2, name: "no price" }] });
    assert.deepEqual(p, [{ id: "4984581", name: "عسل کوهستان", price: 638058, img: "https://statics.basalam.com/m.jpg", url: "https://basalam.com/p/4984581", rating: 4.5, votes: 3714, seller: "عسل بالچی", city: "اردبیل", site: "basalam" }]);
  });
});

describe("one store from several sites", () => {
  const s = (site: DirStore["site"], name: string, lat: number, lng: number, extra: Partial<DirStore> = {}): DirStore => ({ id: `${site}:${name}`, site, name, lat, lng, type: "food", cat: "", rating: 0, url: "https://x", ...extra });
  it("merges the same store listed by two sites, keeping the richer card and the phone", () => {
    const out = mergeStores([s("irangaah", "پیتزا داغ", 35.7351, 51.5151, { phone: "02177001122" }), s("bilbooard", "پیتزا داغ", 35.7352, 51.5152, { rating: 4.2 }), s("bilbooard", "کبابی نمونه", 35.7353, 51.5153)]);
    assert.equal(out.length, 2);
    const pizza = out.find((x) => x.name === "پیتزا داغ")!;
    assert.equal(pizza.site, "bilbooard");
    assert.deepEqual(pizza.also, ["irangaah"]);
    assert.equal(pizza.phone, "02177001122");
  });
  it("finds a place's twin on a directory (same name, close by)", () => {
    const list = [s("irangaah", "پیتزا داغ", 35.7351, 51.5151), s("irangaah", "داغ", 35.75, 51.6)];
    assert.equal(findTwin(list, { name: "پیتزا داغ", lat: 35.7352, lng: 51.5152 })?.lat, 35.7351);
    assert.equal(findTwin(list, { name: "کافه دیگر", lat: 35.7352, lng: 51.5152 }), null);
  });
});

describe("leaving the game", () => {
  it("names the site a link opens", () => {
    assert.equal(leaveInfo("https://www.okala.com/store/1")?.site?.id, "okala");
    assert.equal(leaveInfo("https://basalam.com/p/1")?.site?.id, "basalam");
    assert.equal(leaveInfo("https://snappfood.ir/restaurant/menu/x/")?.known, "Snappfood");
    const other = leaveInfo("http://example.org/x")!;
    assert.deepEqual([other.site, other.known, other.secure, other.host], [null, "", false, "example.org"]);
    assert.equal(leaveInfo("tel:021"), null);
    assert.equal(leaveInfo("not a url"), null);
  });
  it("every site has a name, a colour, an https home and a host", () => {
    for (const id of SITE_IDS) {
      const s = SITES[id];
      assert.ok(s.name && s.what && /^#[0-9a-f]{6}$/i.test(s.color) && s.url.startsWith("https://") && s.hosts.length, id);
      assert.equal(leaveInfo(s.url)?.site?.id, id);
    }
  });
});

describe("services and product links", () => {
  it("links each service to its page on each site, for the player's city", () => {
    const clean = SERVICES.find((c) => c.key === "cleaning")!;
    assert.equal(serviceUrl("sanjagh", clean.links.sanjagh!, "mashhad"), "https://sanjagh.pro/b/121?z=mashhad");
    assert.equal(serviceUrl("sanjagh", clean.links.sanjagh!, null), "https://sanjagh.pro/b/121?z=tehran");
    assert.equal(serviceUrl("achareh", clean.links.achareh!, "tehran"), "https://achareh.co/categories/cleaning-and-washing/");
    for (const c of SERVICES) assert.ok(Object.keys(c.links).length > 0, c.key);
  });
  it("searches a product on the sites that take it in the link", () => {
    assert.deepEqual(productSearchLinks("عسل").map((l) => l.url), ["https://torob.com/search/?query=%D8%B9%D8%B3%D9%84", "https://basalam.com/s?q=%D8%B9%D8%B3%D9%84"]);
  });
});
