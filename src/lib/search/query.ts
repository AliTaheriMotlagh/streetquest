// Understanding what a player types into product search (pure; tests/searchQuery.test.ts), in
// Persian, English or Turkish, with Persian or Latin digits:
//  - a price: "زیر ۳۰۰ هزار", "تا ۲ میلیون", "under 300k", "below 1.5m", "300 TL altı", "between 100 and 200 thousand",
//    "بالای ۵۰۰ هزار" / "over 500k" (a floor), "۱۰۰ تا ۲۰۰ هزار" (a range) — toman, lira or whatever the shop uses;
//  - an order: "ارزان‌ترین" / "cheapest" / "en ucuz", "نزدیک‌ترین" / "nearest" / "en yakın", "بهترین" / "best rated";
//  - discounts only: "تخفیف‌دار" / "on sale" / "indirimli";
//  - a trip: a city with "بلیط / پرواز / قطار / هتل / flight / train / hotel / bilet / otel" → the travel planner;
// what's left are the words to look for. Each word also matches its translations (pizza = پیتزا = pizza,
// kebab = کباب = kebap…) and, from four letters, one typo ("piza", "پیتزاا").
import { msg } from "../i18n";
import { normName } from "../localData";
import { findCities, type City } from "../travel";

export type Parsed = {
  /** The words to look for (price, order and the rest taken out). */
  words: string;
  min?: number;
  max?: number;
  sort?: "cheap" | "dear" | "near" | "rating" | "off";
  onlyOff?: boolean;
  /** The amounts had no unit ("زیر ۳۰۰"): in toman people mean thousands, in lira what they say (the UI decides: `scaleBare`). */
  bare?: boolean;
  /** A trip asked for: open the travel planner to this city. */
  trip?: { city: City; kind: "flight" | "train" | "bus" | "hotel" | "any" };
  /** What was understood, each with the text it came from (the UI shows them as chips that can be undone). */
  parts: { kind: "max" | "min" | "range" | "sort" | "off" | "trip"; text: string }[];
};

/** Persian, Arabic-Indic and Latin digits, and the separators people type ("۲٬۵۰۰", "2,500", "2.5"). */
export const asciiDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[٬،]/g, ",").replace(/٫/g, ".");

const UNIT: [RegExp, number][] = [
  [/^(میلیون|ملیون|million|milyon|mil|m)$/i, 1e6],
  [/^(هزار|thousand|bin|k)$/i, 1e3],
  [/^(میلیارد|billion|milyar|b)$/i, 1e9],
];
const NUM = String.raw`(\d+(?:[.,]\d+)*)\s*(میلیون|ملیون|هزار|میلیارد|million|thousand|billion|milyon|milyar|bin|mil|k|m|b)?(?![A-Za-z\u0600-\u06ff])`;
const MONEY = String.raw`(\s*(?:تومان|تومن|ریال|toman|tomans|lira|tl|₺|try)(?![A-Za-z\u0600-\u06ff]))?`;
/** "2.5" + "میلیون" → 2,500,000; "300,000" → 300000; "300" with no unit → 300 (the caller decides what a bare number means). */
export function amount(num: string, unit?: string): number {
  const clean = num.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(num) ? num.replace(/,/g, "") : num.replace(/[.,]/g, "");
  const n = Number(clean);
  const k = unit ? (UNIT.find(([re]) => re.test(unit))?.[1] ?? 1) : 1;
  return Math.round(n * k);
}

