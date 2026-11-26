// The trip planner's extras (lib/travel/extras.ts, steps.ts): nearby cities, your own steps from pasted
// links, and the final list of everything to book.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklist, nearbyCities } from "@/lib/travel/extras";
import { cleanSteps, stepFromUrl, stepsCost, type Step } from "@/lib/travel/steps";
import { billOf, cleanPlan, itinerary, type Plan } from "@/lib/travel/plan";
import { ADAPTERS } from "@/lib/travel/sources";
import type { Stay, Trip } from "@/lib/travel";

const plan = (over: Partial<Plan> = {}): Plan => ({ home: "tehran", stops: [{ city: "isfahan", nights: 2 }, { city: "shiraz", nights: 3 }], back: true, travellers: 2, start: "2026-12-01", ...over });
const trip = (price: number): Trip => ({ id: `flight:${price}`, mode: "flight", from: "x", to: "y", depart: "2026-12-01T08:00:00", price, company: "Iran Air", offers: [{ source: "alibaba", price, url: "https://www.alibaba.ir/flights/THR-IFN" }] });
const stay = (price: number): Stay => ({ id: `s${price}`, source: "jabama", name: "Hotel Abbasi", kind: "hotel", city: "isfahan", price, capacity: 2, url: "https://www.jabama.com/stay/hotel-1", photo: "", photos: [] });
const step = (over: Partial<Step> = {}): Step => ({ id: "s1", date: "2026-12-02", title: "Concert", url: "https://evand.com/events/concert", site: "Evand", price: 500_000, people: 2, ...over });

describe("nearby cities", () => {
  it("a few hours' drive from a stop, nearest first, leaving out the trip's own cities", () => {
    const near = nearbyCities("isfahan", ["tehran", "shiraz"]);
    assert.ok(near.length > 0 && near.length <= 4);
    for (let i = 1; i < near.length; i++) assert.ok(near[i].km >= near[i - 1].km);
    assert.ok(near.every((n) => n.km <= 300 && n.km > 15 && n.minutes > 0));
    assert.ok(!near.some((n) => ["isfahan", "tehran", "shiraz"].includes(n.city.key)));
    assert.deepEqual(nearbyCities("nowhere"), []);
  });
});

describe("your own steps", () => {
  it("reads a pasted link: its site from the host, a title from the path; text around it is fine", () => {
    assert.deepEqual(stepFromUrl("https://evand.com/events/concert-of-homayoun"), { url: "https://evand.com/events/concert-of-homayoun", site: "Evand", title: "concert of homayoun" });
    const fa = stepFromUrl(`see this: https://www.jajiga.com/room/123 ok`)!;
    assert.equal(fa.site, "Jajiga");
    assert.equal(fa.url, "https://www.jajiga.com/room/123");
    assert.equal(stepFromUrl(`https://www.tiwall.com/p/${encodeURIComponent("نمایش-هملت")}`)!.title, "نمایش هملت");
    assert.equal(stepFromUrl("https://example.org/x/1.html")!.title, "example.org", "no readable part: the site");
    assert.equal(stepFromUrl("no link here"), null);
    assert.equal(stepFromUrl("javascript:alert(1)"), null);
  });
  it("knows every travel adapter's host", () => {
    for (const a of ADAPTERS) {
      const url = a.deepLink({ vertical: a.verticals[0] === "ticket" ? "ticket" : a.verticals[0], mode: "flight", route: { from: { key: "tehran", fa: "تهران", en: "Tehran", province: "", iata: "THR" }, to: { key: "mashhad", fa: "مشهد", en: "Mashhad", province: "", iata: "MHD" }, date: "2026-12-01" }, city: { key: "tehran", fa: "تهران", en: "Tehran", province: "" } } as never);
      if (url) assert.notEqual(stepFromUrl(url)!.site, new URL(url).hostname.replace(/^www\./, ""), `${a.site} host known`);
    }
  });
  it("cleans steps read back (bad links, sizes and dates dropped or clamped) and adds them to the bill and the diary", () => {
    const clean = cleanSteps([step(), step({ id: "bad", url: "ftp://x" }), step({ id: "d", date: "soon" }), { id: "p", date: "2026-12-03", url: "https://jajiga.com/r/1", title: "", price: -5, people: 99 }]);
    assert.deepEqual(clean.map((s) => s.id), ["s1", "p"]);
    assert.deepEqual([clean[1].price, clean[1].people, clean[1].site], [0, 9, "Jajiga"]);
    assert.equal(stepsCost(clean), 1_000_000);
    const p = plan({ steps: [step()] });
    assert.equal(billOf(p, {}, {}).steps, 1_000_000);
    assert.equal(billOf(p, {}, {}).total, 1_000_000);
    assert.ok(itinerary(p).find((d) => d.date === "2026-12-02")!.items.some((x) => x.kind === "step"));
    assert.deepEqual(cleanPlan({ ...p, start: "2099-01-01" })!.steps!.map((s) => s.id), ["s1"]);
  });
});

describe("the final list to book", () => {
  it("every chosen thing in date order with its price for everyone, site, link and Jalali date; open ones counted", () => {
    const p = plan({ steps: [step()], acts: [{ id: "a1", city: "shiraz", title: "Eram garden", emoji: "🌳", price: 100_000, people: 2 }] });
    const list = checklist(p, { 0: { way: "flight", trip: trip(2_000_000) }, 1: { way: "car" } }, { 0: { stay: stay(1_500_000) } });
    assert.deepEqual(list.items.map((x) => x.kind), ["ticket", "stay", "step", "car", "act"]);
    const [tk, st] = list.items;
    assert.deepEqual([tk.price, tk.site, tk.url, tk.jalali, tk.from, tk.to], [4_000_000, "alibaba", "https://www.alibaba.ir/flights/THR-IFN", "1405/09/10", "tehran", "isfahan"]);
    assert.deepEqual([st.price, st.n, st.site, st.url], [1_500_000 * 2, 2, "jabama", "https://www.jabama.com/stay/hotel-1"]);
    assert.ok(list.items[3].price > 0, "the car's fuel");
    assert.equal(list.total, list.items.reduce((s, x) => s + x.price, 0));
    assert.equal(list.open, 2, "the leg home and Shiraz's stay");
  });
});
