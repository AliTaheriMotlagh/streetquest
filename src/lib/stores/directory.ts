// Iran's store directories, deal sites, classifieds, marketplaces and home-service sites, as one
// list of stores on the map (pure: the server fetches, this reads what came back).
//
//   map stores   Bilbooard (bbox API, photos, hours), Irangaah (a city's whole index, with phones),
//                Okala (supermarkets / bakeries / fruit that deliver, with ratings and reviews)
//   deals        Netbarg (a neighbourhood's deals, each with its store's position)
//   ads          Sheypoor (a city's newest ads, pinned on the neighbourhood they name)
//   products     Basalam (handmade / local sellers: search by product, seller's city)
//   prices       Emalls, Snapp Shop (no open data: a search link from a product row)
//   services     Achareh, Sanjagh, Khedmatazma (home services by category, per city)
//
// Every store gets one of the game's store types (`typeOf` reads each site's own category words),
// which the map filter and the store list filter by, next to the site it came from.
import { msg } from "../i18n";
import { distanceM } from "../geo";
import { latinDigits, nameScore, phonesFrom, type StorePhone, type Week } from "../localData";
import type { PlaceCat } from "../places";

// ---------------------------------------------------------------- sites
export type MapSite = "bilbooard" | "irangaah" | "okala" | "netbarg";
export type SiteId = MapSite | "sheypoor" | "basalam" | "emalls" | "snappshop" | "achareh" | "sanjagh" | "khedmatazma";
export type SiteRole = "map" | "deals" | "ads" | "products" | "prices" | "services";
export type Site = { id: SiteId; name: string; emoji: string; color: string; url: string; hosts: string[]; role: SiteRole; what: string };

export const SITES: Record<SiteId, Site> = {
  bilbooard: { id: "bilbooard", name: msg("Bilbooard"), emoji: "🪧", color: "#2f6bff", url: "https://bilbooard.ir", hosts: ["bilbooard.ir"], role: "map", what: msg("A guide to over a million businesses: photos, hours, address and what they do.") },
  irangaah: { id: "irangaah", name: msg("Irangaah"), emoji: "🧭", color: "#0e9f8a", url: "https://irangaah.ir", hosts: ["irangaah.ir"], role: "map", what: msg("Doctors, businesses and every kind of place, with their phone numbers.") },
  okala: { id: "okala", name: msg("Okala"), emoji: "🛒", color: "#e8336f", url: "https://www.okala.com", hosts: ["okala.com", "www.okala.com"], role: "map", what: msg("Supermarkets, bakeries and fruit shops around you that deliver, with ratings and reviews.") },
  netbarg: { id: "netbarg", name: msg("Netbarg"), emoji: "🎟️", color: "#ff7a00", url: "https://netbarg.com", hosts: ["netbarg.com"], role: "deals", what: msg("Group deals: discounted menus, services and fun at stores near you.") },
  sheypoor: { id: "sheypoor", name: msg("Sheypoor"), emoji: "📣", color: "#7a3cff", url: "https://www.sheypoor.com", hosts: ["sheypoor.com", "www.sheypoor.com"], role: "ads", what: msg("Classified ads: things for sale, homes, cars and jobs in your neighbourhood.") },
  basalam: { id: "basalam", name: msg("Basalam"), emoji: "🧺", color: "#f05a28", url: "https://basalam.com", hosts: ["basalam.com"], role: "products", what: msg("Handmade and local products straight from sellers across Iran.") },
  emalls: { id: "emalls", name: msg("Emalls"), emoji: "🔎", color: "#1b8be0", url: "https://emalls.ir", hosts: ["emalls.ir"], role: "prices", what: msg("Compares a product's price across online shops.") },
  snappshop: { id: "snappshop", name: msg("Snapp Shop"), emoji: "🛍️", color: "#00b862", url: "https://snapp.shop", hosts: ["snapp.shop", "snappshop.ir"], role: "prices", what: msg("Snapp's online shop: electronics, home and fashion.") },
  achareh: { id: "achareh", name: msg("Achareh"), emoji: "🔧", color: "#00a3a3", url: "https://achareh.co", hosts: ["achareh.co"], role: "services", what: msg("Book home services: cleaning, repairs, moving, beauty.") },
  sanjagh: { id: "sanjagh", name: msg("Sanjagh"), emoji: "📌", color: "#ef4b4b", url: "https://sanjagh.pro", hosts: ["sanjagh.pro"], role: "services", what: msg("Find a pro for any job and compare their prices and reviews.") },
  khedmatazma: { id: "khedmatazma", name: msg("Khedmatazma"), emoji: "🧰", color: "#3d6df2", url: "https://khedmatazma.com", hosts: ["khedmatazma.com"], role: "services", what: msg("Specialists for the home, car, beauty and building work.") },
};
export const SITE_IDS = Object.keys(SITES) as SiteId[];
export const MAP_SITES: MapSite[] = ["bilbooard", "irangaah", "okala", "netbarg"];
/** The map filter's keys for each layer of this file ("dir-" so they never clash with the other layers). */
export const siteLayer = (s: SiteId) => `dir-${s}` as const;

