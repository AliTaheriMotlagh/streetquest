// What other sites know about a real store (pure — client and server): its Snappfood menu
// or catalog, its Torob listings, its Divar ad. The fetching and caching is in
// server/localData.ts; this file has the shapes, the link parsing and the name matching.
import { msg } from "./i18n";
import { distanceM } from "./geo";
import type { PlaceCat } from "./places";

/** A Snappfood vendor on the map: restaurants, cafés, bakeries, supermarkets… */
export type Vendor = {
  code: string;
  title: string;
  kind: VendorKind;
  lat: number;
  lng: number;
  rating: number;
  logo: string;
  url: string;
  open: boolean;
  about: string;
};
/** `photo` is the thumbnail for the list; `image` the full-size picture for the item's own sheet. */
export type MenuItem = { id: string; title: string; about: string; price: number; priceNow: number; photo: string; image?: string };
export type MenuSection = { title: string; items: MenuItem[] };
/**
 * A vendor's menu and what its page says about it: opening hours, phone, neighbourhood,
 * how many reviews it has and their star shares (% of 1…5 stars), delivery terms in toman.
 * Copies cached before these were read have none of the optional fields.
 */
export type Menu = {
  vendor: Vendor;
  cover: string;
  address: string;
  sections: MenuSection[];
  fetchedAt: string;
  week?: Week | null;
  phone?: string;
  /** Every number known for the store, with where each came from (`phone` is the first). */
  phones?: StorePhone[];
  area?: string;
  reviews?: number;
  stars?: number[];
  minOrder?: number;
  deliveryFee?: number;
};
/** A customer's review on Snappfood: `rate` 1–5 stars, `date` as Snappfood prints it (Solar Hijri), what they ordered, the store's answer. */
export type Review = { id: string; who: string; date: string; rate: number; text: string; foods: string[]; reply: string };
export type ReviewPage = { count: number; reviews: Review[] };
/** `from`: the cheapest of several shops (in a shop's catalog, too — Torob shows the best price). */
export type TorobItem = { title: string; price: number; from?: boolean; shop: string; photo: string; url: string };
/** A shop on Torob; `count` is how many products it lists. */
export type TorobShop = { id: number; name: string; logo: string; url: string; count: number };
/**
 * A product a walk-in store was seen selling on Torob's map of sellers, at that store's
 * own price (toman; 0 = ask in the store), with the store's own description of it
 * (`note`) and when it last changed the price (`when`, Torob's Persian words).
 */
export type TorobStock = { title: string; price: number; photo: string; url: string; note: string; when: string };
/**
 * A Torob shop with a store you can walk into, where Torob's own map of sellers puts it:
 * its city, the start of its address, a photo of the store, its week, what it was seen
 * selling (the emoji of each kind of product) and those products at its own prices
 * (`stock`; missing on maps built before it was kept).
 */
export type TorobPlace = { id: number; name: string; lat: number; lng: number; city: string; address: string; photo: string; week: Week | null; sells: string[]; stock?: TorobStock[] };
/** At most this many products are kept per walk-in store. */
export const MAX_STOCK = 8;

/** A row of Torob's map of sellers (that store) for a listing (the product) → what the store sells, at its price. */
export function stockOf(listing: { name1?: string; image_url?: string; web_client_absolute_url?: string }, row: { price?: number; name2?: string; last_price_change_date?: string }): TorobStock | null {
  const title = listing.name1?.trim(), path = listing.web_client_absolute_url;
  if (!title || !path || !path.startsWith("/")) return null;
  return {
    title: title.slice(0, 120),
    price: Math.max(0, Math.round(Number(row.price) || 0)),
    photo: listing.image_url ?? "",
    url: `https://torob.com${path}`,
    note: (row.name2 ?? "").trim().slice(0, 100),
    when: (row.last_price_change_date ?? "").trim().slice(0, 40),
  };
}

/** One store seen twice (the nationwide map, a search round a player): kinds and products merged, the first sighting's details kept. */
export function mergeTorobPlace(a: TorobPlace, b: TorobPlace): TorobPlace {
  const urls = new Set<string>(), stock: TorobStock[] = [];
  for (const s of [...(a.stock ?? []), ...(b.stock ?? [])]) if (!urls.has(s.url) && stock.length < MAX_STOCK) (urls.add(s.url), stock.push(s));
  return { ...a, address: a.address || b.address, photo: a.photo || b.photo, week: a.week ?? b.week, sells: [...a.sells, ...b.sells.filter((x) => !a.sells.includes(x))], stock };
}
/** The rest of a walk-in Torob shop's page: full address, phone, logo and photos. */
export type TorobPlaceInfo = { id: number; name: string; logo: string; photos: string[]; address: string; phone: string; phones?: StorePhone[]; city: string; url: string };
export type StoreLink = { kind: "snappfood" | "torob" | "divar" | "website" | "phone" | "instagram" | "directory"; url: string; label: string };
/**
 * `torob`: the store's own Torob shop catalog when `torobShop` is set, else listings only it sells.
 * `about`: what the card shows at the top — a picture (Snappfood cover, OSM photo), a logo,
 * the address, opening hours (`week` when they could be read, else the map's text in
 * `hours`) and a phone, whichever are known.
 */
export type StoreData = {
  menu: Menu | null;
  torob: TorobItem[];
  torobQuery: string;
  torobShop: TorobShop | null;
  links: StoreLink[];
  about: { photo: string; logo: string; address: string; hours: string; week?: Week | null; phone?: string; phones?: StorePhone[]; name?: string };
};

