// "Navigate with…" (lib/navApps.ts): which apps each device is offered, in what order, and their links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coordsText, navLink, navLinks, platformOf } from "@/lib/navApps";

const TO = { lat: 35.7448123, lng: 51.53750009 };

test("platform from the user agent (an iPad says Macintosh but has a touch screen)", () => {
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 14; SM-A546E)"), "android");
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "ios");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), "desktop");
  assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
});

test("each device gets its native choice first, and Neshan, Balad, Google Maps and Waze everywhere", () => {
  const apps = (p: "android" | "ios" | "desktop") => navLinks(TO, { platform: p }).map((l) => l.app);
  assert.equal(apps("android")[0], "geo");
  assert.equal(apps("ios")[0], "apple");
  assert.equal(apps("desktop")[0], "google");
  assert.ok(!apps("ios").includes("geo") && !apps("desktop").includes("geo"), "geo: only works on Android");
  for (const p of ["android", "ios", "desktop"] as const) for (const a of ["neshan", "balad", "google", "waze"] as const) assert.ok(apps(p).includes(a), `${p} offers ${a}`);
});

test("the app used last time goes first; an unknown one changes nothing", () => {
  assert.equal(navLinks(TO, { platform: "android", favourite: "waze" })[0].app, "waze");
  assert.equal(navLinks(TO, { platform: "android", favourite: "waze" }).filter((l) => l.app === "waze").length, 1);
  assert.equal(navLinks(TO, { platform: "ios", favourite: "geo" })[0].app, "apple");
  assert.equal(navLinks(TO, { platform: "desktop", favourite: "nonsense" })[0].app, "google");
});

test("links carry the destination (6 decimals, no trailing zeros)", () => {
  assert.equal(navLink("waze", TO), "https://waze.com/ul?ll=35.744812,51.5375&navigate=yes");
  assert.equal(navLink("google", TO), "https://www.google.com/maps/dir/?api=1&destination=35.744812,51.5375&travelmode=driving");
  assert.match(navLink("googleWalk", TO), /travelmode=walking$/);
  assert.equal(navLink("neshan", TO), "https://neshan.org/maps/@35.744812,51.5375,17z,0p");
  assert.equal(navLink("balad", TO), "https://balad.ir/location?latitude=35.744812&longitude=51.5375&zoom=17");
  assert.equal(navLink("apple", TO, { name: "Café Nader" }), "https://maps.apple.com/?daddr=35.744812,51.5375&dirflg=d&q=Caf%C3%A9%20Nader");
  assert.equal(navLink("geo", TO, { name: "کافه" }), `geo:35.744812,51.5375?q=35.744812,51.5375(${encodeURIComponent("کافه")})`);
  assert.equal(navLink("osm", TO), "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B35.744812%2C51.5375");
  assert.match(navLink("osm", TO, { from: { lat: 35.7, lng: 51.4 } }), /route=35\.7%2C51\.4%3B35\.744812%2C51\.5375$/);
  assert.equal(navLink("google", { lat: 35, lng: 51 }), "https://www.google.com/maps/dir/?api=1&destination=35,51&travelmode=driving");
});

test("coordinates to paste into any map", () => assert.equal(coordsText(TO), "35.744812, 51.5375"));
