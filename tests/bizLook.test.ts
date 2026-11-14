// A business's look in the game (lib/business.ts): what each plan shows, the owner's hours and menu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bizLook, bizOpeningHours, bizWeek, brandTier, cleanColor, cleanMenu, inkOn, PLAN_BY_KEY, shade, BIZ_MENU_MAX } from "../src/lib/business";
import { openState } from "../src/lib/localData";
import { pinHtml } from "../src/lib/mapPins";

const future = new Date(Date.now() + 10 * 86_400_000);
const base = { id: "b1", color: "#FF8800", tagline: "Fresh bread since 1985", menu: [{ title: "Sangak", price: 15000 }], hours: "07:00-21:00", offDays: 0, logoHash: "abc123" };

test("each plan shows its own share of the look", () => {
  assert.equal(brandTier(PLAN_BY_KEY.free), "basic");
  assert.equal(brandTier(PLAN_BY_KEY.starter), "brand");
  assert.equal(brandTier(PLAN_BY_KEY.pro), "featured");
  assert.equal(brandTier(PLAN_BY_KEY.chain), "featured");
  const free = bizLook({ ...base, plan: "free", planUntil: null });
  assert.deepEqual([free.tier, free.color, free.tagline, free.logo, free.menu.length], ["basic", "", "", null, 0]);
  assert.ok(free.week, "hours show on every plan");
  const starter = bizLook({ ...base, plan: "starter", planUntil: future });
  assert.equal(starter.tier, "brand");
  assert.equal(starter.color, "#ff8800");
  assert.equal(starter.logo, "/api/business/logo?id=b1&v=abc123");
  assert.deepEqual(starter.menu, [{ title: "Sangak", price: 15000 }]);
  // A paid plan past its date is back to the basic look.
  assert.equal(bizLook({ ...base, plan: "pro", planUntil: new Date(Date.now() - 1000) }).tier, "basic");
  assert.equal(bizLook({ ...base, plan: "pro", planUntil: future }).tier, "featured");
  assert.equal(bizLook({ ...base, logoHash: "", plan: "pro", planUntil: future }).logo, null);
});

test("colours and menus are cleaned", () => {
  assert.equal(cleanColor("#AbCdEf"), "#abcdef");
  for (const bad of ["red", "#abc", "#12345g", "javascript:", 5, null]) assert.equal(cleanColor(bad), "");
  assert.deepEqual(cleanMenu([{ title: "  Tea  ", price: 12.6 }, { title: "", price: 3 }, { title: "Bad", price: -1 }, { title: "NaN", price: "x" }, null]), [{ title: "Tea", price: 13 }]);
  assert.equal(cleanMenu(Array.from({ length: 40 }, (_, i) => ({ title: `i${i}`, price: i }))).length, BIZ_MENU_MAX);
  assert.deepEqual(cleanMenu("nope"), []);
  assert.equal(shade("#808080", -0.5), "#404040");
  assert.equal(shade("#000000", 1), "#ffffff");
  assert.equal(inkOn("#ffffff"), "#1a1a1a");
  assert.equal(inkOn("#102040"), "#ffffff");
});

test("the owner's hours become a week, closed days and past midnight included", () => {
  assert.equal(bizWeek(""), null);
  assert.equal(bizWeek("whenever"), null);
  const w = bizWeek("09:00-13:00, 16:00-21:00", 1 << 6)!; // shut on Friday
  assert.deepEqual(w[0], [[540, 780], [960, 1260]]);
  assert.deepEqual(w[6], []);
  assert.deepEqual(bizWeek("24")![3], [[0, 1440]]);
  assert.deepEqual(bizWeek("۱۸:۰۰-۰۲:۰۰")![2], [[1080, 1560]], "Persian digits, open past midnight");
  // 23:30 Tehran on a Monday (week day 2) is open at a place open 18:00-02:00.
  const late = bizWeek("18:00-02:00")!;
  assert.equal(openState(late, new Date("2026-11-16T20:00:00Z"), "Asia/Tehran").open, true);
  assert.equal(bizOpeningHours("09:00-22:00", (1 << 6) | 1), "09:00-22:00; Sa off; Fr off");
  assert.equal(bizOpeningHours("24"), "00:00-24:00");
  assert.equal(bizOpeningHours("nope"), "");
});

test("a business's own logo may show in its map pin; other relative URLs may not", () => {
  assert.match(pinHtml({ family: "game", face: "🏪", color: "#f0c05a", logo: "/api/business/logo?id=b1&v=abc", label: "X" }), /pin-logo/);
  assert.doesNotMatch(pinHtml({ family: "game", face: "🏪", color: "#f0c05a", logo: "/evil.png", label: "X" }), /pin-logo/);
  assert.doesNotMatch(pinHtml({ family: "game", face: "🏪", color: "#f0c05a", logo: "http://x/y.png", label: "X" }), /pin-logo/);
});
