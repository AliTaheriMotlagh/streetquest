// What other sites know about a real store (pure — client and server): its Snappfood menu
// or catalog, its Torob listings, its Divar ad. The fetching and caching is in
// server/localData.ts; this file has the shapes, the link parsing and the name matching.
import { msg } from "./i18n";
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
export type MenuItem = { id: string; title: string; about: string; price: number; priceNow: number; photo: string };
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
 * A Torob shop with a store you can walk into, where Torob's own map of sellers puts it:
 * its city, the start of its address, a photo of the store, its week, and what it was
 * seen selling (the emoji of each kind of product).
 */
export type TorobPlace = { id: number; name: string; lat: number; lng: number; city: string; address: string; photo: string; week: Week | null; sells: string[] };
/** The rest of a walk-in Torob shop's page: full address, phone, logo and photos. */
export type TorobPlaceInfo = { id: number; name: string; logo: string; photos: string[]; address: string; phone: string; city: string; url: string };
export type StoreLink = { kind: "snappfood" | "torob" | "divar" | "website" | "phone" | "instagram"; url: string; label: string };
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
  about: { photo: string; logo: string; address: string; hours: string; week?: Week | null; phone?: string };
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

/** Rial (what Snappfood quotes) → toman (what the game and Torob show). */
export const rialToToman = (rial: number) => Math.round(rial / 10);

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
