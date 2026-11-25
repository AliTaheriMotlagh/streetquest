// What a storefront in the 3D city looks like, by what it sells (pure; tests/storeKinds.test.ts).
// The sources name stores in different vocabularies — OpenStreetMap classes, our place
// categories (PlaceCat), Snappfood vendor types, and the shop's own Persian name — so
// `storeKind` folds all of them into ~12 visual kinds, and STORE_LOOK says how each is dressed:
// awning colours, window glow, the few cheap props, and what moves (steam, neon, a cross).
import { dayClock, openState, type Week } from "./localData";
import { msg } from "./i18n";
import { countryAt, wordsAt } from "./region";
import type { PlaceCat } from "./places";

export const STORE_KINDS = ["restaurant", "fastfood", "cafe", "bakery", "sweets", "market", "produce", "butcher", "pharmacy", "fashion", "tech", "general"] as const;
export type StoreKind = (typeof STORE_KINDS)[number];
export type Prop = "crates" | "menu" | "neon" | "cross" | "steam" | "rack" | "screen" | "rug" | "samovar";

export type StoreLook = {
  emoji: string;
  /** Awning stripe colour (the other stripe is white-ish) and the sign's two background colours. */
  awning: string;
  sign: [string, string];
  /** Light through the display window (warm for food, cold for tech, green for the chemist). */
  glow: string;
  props: Prop[];
  /** The place category the store lookup is asked with. */
  cat: PlaceCat;
};

export const STORE_LOOK: Record<StoreKind, StoreLook> = {
  restaurant: { emoji: "🍽️", awning: "#b3261e", sign: ["#7a1a14", "#3d0b08"], glow: "#ffb45c", props: ["menu", "steam", "samovar"], cat: "restaurant" },
  fastfood: { emoji: "🍔", awning: "#e8a200", sign: ["#c0392b", "#7b1d14"], glow: "#ffd05a", props: ["menu", "steam"], cat: "burger" },
  cafe: { emoji: "☕", awning: "#6b4a2f", sign: ["#3b2a1c", "#1d130b"], glow: "#ffc98a", props: ["neon", "menu", "samovar"], cat: "cafe" },
  bakery: { emoji: "🥖", awning: "#c98a3a", sign: ["#8a5a22", "#4b300f"], glow: "#ffd9a0", props: ["steam", "crates"], cat: "bakery" },
  sweets: { emoji: "🍰", awning: "#d6598c", sign: ["#a83279", "#5e1a43"], glow: "#ffc4de", props: ["neon"], cat: "bakery" },
  market: { emoji: "🛒", awning: "#2e9e44", sign: ["#1f7a34", "#0f4219"], glow: "#eaffd0", props: ["crates"], cat: "grocery" },
  produce: { emoji: "🍎", awning: "#4caf50", sign: ["#2d8a3a", "#17491e"], glow: "#fff1b8", props: ["crates"], cat: "grocery" },
  butcher: { emoji: "🥩", awning: "#a61e1e", sign: ["#8b1a1a", "#470d0d"], glow: "#ffd0c0", props: [], cat: "grocery" },
  pharmacy: { emoji: "⚕️", awning: "#1e9e6a", sign: ["#14804f", "#0a4429"], glow: "#d8fff0", props: ["cross"], cat: "pharmacy" },
  fashion: { emoji: "👗", awning: "#7d3c98", sign: ["#232323", "#0c0c0c"], glow: "#ffe6f2", props: ["rack", "rug"], cat: "fashion" },
  tech: { emoji: "📱", awning: "#2c6fbb", sign: ["#16202e", "#070b11"], glow: "#8fd8ff", props: ["screen"], cat: "tech" },
  general: { emoji: "🏪", awning: "#5f6b78", sign: ["#3d4b59", "#222b33"], glow: "#fff0cf", props: ["rug"], cat: "shop" },
};

/** What each kind is called, for the sign's second line ("Café · ★ 4.6"). */
export const KIND_LABEL: Record<StoreKind, string> = {
  restaurant: msg("Restaurant"),
  fastfood: msg("Fast food"),
  cafe: msg("Café"),
  bakery: msg("Bakery"),
  sweets: msg("Sweets & nuts"),
  market: msg("Supermarket"),
  produce: msg("Fruit & veg"),
  butcher: msg("Butcher"),
  pharmacy: msg("Pharmacy"),
  fashion: msg("Clothes & shoes"),
  tech: msg("Phones & electronics"),
  general: msg("Store"),
};

