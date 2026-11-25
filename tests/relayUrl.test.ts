// Where the server reaches an Iranian site (lib/relayUrl.ts): its own *_URL, else through the relay's
// generic route when RELAY_URL is set and the site is in RELAY_FOR, else straight.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reachable, siteBase } from "@/lib/relayUrl";

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
  it("never sends a site abroad (Istanbul buses, plane positions) through Iran just because of \"all\"", () => {
    assert.equal(siteBase("iett", undefined, "https://api.ibb.gov.tr", { RELAY_URL: R, RELAY_FOR: "all" }), "https://api.ibb.gov.tr");
    assert.equal(siteBase("adsb", undefined, "https://api.adsb.lol", { RELAY_URL: R, RELAY_FOR: "all" }), "https://api.adsb.lol");
    assert.equal(siteBase("iett", undefined, "https://api.ibb.gov.tr", { RELAY_URL: R, RELAY_FOR: "all,iett" }), "http://37.0.0.1:8790/key-0123456789abcdef/https/api.ibb.gov.tr", "named: yes");
  });
  it("lets a site's own URL win, and \"off\" turn it off", () => {
    assert.equal(siteBase("snappfood", "http://relay/k/snappfood/", "https://snappfood.ir", { RELAY_URL: R }), "http://relay/k/snappfood");
    assert.equal(siteBase("snappfood", "off", "https://snappfood.ir", { RELAY_URL: R }), null);
  });
  it("on Cloudflare Workers turns a bare-IP relay into its sslip.io name (Workers refuse IPs: error 1003)", () => {
    assert.equal(siteBase("snappfood", undefined, "https://snappfood.ir", { RELAY_URL: R }, true), "http://37-0-0-1.sslip.io:8790/key-0123456789abcdef/https/snappfood.ir");
    assert.equal(siteBase("snappfood", "http://37.0.0.1:8790/k/snappfood", "https://snappfood.ir", {}, true), "http://37-0-0-1.sslip.io:8790/k/snappfood");
    assert.equal(siteBase("snappfood", undefined, "https://snappfood.ir", { RELAY_URL: R }, false), "http://37.0.0.1:8790/key-0123456789abcdef/https/snappfood.ir", "Node: as set");
  });
});

describe("reachable", () => {
  it("rewrites only a bare IPv4 host, keeping port, key and path", () => {
    assert.equal(reachable("http://1.2.3.4:8790/k/x?y=1.2.3.4", true), "http://1-2-3-4.sslip.io:8790/k/x?y=1.2.3.4");
    assert.equal(reachable("https://1.2.3.4/x", true), "https://1-2-3-4.sslip.io/x");
    assert.equal(reachable("http://1.2.3.4", true), "http://1-2-3-4.sslip.io");
    assert.equal(reachable("http://1-2-3-4.sslip.io:8790/k", true), "http://1-2-3-4.sslip.io:8790/k");
    assert.equal(reachable("https://snappfood.ir/1.2.3.4", true), "https://snappfood.ir/1.2.3.4");
    assert.equal(reachable("http://1.2.3.4.example.com/", true), "http://1.2.3.4.example.com/");
  });
});