// ---------------------------------------------------------------- opening hours
/**
 * A store's week, Saturday first (the Iranian week): each day's open spans in minutes
 * after midnight — [540, 1230] is 09:00–20:30, and an end past 1440 runs into the next
 * day. A day with no spans is closed.
 */
export type Week = [number, number][][];
/** Saturday = 0 … Friday = 6, as Week counts them. */
export const WEEK_DAYS = [msg("Saturday"), msg("Sunday"), msg("Monday"), msg("Tuesday"), msg("Wednesday"), msg("Thursday"), msg("Friday")];

/** Persian and Arabic digits as 0–9. */
export const latinDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const minutes = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m && Number(m[1]) <= 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** A span that closes at or before it opens runs past midnight. */
const spanOf = (a: number, b: number): [number, number] => [a, b <= a ? b + 1440 : b];
const emptyWeek = (): Week => [[], [], [], [], [], [], []];
const done = (w: Week) => (w.forEach((d) => d.sort((x, y) => x[0] - y[0])), w.some((d) => d.length) ? w : null);

/** Snappfood's schedule: `weekday` 1 = Saturday … 7 = Friday, a row per span. */
export function weekFromSnappfood(rows: { weekday?: number; allDay?: boolean; startHour?: string; stopHour?: string }[] | undefined): Week | null {
  if (!rows?.length) return null;
  const week = emptyWeek();
  for (const r of rows) {
    const d = (r.weekday ?? 0) - 1;
    if (d < 0 || d > 6) continue;
    if (r.allDay) {
      week[d] = [[0, 1440]];
      continue;
    }
    const a = minutes(r.startHour ?? ""), b = minutes(r.stopHour ?? "");
    if (a != null && b != null && !week[d].some((s) => s[0] === 0 && s[1] === 1440)) week[d].push(spanOf(a, b));
  }
  return done(week);
}

/** Torob's table: seven rows from Saturday, "۱۰:۰۰ - ۱۳:۳۰ | ۱۷:۰۰ - ۲۱:۳۰", "تعطیل" (closed) or "۲۴ ساعته". */
export function weekFromTorob(rows: { text?: string }[] | undefined): Week | null {
  if (!rows || rows.length !== 7) return null;
  return done(
    rows.map((r) => {
      const s = latinDigits(r.text ?? "");
      if (/24\s*ساعت/.test(s)) return [[0, 1440]];
      const out: [number, number][] = [];
      for (const m of s.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)) {
        const a = minutes(m[1]), b = minutes(m[2]);
        if (a != null && b != null) out.push(spanOf(a, b));
      }
      return out;
    }),
  );
}

/** OpenStreetMap day codes in Week order (Saturday first). */
const OSM_DAYS = ["sa", "su", "mo", "tu", "we", "th", "fr"];
/** OpenStreetMap's own order, Monday first, for ranges like "Sa-Th" that wrap around. */
const OSM_ORDER = ["mo", "tu", "we", "th", "fr", "sa", "su"];
/**
 * The usual shapes of OpenStreetMap's `opening_hours`: "24/7", "Mo-Fr 09:00-18:00",
 * "Sa-Th 08:00-13:00,16:00-21:00; Fr off", rules without days (every day). A later rule
 * replaces earlier ones for its days, as in the spec. Anything fancier (months, holidays,
 * sunset…) is null: the card then shows the map's own text.
 */
export function weekFromOsm(v: string | undefined | null): Week | null {
  const s = v?.trim().toLowerCase();
  if (!s) return null;
  if (s === "24/7") return Array.from({ length: 7 }, () => [[0, 1440]]);
  const week = emptyWeek();
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:mo|tu|we|th|fr|sa|su)(?:\s*-\s*(?:mo|tu|we|th|fr|sa|su))?(?:\s*,\s*(?:mo|tu|we|th|fr|sa|su)(?:\s*-\s*(?:mo|tu|we|th|fr|sa|su))?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const days = new Set<number>();
    for (const part of (m[1] ?? "mo-su").split(",")) {
      const [a, b] = part.split("-").map((d) => OSM_ORDER.indexOf(d.trim()));
      for (let i = a, n = 0; n < 7; i = (i + 1) % 7, n++) {
        days.add(OSM_DAYS.indexOf(OSM_ORDER[i]));
        if (b == null || i === b) break;
      }
    }
    const times = m[2].trim();
    let spans: [number, number][] = [];
    if (times === "off" || times === "closed") spans = [];
    else if (times === "24/7" || times === "00:00-24:00") spans = [[0, 1440]];
    else
      for (const t of times.split(",")) {
        const r = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/.exec(t.trim());
        const a = r && minutes(r[1]), b = r && minutes(r[2]);
        if (a == null || b == null) return null;
        spans.push(spanOf(a, b));
      }
    for (const d of days) week[d] = [...spans];
  }
  return done(week);
}