/** Persian / English words in a store's own name that say what it is (they sharpen a vague class). */
const NAME_HINTS: [RegExp, StoreKind][] = [
  [/داروخانه|pharm/i, "pharmacy"],
  [/نانوایی|بیکری|bakery|boulang/i, "bakery"],
  [/شیرینی|قنادی|آجیل|بستنی|شکلات|sweet|candy|ice ?cream|dessert/i, "sweets"],
  [/قصابی|گوشت|مرغ|ماهی|پروتئین|butcher|meat/i, "butcher"],
  [/میوه|سبزی|تره ?بار|صیفی|fruit|veg/i, "produce"],
  [/سوپر|هایپر|بقالی|مارکت|اتکا|رفاه|شهروند|market|grocery/i, "market"],
  [/کافه|کافی|قهوه|coffee|cafe|café/i, "cafe"],
  [/فست ?فود|برگر|پیتزا|ساندویچ|ساندویج|سیب ?زمینی|burger|pizza|sandwich|fast ?food|kfc|hotdog/i, "fastfood"],
  [/رستوران|چلو|کبابی|سرای|restaurant|grill|kitchen/i, "restaurant"],
  [/پوشاک|لباس|کفش|مانتو|بوتیک|پارچه|زیورآلات|طلا|جواهر|کیف|fashion|boutique|shoes|cloth/i, "fashion"],
  [/موبایل|لوازم خانگی|کامپیوتر|لپ ?تاپ|دیجیتال|الکترونیک|ارتباطات|mobile|phone|digital|electronic|computer/i, "tech"],
];

/** Classes from OpenStreetMap, our PlaceCat, and Snappfood vendor kinds → a kind. */
const CLASS_KIND: [RegExp, StoreKind][] = [
  [/^(pharmacy|chemist|medical_supply|optician|clinic|doctors|dentist|hospital)$/, "pharmacy"],
  [/^(fast_food|burger|pizza|food_court|kebab)$/, "fastfood"],
  [/^(restaurant|bar|pub|food|deli)$/, "restaurant"],
  [/^(cafe|coffee|caffe)$/, "cafe"],
  [/^(bakery)$/, "bakery"],
  [/^(confectionery|pastry|ice_cream|icecream|juice|chocolate|sweets|nuts)$/, "sweets"],
  [/^(butcher|seafood)$/, "butcher"],
  [/^(greengrocer|fruit|vegetable|farm)$/, "produce"],
  [/^(supermarket|convenience|grocery|general|kiosk|dairy|beverages|market|mall|department_store)$/, "market"],
  [/^(clothes|clothing_store|shoes|boutique|jewelry|bag|fabric|tailor|fashion|watches)$/, "fashion"],
  [/^(mobile_phone|electronics|computer|telecommunication|hifi|appliance|tech)$/, "tech"],
];

/** The visual kind of a store from its class (any of the vocabularies) and/or its name. A specific class beats the name; the name sharpens a vague one. */
export function storeKind(cls = "", name = ""): StoreKind {
  const c = cls.toLowerCase();
  const byClass = CLASS_KIND.find(([re]) => re.test(c))?.[1];
  // "restaurant" / "grocery" / unknown are vague: a name like "Pizza Roma" or "نانوایی سنگکی" says more.
  const vague = !byClass || byClass === "restaurant" || byClass === "market";
  if (!vague) return byClass;
  const byName = NAME_HINTS.find(([re]) => re.test(name))?.[1];
  return byName ?? byClass ?? "general";
}

/** Typical opening hours when the real ones aren't known (minutes after midnight; ends past 1440 run into the next day). */
const HOURS: Record<StoreKind, [number, number]> = {
  restaurant: [660, 1410], fastfood: [660, 1500], cafe: [540, 1410], bakery: [360, 1260], sweets: [540, 1320], market: [480, 1380],
  produce: [480, 1320], butcher: [420, 1200], pharmacy: [480, 1320], fashion: [600, 1290], tech: [600, 1260], general: [540, 1260],
};
const FRIDAY_SHUT = new Set<StoreKind>(["butcher", "fashion", "tech", "general", "produce"]);
/** A week (Saturday first) of the kind's typical hours. */
export function defaultWeek(kind: StoreKind): Week {
  const h = HOURS[kind];
  return Array.from({ length: 7 }, (_, d) => (d === 6 && FRIDAY_SHUT.has(kind) ? [] : [[h[0], h[1]] as [number, number]]));
}

