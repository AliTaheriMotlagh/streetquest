import { test } from "node:test";
import assert from "node:assert/strict";
import { addVisit, claimCode, claimRisk, codeOnPage, iranDay, RISK_REVIEW, sameSite, settle, VISIT_GAP_H, VISIT_M } from "../src/lib/claims";

test("claim codes are SQ- and six unmistakable characters", () => {
  let i = 0;
  const seq = [0, 0.1, 0.5, 0.99, 0.3, 0.7];
  const c = claimCode(() => seq[i++ % seq.length]);
  assert.match(c, /^SQ-[A-HJ-NP-Z2-9]{6}$/);
  for (let n = 0; n < 50; n++) assert.doesNotMatch(claimCode().slice(3), /[01OI]/);
});

test("the code is found however the site wrote it", () => {
  assert.ok(codeOnPage(`<meta name="streetquest" content="SQ-AB2CD3">`, "SQ-AB2CD3"));
  assert.ok(codeOnPage("<footer>کد تأیید: sq ab2cd3</footer>", "SQ-AB2CD3"));
  assert.ok(codeOnPage("SQ‌-AB۲CD۳", "SQ-AB2CD3"));
  assert.ok(!codeOnPage("<p>SQ-AB2CD4</p>", "SQ-AB2CD3"));
});

test("only the store's own website counts", () => {
  assert.ok(sameSite("https://www.cafe-naderi.ir/about", "cafe-naderi.ir"));
  assert.ok(sameSite("cafe-naderi.ir", "http://www.cafe-naderi.ir"));
  assert.ok(!sameSite("https://cafe-naderi.ir.evil.com", "cafe-naderi.ir"));
  assert.ok(!sameSite("https://instagram.com/cafe", ""));
  assert.ok(!sameSite("not a url ::", "cafe.ir"));
});

test("two visits at the store on different days, far enough apart", () => {
  const day1 = Date.UTC(2026, 10, 15, 6); // 09:30 in Tehran
  const at = (ms: number, dist = 10) => ({ at: ms, lat: 35.7, lng: 51.4, dist });
  assert.deepEqual(addVisit([], at(day1, VISIT_M + 30)), { ok: false, why: "far" });
  const one = addVisit([], at(day1));
  assert.ok(one.ok && !one.done);
  if (!one.ok) return;
  // Same afternoon: too soon.
  assert.deepEqual(addVisit(one.visits, at(day1 + 6 * 3600_000)), { ok: false, why: "soon" });
  // Next day but only a few hours later (late night → early morning): still too soon.
  const lateNight = Date.UTC(2026, 10, 15, 19); // 22:30 Tehran
  const early = addVisit([at(lateNight)], at(lateNight + 4 * 3600_000));
  assert.equal(iranDay(lateNight) !== iranDay(lateNight + 4 * 3600_000), true);
  assert.deepEqual(early, { ok: false, why: "soon" });
  const two = addVisit(one.visits, at(day1 + (VISIT_GAP_H + 8) * 3600_000));
  assert.ok(two.ok && two.done && two.visits.length === 2);
  // GPS slack widens the store's circle.
  assert.ok(addVisit([], at(day1, VISIT_M + 20), 25).ok);
});

test("risk: clean owners are approved at once, doubtful ones go to an admin", () => {
  const clean = claimRisk({ accountDays: 40, rejected: 0, recentClaims: 0, owned: 0, dispute: false });
  assert.equal(clean.score, 0);
  assert.equal(settle("website", clean.score, false), "approved");
  assert.equal(settle("visits", clean.score, false), "approved");
  assert.equal(settle("document", clean.score, false), "review");
  const fresh = claimRisk({ accountDays: 0.5, rejected: 1, recentClaims: 4, owned: 0, dispute: false });
  assert.ok(fresh.score >= RISK_REVIEW);
  assert.ok(fresh.flags.includes("New account"));
  assert.equal(settle("website", fresh.score, false), "review");
  // A store someone else runs never changes hands without an admin.
  assert.equal(settle("website", 0, true), "review");
  assert.ok(claimRisk({ accountDays: 99, rejected: 0, recentClaims: 0, owned: 0, dispute: true }).flags.includes("Store already has an owner"));
});
