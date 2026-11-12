// Every store the game knows, as one kind of row — whichever site it came from.
//
// Snappfood restaurants, Torob's walk-in shops, Takhfifan deals, cinemas (cinematicket), the
// directory sites (Bilbooard, Irangaah, Okala, Netbarg) and the map's own places all become a
// `Listing`: a name, a spot, one store type, a rating out of 5, open now or not, a deal, a
// picture, and which sites list it. The same shop on two sites is one listing that carries both
// sources (and the best of each site's facts), so lists and filters never show a store twice.
//
// One filter for all of them (`ListingFilter`): words, sources, types, open now, rating, deals,
// and one order (nearest, best rated, biggest deal, A–Z). Used by the store list on the 2D map
// and the Places panel in the 3D city. Pure: no fetching, no React.
import { msg } from "@/lib/i18n";
import { distanceM, type LatLng } from "@/lib/geo";
import { sameName, sameStore, type Deal, type TorobPlace, type Vendor, type VendorKind } from "@/lib/localData";
import type { Cinema } from "@/lib/cinema";
import type { PlaceCat } from "@/lib/places";
import { SITES, STORE_TYPES, typeOf, type DirStore, type MapSite, type StoreType } from "./directory";

export type ListingSource = "snappfood" | "torob" | "takhfifan" | "cinema" | MapSite | "map";
/** Each source's badge: its name, mark and brand colour — the same chip everywhere. */
export const LISTING_SOURCES: Record<ListingSource, { name: string; emoji: string; color: string; what: string }> = {
  snappfood: { name: msg("Snappfood"), emoji: "🍽️", color: "#ff00a6", what: msg("Menus and prices") },
  torob: { name: msg("Torob"), emoji: "🏷️", color: "#d73948", what: msg("Walk-in shops and their prices") },
  takhfifan: { name: msg("Takhfifan"), emoji: "🎟️", color: "#00a19a", what: msg("Discounts") },
  cinema: { name: msg("Cinematicket"), emoji: "🎬", color: "#e2a400", what: msg("Films and showtimes") },
  bilbooard: { name: SITES.bilbooard.name, emoji: SITES.bilbooard.emoji, color: SITES.bilbooard.color, what: SITES.bilbooard.what },
  irangaah: { name: SITES.irangaah.name, emoji: SITES.irangaah.emoji, color: SITES.irangaah.color, what: SITES.irangaah.what },
  okala: { name: SITES.okala.name, emoji: SITES.okala.emoji, color: SITES.okala.color, what: SITES.okala.what },
  netbarg: { name: SITES.netbarg.name, emoji: SITES.netbarg.emoji, color: SITES.netbarg.color, what: SITES.netbarg.what },
  map: { name: msg("Map"), emoji: "📍", color: "#6b7a90", what: msg("Places on the map") },
};
/** The order sources are listed (and merged: the first one's facts win a tie). */
export const LISTING_SOURCE_KEYS: ListingSource[] = ["snappfood", "torob", "takhfifan", "okala", "netbarg", "cinema", "bilbooard", "irangaah", "map"];

/** What a listing opens when tapped: the original row, for the card that already knows it. */
export type ListingRef =
  | { type: "vendor"; data: Vendor }
  | { type: "torob"; data: TorobPlace }
  | { type: "deal"; data: Deal }
  | { type: "cinema"; data: Cinema }
  | { type: "dir"; data: DirStore }
  | { type: "spot"; data: { id: string; name: string; cat: PlaceCat; lat: number; lng: number } };

export type Listing = {
  /** `<source>:<its id>` of the row that opens. */
  key: string;
  name: string;
  lat: number;
  lng: number;
  type: StoreType;
  /** The site's own category words (for the row and the search). */
  cat: string;
  /** Out of 5 (0: unknown); `reviews`: how many said so (0: unknown). */
  rating: number;
  reviews: number;
  img: string;
  /** Open right now (Snappfood says): true / false; null when no site says. */
  open: boolean | null;
  /** Percent off (a deal), 0 when none. */
  off: number;
  /** Has a menu or a catalogue with prices to look at. */
  priced: boolean;
  /** Every site that lists this store, the first being the one `ref` opens. */
  sources: ListingSource[];
  ref: ListingRef;
};