/** Open right now: by the store's real week when it has one, else the kind's typical hours. */
export function storeOpen(kind: StoreKind, week: Week | null | undefined, at: Date, zone = "Asia/Tehran"): boolean {
  return openState(week ?? defaultWeek(kind), at, zone).open;
}

/** Minutes after midnight in Tehran. */
export const tehranMinutes = (at: Date) => dayClock(at, "Asia/Tehran").min;

/** How much detail a sign gets at this distance: only the near ones carry text; far ones are a coloured bar. */
export const SIGN_TEXT_M = 80;
export const signDetail = (d: number): "text" | "bar" | "none" => (d <= SIGN_TEXT_M ? "text" : d <= 170 ? "bar" : "none");

/** The most storefronts at once, by quality tier ("lite" is the phone budget): signs, dressed fronts (awning, window, props), steam puffs. */
export function storefrontCap(tier: "lite" | "low" | "medium" | "high" | "ultra"): { signs: number; dressed: number; steam: number } {
  if (tier === "lite") return { signs: 24, dressed: 8, steam: 0 };
  if (tier === "low") return { signs: 36, dressed: 12, steam: 4 };
  if (tier === "medium") return { signs: 56, dressed: 24, steam: 8 };
  return { signs: 64, dressed: 40, steam: 14 };
}

/** The first few priced menu lines (one from each section in turn), for the in-world panel. */
export function menuHighlights(sections: { items: { title: string; price: number; priceNow: number }[] }[], n = 3): { title: string; price: number }[] {
  const out: { title: string; price: number }[] = [];
  for (let i = 0; out.length < n && i < 8; i++)
    for (const s of sections) {
      const it = s.items[i];
      if (it && (it.priceNow || it.price) > 0 && out.length < n) out.push({ title: it.title, price: it.priceNow || it.price });
    }
  return out;
}

/** Neon level for a store (seeded by its slot) at time t: steady, with the odd stutter. */
export function neonFlicker(seed: number, t: number): number {
  const k = Math.sin(t * 1.3 + seed * 7.1) * Math.sin(t * 9.7 + seed * 3.3);
  return k > 0.93 ? 0.35 : 1;
}

// ---------------------------------------------------------------- when the menu isn't online
/**
 * What a kind of store usually has — shown, plainly as "usually", when its own menu isn't online
 * (most walk-in stores aren't on any delivery site). Never prices: those would be made up.
 */
export const USUALLY: Record<StoreKind, string[]> = {
  restaurant: [msg("Chelow kabab"), msg("Joojeh kabab"), msg("Ghormeh sabzi"), msg("Zereshk polo")],
  fastfood: [msg("Burgers"), msg("Pizza"), msg("Sandwiches"), msg("Fries")],
  cafe: [msg("Espresso & latte"), msg("Tea"), msg("Cakes"), msg("Shakes")],
  bakery: [msg("Sangak & barbari"), msg("Lavash"), msg("Fresh bread")],
  sweets: [msg("Pastries"), msg("Zoolbia & bamieh"), msg("Ice cream"), msg("Nuts")],
  market: [msg("Dairy"), msg("Drinks"), msg("Snacks"), msg("Household")],
  produce: [msg("Fruit"), msg("Vegetables"), msg("Herbs")],
  butcher: [msg("Lamb & beef"), msg("Chicken"), msg("Minced meat")],
  pharmacy: [msg("Medicine"), msg("Skin care"), msg("Baby care")],
  fashion: [msg("Clothes"), msg("Shoes"), msg("Bags")],
  tech: [msg("Phones"), msg("Chargers & cables"), msg("Repairs")],
  general: [msg("Everyday things")],
};