/** The time zone a store keeps: Tehran's inside Iran, else the device's own (undefined). */
export const zoneOf = (p: { lat: number; lng: number }) => (p.lat > 25 && p.lat < 40 && p.lng > 44 && p.lng < 63.5 ? "Asia/Tehran" : undefined);
const DAY_KEYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
/** The Week day (Saturday = 0) and minutes after midnight of a moment, in a time zone. */
export function dayClock(at: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: DAY_KEYS.indexOf(get("weekday")), min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}
/** "09:30" for 570; spans running past midnight print the next day's hour (26:00 → 02:00). */
export const clockOf = (min: number) => (min === 1440 ? "24:00" : `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
/**
 * Open at that moment (today's spans, or last night's running past midnight), and the
 * next time that changes today: when it closes, or when it opens again (null: not today).
 */
export function openState(week: Week, at: Date, timeZone?: string): { open: boolean; next: number | null } {
  const { day, min } = dayClock(at, timeZone);
  if (day < 0) return { open: false, next: null };
  const late = week[(day + 6) % 7].find(([, b]) => b > 1440 && min < b - 1440);
  if (late) return { open: true, next: late[1] - 1440 };
  const now = week[day].find(([a, b]) => min >= a && min < b);
  if (now) return { open: true, next: now[1] };
  return { open: false, next: week[day].find(([a]) => a > min)?.[0] ?? null };
}

// ---------------------------------------------------------------- Divar
/** An ad on Divar. `price`, `when` ("half an hour ago in Narmak") and `note` are Divar's own words (Persian). */
export type DivarPost = { token: string; title: string; price: string; when: string; note: string; photo: string; url: string };
/**
 * One Divar ad in full, for its page in the game (opened before going to divar.ir): its
 * description, every photo, the facts Divar lists (area, rooms, year, price per metre… as
 * title/value), what it has (elevator, parking…), when it was posted, and roughly where
 * (Divar blurs it to a circle). Read from Divar's own web page data; see `divarDetailOf`.
 */
export type DivarDetail = { token: string; title: string; description: string; photos: string[]; facts: { title: string; value: string }[]; features: string[]; posted: string; at: { lat: number; lng: number; radius: number } | null; url: string };

type DvWidget = { widget_type?: string; data?: Record<string, unknown> & { widget_list?: DvWidget[] } };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Divar's post page (`/v8/posts-v2/web/<token>`) → the ad's page; null when it isn't one (removed, or not an ad). */
export function divarDetailOf(token: string, raw: { sections?: { section_name?: string; widgets?: DvWidget[] }[] } | null): DivarDetail | null {
  if (!raw?.sections?.length) return null;
  const out: DivarDetail = { token, title: "", description: "", photos: [], facts: [], features: [], posted: "", at: null, url: `https://divar.ir/v/${encodeURIComponent(token)}` };
  const walk = (ws: DvWidget[] | undefined, section: string) => {
    for (const w of ws ?? []) {
      const d = w.data ?? {};
      switch (w.widget_type) {
        case "LEGEND_TITLE_ROW":
          if (section === "TITLE" && !out.title) out.title = str(d.title);
          break;
        case "DESCRIPTION_ROW":
          // The title's own little row is when it was posted; the description section is the text.
          if (section === "DESCRIPTION") out.description ||= str(d.text);
          else if (section === "TITLE") out.posted ||= str(d.text).split("\n")[0];
          break;
        case "IMAGE_CAROUSEL":
          for (const it of (d.items as { image?: { url?: string } }[] | undefined) ?? []) if (it.image?.url?.startsWith("https://")) out.photos.push(it.image.url);
          break;
        case "GROUP_INFO_ROW":
          for (const it of (d.items as { title?: string; value?: string }[] | undefined) ?? []) if (str(it.title) && str(it.value)) out.facts.push({ title: str(it.title), value: str(it.value) });
          break;
        case "UNEXPANDABLE_ROW":
          if (section === "LIST_DATA" && str(d.title) && str(d.value)) out.facts.push({ title: str(d.title), value: str(d.value) });
          break;
        case "GROUP_FEATURE_ROW":
          for (const it of (d.items as { title?: string; available?: boolean }[] | undefined) ?? []) if (str(it.title) && it.available !== false) out.features.push(str(it.title));
          break;
        case "MAP_ROW": {
          const f = (d.location as { fuzzy_data?: { point?: { latitude?: number; longitude?: number }; radius?: number }; exact_data?: { point?: { latitude?: number; longitude?: number } } } | undefined) ?? {};
          const pt = f.fuzzy_data?.point ?? f.exact_data?.point;
          if (typeof pt?.latitude === "number" && typeof pt.longitude === "number") out.at = { lat: pt.latitude, lng: pt.longitude, radius: f.fuzzy_data?.radius ?? 0 };
          break;
        }
      }
      if (w.data?.widget_list) walk(w.data.widget_list, section);
    }
  };
  for (const sec of raw.sections) walk(sec.widgets, sec.section_name ?? "");
  if (!out.title) return null;
  out.photos = [...new Set(out.photos)].slice(0, 12);
  out.facts = out.facts.slice(0, 16);
  out.features = [...new Set(out.features)].slice(0, 16);
  out.description = out.description.slice(0, 4000);
  return out;
}

// ---------------------------------------------------------------- Takhfifan (deals)
/** One of a store's deals on Takhfifan: its price and the usual price (toman), the discount, its photo, and when it ends (ISO). */
export type DealItem = { id: number; name: string; price: number; retail: number; off: number; photo: string; ends: string };
/**
 * A store near you with a deal on Takhfifan (takhfifan.com): where it is, its best discount
 * (`off`, %) or the cashback you get paying there (`cashback`, %), its rating, photos and
 * the deals themselves. Prices are TOMAN (Takhfifan's own are rials).
 */
