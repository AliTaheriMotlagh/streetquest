// Bus rides have no arrival time on the ticket sites, so the planner estimates their length (lib/travel
// busMinutes): the site's road distance at ~70 km/h, else the cities' positions with winding roads — "about".
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUS_KMH, busMinutes, cityByKey, fromAlibabaBuses } from "@/lib/travel";

describe("busMinutes", () => {
  it("uses the road distance the site gives, rounded to 5 minutes", () => {
    assert.equal(BUS_KMH, 70);
    assert.equal(busMinutes(140), 120);
    assert.equal(busMinutes(900), 770); // 771.4 → 770
    assert.equal(busMinutes(2), 5, "never under 5 minutes");
  });
  it("falls back to the cities' positions (Tehran → Shiraz is roughly 12 hours)", () => {
    const m = busMinutes(undefined, { lat: 35.6892, lng: 51.389 }, { lat: 29.5918, lng: 52.5837 })!;
    assert.ok(m > 10 * 60 && m < 14 * 60, `${m} min`);
    assert.equal(busMinutes(0, { lat: 35.6892, lng: 51.389 }, { lat: null, lng: null }), undefined);
    assert.equal(busMinutes(null), undefined);
  });
  it("gives every bus trip an estimated length, marked as an estimate", () => {
    const from = cityByKey("tehran"), to = cityByKey("shiraz");
    assert.ok(from && to, "cities exist");
    const list = { result: { availableList: [{ companyName: "سیر و سفر", departureDateTime: "2026-11-20T21:00:00", price: 9000000, busType: "VIP" }, { companyName: "رویال", departureDateTime: "2026-11-20T22:00:00", price: 9500000, busType: "VIP", distance: 920 }] } };
    const [a, b] = fromAlibabaBuses(list, { from: from!, to: to!, date: "2026-11-20" });
    assert.equal(a.about, true);
    assert.ok(a.minutes! > 600, "from positions when the site gives no distance");
    assert.equal(b.minutes, busMinutes(920));
  });
});