/** Turkey's own (Istanbul's kebab shop isn't a chelow-kababi). */
const USUALLY_TR: Partial<Record<StoreKind, string[]>> = {
  restaurant: [msg("Kebab"), msg("Pide"), msg("Lahmacun"), msg("Mezes")],
  fastfood: [msg("Döner"), msg("Burgers"), msg("Toast"), msg("Fries")],
  cafe: [msg("Turkish coffee"), msg("Tea"), msg("Cakes")],
  bakery: [msg("Simit"), msg("Börek"), msg("Fresh bread")],
  sweets: [msg("Baklava"), msg("Künefe"), msg("Turkish delight"), msg("Ice cream")],
};
/** Anywhere else: what such a store has the world over. */
const USUALLY_ANY: Partial<Record<StoreKind, string[]>> = {
  restaurant: [msg("Mains"), msg("Grills"), msg("Salads"), msg("Desserts")],
  cafe: [msg("Espresso & latte"), msg("Tea"), msg("Cakes"), msg("Sandwiches")],
  bakery: [msg("Bread"), msg("Pastries"), msg("Cakes")],
  sweets: [msg("Pastries"), msg("Chocolate"), msg("Ice cream")],
};
/** What this kind of store usually has, where it is (Iran's list without a position). */
export function usuallyAt(kind: StoreKind, at?: { lat: number; lng: number } | null): string[] {
  const c = at && (at.lat || at.lng) ? countryAt(at.lat, at.lng) : "IR";
  return (c === "IR" ? null : c === "TR" ? USUALLY_TR[kind] : USUALLY_ANY[kind]) ?? USUALLY[kind];
}

export type MenuSearch = { kind: "web" | "maps"; label: string; url: string };

/**
 * Where to look a store's menu up when we couldn't find it: a web search for its name with
 * "menu", and the place itself on a map (name + where it is, so the right branch comes up).
 */
export function menuSearch(name: string, at?: { lat: number; lng: number } | null): MenuSearch[] {
  const n = name.trim();
  if (n.length < 2) return [];
  const q = encodeURIComponent(`${n} ${wordsAt(at).menu}`);
  const out: MenuSearch[] = [{ kind: "web", label: msg("Search for the menu"), url: `https://www.google.com/search?q=${q}` }];
  const place = encodeURIComponent(n);
  out.push({ kind: "maps", label: msg("Photos & reviews on the map"), url: at && (at.lat || at.lng) ? `https://www.google.com/maps/search/${place}/@${at.lat.toFixed(5)},${at.lng.toFixed(5)},18z` : `https://www.google.com/maps/search/${place}` });
  return out;
}

/**
 * Places that aren't shops: mosques, shrines, churches, schools, universities, hospitals, clinics, police,
 * fire stations, offices of the state, banks, libraries, post offices, cemeteries. No shopkeeper calls from
 * those, no wares or menu on the sign, no walking in to buy — their card says what they are instead (a
 * mosque's prayer times, the emergency number, the map's opening hours). First match wins: a "Post Bank"
 * is a bank, a "post office" isn't a government office.
 */