type Rule = { re: RegExp; kind: Parsed["parts"][number]["kind"]; apply: (m: RegExpMatchArray, p: Parsed) => void };
const RULES: Rule[] = [
  // ranges: "۱۰۰ تا ۲۰۰ هزار", "between 100 and 200k", "100-200 bin", "100 ile 200 arası"
  {
    re: new RegExp(String.raw`(بین\s*|between\s*)?${NUM}\s*(?:تا|و|-|–|to|and|ile)\s*${NUM}(\s*(?:تومان|تومن|ریال|toman|tomans|lira|tl|₺|try))?(\s*arası)?`, "i"),
    kind: "range",
    apply: (m, p) => {
      // "iphone 13 and 14" isn't a price: a range needs "between", a unit or a currency.
      if (!m[1] && !m[3] && !m[5] && !m[6] && !m[7]) return;
      const hiUnit = m[5] ?? m[3];
      const lo = amount(m[2], m[3] ?? hiUnit), hi = amount(m[4], hiUnit);
      if (lo > 0 && hi > lo) (p.min = lo), (p.max = hi), (p.bare = !hiUnit && hi < 10_000);
    },
  },
  // a ceiling: "زیر / کمتر از / تا / حداکثر ۳۰۰ هزار", "under / below / up to / max / less than 300k", "300 TL altı", "en fazla 300"
  { re: new RegExp(String.raw`(?:زیر|کمتر\s*از|ارزان‌?تر\s*از|حداکثر|تا|under|below|less\s*than|cheaper\s*than|up\s*to|max(?:imum)?|en\s*fazla|<)\s*${NUM}${MONEY}`, "i"), kind: "max", apply: (m, p) => void ((p.max = amount(m[1], m[2])), (p.bare = !m[2] && !m[3] && p.max < 10_000)) },
  { re: new RegExp(String.raw`${NUM}${MONEY}\s*(?:altı|altında|ve\s*altı)`, "i"), kind: "max", apply: (m, p) => void ((p.max = amount(m[1], m[2])), (p.bare = !m[2] && !m[3] && p.max < 10_000)) },
  // a floor: "بالای / بیشتر از / حداقل", "over / above / more than / at least", "300 TL üstü"
  { re: new RegExp(String.raw`(?:بالای|بالاتر\s*از|بیشتر\s*از|حداقل|over|above|more\s*than|at\s*least|min(?:imum)?|en\s*az|>)\s*${NUM}${MONEY}`, "i"), kind: "min", apply: (m, p) => void ((p.min = amount(m[1], m[2])), (p.bare = !m[2] && !m[3] && p.min < 10_000)) },
  { re: new RegExp(String.raw`${NUM}${MONEY}\s*(?:üstü|üzeri)`, "i"), kind: "min", apply: (m, p) => void ((p.min = amount(m[1], m[2])), (p.bare = !m[2] && !m[3] && p.min < 10_000)) },
  // orders
  { re: /(ارزان[‌\s]?ترین|ارزونترین|ارزون[‌\s]?ترین|cheapest|lowest\s*price|en\s*ucuz)/i, kind: "sort", apply: (_m, p) => void (p.sort = "cheap") },
  { re: /(گران[‌\s]?ترین|most\s*expensive|priciest|en\s*pahalı)/i, kind: "sort", apply: (_m, p) => void (p.sort = "dear") },
  { re: /(نزدیک[‌\s]?ترین|نزدیک\s*من|nearest|closest|near\s*me|nearby|en\s*yakın|yakınımdaki)/i, kind: "sort", apply: (_m, p) => void (p.sort = "near") },
  { re: /(بهترین|پرامتیاز[‌\s]?ترین|best\s*rated|top\s*rated|best|en\s*iyi)/i, kind: "sort", apply: (_m, p) => void (p.sort = "rating") },
  // discounts
  { re: /(تخفیف[‌\s]?دار|با\s*تخفیف|حراج|on\s*sale|discounted|discount|deals?|indirimli|indirim)/i, kind: "off", apply: (_m, p) => void (p.onlyOff = true) },
];

const TRIP_WORDS: [RegExp, NonNullable<Parsed["trip"]>["kind"]][] = [
  [/(پرواز|هواپیما|بلیط\s*هواپیما|flights?|plane|uçak|uçuş)/i, "flight"],
  [/(قطار|بلیط\s*قطار|train|tren)/i, "train"],
  [/(اتوبوس|bus|otobüs)/i, "bus"],
  [/(هتل|اقامتگاه|ویلا|سوئیت|hotel|stay|villa|otel|konaklama)/i, "hotel"],
  [/(بلیط|بلیت|سفر\s*به|ticket|trip\s*to|travel\s*to|bilet|seyahat)/i, "any"],
];

