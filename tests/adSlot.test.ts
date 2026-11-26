// Ad slots (lib/ads/slot.ts): the fallback chain per country, prices, links, weighted picks.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adChain, adPositions, adPrice, cleanAdUrl, pickHouse } from "@/lib/ads/slot";

const all = { yektanet: "https://cdn.example/y.js", tapsell: "https://cdn.example/t.js", adsense: { client: "ca-pub-1234567890", slot: "12345" } };

describe("ad slots", () => {
  it("Iran: house, then Yektanet and Tapsell — never AdSense", () => assert.deepEqual(adChain("IR", all), ["house", "yektanet", "tapsell"]));
  it("outside Iran: house, then AdSense", () => assert.deepEqual(adChain("TR", all), ["house", "adsense"]));
  it("unknown country: the Iranian networks, no AdSense", () => assert.deepEqual(adChain(null, all), ["house", "yektanet", "tapsell"]));
  it("networks that aren't set up are skipped", () => assert.deepEqual(adChain("IR", {}), ["house"]));
  it("prices round up to whole hundreds of views", () => {
    assert.equal(adPrice(100, 40), 40);
    assert.equal(adPrice(150, 40), 80);
    assert.equal(adPrice(5000, 40), 2000);
  });
  it("links: https or a path here; nothing else", () => {
    assert.equal(cleanAdUrl("https://shop.example/a"), "https://shop.example/a");
    assert.equal(cleanAdUrl("/s/abc"), "/s/abc");
    assert.equal(cleanAdUrl(""), "");
    for (const bad of ["http://x.example", "javascript:alert(1)", "//evil.example", "/\\evil", "ftp://x"]) assert.equal(cleanAdUrl(bad), null, bad);
  });
  it("picks by views left; none left → nothing", () => {
    const ads = [{ id: "a", views: 100, shown: 100 }, { id: "b", views: 300, shown: 0 }, { id: "c", views: 100, shown: 0 }];
    assert.equal(pickHouse(ads, () => 0)?.id, "b");
    assert.equal(pickHouse(ads, () => 0.99)?.id, "c");
    assert.equal(pickHouse([{ views: 10, shown: 10 }]), null);
  });
});

describe("ad positions in a list", () => {
  it("after the third row (the last in a short list), then every 12th, at most 4", () => {
    assert.deepEqual([...adPositions(0)], []);
    assert.deepEqual([...adPositions(2)], [1]);
    assert.deepEqual([...adPositions(10)], [2]);
    assert.deepEqual([...adPositions(30)], [2, 14, 26]);
    assert.deepEqual([...adPositions(200)].length, 4);
    assert.deepEqual([...adPositions(40, 4, 16)], [3, 19, 35]);
  });
});