export type CivicKind = "mosque" | "worship" | "school" | "university" | "hospital" | "clinic" | "police" | "fire" | "bank" | "post" | "library" | "government" | "cemetery";
const ZW = "[\\s\\u200c]?";
const CIVIC_RULES: [CivicKind, RegExp, RegExp][] = [
  ["mosque", /^(muslim|shia|sunni|mosque|imamzadeh|shrine)$/, new RegExp(`مسجد|حسینیه|امامزاده|تکیه|مصلی|\\bmosque\\b|\\bcamii?\\b|\\bmescidi?\\b`, "i")],
  ["worship", /^(place_of_worship|christian|jewish|zoroastrian|church|synagogue|religious|monastery|temple)$/, /کلیسا|کنیسه|آتشکده|\bchurch\b|\bkilisesi\b|\bsynagogue\b/i],
  ["university", /^(university|college)$/, /دانشگاه|دانشکده|\buniversity\b|üniversitesi/i],
  ["school", /^(school|kindergarten|seminary)$/, new RegExp(`مدرسه|حوزه|دبستان|دبیرستان|هنرستان|مهد${ZW}کودک|پیش${ZW}دبستانی|\\bschool\\b|\\bokulu\\b`, "i")],
  ["hospital", /^hospital$/, /بیمارستان|\bhospital\b|hastanesi/i],
  ["clinic", /^(clinic|doctors|dentist)$/, /درمانگاه|مرکز بهداشت|خانه بهداشت/],
  ["police", /^police$/, /کلانتری|پاسگاه|پلیس\s*\+?\s*۱۰|ستاد انتظامی|\bpolice\b|karakol/i],
  ["fire", /^fire_station$/, new RegExp(`آتش${ZW}نشانی|\\bfire station\\b|itfaiye`, "i")],
  ["bank", /^(bank|atm)$/, new RegExp(`بانک${ZW}(ملی|ملت|صادرات|تجارت|سپه|مسکن|کشاورزی|پاسارگاد|سامان|پارسیان|رفاه|اقتصاد|آینده|شهر|سینا|دی|کارآفرین|توسعه|رسالت|مهر|سرمایه|گردشگری|خاورمیانه|ایران${ZW}زمین|قرض|صنعت|ایران|انصار|حکمت|قوامین)(?![\\u0600-\\u06FF])|پست${ZW}بانک|قرض${ZW}الحسنه|^bank\\b`, "i")],
  ["post", /^post_office$/, new RegExp(`اداره${ZW}پست|دفتر${ZW}پیشخوان|\\bpost office\\b|\\bptt\\b`, "i")],
  ["library", /^library$/, /کتابخانه|\blibrary\b|kütüphane/i],
  ["government", /^(townhall|courthouse|government|embassy|public_building|ministry|community_centre|social_facility|military)$/, /شهرداری|اداره|وزارت|سازمان|دادگستری|دادسرا|فرمانداری|استانداری|بخشداری|سفارت|کنسولگری|بهزیستی|سرای محله|\bembassy\b|belediye/i],
  ["cemetery", /^(grave_yard|cemetery)$/, /آرامستان|قبرستان|گلزار شهدا|\bcemetery\b|mezarlığı/i],
];

/** What kind of non-shop place this is, by its map class first, then its name — or null: a shop. */
export function civicKind(cls = "", name = ""): CivicKind | null {
  const c = cls.toLowerCase();
  return CIVIC_RULES.find(([, byCls]) => byCls.test(c))?.[0] ?? CIVIC_RULES.find(([, , byName]) => byName.test(name))?.[0] ?? null;
}

/** Is this place a shop at all? (Not one of the places above.) */
export const isShop = (cls = "", name = "") => civicKind(cls, name) === null;

/** How a non-shop place looks on its card: emoji and what it is. */
export const CIVIC_LOOK: Record<CivicKind, { emoji: string; label: string; color: string }> = {
  mosque: { emoji: "🕌", label: msg("Mosque"), color: "#2bb3a3" },
  worship: { emoji: "⛪", label: msg("Place of worship"), color: "#8b9cf7" },
  school: { emoji: "🏫", label: msg("School"), color: "#f4b942" },
  university: { emoji: "🎓", label: msg("University"), color: "#7c83fd" },
  hospital: { emoji: "🏥", label: msg("Hospital"), color: "#ef4444" },
  clinic: { emoji: "🩺", label: msg("Health centre"), color: "#f87171" },
  police: { emoji: "🚓", label: msg("Police station"), color: "#3b82f6" },
  fire: { emoji: "🚒", label: msg("Fire station"), color: "#f97316" },
  bank: { emoji: "🏦", label: msg("Bank"), color: "#facc15" },
  post: { emoji: "📮", label: msg("Post office"), color: "#60a5fa" },
  library: { emoji: "📚", label: msg("Library"), color: "#a3a3ff" },
  government: { emoji: "🏛️", label: msg("Government office"), color: "#94a3b8" },
  cemetery: { emoji: "🪦", label: msg("Cemetery"), color: "#78716c" },
};

/** The number to call for this kind of place's emergency, by country (Iran: police 110, fire 125, ambulance 115; Turkey and Europe: 112). */
export function emergencyNumber(kind: CivicKind, country: string): string | null {
  const need = kind === "police" ? "police" : kind === "fire" ? "fire" : kind === "hospital" || kind === "clinic" ? "ambulance" : null;
  if (!need) return null;
  if (country === "IR") return need === "police" ? "110" : need === "fire" ? "125" : "115";
  if (country === "US" || country === "CA") return "911";
  if (country === "GB") return "999";
  return "112";
}
