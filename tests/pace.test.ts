// A polite client of the store sites: spaced out, capped a minute, backing off when told to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PACE_MAX_WAIT_MS, PACE_RULES, Pacer, pacerFor, siteOfUrl } from "@/lib/pace";

describe("pacing the store sites", () => {
  it("knows a site from its URL — straight or through the relay — and leaves others alone", () => {
    assert.equal(siteOfUrl("https://snappfood.ir/mobile/v2/restaurant/details/dynamic?x=1"), "snappfood");
    assert.equal(siteOfUrl("http://37.0.0.1:8790/key/https/snappfood.ir/search/api/v1/desktop/search"), "snappfood");
    assert.equal(siteOfUrl("https://api.torob.com/v4/base-product/search/"), "torob");
    assert.equal(siteOfUrl("https://search.raah.ir/v6/bundle-search"), "balad");
    assert.equal(siteOfUrl("http://localhost:4010/stub/vendors"), "");
    assert.equal(pacerFor("http://localhost:4010/stub/vendors", {}), null);
    assert.equal(pacerFor("https://snappfood.ir/x", { SITE_PACE: "off" }), null);
    assert.ok(pacerFor("https://snappfood.ir/x", {}) === pacerFor("https://snappfood.ir/y", {}), "one pacer per site");
    // Snappfood is the one we can least afford to lose: nobody is paced more gently.
    const sf = PACE_RULES.find((r) => r.site === "snappfood")!.rule;
    for (const r of PACE_RULES) if (r.site !== "torob") assert.ok(sf.gapMs >= r.rule.gapMs && sf.perMin <= r.rule.perMin, r.site);
  });

  it("spaces requests out: a burst leaves one at a time", () => {
    const p = new Pacer({ gapMs: 300, perMin: 100, coolOn: [429], strikes: 2, coolMs: 60_000 });
    assert.deepEqual([p.take(1000), p.take(1000), p.take(1000), p.take(1100)], [0, 300, 600, 800]);
    // After a quiet spell the next one goes at once.
    assert.equal(p.take(10_000), 0);
    // A queue that would wait too long isn't joined: the cache answers instead.
    const slow = new Pacer({ gapMs: 2500, perMin: 100, coolOn: [], strikes: 1, coolMs: 0 });
    assert.deepEqual([slow.take(0), slow.take(0), slow.take(0)], [0, 2500, 5000]);
    assert.ok(7500 > PACE_MAX_WAIT_MS);
    assert.equal(slow.take(0), null);
  });

  it("caps a minute, and the budget comes back as the minute passes", () => {
    const p = new Pacer({ gapMs: 0, perMin: 3, coolOn: [], strikes: 1, coolMs: 0 });
    assert.deepEqual([p.take(0), p.take(10), p.take(20), p.take(30)], [0, 0, 0, null]);
    assert.equal(p.take(59_000), null);
    assert.equal(p.take(60_001), 0, "the first one is a minute old");
    assert.equal(p.state(60_001).lastMin, 3);
  });

  it("stops asking once the site says no several times running, then starts again", () => {
    const p = new Pacer({ gapMs: 0, perMin: 100, coolOn: [403, 429], strikes: 3, coolMs: 15 * 60_000 });
    p.saw(403, 0);
    p.saw(200, 1); // a good answer in between: not "several running"
    p.saw(403, 2);
    p.saw(429, 3);
    assert.equal(p.cooling(4), false);
    assert.equal(p.take(4), 0);
    p.saw(403, 5);
    assert.equal(p.cooling(6), true, "three refusals in a row");
    assert.equal(p.take(6), null);
    assert.equal(p.state(6).coolS, 900);
    // A missing page or a timeout is nobody saying "go away".
    const q = new Pacer({ gapMs: 0, perMin: 100, coolOn: [429], strikes: 1, coolMs: 1000 });
    q.saw(404, 0);
    q.saw(0, 0);
    q.saw(500, 0);
    assert.equal(q.cooling(1), false);
    assert.equal(p.take(5 + 15 * 60_000), 0, "and we ask again afterwards");
  });
});
