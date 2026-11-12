// Where the server reaches an Iranian site (lib/relayUrl.ts): its own *_URL, else through the relay's
// generic route when RELAY_URL is set and the site is in RELAY_FOR, else straight.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteBase } from "@/lib/relayUrl";

describe("siteBase", () => {
  const R = "http://37.0.0.1:8790/key-0123456789abcdef/";
  it("goes straight to the site with no relay", () => {
    assert.equal(siteBase("snappfood", undefined, "https://snappfood.ir", {}), "https://snappfood.ir");
    assert.equal(siteBase("cinematicket", undefined, "https://cinematicket.org/api/v1/", {}), "https://cinematicket.org/api/v1");
  });
  it("sends Snappfood (by default) through the relay's generic route, keeping the site's path", () => {
    assert.equal(siteBase("snappfood", undefined, "https://snappfood.ir", { RELAY_URL: R }), "http://37.0.0.1:8790/key-0123456789abcdef/https/snappfood.ir");
    assert.equal(siteBase("torob", undefined, "https://api.torob.com", { RELAY_URL: R }), "https://api.torob.com", "not in RELAY_FOR");
    assert.equal(siteBase("cinematicket", undefined, "https://cinematicket.org/api/v1", { RELAY_URL: R, RELAY_FOR: "all" }), "http://37.0.0.1:8790/key-0123456789abcdef/https/cinematicket.org/api/v1");
    assert.equal(siteBase("torob", undefined, "https://api.torob.com", { RELAY_URL: R, RELAY_FOR: "snappfood, Torob" }), "http://37.0.0.1:8790/key-0123456789abcdef/https/api.torob.com");
  });
  it("lets a site's own URL win, and \"off\" turn it off", () => {
    assert.equal(siteBase("snappfood", "http://relay/k/snappfood/", "https://snappfood.ir", { RELAY_URL: R }), "http://relay/k/snappfood");
    assert.equal(siteBase("snappfood", "off", "https://snappfood.ir", { RELAY_URL: R }), null);
  });
});