// ---------------------------------------------------------------- store types
export type StoreType =
  | "food" | "cafe" | "sweets" | "grocery" | "bakery" | "fruit" | "butcher" | "clothing" | "beauty" | "health" | "doctor"
  | "pharmacy" | "auto" | "home" | "building" | "digital" | "education" | "sport" | "realestate" | "finance" | "hotel" | "gifts" | "pets" | "services" | "other";
export const STORE_TYPES: Record<StoreType, { emoji: string; label: string; color: string }> = {
  food: { emoji: "🍽️", label: msg("Restaurants & fast food"), color: "#ff5a3c" },
  cafe: { emoji: "☕", label: msg("Cafés"), color: "#a0643c" },
  sweets: { emoji: "🍰", label: msg("Sweets & ice cream"), color: "#f06ba8" },
  grocery: { emoji: "🛒", label: msg("Supermarkets"), color: "#2fa84f" },
  bakery: { emoji: "🥖", label: msg("Bakeries"), color: "#d39b2a" },
  fruit: { emoji: "🍎", label: msg("Fruit & veg"), color: "#5cb85c" },
  butcher: { emoji: "🥩", label: msg("Butchers & protein"), color: "#c0392b" },
  clothing: { emoji: "👗", label: msg("Clothes & shoes"), color: "#9b59b6" },
  beauty: { emoji: "💇", label: msg("Beauty & salons"), color: "#e84393" },
  health: { emoji: "🏥", label: msg("Clinics & labs"), color: "#e74c3c" },
  doctor: { emoji: "🩺", label: msg("Doctors"), color: "#3b82f6" },
  pharmacy: { emoji: "💊", label: msg("Pharmacies"), color: "#10b981" },
  auto: { emoji: "🚗", label: msg("Cars & repairs"), color: "#475569" },
  home: { emoji: "🛋️", label: msg("Home & appliances"), color: "#8d6e63" },
  building: { emoji: "🧱", label: msg("Building & hardware"), color: "#b7791f" },
  digital: { emoji: "📱", label: msg("Phones & computers"), color: "#0ea5e9" },
  education: { emoji: "🎓", label: msg("Schools & classes"), color: "#6366f1" },
  sport: { emoji: "🏋️", label: msg("Sport & fun"), color: "#f97316" },
  realestate: { emoji: "🏠", label: msg("Estate agents"), color: "#64748b" },
  finance: { emoji: "🏦", label: msg("Banks & insurance"), color: "#0f766e" },
  hotel: { emoji: "🏨", label: msg("Hotels & stays"), color: "#7c3aed" },
  gifts: { emoji: "🎁", label: msg("Gifts, books & flowers"), color: "#db2777" },
  pets: { emoji: "🐾", label: msg("Pets & vets"), color: "#a16207" },
  services: { emoji: "🛠️", label: msg("Services"), color: "#78716c" },
  other: { emoji: "🏪", label: msg("Other stores"), color: "#6b7280" },
};
export const STORE_TYPE_KEYS = Object.keys(STORE_TYPES) as StoreType[];
/** The map's place category for a store type: what /api/local?store=place takes (menu vs Torob catalog). */
export function placeCatOf(type: StoreType): PlaceCat {
  const map: Partial<Record<StoreType, PlaceCat>> = {
    food: "restaurant", cafe: "cafe", sweets: "icecream", bakery: "bakery", grocery: "grocery", fruit: "grocery", butcher: "grocery",
    pharmacy: "pharmacy", clothing: "fashion", digital: "tech", sport: "gym", finance: "bank",
  };
  return map[type] ?? "shop";
}

