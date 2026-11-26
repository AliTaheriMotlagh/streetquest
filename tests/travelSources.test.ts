// More travel sites (lib/travel/sources.ts): each site's page for a query, one merged list of offers, and
// Jajiga's server-rendered stays. URLs are the formats probed on 2026-11-26 (every one answered 200).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cityByKey, type Route } from "@/lib/travel";
import { ADAPTERS, adapterOf, compareLinks, mergeOffers, parseJajiga, readable, type SourceOffer, type SourceQuery } from "@/lib/travel/sources";

const city = (k: string) => cityByKey(k)!;
const route = (a = "tehran", b = "mashhad"): Route => ({ from: city(a), to: city(b), date: "2026-11-20" });
const link = (site: string, q: SourceQuery) => ADAPTERS.find((a) => a.site === site)!.deepLink(q);
const tk = (mode: "flight" | "train" | "bus", a?: string, b?: string): SourceQuery => ({ vertical: "ticket", mode, route: route(a, b) });

describe("travel sources: deep links", () => {
  it("flights: IATA pairs on 3click, Ghasedak24, Snapptrip; Flytoday's search with the date", () => {
    assert.equal(link("threeclick", tk("flight")), "https://3click.com/flight/THR-MHD");
    assert.equal(link("ghasedak24", tk("flight", "tehran", "bandar-abbas")), "https://ghasedak24.com/flights/THR-BND");
    assert.equal(link("snapptrip", tk("flight")), "https://www.snapptrip.com/flights/THR_city/MHD_city?date=2026-11-20");
    assert.match(link("flytoday", tk("flight"))!, /flytoday\.ir\/flight\/search\?departure=THR,1&arrival=MHD,1&departureDate=2026-11-20/);
    assert.equal(link("sepehr360", tk("flight")), "https://www.sepehr360.ir/");
    assert.equal(link("safar724", tk("flight")), null, "Safar724 sells buses only");
  });
  it("buses and trains: each site's own city slugs (Bandar Abbas without its dash, Snapptrip in CamelCase)", () => {
    assert.equal(link("safar724", tk("bus", "tehran", "bandar-abbas")), "https://safar724.com/bus/tehran-bandarabbas?date=1405-08-29");
    assert.equal(link("flytoday", tk("bus", "tehran", "bandar-abbas")), "https://www.flytoday.ir/bus/tehran-bandarabbas");
    assert.equal(link("flytoday", tk("train")), "https://www.flytoday.ir/train/tehran-mashhad");
    assert.equal(link("snapptrip", tk("bus", "tehran", "bandar-abbas")), "https://www.snapptrip.com/bus/Tehran/BandarAbbas");
    assert.equal(link("snapptrip", tk("train")), "https://www.snapptrip.com/train-ticket/Tehran/Mashhad");
    assert.equal(link("raja", tk("train")), "https://www.raja.ir/");
    assert.equal(link("payaneh", tk("bus")), "https://payaneh.ir/");
    assert.equal(link("threeclick", tk("bus")), null);
  });
  it("stays: Jajiga, Otaghak, Shab, Snapptrip, Flytoday by the city; Eghamat24 only where it has a page", () => {
    const st = (k: string): SourceQuery => ({ vertical: "stay", city: city(k) });
    assert.equal(link("jajiga", st("bandar-abbas")), "https://www.jajiga.com/s/bandarabbas");
    assert.equal(link("otaghak", st("mashhad")), "https://www.otaghak.com/city/mashhad/");
    assert.equal(link("shab", st("mashhad")), `https://www.shab.ir/search/city/${encodeURIComponent("مشهد")}`);
    assert.equal(link("snapptrip", st("shiraz")), `https://www.snapptrip.com/${encodeURIComponent("رزرو-هتل")}/${encodeURIComponent("شیراز")}`);
    assert.equal(link("eghamat24", st("isfahan")), "https://www.eghamat24.com/EsfahanHotels.html");
    assert.equal(link("eghamat24", st("bandar-abbas")), "https://www.eghamat24.com/IranHotels.html");
  });
  it("events: Evand by city; Vadoostan and Emruzkojaberam in Tehran only", () => {
    const ev = (k: string): SourceQuery => ({ vertical: "event", city: city(k) });
    assert.equal(link("evand", ev("tehran")), `https://evand.com/events?cities=${encodeURIComponent("تهران")}`);
    assert.ok(link("vadoostan", ev("tehran")));
    assert.equal(link("vadoostan", ev("shiraz")), null);
  });
  it("compare links: only the sites that cover the query, each once, never a ticket site for stays", () => {
    const bus = compareLinks(tk("bus")).map((l) => l.site);
    assert.deepEqual(bus, ["flytoday", "snapptrip", "safar724", "payaneh"]);
    const stays = compareLinks({ vertical: "stay", city: city("mashhad") }).map((l) => l.site);
    assert.ok(stays.includes("jajiga") && stays.includes("otaghak") && !stays.includes("safar724"));
    for (const l of compareLinks(tk("flight"))) assert.match(l.url, /^https:\/\//);
    assert.ok(adapterOf("jajiga").name);
    assert.deepEqual(readable({ vertical: "stay", city: city("mashhad") }).map((a) => a.site), ["jajiga"]);
    assert.deepEqual(readable(tk("flight")), []);
  });
});

describe("travel sources: offers", () => {
  const o = (key: string, price: number, source: SourceOffer["source"] = "jajiga"): SourceOffer => ({ key, source, vertical: "stay", title: key, price, url: `https://x/${key}`, checkedAt: 1 });
  it("each thing once at its cheapest; priced ones cheapest first, unpriced last", () => {
    const out = mergeOffers([[o("a", 500), o("b", 0)], [o("a", 300, "otaghak"), o("c", 100)]]);
    assert.deepEqual(out.map((x) => [x.key, x.price]), [["c", 100], ["a", 300], ["b", 0]]);
    assert.equal(out[1].source, "otaghak");
  });
  it("reads Jajiga's server-rendered stays (toman a night, the discount price, photo, rating, guests, place)", () => {
    const data = { props: { pageProps: { initialData: { rooms: { items: [
      { id: 3249091, title: " هتل آپارتمان در مشهد ", price: 3590000, priceAfterDiscount: 3200000, url: "/room/3249091", guestNumber: 2, geo: { lat: 36.2912345, lng: 59.6011111 }, rating: { total: 4.8, count: 58 }, pictures: { items: [{ url: "2024/11/27/x.jpg" }] } },
      { id: 2, title: "no discount", price: 900000, priceAfterDiscount: 0 },
      { title: "no id" },
    ] } } } } };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
    const out = parseJajiga(html, 42);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
      key: "jajiga:3249091", source: "jajiga", vertical: "stay", title: "هتل آپارتمان در مشهد", price: 3200000, url: "https://www.jajiga.com/room/3249091",
      photo: "https://storage.jajiga.com/public/pictures/medium/2024/11/27/x.jpg", rating: 4.8, guests: 2, lat: 36.29123, lng: 59.60111, checkedAt: 42,
    });
    assert.equal(out[1].price, 900000);
    assert.deepEqual(parseJajiga("<html>no data</html>", 1), []);
    assert.deepEqual(parseJajiga('<script id="__NEXT_DATA__">{broken</script>', 1), []);
  });
});