/** What the player typed, understood. */
export function parseQuery(raw: string): Parsed {
  let s = ` ${asciiDigits(raw)} `;
  const p: Parsed = { words: "", parts: [] };
  for (const r of RULES) {
    if (r.kind === "max" && (p.max || p.min)) continue;
    if (r.kind === "min" && (p.min || p.max)) continue;
    if (r.kind === "sort" && p.sort) continue;
    if (r.kind === "off" && p.onlyOff) continue;
    const m = s.match(r.re);
    if (!m) continue;
    const before = { ...p };
    r.apply(m, p);
    if (JSON.stringify(before) === JSON.stringify({ ...p, parts: before.parts })) continue;
    p.parts.push({ kind: r.kind, text: m[0].trim() });
    s = s.replace(m[0], " ");
  }
  // A trip: a travel word and a city name ("بلیط مشهد", "hotel in Shiraz", "İstanbul otel").
  const tw = TRIP_WORDS.find(([re]) => re.test(s));
  if (tw) {
    const rest = s.replace(tw[0], " ").replace(/\b(to|in|for|at|به|در|برای)\b/gi, " ").trim();
    const city = rest.length >= 2 ? findCities(rest, 1)[0] : undefined;
    if (city) {
      p.trip = { city, kind: tw[1] };
      p.parts.push({ kind: "trip", text: s.match(tw[0])?.[0]?.trim() ?? "" });
    }
  }
  p.words = s.replace(/\s+/g, " ").trim();
  return p;
}

/** In toman a bare "۳۰۰" means 300,000 (how prices are spoken); in lira it means 300. */
export function scaleBare(p: Parsed, lira: boolean): { min?: number; max?: number } {
  const k = p.bare && !lira ? 1000 : 1;
  return { min: p.min ? p.min * k : undefined, max: p.max ? p.max * k : undefined };
}