/** Words (Persian and the sites' English slugs) that say which type a store is; the first rule that matches wins. */
const TYPE_RULES: [StoreType, RegExp][] = [
  ["pharmacy", /داروخانه|pharmac/i],
  ["doctor", /پزشک|دکتر|متخصص|جراح|دندان|^dr\b|\/dr\/|dentist|optometr|midwife|ماما\b|روانشناس|psychiatr|psycholog/i],
  ["health", /درمانگاه|کلینیک|بیمارستان|آزمایشگاه|رادیولوژی|فیزیوتراپی|سونوگرافی|کاردرمانی|گفتاردرمانی|توانبخشی|ترک اعتیاد|طب سنتی|عطاری|عینک|اپتیک|clinic|hospital|medical|laborator|lab\b|optic/i],
  ["cafe", /کافه|قهوه|café|cafe|coffee|چایخانه|teahouse/i],
  ["sweets", /شیرینی|قنادی|بستنی|آبمیوه|کیک|شکلات|confection|cake|ice-?cream|juice|sweet|dessert/i],
  ["bakery", /نانوایی|نان |سنگک|بربری|لواش|bakery|baker/i],
  ["fruit", /میوه|تره.?بار|سبزی|fruit|vegetable|greengrocer/i],
  ["butcher", /قصابی|گوشت|مرغ|ماهی|پروتئین|butcher|meat|poultry|seafood|fish/i],
  ["grocery", /سوپرمارکت|سوپر مارکت|هایپر|فروشگاه زنجیره|بقالی|خواربار|لبنیات|آجیل|خشکبار|شوینده|افق کوروش|اپک|مینومارت|شهروند|رفاه|supermarket|hypermarket|grocery|convenience|dairy|chain-stores|nuts|honey/i],
  ["food", /رستوران|فست.?فود|پیتزا|ساندویچ|برگر|کباب|سفره.?خانه|غذا|طباخی|کله.?پزی|جگر|سوخاری|آش|حلیم|کترینگ|restaurant|fast-?food|pizza|sandwich|burger|kebab|catering|food|dining|liver|soup/i],
  ["beauty", /آرایش|سالن زیبایی|زیبایی|ناخن|مژه|اپیلاسیون|پیرایش|ماساژ|اسپا|barber|salon|nail|beauty|cosmetic|spa\b|massage/i],
  ["clothing", /پوشاک|لباس|کیف|کفش|مانتو|بوتیک|خیاط|پارچه|عروس|سیسمونی|پیراهن|جامه|پوش\b|جین|clothing|fashion|shoe|bag|tailor|fabric|boutique|underwear|baby/i],
  ["gifts", /گل.?فروشی|گل و گیاه|اسباب.?بازی|بازی فکری|لوازم.?التحریر|کتاب|نشر|طلا|جواهر|زیورآلات|ساعت.?فروشی|هدیه|کادو|لوازم جشن|صنایع دستی|flower|florist|toy|stationery|book|jewel|gold|gift|craft/i],
  ["pets", /پت.?شاپ|حیوانات|دامپزشک|pet|veterinar/i],
  ["auto", /خودرو|اتومبیل|مکانیک|تعمیرگاه|لوازم یدکی|کارواش|لاستیک|صافکاری|نقاشی خودرو|نمایشگاه ماشین|automotive|\bauto\b|car-?wash|mechanic|tyre|tire|vehicle/i],
  ["digital", /موبایل|گوشی|کامپیوتر|لپ.?تاپ|دیجیتال|الکترونیک|digital|mobile|computer|laptop|electronic/i],
  ["realestate", /املاک|مشاور املاک|بنگاه|estate|real-?estate|amlak/i],
  ["finance", /بانک|بیمه|صرافی|bank|insurance|exchange|atm/i],
  ["education", /مدرسه|آموزشگاه|دانشگاه|مهد کودک|پیش.?دبستان|آموزش|کلاس|کنکور|تدریس|school|education|academ|kinder|universit|institute/i],
  ["sport", /ورزش|باشگاه|استخر|بدنسازی|خانه بازی|شهربازی|سرگرمی|تفریح|sport|gym|fitness|pool|entertainment|play/i],
  ["hotel", /هتل|مهمان.?پذیر|اقامتگاه|مسافرخانه|hotel|guesthouse|hostel|motel/i],
  ["building", /مصالح|ساختمان|ابزار|یراق|کاشی|سرامیک|شیرآلات|تجهیزات صنعتی|ژنراتور|نجاری|کابینت|دوربین مداربسته|دزدگیر|لوازم برقی|الکتریکی|در و پنجره|کناف|آسانسور|construction|building|hardware|tools|industrial/i],
  ["home", /لوازم خانگی|مبل|فرش|پرده|دکوراسیون|آشپزخانه|کالای خواب|home|furniture|carpet|appliance|decor/i],
  ["services", /خدمات|تعمیر|نظافت|خشکشویی|قالیشویی|عکاسی|چاپ|دفتر|وکالت|وکیل|حقوقی|محضر|آژانس|تبلیغ|تابلو|کافی.?نت|مهندسین|طراحی سایت|باربری|اتوبار|لوله.?بازکنی|تشریفات|مجالس|اسنپ|service|repair|clean|laundry|notar|lawyer|legal|print|photo|agency|travel/i],
];
/** The game's store type for a site's category words (a Persian label, an English slug or a URL path). */
export function typeOf(...words: (string | null | undefined)[]): StoreType {
  const text = words.filter(Boolean).join(" ");
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type;
  return "other";
}

// ---------------------------------------------------------------- stores
/** One store from a directory, as the map and the store list show it. */
export type DirStore = {
  /** `<site>:<its id>` — what /api/stores?detail= takes back. */
  id: string;
  site: MapSite;
  name: string;
  lat: number;
  lng: number;
  type: StoreType;
  /** The site's own category label (Persian), for the card. */
  cat: string;
  /** Out of 5; 0 when the site has none. */
  rating: number;
  img?: string;
  phone?: string;
  /** The store's page on its site. */
  url: string;
  /** Netbarg: percent off (0 when none), the deal's price in toman. */
  off?: number;
  price?: number;
  /** Other sites that list the same store (merged into this one). */
  also?: MapSite[];
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(latinDigits(v).replace(/[^\d.\-]/g, "")) : NaN);
const okPos = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const rating5 = (v: unknown, outOf = 5) => {
  const n = num(v);
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(5, (n * 5) / outOf) * 10) / 10 : 0;
};