const SPOT_TYPES: Partial<Record<PlaceCat, StoreType>> = {
  burger: "food", pizza: "food", restaurant: "food", cafe: "cafe", bakery: "bakery", icecream: "sweets", bar: "cafe",
  grocery: "grocery", pharmacy: "pharmacy", fuel: "auto", gym: "sport", fashion: "clothing", tech: "digital", books: "gifts", cinema: "sport", bank: "finance", park: "other", shop: "other",
};
const VENDOR_TYPES: Record<VendorKind, StoreType> = { food: "food", cafe: "cafe", sweets: "sweets", market: "grocery" };
const r5 = (n: number, outOf = 5) => (n > 0 ? Math.round(Math.min(5, (n * 5) / outOf) * 10) / 10 : 0);

export const fromVendor = (v: Vendor): Listing => ({
  key: `snappfood:${v.code}`, name: v.title, lat: v.lat, lng: v.lng, type: VENDOR_TYPES[v.kind] ?? "food", cat: "",
  rating: r5(v.rating, 10), reviews: 0, img: v.logo, open: v.open, off: 0, priced: true, sources: ["snappfood"], ref: { type: "vendor", data: v },
});
export const fromTorob = (p: TorobPlace): Listing => ({
  key: `torob:${p.id}`, name: p.name, lat: p.lat, lng: p.lng, type: typeOf(p.name, ...p.sells), cat: p.sells.slice(0, 2).join("، "),
  rating: 0, reviews: 0, img: p.photo, open: null, off: 0, priced: !!p.stock?.length || p.sells.length > 0, sources: ["torob"], ref: { type: "torob", data: p },
});
export const fromDeal = (d: Deal): Listing => ({
  key: `takhfifan:${d.id}`, name: d.name, lat: d.lat, lng: d.lng, type: typeOf(d.category, d.name), cat: d.category,
  rating: r5(d.rating), reviews: d.reviews, img: d.photos[0] ?? "", open: null, off: d.off, priced: d.items.length > 0, sources: ["takhfifan"], ref: { type: "deal", data: d },
});
export const fromCinema = (c: Cinema): Listing => ({
  key: `cinema:${c.id}`, name: c.name, lat: c.lat, lng: c.lng, type: "sport", cat: "سینما",
  rating: r5(c.rate), reviews: c.rates, img: c.photo, open: null, off: 0, priced: true, sources: ["cinema"], ref: { type: "cinema", data: c },
});
export const fromDir = (s: DirStore): Listing => ({
  key: s.id, name: s.name, lat: s.lat, lng: s.lng, type: s.type, cat: s.cat,
  rating: s.rating, reviews: 0, img: s.img ?? "", open: null, off: s.off ?? 0, priced: s.site === "okala" || !!s.price, sources: [s.site, ...(s.also ?? [])], ref: { type: "dir", data: s },
});
export const fromSpot = (p: { id: string; name: string; cat: PlaceCat; lat: number; lng: number }): Listing => ({
  key: `map:${p.id}`, name: p.name, lat: p.lat, lng: p.lng, type: SPOT_TYPES[p.cat] ?? "other", cat: "",
  rating: 0, reviews: 0, img: "", open: null, off: 0, priced: false, sources: ["map"], ref: { type: "spot", data: p },
});

const CELL = 0.004; // ≈ 440 m: sameStore never reaches further
/**
 * One listing per store. `lists` come best source first (the one whose card should open): a
 * later row that is the same store as an earlier one (sameStore: near and alike in name) adds
 * its source to it and fills what it lacks — a picture, a rating, a deal, opening state — and
 * isn't listed again. Rows without a name are dropped; a source's own repeats (the same name
 * within 40 m) too.
 */
