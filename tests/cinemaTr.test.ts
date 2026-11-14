import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { osmCinemaQuery, parseOsmCinema, trailerOf, webLink } from "@/lib/cinemaTr";
import { sourceAt } from "@/lib/region";

describe("cinemas in Turkey and trailers", () => {
  it("reads an open-map cinema: a way's centre, its address, its own page or a search for its programme", () => {
    const c = parseOsmCinema({ type: "way", id: 42, center: { lat: 41.04, lon: 28.99 }, tags: { amenity: "cinema", name: "Atlas Sineması", "addr:street": "İstiklal Caddesi", "addr:housenumber": "131", website: "atlassinemalari.com" } })!;
    assert.deepEqual([c.id, c.name, c.lat, c.lng, c.osm, c.site, c.address], [1e13 + 42, "Atlas Sineması", 41.04, 28.99, true, "https://atlassinemalari.com/", "İstiklal Caddesi 131"]);
    const n = parseOsmCinema({ type: "node", id: 7, lat: 41, lon: 29, tags: { name: "Kadıköy Sineması" } })!;
    assert.match(n.site!, /google\.com\/search\?q=Kad%C4%B1k%C3%B6y%20Sinemas%C4%B1%20seans%20saatleri/);
    assert.equal(parseOsmCinema({ type: "node", id: 8, lat: 41, lon: 29, tags: {} }), null);
    assert.equal(webLink("javascript:alert(1)"), null);
    assert.match(osmCinemaQuery(41, 29, 25_000), /amenity"="cinema"\]\(around:25000,41\.00000,29\.00000\)/);
  });
  it("a film's trailer: Aparat's MP4 only from Aparat over https, and its page", () => {
    const ok = trailerOf({ movie: { aparat_trailer: "https://persian29.asset.aparat.com/aparat-video/abc-480p.mp4?wmsAuthSign=x", aparat_hash: "bms6eki" } });
    assert.deepEqual(ok, { url: "https://persian29.asset.aparat.com/aparat-video/abc-480p.mp4?wmsAuthSign=x", page: "https://www.aparat.com/v/bms6eki" });
    assert.deepEqual(trailerOf({ movie: { aparat_trailer: "https://evil.example/x.mp4", aparat_hash: null } }), { url: null, page: null });
    assert.deepEqual(trailerOf({ movie: { aparat_trailer: "", aparat_hash: "" } }), { url: null, page: null });
  });
  it("Turkey's cinemas only in Turkey, Cinematicket only in Iran", () => {
    assert.equal(sourceAt("sinema", { lat: 41.01, lng: 28.98 }), true);
    assert.equal(sourceAt("sinema", { lat: 35.69, lng: 51.39 }), false);
    assert.equal(sourceAt("cinematicket", { lat: 41.01, lng: 28.98 }), false);
  });
});
