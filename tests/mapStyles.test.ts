// Every 2D map look must work without a key: a keyed provider answers with an
// "API key required" picture instead of the map (CARTO did exactly that in 2026).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_STYLE, MAP_STYLES, mapStyle, tileHosts, type Tiles } from "@/components/game/mapStyles";

/** Providers that need a key (or now draw a watermark) without one. */
const KEYED = /cartocdn\.com|thunderforest\.com|stadiamaps\.com|maptiler\.com|mapbox\.com|arcgis\.com\/arcgis\/rest|here\.com|tomtom\.com|google(apis)?\.com/i;
const providers = (): Tiles[] => MAP_STYLES.flatMap((s) => [s.tiles, s.labels, s.fallback]).filter((t): t is Tiles => !!t);

describe("map styles", () => {
  it("use no provider that needs a key", () => {
    for (const t of providers()) assert.doesNotMatch(t.url, KEYED, t.url);
    for (const t of providers()) assert.doesNotMatch(t.url, /[?&](key|api_key|access_token|apikey)=/i, t.url);
  });

  it("each draw something: their own tiles, or a filter over the default ones", () => {
    for (const s of MAP_STYLES) assert.ok(s.tiles || s.css || s.id === "classic", s.id);
    assert.equal(new Set(MAP_STYLES.map((s) => s.id)).size, MAP_STYLES.length, "ids are unique");
  });

  it("give every provider an attribution and a well-formed template", () => {
    for (const t of providers()) {
      assert.ok(t.attribution.length > 10, t.url);
      assert.match(t.url, /^https:\/\//);
      assert.match(t.url, /\{z\}/);
      if (t.url.includes("{s}")) assert.ok(t.subdomains ?? "abc", t.url);
    }
  });

  it("fall back from providers that block some countries", () => {
    // Esri is geo-blocked in Iran on and off: its street and topo looks have a stand-in.
    for (const id of ["topo", "esri-streets"]) assert.ok(mapStyle(id).fallback, id);
  });

  it("let the service worker keep every provider's tiles, stand-ins included", () => {
    const hosts = tileHosts();
    for (const t of providers()) {
      const host = new URL(t.url.replace(/^(https?:\/\/)\{s\}\./, "$1").replace(/\{[^}]+\}/g, "0")).hostname;
      assert.ok(hosts.includes(host), host);
    }
  });

  it("start on the default look, and an unknown id falls back to it", () => {
    assert.equal(mapStyle("nope"), DEFAULT_STYLE);
    assert.equal(mapStyle(null), DEFAULT_STYLE);
  });
});