export function mergeListings(...lists: Listing[][]): Listing[] {
  const grid = new Map<string, Listing[]>();
  const out: Listing[] = [];
  for (const list of lists)
    for (const l of list) {
      if (!l.name?.trim() || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue;
      const cy = Math.floor(l.lat / CELL), cx = Math.floor(l.lng / CELL);
      let twin: Listing | null = null;
      for (let dy = -1; dy <= 1 && !twin; dy++)
        for (let dx = -1; dx <= 1 && !twin; dx++)
          for (const o of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
            const m = distanceM(l, o);
            const own = o.sources[0] === l.sources[0];
            if (own ? m <= 40 && sameName(l.name, o.name) : sameStore({ name: l.name, lat: l.lat, lng: l.lng }, { title: o.name, lat: o.lat, lng: o.lng }, m)) {
              twin = o;
              break;
            }
          }
      if (twin) {
        for (const s of l.sources) if (!twin.sources.includes(s)) twin.sources.push(s);
        twin.img ||= l.img;
        if (!twin.rating && l.rating) (twin.rating = l.rating), (twin.reviews = l.reviews);
        twin.off = Math.max(twin.off, l.off);
        twin.priced ||= l.priced;
        if (twin.open == null) twin.open = l.open;
        if (twin.type === "other") twin.type = l.type;
        twin.cat ||= l.cat;
        continue;
      }
      const copy = { ...l, sources: [...l.sources] };
      const k = `${cy}:${cx}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(copy);
      out.push(copy);
    }
  return out;
}

export type ListingSort = "near" | "rating" | "off" | "name";
export const LISTING_SORTS: Record<ListingSort, string> = {
  near: msg("Nearest"),
  rating: msg("Best rated"),
  off: msg("Biggest discount"),
  name: msg("A–Z"),
};
export const LISTING_SORT_KEYS = Object.keys(LISTING_SORTS) as ListingSort[];

export type ListingFilter = {
  q?: string;
  sources?: ListingSource[];
  types?: StoreType[];
  /** Only what a site says is open now. */
  openNow?: boolean;
  /** Only rated at least this (out of 5). */
  minRating?: number;
  /** Only with something off. */
  deals?: boolean;
  /** Only with a menu or prices to look at. */
  priced?: boolean;
  sort?: ListingSort;
};
/** How many filters are set (the badge on the Filters button); words and order don't count. */
export const filterCount = (f: ListingFilter) =>
  (f.sources?.length ? 1 : 0) + (f.types?.length ? 1 : 0) + (f.openNow ? 1 : 0) + (f.minRating ? 1 : 0) + (f.deals ? 1 : 0) + (f.priced ? 1 : 0);

export type Row = { l: Listing; m: number };
export type Filtered = {
  rows: Row[];
  /** For each chip, how many the *other* filters leave — so a chip never promises a list it can't give. */
  bySource: Map<ListingSource, number>;
  byType: Map<StoreType, number>;
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌ً-ْ]/g, "")
    .replace(/\s+/g, " ");

/** Searchable text of a listing: its name, its site category and its type's label (in either language). */
export const hayOf = (l: Listing, label: (s: string) => string) => fold(`${l.name} ${l.cat} ${label(STORE_TYPES[l.type].label)} ${STORE_TYPES[l.type].label}`);

/**
 * `list` as `f` leaves it, sorted, with the distance from `at` (0 everywhere without one).
 * `hay` caches the searchable text (hayOf) by key so typing doesn't rebuild it.
 */
export function filterListings(list: Listing[], f: ListingFilter, at: LatLng | null, hay: (l: Listing) => string): Filtered {
  const words = fold(f.q ?? "").trim().split(" ").filter(Boolean);
  const src = f.sources?.length ? new Set(f.sources) : null;
  const types = f.types?.length ? new Set(f.types) : null;
  const rest = (l: Listing) =>
    (!words.length || words.every((w) => hay(l).includes(w))) &&
    (!f.openNow || l.open === true) &&
    (!f.minRating || l.rating >= f.minRating) &&
    (!f.deals || l.off > 0) &&
    (!f.priced || l.priced);
  const bySource = new Map<ListingSource, number>(), byType = new Map<StoreType, number>();
  const rows: Row[] = [];
  for (const l of list) {
    if (!rest(l)) continue;
    const okSrc = !src || l.sources.some((s) => src.has(s));
    const okType = !types || types.has(l.type);
    if (okType) for (const s of l.sources) bySource.set(s, (bySource.get(s) ?? 0) + 1);
    if (okSrc) byType.set(l.type, (byType.get(l.type) ?? 0) + 1);
    if (okSrc && okType) rows.push({ l, m: at ? distanceM(at, l) : 0 });
  }
  const sort = f.sort ?? "near";
  const by: Record<ListingSort, (a: Row, b: Row) => number> = {
    near: (a, b) => a.m - b.m,
    rating: (a, b) => b.l.rating - a.l.rating || b.l.reviews - a.l.reviews || a.m - b.m,
    off: (a, b) => b.l.off - a.l.off || a.m - b.m,
    name: (a, b) => a.l.name.localeCompare(b.l.name, "fa"),
  };
  rows.sort(by[sort]);
  return { rows, bySource, byType };
}
