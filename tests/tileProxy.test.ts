import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE_SOURCES, tileCachePath, tileSourceUrl, viaHost } from "../src/lib/tileProxy";

test("tile proxy: a provider's template becomes our path; unknown ones (Esri) stay as they are", () => {
  assert.equal(viaHost("https://tile.openstreetmap.org/{z}/{x}/{y}.png"), "/api/tile/osm/{z}/{x}/{y}.png");
  assert.equal(viaHost("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"), "/api/tile/rail/{z}/{x}/{y}.png");
  const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  assert.equal(viaHost(esri), esri);
  assert.equal(viaHost("https://tile.openstreetmap.org/{z}/{x}/{y}.png", false), "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "off: direct");
});

test("tile proxy: one tile's provider URL, subdomains spread, bad tiles refused", () => {
  assert.equal(tileSourceUrl("osm", 15, 21075, 12940), "https://tile.openstreetmap.org/15/21075/12940.png");
  assert.match(tileSourceUrl("topo", 12, 2634, 1617)!, /^https:\/\/[abc]\.tile\.opentopomap\.org\/12\/2634\/1617\.png$/);
  assert.notEqual(tileSourceUrl("hot", 10, 1, 0), tileSourceUrl("hot", 10, 2, 0)?.replace("/2/", "/1/"), "neighbours use different subdomains");
  assert.equal(tileSourceUrl("topo", 18, 0, 0), null, "past the provider's zoom");
  assert.equal(tileSourceUrl("osm", 2, 4, 0), null, "outside the world");
  assert.equal(tileSourceUrl("osm", 2.5, 0, 0), null);
  assert.equal(tileSourceUrl("evil", 1, 0, 0), null, "only providers we pass through");
  assert.equal(tileCachePath("osm", 15, 1, 2), "osm/15/1/2.png");
  for (const s of Object.values(TILE_SOURCES)) assert.match(s.url, /^https:\/\/.*\{z\}\/\{x\}\/\{y\}\.png$/);
});