export type Deal = { id: number; name: string; lat: number; lng: number; district: string; category: string; rating: number; reviews: number; off: number; cashback: number; photos: string[]; items: DealItem[]; url: string };
type RawDeal = {
  id?: number; name?: string; review_rate?: number; review_count?: number; max_discount_percentage?: number; max_cashback_percentage?: number;
  category?: { name?: string }; location?: { lat?: number; lon?: number; district?: string; area?: string };
  images?: { url?: string }[]; products?: { id?: number; name?: string; price?: number; retail_price?: number; discount_percentage?: number; image?: string; deal_end_date?: string }[];
};
const toToman = (rial: number | undefined) => (rial && rial > 0 ? Math.round(rial / 10) : 0);
/** A row of Takhfifan's search → a deal on the map; null without a real spot, or with nothing off. */
export function dealOf(r: RawDeal): Deal | null {
  const lat = r.location?.lat, lng = r.location?.lon;
  if (!r.id || !r.name?.trim() || typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) < 1 || Math.abs(lng) < 1) return null;
  const items = (r.products ?? [])
    .filter((p) => p.id && p.name?.trim() && (p.price ?? 0) > 0)
    .map((p) => ({ id: p.id!, name: p.name!.trim(), price: toToman(p.price), retail: toToman(p.retail_price), off: Math.round(p.discount_percentage ?? 0), photo: p.image?.startsWith("https://") ? p.image : "", ends: p.deal_end_date ?? "" }))
    .slice(0, 12);
  const off = Math.round(Math.max(r.max_discount_percentage ?? 0, ...items.map((i) => i.off)));
  const cashback = Math.round((r.max_cashback_percentage ?? 0) * 10) / 10;
  if (off <= 0 && cashback <= 0) return null;
  return {
    id: r.id, name: r.name.trim(), lat, lng, district: r.location?.district?.trim() || r.location?.area?.trim() || "", category: r.category?.name?.trim() ?? "",
    rating: Math.round((r.review_rate ?? 0) * 10) / 10, reviews: r.review_count ?? 0, off, cashback,
    photos: (r.images ?? []).map((i) => i.url ?? "").filter((u) => u.startsWith("https://")).slice(0, 8), items, url: `https://takhfifan.com/vendor/${r.id}`,
  };
}
/** Deals within `radiusM` of `here`, each store once, nearest first. */
export function dealsNear(list: Deal[], here: { lat: number; lng: number }, radiusM: number): Deal[] {
  const seen = new Set<number>();
  return list
    .map((d) => ({ d, m: distanceM(here, d) }))
    .filter(({ d, m }) => m <= radiusM && !seen.has(d.id) && (seen.add(d.id), true))
    .sort((a, b) => a.m - b.m)
    .map(({ d }) => d);
}

// ---- the nearby map (takhfifan.com/nearby): stores by position, then one store in full
/** A bigger picture from Takhfifan's CDN (the map lists thumbnails: `&width=100`). */
const bigPic = (u: string | undefined, w = 640) => (u?.startsWith("https://") ? (/[?&]width=\d+/.test(u) ? u.replace(/([?&]width=)\d+/, `$1${w}`) : u) : "");
type RawPoi = {
  id?: number; name?: string; catalog_category_name?: string; coordinates?: { lat?: number; lon?: number }; image?: string; images?: string[]; location?: string | null; city?: string;
  rate?: string | number; rate_count?: number; comment_count?: number; discount?: number; max_cashback_percent?: number;
};
/** A store from the nearby map's list → a deal on the map (its deals come when the card opens); null without a real spot or nothing off. */
export function dealOfPoi(p: RawPoi): Deal | null {
  const lat = p.coordinates?.lat, lng = p.coordinates?.lon;
  if (!p.id || !p.name?.trim() || typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) < 1 || Math.abs(lng) < 1) return null;
  const off = Math.round(p.discount ?? 0), cashback = Math.round((p.max_cashback_percent ?? 0) * 10) / 10;
  if (off <= 0 && cashback <= 0) return null;
  const photos = [...new Set([p.image, ...(p.images ?? [])].map((u) => bigPic(u)).filter(Boolean))].slice(0, 8);
  return {
    id: p.id, name: p.name.trim(), lat, lng, district: (typeof p.location === "string" ? p.location : "").trim(), category: p.catalog_category_name?.trim() ?? "",
    rating: Math.round(Number(p.rate ?? 0) * 10) / 10 || 0, reviews: p.rate_count ?? 0, off, cashback, photos, items: [], url: `https://takhfifan.com/vendor/${p.id}`,
  };
}
/** The box on the map (Takhfifan wants its two corners) round a point, `halfM` metres each way. */
export function nearbyBox(at: { lat: number; lng: number }, halfM: number) {
  const dLat = halfM / 111_320, dLng = halfM / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  const r = (n: number) => n.toFixed(4);
  return { top_left_lat: r(at.lat + dLat), top_left_lng: r(at.lng - dLng), bottom_right_lat: r(at.lat - dLat), bottom_right_lng: r(at.lng + dLng) };
}