export type Bbox = { s: number; w: number; n: number; e: number };
/** A box `m` metres each way round a point. */
export function bboxAround(at: { lat: number; lng: number }, m: number): Bbox {
  const dLat = m / 111_320, dLng = m / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  return { s: at.lat - dLat, n: at.lat + dLat, w: at.lng - dLng, e: at.lng + dLng };
}
export const inBbox = (b: Bbox, lat: number, lng: number) => lat >= b.s && lat <= b.n && lng >= b.w && lng <= b.e;

/** Bilbooard's map endpoint (`/<city>/businesses/map?sw_lat…`): its businesses. */
export function fromBilbooard(json: unknown): DirStore[] {
  const list = (json as { businesses?: unknown[] } | null)?.businesses;
  if (!Array.isArray(list)) return [];
  const out: DirStore[] = [];
  for (const raw of list) {
    const b = raw as Record<string, unknown>;
    const lat = num(b.latitude), lng = num(b.longitude), name = clean(b.name), url = clean(b.url);
    if (!name || !okPos(lat, lng) || !/^https:\/\/bilbooard\.ir\//.test(url)) continue;
    const cat = clean(b.category);
    out.push({ id: `bilbooard:${num(b.id) || clean(b.slug)}`, site: "bilbooard", name, lat, lng, type: typeOf(cat), cat, rating: rating5(b.average_rating), img: clean(b.image) || undefined, url });
  }
  return out;
}

/** Irangaah's city index row: [name, lat, lng, category code, path, phone]. */
export type IrangaahRow = [string, number, number, number, string, string];
/** What a path's first two parts say: "/business/food/…" → food, "/dr/dentist/…" → a doctor. */
const IG_CATS: Record<string, string> = {
  stores: "فروشگاه", services: "خدمات", construction: "ساختمان", food: "غذا", automotive: "خودرو", "digital-services": "دیجیتال",
  education: "آموزش", "estate-agents": "املاک", "chain-stores": "فروشگاه زنجیره‌ای", notaries: "دفتر اسناد", insurance: "بیمه",
  "medical-centers": "درمانگاه", pharmacies: "داروخانه", hotels: "هتل", sports: "ورزشی", banks: "بانک",
};
/** Irangaah's places that aren't stores (bus stops, parks, mosques, offices): left off the map. */
const IG_SKIP = /^\/(places\/(bus-stops|parks|religious|government|cemeter|metro|stations)|schools|kinder)/;
export function fromIrangaah(rows: unknown, box: Bbox, max = 600): DirStore[] {
  if (!Array.isArray(rows)) return [];
  const out: DirStore[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [name, lat, lng, , path, phone] = r as IrangaahRow;
    if (typeof name !== "string" || typeof path !== "string" || !okPos(lat, lng) || !inBbox(box, lat, lng) || IG_SKIP.test(path)) continue;
    const parts = path.split("/").filter(Boolean);
    const doctor = parts[0] === "dr";
    const cat = doctor ? `پزشک · ${parts[1] ?? ""}` : IG_CATS[parts[1] ?? ""] ?? parts[1] ?? "";
    const type = doctor ? "doctor" : typeOf(parts[1], name, cat);
    out.push({ id: `irangaah:${parts.join("~")}`, site: "irangaah", name: clean(name), lat, lng, type, cat, rating: 0, phone: phonesFrom("irangaah", phone)[0]?.number, url: `https://irangaah.ir${path}` });
    if (out.length >= max) break;
  }
  return out;
}
/**
 * The Irangaah city whose index covers a point (cities.json: [slug, name, province, lat, lng], biggest
 * first). A big city's index covers its whole area, and the towns round it have centres of their own
 * nearer some of its districts (Shemiranat's is nearer Tehranpars than Tehran's): so the first city —
 * the biggest — within `bigM` wins, else the nearest within `maxM`.
 */
export function nearestCity(cities: unknown, at: { lat: number; lng: number }, maxM = 40_000, bigM = 20_000): string | null {
  const list = (cities as { c?: unknown[] } | null)?.c;
  if (!Array.isArray(list)) return null;
  let best: string | null = null, bestM = maxM;
  for (const c of list) {
    if (!Array.isArray(c) || typeof c[0] !== "string") continue;
    const m = distanceM(at, { lat: Number(c[3]), lng: Number(c[4]) });
    if (m <= bigM) return c[0];
    if (m < bestM) (best = c[0]), (bestM = m);
  }
  return best;
}
/** Bilbooard's 33 cities (its URLs start with one); Irangaah's slugs are the same words. */
export const BILBOOARD_CITIES = ["ahvaz", "arak", "ardabil", "bandar-abbas", "birjand", "bojnurd", "bonab", "bushehr", "gorgan", "hamadan", "ilam", "isfahan", "karaj", "kashan", "kerman", "kermanshah", "khorramabad", "mashhad", "qazvin", "qom", "rasht", "sanandaj", "sari", "semnan", "shahrekord", "shiraz", "tabriz", "tehran", "urmia", "yasuj", "yazd", "zahedan", "zanjan"];
/** Irangaah spells Hamedan with an e. */
export const bilbooardCity = (slug: string | null) => (slug === "hamedan" ? "hamadan" : slug && BILBOOARD_CITIES.includes(slug) ? slug : null);

/** An Okala store: the nearby list's row and its details (the only one with a position). Prices are rials. */
export function fromOkala(row: unknown, detail: unknown): DirStore | null {
  const r = row as Record<string, unknown> | null, d = detail as Record<string, unknown> | null;
  const id = num(r?.storeId ?? d?.storeId), lat = num(d?.storeLat), lng = num(d?.storeLng);
  if (!Number.isFinite(id) || !okPos(lat, lng)) return null;
  const brand = clean(r?.storeCategoryName ?? d?.storeCategoryName), own = clean(r?.storeName ?? d?.storeName);
  // "Ofogh Kourosh · Narmak": a chain's branch is named by its area.
  const chain = !/سوپرمارکت|نانوایی|سوپرمیوه|میوه|پروتئین|لبنیات|قصابی/.test(brand);
  const name = chain && brand && !own.includes(brand) ? `${brand} ${own}` : own;
  return { id: `okala:${id}`, site: "okala", name, lat, lng, type: typeOf(brand, own), cat: brand, rating: rating5(r?.rate ?? d?.rate), img: clean(d?.logo ?? r?.logo) || undefined, url: `https://www.okala.com/store/${id}` };
}

// ---------------------------------------------------------------- pages (JSON-LD)
/** Every schema.org object on a page (`@graph`s and arrays flattened). */
export function ldObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (Array.isArray(o["@graph"])) walk(o["@graph"]);
      else out.push(o);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* a broken block: skip it */
    }
  }
  return out;
}
const BUSINESS = /Restaurant|FoodEstablishment|LocalBusiness|Store|CafeOrCoffeeShop|Bakery|MedicalBusiness|Physician|Dentist|Pharmacy|AutoRepair|BeautySalon|HealthAndBeautyBusiness|ProfessionalService|LodgingBusiness|Hotel|Organization/;
const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const minutes = (s: unknown) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(latinDigits(String(s ?? "")));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
/** schema.org openingHoursSpecification as the game's week (Saturday first); null when it says nothing. */
export function weekFromLd(spec: unknown): Week | null {
  const list = Array.isArray(spec) ? spec : spec ? [spec] : [];
  const week: Week = DAYS.map(() => []);
  let any = false;
  for (const s of list as Record<string, unknown>[]) {
    const days = (Array.isArray(s?.dayOfWeek) ? s.dayOfWeek : [s?.dayOfWeek]).map((d) => String(d ?? "").replace(/^https?:\/\/schema\.org\//, ""));
    let a = minutes(s?.opens), b = minutes(s?.closes);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (b === 1439) b = 1440;
    if (b <= a) b += 1440;
    for (const d of days) {
      const i = DAYS.indexOf(d);
      if (i >= 0) (week[i].push([a, b]), (any = true));
    }
  }
  return any ? week : null;
}

/** A store's page in full, as the card shows it. */
export type DirDetail = {
  id: string;
  site: MapSite;
  name: string;
  url: string;
  lat?: number;
  lng?: number;
  description: string;
  photos: string[];
  address: string;
  week: Week | null;
  phones: StorePhone[];
  rating: number;
  ratingCount: number;
  links: { url: string; label: string }[];
  /** Netbarg: the deal (title, price and the price before, toman). */
  offer?: { title: string; price: number; was: number; off: number; available: boolean };
  /** Okala: when the first delivery can come ("60 دقیقه") and the smallest order (toman). */
  eta?: string;
  minOrder?: number;
  reviews?: { name: string; rate: number; text: string; at: string }[];
};

/** The business on a Bilbooard / Irangaah / Netbarg page (its JSON-LD). */
export function detailFromLd(html: string, base: { id: string; site: MapSite; url: string }): DirDetail | null {
  const all = ldObjects(html);
  const biz = all.find((o) => BUSINESS.test(String(o["@type"] ?? "")) && (o.geo || o.address || o.telephone)) ?? null;
  if (!biz) return null;
  const geo = biz.geo as Record<string, unknown> | undefined;
  const addr = biz.address as Record<string, unknown> | string | undefined;
  const img = biz.image;
  const photos = (Array.isArray(img) ? img : img ? [img] : []).map((x) => (typeof x === "string" ? x : clean((x as Record<string, unknown>)?.url))).filter((u) => /^https:\/\//.test(u)).slice(0, 12);
  const agg = (biz.aggregateRating ?? {}) as Record<string, unknown>;
  const best = num(agg.bestRating) || 5;
  const same = (Array.isArray(biz.sameAs) ? biz.sameAs : biz.sameAs ? [biz.sameAs] : []).map(String).filter((u) => /^https:\/\//.test(u));
  const lat = num(geo?.latitude), lng = num(geo?.longitude);
  return {
    id: base.id,
    site: base.site,
    url: base.url,
    name: clean(biz.name),
    ...(okPos(lat, lng) ? { lat, lng } : {}),
    description: clean(biz.description).slice(0, 1200),
    photos,
    address: typeof addr === "string" ? clean(addr) : clean(addr?.streetAddress),
    week: weekFromLd(biz.openingHoursSpecification),
    phones: phonesFrom(base.site === "irangaah" ? "irangaah" : base.site === "netbarg" ? "netbarg" : "map", clean(biz.telephone)),
    rating: rating5(agg.ratingValue, best),
    ratingCount: num(agg.ratingCount ?? agg.reviewCount) || 0,
    links: same.slice(0, 4).map((url) => ({ url, label: /instagram/.test(url) ? "Instagram" : new URL(url).hostname.replace(/^www\./, "") })),
  };
}

// ---------------------------------------------------------------- Netbarg
/** The deals a Netbarg neighbourhood page links to: `/<city>/d/c:<cat>/<id>/…` (each once). */
export function netbargDealLinks(html: string): { id: number; cat: string; url: string }[] {
  const seen = new Set<number>(), out: { id: number; cat: string; url: string }[] = [];
  for (const m of html.matchAll(/href="(\/[a-z]+\/d\/c:([a-z-]+)\/(\d+)\/[^"]*)"/g)) {
    const id = Number(m[3]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, cat: m[2], url: `https://netbarg.com${m[1]}` });
  }
  return out;
}
/**
 * A Netbarg deal page: its store on the map and the deal. The store stands on the page's map pin; a
 * deal still on sale whose page loads its map only when asked stands on the centre of the
 * neighbourhood whose page listed it (`area`). An ended deal's store is still a real store (address,
 * phone, rating) — kept without the deal badge, and only where its page pins it. null otherwise.
 */
export function fromNetbargDeal(html: string, link: { id: number; cat: string; url: string }, area?: { lat: number; lng: number }): { store: DirStore; detail: DirDetail } | null {
  const pin = /LatLng\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)/.exec(html);
  const lat = pin ? Number(pin[1]) : area?.lat ?? NaN, lng = pin ? Number(pin[2]) : area?.lng ?? NaN;
  const all = ldObjects(html);
  const product = all.find((o) => o["@type"] === "Product");
  const offer = (product?.offers ?? {}) as Record<string, unknown>;
  const available = /InStock/i.test(String(offer.availability ?? ""));
  if (!product || !okPos(lat, lng) || (!pin && !available)) return null;
  const id = `netbarg:${link.id}`;
  const d = detailFromLd(html, { id, site: "netbarg", url: link.url });
  if (!d) return null;
  // The offer is in rials; the page's own text ("… 540.000 تومان بجای 600.000 تومان") is toman.
  const price = Math.round((num(offer.price) || 0) / 10);
  const text = latinDigits(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const was = num(/بجای\s*([\d.,٬]{4,})\s*تومان/.exec(text)?.[1]?.replace(/[.,٬]/g, "") ?? "") || 0;
  const off = num(/(\d{1,2})\s*%\s*تخفیف/.exec(text)?.[1] ?? "") || (price && was > price ? Math.round((1 - price / was) * 100) : 0);
  const title = clean(product.name);
  const name = d.name || title;
  const store: DirStore = { id, site: "netbarg", name, lat, lng, type: typeOf(name, link.cat, title), cat: title, rating: d.rating, img: d.photos[0] ?? (clean(product.image) || undefined), phone: d.phones[0]?.number, url: link.url, ...(available ? { off, price } : {}) };
  return { store, detail: { ...d, name, lat, lng, offer: { title, price, was, off, available } } };
}

// ---------------------------------------------------------------- Sheypoor
export type AdItem = { id: string; title: string; area: string; price: string; img: string; url: string; ago: string; cat: string; lat?: number; lng?: number };
/** An area's ads, pinned on its centre (Divar's district list gives the centres). */
export type AdArea = { id: string; name: string; lat: number; lng: number; ads: AdItem[] };
/** The text of a Next.js page's streamed data (`self.__next_f.push([1,"…"])` chunks), unescaped. */
export function rscText(html: string): string {
  let s = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      s += JSON.parse(`"${m[1]}"`);
    } catch {
      /* skip */
    }
  }
  return s;
}
/** Sheypoor's listings on a search page. */
export function sheypoorListings(html: string): AdItem[] {
  const text = rscText(html) || html;
  const out: AdItem[] = [], seen = new Set<string>();
  for (const m of text.matchAll(/\{"id":"(\d{5,})","type":"(?:normal|paidEngagement)","attributes":\{/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    // Each listing is a flat-ish object: read its fields from the next 3 kB.
    const chunk = text.slice(m.index!, m.index! + 3000);
    const f = (k: string) => {
      const r = new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`).exec(chunk);
      try {
        return r ? (JSON.parse(`"${r[1]}"`) as string) : "";
      } catch {
        return "";
      }
    };
    const title = f("title"), url = f("url");
    if (!title || !/^https:\/\/www\.sheypoor\.com\//.test(url)) continue;
    seen.add(id);
    const amount = /"amount":"([^"]*)","currency":"([^"]*)"/.exec(chunk);
    const geo = /"geo":\{"lat":(-?[\d.]+),"lon":(-?[\d.]+)\}/.exec(chunk);
    const cat = /"categories":\[(?:\{"name":"[^"]*","id":"\d+"\},)*\{"name":"([^"]*)"/.exec(chunk)?.[1] ?? "";
    out.push({
      id,
      title,
      area: f("location"),
      price: amount && amount[1] ? `${amount[1]} ${amount[2]}`.trim() : "",
      img: f("landscape") || f("round"),
      url,
      ago: f("timePassedLabel"),
      cat,
      ...(geo && okPos(Number(geo[1]), Number(geo[2])) ? { lat: Number(geo[1]), lng: Number(geo[2]) } : {}),
    });
  }
  return out;
}
/** The neighbourhood in "تهران، نارمک" ("" for the whole city / province / country). */
export const adAreaName = (location: string) => (location.includes("،") ? location.split("،").slice(1).join("،").trim() : "");
const fa = (s: string) => s.replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌\s]+/g, "").trim();
/** Ads pinned on the districts they name (only districts near the player, which `districts` already are). */
export function adAreas(ads: AdItem[], districts: { id: string; name: string; lat: number; lng: number }[]): AdArea[] {
  const byName = new Map(districts.map((d) => [fa(d.name), d]));
  const areas = new Map<string, AdArea>();
  for (const ad of ads) {
    const d = byName.get(fa(adAreaName(ad.area)));
    if (!d) continue;
    let a = areas.get(d.id);
    if (!a) areas.set(d.id, (a = { id: d.id, name: d.name, lat: d.lat, lng: d.lng, ads: [] }));
    a.ads.push(ad);
  }
  return [...areas.values()];
}

// ---------------------------------------------------------------- Basalam
export type Product = { id: string; name: string; price: number; img: string; url: string; rating: number; votes: number; seller: string; city: string; site: "basalam" };
/** Basalam's product search (prices in rials → toman). */
export function fromBasalam(json: unknown): Product[] {
  const list = (json as { products?: unknown[] } | null)?.products;
  if (!Array.isArray(list)) return [];
  const out: Product[] = [];
  for (const raw of list) {
    const p = raw as Record<string, unknown>;
    const v = (p.vendor ?? {}) as Record<string, unknown>;
    const owner = (v.owner ?? {}) as Record<string, unknown>;
    const id = num(p.id), name = clean(p.name), price = Math.round((num(p.price) || 0) / 10);
    if (!Number.isFinite(id) || !name || !price) continue;
    const photo = p.photo as Record<string, unknown> | string | undefined;
    const img = typeof photo === "string" ? photo : clean(photo?.MEDIUM ?? photo?.SMALL ?? photo?.medium ?? photo?.small ?? photo?.url);
    const r = (p.rating ?? {}) as Record<string, unknown>;
    out.push({ id: String(id), name, price, img, url: `https://basalam.com/p/${id}`, rating: rating5(r.average), votes: num(r.count) || 0, seller: clean(v.name), city: clean(owner.city ?? v.city), site: "basalam" });
  }
  return out;
}

// ---------------------------------------------------------------- one store from many sites
/** One store listed by several directories becomes one marker: the first in `order` keeps its card, the rest go in `also`. */
export function mergeStores(list: DirStore[], order: MapSite[] = ["okala", "netbarg", "bilbooard", "irangaah"]): DirStore[] {
  const sorted = [...list].sort((a, b) => order.indexOf(a.site) - order.indexOf(b.site));
  const kept: DirStore[] = [];
  const grid = new Map<string, DirStore[]>();
  const cell = (lat: number, lng: number) => `${Math.floor(lat / 0.004)}:${Math.floor(lng / 0.005)}`;
  for (const s of sorted) {
    const [cy, cx] = cell(s.lat, s.lng).split(":").map(Number);
    let twin: DirStore | undefined;
    for (let dy = -1; dy <= 1 && !twin; dy++)
      for (let dx = -1; dx <= 1 && !twin; dx++)
        twin = grid.get(`${cy + dy}:${cx + dx}`)?.find((k) => {
          const m = distanceM(k, s);
          return m <= 60 ? nameScore(k.name, s.name) >= 0.5 : m <= 250 && nameScore(k.name, s.name) >= 1;
        });
    if (twin) {
      if (twin.site !== s.site && !twin.also?.includes(s.site)) twin.also = [...(twin.also ?? []), s.site];
      twin.phone ||= s.phone;
      twin.img ||= s.img;
      twin.rating ||= s.rating;
      continue;
    }
    const k = cell(s.lat, s.lng);
    grid.set(k, [...(grid.get(k) ?? []), s]);
    kept.push(s);
  }
  return kept;
}
/** The directory store that is this place (a store card in 2D or 3D, or a Snappfood vendor), if any. */
export function findTwin<T extends { site: MapSite; name: string; lat: number; lng: number }>(list: T[], place: { name: string; lat: number; lng: number }, site?: MapSite): T | null {
  let best: T | null = null, bestM = Infinity;
  for (const s of list) {
    if (site && s.site !== site) continue;
    const m = distanceM(s, place);
    if (m < bestM && (m <= 80 ? nameScore(s.name, place.name) >= 0.5 : m <= 300 && nameScore(s.name, place.name) >= 1)) (best = s), (bestM = m);
  }
  return best;
}

// ---------------------------------------------------------------- leaving the game
/** Before a link opens another site: which site it is (a known one has its own name, emoji and what you'll find). */
export type LeaveInfo = { host: string; secure: boolean; site: Site | null; known: string };
/** Sites the game already reads (their name only; the directory sites have the full entry in SITES). */
const KNOWN: Record<string, string> = {
  "snappfood.ir": msg("Snappfood"), "torob.com": msg("Torob"), "divar.ir": msg("Divar"), "takhfifan.com": msg("Takhfifan"),
  "cinematicket.org": msg("Cinematicket"), "balad.ir": msg("Balad"), "instagram.com": "Instagram", "google.com": "Google", "neshan.org": msg("Neshan"),
};
export function leaveInfo(href: string): LeaveInfo | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const site = SITE_IDS.map((id) => SITES[id]).find((s) => s.hosts.some((h) => host === h.replace(/^www\./, "") || host.endsWith(`.${h}`))) ?? null;
  const known = Object.entries(KNOWN).find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? "";
  return { host, secure: u.protocol === "https:", site, known };
}

// ---------------------------------------------------------------- home services
export type ServiceCat = { key: string; emoji: string; label: string; links: Partial<Record<"achareh" | "sanjagh" | "khedmatazma", string>> };
/** What each services site calls its categories (Sanjagh and Khedmatazma pages are per city: `{city}`). */
export const SERVICES: ServiceCat[] = [
  { key: "cleaning", emoji: "🧽", label: msg("Cleaning"), links: { achareh: "/categories/cleaning-and-washing/", sanjagh: "/b/121?z={city}", khedmatazma: "/categories/cleaning" } },
  { key: "repairs", emoji: "🔧", label: msg("Home repairs & plumbing"), links: { achareh: "/categories/building-repairs-and-installations/", sanjagh: "/b/125?z={city}", khedmatazma: "/categories/facility" } },
  { key: "appliances", emoji: "🧊", label: msg("Appliance & phone repair"), links: { achareh: "/categories/household-appliances-repairs-and-mobile-and-computer/", sanjagh: "/b/123?z={city}", khedmatazma: "/categories/digital" } },
  { key: "moving", emoji: "🚚", label: msg("Moving"), links: { achareh: "/categories/moving-and-carrying/", sanjagh: "/b/100?z={city}", khedmatazma: "/categories/home" } },
  { key: "renovation", emoji: "🏗️", label: msg("Renovation & building"), links: { achareh: "/categories/building-repairs-and-installations/", sanjagh: "/b/124?z={city}", khedmatazma: "/categories/building" } },
  { key: "beauty", emoji: "💅", label: msg("Beauty at home"), links: { achareh: "/categories/beauty-and-health/", sanjagh: "/b/104?z={city}", khedmatazma: "/categories/beauty" } },
  { key: "car", emoji: "🚗", label: msg("Car services"), links: { achareh: "/categories/car/", khedmatazma: "/categories/car" } },
  { key: "pets", emoji: "🐾", label: msg("Pet care"), links: { sanjagh: "/b/102?z={city}" } },
  { key: "events", emoji: "🎉", label: msg("Parties & events"), links: { sanjagh: "/b/106?z={city}" } },
  { key: "office", emoji: "🗂️", label: msg("Office & business"), links: { achareh: "/categories/corporate-or-organizational-services/", sanjagh: "/b/110?z={city}" } },
];
/** A service category's page on one site, for a city (Sanjagh and Khedmatazma know ~30 cities; elsewhere their home page). */
export function serviceUrl(site: "achareh" | "sanjagh" | "khedmatazma", path: string, city: string | null): string {
  return `${SITES[site].url}${path.replace("{city}", encodeURIComponent(city || "tehran"))}`;
}

// ---------------------------------------------------------------- price links
/**
 * Search one product on the sites whose search page takes it in the link (Torob, Basalam). Emalls and
 * Snapp Shop search only inside their own pages, so the shopping-sites list opens their home page.
 */
export function productSearchLinks(q: string): { site: SiteId | "torob"; label: string; url: string }[] {
  const s = encodeURIComponent(q.trim());
  return [
    { site: "torob", label: msg("Torob"), url: `https://torob.com/search/?query=${s}` },
    { site: "basalam", label: msg("Basalam"), url: `https://basalam.com/s?q=${s}` },
  ];
}