/** The text without one understood part (the chip's ✕). */
export const withoutPart = (raw: string, text: string) => asciiDigits(raw).replace(text, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- words across languages
/**
 * The same thing in Persian, English and Turkish (and the spellings people use). Not a translator:
 * the words people search shops for most. Each group is one thing; the first Persian word is what
 * Iranian shops are searched with when the player typed it in another language.
 */
export const SAME: string[][] = [
  ["پیتزا", "pizza", "pitza"],
  ["برگر", "همبرگر", "burger", "hamburger"],
  ["کباب", "kebab", "kabab", "kebap"],
  ["جوجه", "جوجه کباب", "chicken kebab", "joojeh", "tavuk şiş"],
  ["مرغ", "chicken", "tavuk"],
  ["ساندویچ", "sandwich", "sandviç"],
  ["قهوه", "coffee", "kahve", "ghahve"],
  ["چای", "tea", "çay", "chai"],
  ["بستنی", "ice cream", "dondurma", "bastani"],
  ["کیک", "cake", "pasta"],
  ["شیرینی", "pastry", "sweets", "tatlı", "shirini"],
  ["نان", "bread", "ekmek", "noon"],
  ["سالاد", "salad", "salata"],
  ["سوشی", "sushi"],
  ["پاستا", "ماکارونی", "pasta", "makarna", "spaghetti"],
  ["سیب زمینی", "fries", "french fries", "patates"],
  ["هات داگ", "hot dog", "sosisli"],
  ["فلافل", "falafel"],
  ["شاورما", "shawarma", "döner", "doner"],
  ["صبحانه", "breakfast", "kahvaltı"],
  ["آبمیوه", "juice", "meyve suyu"],
  ["نوشابه", "soda", "cola", "kola"],
  ["دسر", "dessert", "tatlı"],
  ["سوپ", "soup", "çorba"],
  ["استیک", "steak", "biftek"],
  ["ماهی", "fish", "balık"],
  ["میگو", "shrimp", "karides"],
  ["گوشی", "موبایل", "phone", "mobile", "telefon", "smartphone"],
  ["لپ تاپ", "لپتاپ", "laptop", "notebook", "dizüstü"],
  ["هدفون", "هندزفری", "headphones", "earphones", "kulaklık", "airpods"],
  ["قاب گوشی", "phone case", "kılıf"],
  ["شارژر", "charger", "şarj"],
  ["کفش", "shoes", "ayakkabı", "kafsh"],
  ["کتونی", "sneakers", "spor ayakkabı"],
  ["لباس", "clothes", "giyim"],
  ["پیراهن", "shirt", "gömlek"],
  ["شلوار", "pants", "trousers", "pantolon"],
  ["کیف", "bag", "çanta"],
  ["ساعت", "watch", "saat"],
  ["عینک", "glasses", "gözlük"],
  ["عطر", "perfume", "parfüm"],
  ["کرم", "cream", "krem"],
  ["لوازم آرایش", "makeup", "makyaj"],
  ["کتاب", "book", "kitap"],
  ["اسباب بازی", "toy", "oyuncak"],
  ["گل", "flowers", "çiçek"],
  ["دارو", "medicine", "ilaç"],
  ["میوه", "fruit", "meyve"],
  ["سبزی", "vegetables", "sebze"],
  ["گوشت", "meat", "et"],
  ["شیر", "milk", "süt"],
  ["پنیر", "cheese", "peynir"],
  ["تخم مرغ", "eggs", "yumurta"],
  ["برنج", "rice", "pirinç"],
  ["روغن", "oil", "yağ"],
  ["تلویزیون", "tv", "television", "televizyon"],
  ["یخچال", "fridge", "refrigerator", "buzdolabı"],
  ["دوچرخه", "bicycle", "bike", "bisiklet"],
  ["مبل", "sofa", "couch", "kanepe"],
];
const GROUP_OF = new Map<string, string[]>();
for (const g of SAME) for (const w of g) GROUP_OF.set(normName(w), g);

/** The ways to say what was typed: itself, then the same thing in the other languages (the whole phrase, then word by word). */
export function alternatives(q: string): string[] {
  const n = normName(q);
  if (!n) return [];
  const out = new Set<string>([n]);
  for (const w of GROUP_OF.get(n) ?? []) out.add(normName(w));
  // Word by word ("pizza peperoni" → "پیتزا peperoni").
  const words = n.split(" ");
  if (words.length > 1)
    words.forEach((w, i) => {
      for (const alt of GROUP_OF.get(w) ?? []) out.add(normName([...words.slice(0, i), alt, ...words.slice(i + 1)].join(" ")));
    });
  return [...out].slice(0, 8);
}

/** How Iranian shops should be searched for it: the Persian word when the player wrote it in English or Turkish. */
export function shopQuery(q: string): string {
  const n = normName(q);
  if (/[؀-ۿ]/.test(n)) return q.trim();
  const fa = (GROUP_OF.get(n) ?? []).find((w) => /[؀-ۿ]/.test(w));
  if (fa) return fa;
  const words = n.split(" ").map((w) => (GROUP_OF.get(w) ?? []).find((x) => /[؀-ۿ]/.test(x)) ?? w);
  return words.join(" ");
}

/** Edit distance with transpositions, giving up past `max` (fast enough per word). */
export function typoDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
/** One typo allowed from 4 letters, two from 8: is `w` (typed) a misspelling of some word in `name`? */
export function nearWord(w: string, name: string): boolean {
  if (w.length < 4) return false;
  const max = w.length >= 8 ? 2 : 1;
  return name.split(" ").some((n) => n.length >= 3 && typoDistance(w, n.slice(0, Math.max(n.length, w.length)), max) <= max);
}

export const PART_LABEL: Record<Parsed["parts"][number]["kind"], string> = {
  max: msg("Price cap"),
  min: msg("Lowest price"),
  range: msg("Price range"),
  sort: msg("Order"),
  off: msg("Discounted only"),
  trip: msg("Trip"),
};