/** HTML from Takhfifan's editors as plain lines (paragraphs, list items and breaks kept as line breaks). */
export function htmlText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/<\s*(?:br|\/p|\/h\d|\/li|\/div|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
/** Takhfifan's "2026-11-21 00:00:00" (Tehran time) as an ISO moment. */
const tehranIso = (s: string | null | undefined) => (s && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(s) ? `${s.slice(0, 10)}T${s.slice(11, 19).padEnd(8, ":00")}+03:30` : "");
const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سهشنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
/** A store's week from Takhfifan's `business_timing` (a JSON string: [{day: "شنبه", service_time: "8:30-10:45"}]); null if no day says anything. */
export function weekFromTakhfifan(raw: string | null | undefined): Week | null {
  let rows: { day?: string; service_time?: string }[];
  try {
    rows = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const week = emptyWeek();
  for (const r of rows) {
    const d = DAY_NAMES.indexOf((r.day ?? "").replace(/[\s\u200c]/g, ""));
    if (d < 0) continue;
    const s = latinDigits(r.service_time ?? "");
    if (/24\s*ساعت/.test(s)) week[d] = [[0, 1440]];
    else
      for (const m of s.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)) {
        const a = minutes(m[1]), b = minutes(m[2]);
        if (a != null && b != null) week[d].push(spanOf(a, b));
      }
  }
  return done(week);
}

/** A store's deal in full: what you get (`about`), the conditions (`terms`) and how many were sold. */
export type DealProduct = DealItem & { about: string; terms: string; sold: number };
export type DealInfo = {
  id: number; name: string; logo: string; photos: string[]; address: string; city: string; district: string; lat: number; lng: number;
  phones: StorePhone[]; week: Week | null; hours: string; rating: number; reviews: number; sold: number; off: number; cashback: number; payDiscount: number;
  /** Banks whose cards earn the cashback, with its %. */
  banks: { name: string; cashback: number }[];
  categories: string[]; features: { label: string; value: string }[]; website: string; url: string;
  /** The first page of its deals, and how many it has in all. */
  items: DealProduct[]; itemsTotal: number;
};
type RawVendor = {
  data?: { attributes?: Record<string, unknown> };
  rating?: { rate?: string | number; rate_count?: number };
  categories?: { attributes?: { name?: string }; children?: { attributes?: { name?: string } }[] }[];
};
type RawProducts = {
  data?: { attributes?: { name?: string; image?: string; product_id?: number; price_regular?: number; price_deal?: number; deal_discount?: number; deal_qty_sold?: number; deal_date_to?: string; deal_fine_print?: string; description?: string } }[];
  meta?: { total?: { value?: number } };
};
const numOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** Takhfifan's vendor page data (+ its deals) → one store's card; null if it has no name. `now` drops deals that have ended. */
export function dealInfoOf(vendor: RawVendor | null | undefined, products?: RawProducts | null, now = Date.now()): DealInfo | null {
  const a = vendor?.data?.attributes;
  if (!a || !str(a.name)) return null;
  const id = numOf(a.vendor_id);
  const items: DealProduct[] = (products?.data ?? [])
    .map((x) => x.attributes)
    .filter((p): p is NonNullable<typeof p> => !!p?.product_id && !!p.name?.trim() && (p.price_deal ?? 0) > 0 && !(tehranIso(p.deal_date_to) && Date.parse(tehranIso(p.deal_date_to)) < now))
    .map((p) => ({
      id: p.product_id!, name: p.name!.trim(), price: toToman(p.price_deal), retail: toToman(p.price_regular), off: Math.round(p.deal_discount ?? 0), photo: bigPic(p.image), ends: tehranIso(p.deal_date_to),
      about: htmlText(p.description), terms: htmlText(p.deal_fine_print), sold: p.deal_qty_sold ?? 0,
    }));
  const extra = (a.offline_cashback_extra ?? {}) as { payment_types?: { bank_title?: string; max_cashback_percent?: number }[] };
  const banks = (extra.payment_types ?? []).filter((b) => str(b.bank_title) && (b.max_cashback_percent ?? 0) > 0).map((b) => ({ name: str(b.bank_title), cashback: Math.round((b.max_cashback_percent ?? 0) * 10) / 10 }));
  const gallery = (Array.isArray(a.image_gallery) ? (a.image_gallery as { url?: string }[]) : []).map((g) => bigPic(g.url, 720));
  const cats = (vendor?.categories ?? []).flatMap((c) => [str(c.attributes?.name), ...(c.children ?? []).map((k) => str(k.attributes?.name))]).filter(Boolean);
  return {
    id, name: str(a.name), logo: bigPic(str(a.image), 160), photos: [...new Set(gallery.filter(Boolean))].slice(0, 12),
    address: str(a.address), city: str(a.city), district: str(a.district) || str(a.area), lat: numOf(a.latitude), lng: numOf(a.longitude),
    phones: phonesFrom("takhfifan", str(a.phone_v2)), week: weekFromTakhfifan(str(a.business_timing)),
    hours: [str(a.business_days)].filter((x) => x && x !== "-,").join(" · "),
    rating: Math.round(numOf(vendor?.rating?.rate) * 10) / 10, reviews: vendor?.rating?.rate_count ?? 0, sold: numOf(a.sale_count),
    off: Math.round(Math.max(numOf(a.max_discount_percentage), numOf(a.offline_max_discount_percentage), ...items.map((i) => i.off))),
    cashback: Math.round(numOf(a.offline_max_cashback_percent) * 10) / 10, payDiscount: Math.round(numOf(a.takhfifan_pay_discount_percentage) * 10) / 10, banks,
    categories: [...new Set(cats)].slice(0, 6),
    features: (Array.isArray(a.features) ? (a.features as { label?: string; value?: string }[]) : []).filter((f) => str(f.label) && str(f.value)).map((f) => ({ label: str(f.label), value: str(f.value) })).slice(0, 12),
    website: /^https?:\/\//.test(str(a.website)) ? str(a.website) : "", url: `https://takhfifan.com/vendor/${id}`,
    items, itemsTotal: Math.max(products?.meta?.total?.value ?? 0, items.length),
  };
}

/** A customer's comment on Takhfifan: 1–5 stars, when (ISO), what they wrote, the store's reply. */
export type DealReview = { id: number; rate: number; date: string; text: string; reply: string; buyer: boolean };
export type DealReviewPage = { count: number; avg: number; reviews: DealReview[] };
type RawComments = {
  meta?: { total?: number; rate_average?: number };
  data?: { id?: number; body?: string; rate?: number; created_at?: string; is_buyer?: boolean; status?: string; replies?: { body?: string }[] }[];
};
export function dealReviewsOf(r: RawComments | null | undefined): DealReviewPage {
  const reviews = (r?.data ?? [])
    .filter((c) => c.id && (c.status ?? "published") === "published" && (c.body?.trim() || (c.rate ?? 0) > 0))
    .map((c) => ({ id: c.id!, rate: Math.min(5, Math.max(0, Math.round(c.rate ?? 0))), date: c.created_at ?? "", text: (c.body ?? "").trim(), reply: (c.replies?.[0]?.body ?? "").trim(), buyer: !!c.is_buyer }));
  return { count: r?.meta?.total ?? reviews.length, avg: Math.round((r?.meta?.rate_average ?? 0) * 10) / 10, reviews };
}

/** A Divar neighbourhood near the player (or a small town with none: `id` 0): pinned on its centre, with its latest ads. */
export type DivarArea = { city: number; citySlug: string; id: number; name: string; lat: number; lng: number; distanceM: number; posts: DivarPost[] };
/** The ad categories the Divar card can filter by (Divar's own category slugs). */
export const DIVAR_CATS = {
  all: { slug: "ROOT", emoji: "📢", label: msg("All ads") },
  "real-estate": { slug: "real-estate", emoji: "🏠", label: msg("Homes") },
  vehicles: { slug: "vehicles", emoji: "🚗", label: msg("Vehicles") },
  digital: { slug: "electronic-devices", emoji: "📱", label: msg("Electronics") },
  home: { slug: "home-kitchen", emoji: "🛋️", label: msg("Home & kitchen") },
  services: { slug: "services", emoji: "🛠️", label: msg("Services") },
  jobs: { slug: "jobs", emoji: "💼", label: msg("Jobs") },
} as const;
export type DivarCat = keyof typeof DIVAR_CATS;
export const DIVAR_CAT_KEYS = Object.keys(DIVAR_CATS) as [DivarCat, ...DivarCat[]];

/**
 * Is this real place (OpenStreetMap) the same store as a Snappfood vendor on the map?
 * Then the map shows one sign — the vendor's, which has the menu.
 */
export const sameStore = (p: { name: string; lat: number; lng: number }, v: { title: string; lat: number; lng: number }, metres: number) =>
  metres <= 150 ? nameScore(p.name, v.title) >= 0.5 : metres <= 400 && nameScore(p.name, v.title) >= 1;

/** Snappfood's vendor types, grouped the way the map filter shows them. */
export type VendorKind = "food" | "cafe" | "sweets" | "market";
export const VENDOR_KINDS: Record<VendorKind, { emoji: string; label: string; cat: PlaceCat }> = {
  food: { emoji: "🍽️", label: msg("Restaurants"), cat: "restaurant" },
  cafe: { emoji: "☕", label: msg("Cafés"), cat: "cafe" },
  sweets: { emoji: "🍰", label: msg("Bakeries & sweets"), cat: "bakery" },
  market: { emoji: "🛒", label: msg("Supermarkets & shops"), cat: "grocery" },
};
export const VENDOR_KIND_KEYS = Object.keys(VENDOR_KINDS) as VendorKind[];
export function vendorKind(type: string): VendorKind {
  const t = type.toUpperCase();
  if (t === "CAFFE" || t === "CAFE") return "cafe";
  if (t === "CONFECTIONERY" || t === "BAKERY" || t === "ICE_CREAM" || t === "JUICE") return "sweets";
  if (t === "RESTAURANT" || t === "") return "food";
  return "market";
}

/** Places (and Market shop categories) whose catalog is a menu rather than products on Torob. */
const FOOD: string[] = ["burger", "pizza", "restaurant", "cafe", "bakery", "icecream", "bar", "food"] satisfies (PlaceCat | "food")[];
export const isFoodCat = (cat: string) => FOOD.includes(cat);
/** Places worth looking up by name on Snappfood: food, and the groceries it delivers from. */
export const sellsOnSnappfood = (cat: string) => isFoodCat(cat) || cat === "grocery";

/**
 * A vendor's menu page on Snappfood. Its own `menuUrl` (…/menu/<code>/<slug>?…) redirects
 * to a 404; the bare code with a trailing slash redirects to the real page.
 */
export const snappfoodMenuUrl = (code: string) => `https://snappfood.ir/restaurant/menu/${encodeURIComponent(code)}/`;

// ---------------------------------------------------------------- owner links
const SNAPP_CODE = /^[0-9a-z]{6}$/;
/** A Snappfood vendor code from what an owner pasted: the menu link, or the 6-letter code itself. */
export function snappfoodCode(v: string): string | null {
  const s = v.trim();
  if (SNAPP_CODE.test(s)) return s;
  const m = /snappfood\.ir\/.*?\/menu\/([0-9a-z]{6})(?:[/?#]|$)/i.exec(s) ?? /snappfood\.ir\/.*?[/-]([0-9a-z]{6})(?:[/?#]|$)/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}
/** Only real links to the site in question are kept (an owner can't point players elsewhere). */
const onHost = (v: string, host: string) => {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && (u.hostname === host || u.hostname.endsWith(`.${host}`)) ? u.toString() : null;
  } catch {
    return null;
  }
};
export const torobLink = (v: string) => onHost(v, "torob.com");
/** The shop id in a torob.com/shop/<id>/… link (a product link has none). */
export const torobShopId = (link: string) => Number(/torob\.com\/shop\/(\d+)(?:[/?#]|$)/.exec(link)?.[1]) || null;
export const divarLink = (v: string) => onHost(v, "divar.ir");
/** Empty, or a link the store card can use: the field validators for owner forms. */
export const LINK_CHECKS = {
  snappfood: (v: string) => !v.trim() || !!snappfoodCode(v),
  torob: (v: string) => !v.trim() || !!torobLink(v),
  divar: (v: string) => !v.trim() || !!divarLink(v),
};

// ---------------------------------------------------------------- name matching
/** Words that say what a place is rather than which one ("Restaurant", "Café", "branch"). */
const FILLER = new Set(
  "رستوران کافه کافی شاپ فست فود فستفود پیتزا پیتزای برگر شیرینی سرای فروشگاه سوپرمارکت سوپر مارکت هایپر شعبه نان قنادی کترینگ تهیه غذای غذا کالا مارکت شاپ گالری مرکز فروشگاهی و restaurant cafe café coffee shop fast food pizza burger bakery market supermarket store the branch".split(" "),
);
/** Persian/Arabic letter variants, digits and punctuation folded so names compare. */
export function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    // ۱۳۳ / ١٣٣ / 133 are one name.
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[ً-ْ‌‏‎]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
/** A name's letters and digits alone (no spaces, no "(Area)"). */
const lettersOf = (s: string) => normName(s).replace(/ /g, "");
const words = (s: string) => normName(s).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
/**
 * The same letters, however the words are spaced: Persian names come both ways
 * ("چلوکباب جوان" on the map, "چلو کباب جوان" on Snappfood). A long one inside the
 * other ("ستاره شرق" / "ستاره شرق ۲") counts too.
 */
const sameLetters = (x: string[], y: string[]) => {
  const a = x.join(""), b = y.join("");
  return a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)));
};
/** 0…1: how much two store names share once the "Restaurant"/"Café" words are gone. */
export function nameScore(a: string, b: string) {
  // "برگرلند" / "برگر لند": one name, though "برگر" alone is a filler word.
  const la = lettersOf(a);
  if (la.length >= 4 && la === lettersOf(b)) return 1;
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return 0;
  if (sameLetters(x, y)) return 1;
  const ys = new Set(y);
  const common = x.filter((w) => ys.has(w) || y.some((v) => v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))).length;
  return common / Math.min(x.length, y.length);
}
/** Every word of both names matches: for a site with no position to check the match against. */
export const sameName = (a: string, b: string) => {
  const x = words(a), y = words(b);
  return !!x.length && !!y.length && (x.join("") === y.join("") || (x.length === y.length && nameScore(a, b) >= 1));
};

// ---------------------------------------------------------------- real phone numbers
/**
 * Snappfood answers every vendor's "customerPhone" with its own call centre, not the
 * restaurant's: a number on this list is never shown as the store's phone.
 */
export const PLATFORM_PHONES = ["02196612", "2196612", "02141629", "41629", "02141629000"];
const digitsOf = (s: string) => latinDigits(s).replace(/\D/g, "");
export const isPlatformPhone = (phone: string | null | undefined) => {
  const d = digitsOf(phone ?? "");
  return !!d && PLATFORM_PHONES.some((p) => d === p || d === `98${p.replace(/^0/, "")}`);
};
/** A store's own phone as written (Persian digits read as Latin); "" for a platform's number or junk. */
export function storePhone(phone: string | null | undefined) {
  const s = latinDigits((phone ?? "").trim()).replace(/^tel:\/*/i, "").trim();
  return /^[\d+\-\s()]{5,20}$/.test(s) && !isPlatformPhone(s) ? s : "";
}
/** Every number in a field that may hold several ("021… ; 0912…", "021… - 021…", "021… و 0912…"). */
export function storePhones(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[;,،\/|\n]|\s[-–—]\s|\sو\s/)) {
    const p = storePhone(part);
    if (p) out.push(p);
  }
  return out;
}
/** Where a number was read: the map (OpenStreetMap), the store's own Snappfood / Torob page, Balad, Google. */
export type PhoneSource = "map" | "snappfood" | "torob" | "balad" | "google" | "takhfifan" | "irangaah" | "netbarg";
export type StorePhone = { number: string; source: PhoneSource };
/** A card shows at most this many numbers. */
export const MAX_PHONES = 6;
/** One number however it is written: "+98 21 8802 3649", "0098218802…" and "021-8802 3649" are the same. */
export const phoneKey = (phone: string) => digitsOf(phone).replace(/^(?:0098|98(?=\d{9,}$)|0)/, "");
/** The numbers of some fields of one source. */
export const phonesFrom = (source: PhoneSource, ...raw: (string | null | undefined)[]): StorePhone[] =>
  mergePhones(raw.flatMap((r) => storePhones(r).map((number) => ({ number, source }))));
/** Several sources' numbers as one list: each number once (the first source to have it), in the order given. */
export function mergePhones(...lists: (StorePhone[] | null | undefined)[]): StorePhone[] {
  const seen = new Set<string>(), out: StorePhone[] = [];
  for (const p of lists.flatMap((l) => l ?? [])) {
    const number = storePhone(p?.number), key = phoneKey(number);
    if (!number || seen.has(key) || out.length >= MAX_PHONES) continue;
    seen.add(key);
    out.push({ number, source: p.source });
  }
  return out;
}

/**
 * No map knows the number: where to look it up by hand — a Balad search for the store and a
 * web search for "<name> <city> تلفن" (Snappfood branch suffixes "(Area)" dropped).
 */
export function phoneSearchLinks(name: string, city = ""): { balad: string; web: string } {
  const bare = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim() || name.trim();
  const q = [bare, city.trim(), "تلفن"].filter(Boolean).join(" ");
  return { balad: `https://balad.ir/search?query=${encodeURIComponent(bare)}`, web: `https://www.google.com/search?q=${encodeURIComponent(q)}` };
}

/** Balad (balad.ir) search: POI tokens and, in the same order, their names and positions. */
export type BaladSearch = { "poi-tokens"?: string[]; geojson?: { features?: { geometry?: { coordinates?: number[] }; properties?: { name?: string } }[] } };
/** A Balad place and this store are the same this close with a similar name, or this far with the same name. */
export const BALAD_MATCH_M = 120;
export const BALAD_SAME_NAME_M = 300;
/** …or this far when the two names are word for word the same (Snappfood's pin is often streets off). */
export const BALAD_EXACT_NAME_M = 700;
/**
 * What to ask Balad for a store, most telling first: its name without Snappfood's "(Area)",
 * then the name without the words that say what it is — Balad answers "پیتزا پرپروک" with every
 * pizza place around (a category search) but "پرپروک" with the store.
 */
export function baladQueries(name: string): string[] {
  const bare = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const core = words(name).join(" ");
  return [...new Set([bare, core.length >= 3 ? core : ""])].filter(Boolean);
}
const allWords = (s: string) => normName(s).split(" ").filter((w) => w.length > 1);
/**
 * A name that is one word once "what it is" is dropped ("ایران برگر" → "ایران") also sits in the
 * names of other kinds of places ("بیمه ایران"): a candidate with words of its own and none of
 * the store's "what it is" words is somewhere else.
 */
function otherKind(cand: string, store: string) {
  const sc = words(store);
  if (sc.length !== 1 || !words(cand).some((w) => !sc.includes(w))) return false;
  const kind = allWords(store).filter((w) => FILLER.has(w)), have = new Set(allWords(cand));
  return kind.length > 0 && !kind.some((w) => have.has(w));
}
/**
 * How well a place another map found (its name, where it is) is this store: null when it
 * isn't — too far for how alike the names are, or another kind of place. Higher is better:
 * the name first, then every shared word, then the distance.
 */
export function placeMatch(cand: { name: string; lat: number; lng: number }, store: { name: string; lat: number; lng: number }): number | null {
  const d = distanceM(store, cand);
  const ns = nameScore(cand.name, store.name);
  const exact = normName(cand.name) === normName(store.name);
  const ok = (d <= BALAD_MATCH_M && ns >= 0.5) || (d <= BALAD_SAME_NAME_M && ns >= 1) || (d <= BALAD_EXACT_NAME_M && exact);
  if (!ok || (!exact && otherKind(cand.name, store.name))) return null;
  const mine = new Set(allWords(store.name));
  return ns * 1000 + allWords(cand.name).filter((w) => mine.has(w)).length * 100 - d;
}
/** The token of the Balad place that is this store, if the search found it. */
export function pickBaladPoi(r: BaladSearch | null, store: { name: string; lat: number; lng: number }): string | null {
  const tokens = r?.["poi-tokens"] ?? [];
  const feats = r?.geojson?.features ?? [];
  let best: { token: string; score: number } | null = null;
  feats.forEach((f, i) => {
    const c = f.geometry?.coordinates, name = f.properties?.name ?? "", token = tokens[i];
    if (!token || !c || c.length < 2 || !name) return;
    const score = placeMatch({ name, lat: c[1], lng: c[0] }, store);
    if (score != null && (!best || score > best.score)) best = { token, score };
  });
  return (best as { token: string } | null)?.token ?? null;
}
/** Every number on a Balad place page: its phone rows, its schema.org "telephone", its call link. */
export function baladPhonesOf(r: unknown): string[] {
  const x = r as { phone_link?: string; fields?: { icon?: string; text?: string; value?: string }[]; seo_details?: { schemas?: { telephone?: string }[] } } | null;
  const raw = [
    ...(Array.isArray(x?.fields) ? x.fields : []).filter((f) => f?.icon === "phone").map((f) => f.text ?? f.value),
    ...(x?.seo_details?.schemas ?? []).map((sc) => sc?.telephone),
    x?.phone_link,
  ];
  return phonesFrom("balad", ...raw).map((p) => p.number);
}
/** A Balad place page's first phone, or "". */
export const baladPhoneOf = (r: unknown): string => baladPhonesOf(r)[0] ?? "";

/** Google Places (New) Text Search: the fields we ask for (X-Goog-FieldMask). */
export type GoogleSearch = { places?: { displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; nationalPhoneNumber?: string; internationalPhoneNumber?: string }[] };
/** The phone of the Google place that is this store (same name/distance rule as Balad), or "". */
export function googlePhoneOf(r: GoogleSearch | null, store: { name: string; lat: number; lng: number }): string {
  let best: { phone: string; score: number } | null = null;
  for (const p of r?.places ?? []) {
    const name = p.displayName?.text ?? "", lat = p.location?.latitude, lng = p.location?.longitude;
    const phone = storePhone(p.nationalPhoneNumber) || storePhone(p.internationalPhoneNumber);
    if (!name || lat == null || lng == null || !phone) continue;
    const score = placeMatch({ name, lat, lng }, store);
    if (score != null && (!best || score > best.score)) best = { phone, score };
  }
  return best?.phone ?? "";
}
