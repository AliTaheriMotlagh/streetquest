// Whose address and country a request is (lib/clientIp.ts): the Iran front door's x-front-ip only with
// the shared key, then Cloudflare's own header (a player can't write it), then the dev/Vercel ones.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp, countryOf, sameSecret, viaFront } from "@/lib/clientIp";
import { geoFrom } from "@/server/geoip";

const H = (o: Record<string, string>) => new Headers(o);
const KEY = "front-key-0123456789";

describe("clientIp", () => {
  it("prefers Cloudflare's cf-connecting-ip over a forwarded-for a player could write", () => {
    assert.equal(clientIp(H({ "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1, 5.5.5.5" }), KEY), "5.5.5.5");
  });
  it("falls back to x-forwarded-for (first hop), x-real-ip, then local", () => {
    assert.equal(clientIp(H({ "x-forwarded-for": "10.0.0.7, 3.3.3.3" }), undefined), "10.0.0.7");
    assert.equal(clientIp(H({ "x-real-ip": "4.4.4.4" }), undefined), "4.4.4.4");
    assert.equal(clientIp(H({}), undefined), "local");
  });
  it("believes the front door's x-front-ip only with the right key", () => {
    const h = { "cf-connecting-ip": "205.252.135.101", "x-front-ip": "2.2.2.2" };
    assert.equal(clientIp(H({ ...h, "x-front-key": KEY }), KEY), "2.2.2.2");
    assert.equal(clientIp(H({ ...h, "x-front-key": "front-key-0123456780" }), KEY), "205.252.135.101", "wrong key");
    assert.equal(clientIp(H({ ...h, "x-front-key": KEY }), undefined), "205.252.135.101", "no FRONT_KEY set");
    assert.equal(clientIp(H({ ...h, "x-front-key": "short" }), "short"), "205.252.135.101", "a short key never counts");
    assert.equal(viaFront(H({ "x-front-key": KEY }), KEY), true);
    assert.equal(viaFront(H({}), KEY), false);
  });
  it("compares secrets fully", () => {
    assert.equal(sameSecret("abc", "abc"), true);
    assert.equal(sameSecret("abc", "abd"), false);
    assert.equal(sameSecret("", ""), false);
    assert.equal(sameSecret("ab", "abc"), false);
  });
});

describe("countryOf", () => {
  it("reads Cloudflare's then Vercel's country, never unknown/Tor", () => {
    assert.equal(countryOf(H({ "cf-ipcountry": "ir" })), "IR");
    assert.equal(countryOf(H({ "x-vercel-ip-country": "TR" })), "TR");
    assert.equal(countryOf(H({ "cf-ipcountry": "XX" })), null);
    assert.equal(countryOf(H({ "cf-ipcountry": "T1" })), null);
    assert.equal(countryOf(H({})), null);
  });
});

describe("geoFrom", () => {
  it("takes Cloudflare's cf place, else Vercel's headers", () => {
    assert.deepEqual(geoFrom(H({}), { latitude: "35.69", longitude: "51.42", city: "Tehran" }), { lat: 35.69, lng: 51.42, city: "Tehran" });
    assert.deepEqual(geoFrom(H({ "x-vercel-ip-latitude": "41", "x-vercel-ip-longitude": "29", "x-vercel-ip-city": "%C4%B0stanbul" })), { lat: 41, lng: 29, city: "İstanbul" });
    assert.equal(geoFrom(H({})), null);
    assert.equal(geoFrom(H({}), { latitude: "999", longitude: "1" }), null);
  });
});
