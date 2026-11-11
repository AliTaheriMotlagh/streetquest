// "Navigate with…": hand a place off to a real navigation app (pure — no DOM).
//  - Android: the standard geo: link first, which offers every map app on the phone
//    (Neshan, Balad, Google Maps, Waze…) — then each app by name;
//  - iPhone/iPad: Apple Maps first (it's always there), then the others;
//  - desktop: the web maps, Google first.
// Neshan and Balad (what most people in Iran drive with) open the place on their map, one tap
// from a route; Google Maps, Apple Maps, Waze and OpenStreetMap start the route straight away.
// The app the player picked last time goes to the top.
import type { LatLng } from "./geo";

export type NavApp = "geo" | "google" | "googleWalk" | "waze" | "neshan" | "balad" | "apple" | "osm";
export type Platform = "android" | "ios" | "desktop";
export type NavLink = { app: NavApp; href: string };

/** Which kind of device, from its user agent (iPadOS calls itself a Mac with a touch screen). */
export function platformOf(ua: string, touch = 0): Platform {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return "ios";
  return "desktop";
}

const ORDER: Record<Platform, NavApp[]> = {
  android: ["geo", "neshan", "balad", "google", "waze", "googleWalk", "osm"],
  ios: ["apple", "neshan", "balad", "google", "waze", "googleWalk", "osm"],
  desktop: ["google", "neshan", "balad", "waze", "googleWalk", "apple", "osm"],
};

/** 6 decimals: ~10 cm, and no "1e-7" in an address. */
const c = (n: number) => (Math.round(n * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, "");

/** One app's link to `to` (`from`, where known, for the apps that want a start). */
export function navLink(app: NavApp, to: LatLng, o: { from?: LatLng | null; name?: string } = {}): string {
  const ll = `${c(to.lat)},${c(to.lng)}`;
  switch (app) {
    case "geo":
      return `geo:${ll}?q=${ll}${o.name ? `(${encodeURIComponent(o.name)})` : ""}`;
    case "google":
      return `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
    case "googleWalk":
      return `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`;
    case "waze":
      return `https://waze.com/ul?ll=${ll}&navigate=yes`;
    case "neshan":
      return `https://neshan.org/maps/@${ll},17z,0p`;
    case "balad":
      return `https://balad.ir/location?latitude=${c(to.lat)}&longitude=${c(to.lng)}&zoom=17`;
    case "apple":
      return `https://maps.apple.com/?daddr=${ll}&dirflg=d${o.name ? `&q=${encodeURIComponent(o.name)}` : ""}`;
    case "osm":
      return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${o.from ? encodeURIComponent(`${c(o.from.lat)},${c(o.from.lng)}`) : ""}%3B${encodeURIComponent(ll)}`;
  }
}

/** Every app this device can use, in the order to offer them; `favourite` (the last one used) first. */
export function navLinks(to: LatLng, o: { platform: Platform; from?: LatLng | null; name?: string; favourite?: string | null }): NavLink[] {
  const apps = ORDER[o.platform];
  const fav = apps.find((a) => a === o.favourite);
  const order = fav ? [fav, ...apps.filter((a) => a !== fav)] : apps;
  return order.map((app) => ({ app, href: navLink(app, to, o) }));
}

/** Coordinates as people paste them into any map's search box. */
export const coordsText = (p: LatLng) => `${c(p.lat)}, ${c(p.lng)}`;
