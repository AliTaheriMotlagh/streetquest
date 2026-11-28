// A destination's guide (pure; tests/travelGuide.test.ts): the places a visitor looks for — beaches, sights,
// fun, malls, parks, how to get there and around, hospitals — each at its real spot, for the trip planner's
// guide map (Travel.tsx GuideView). From there "See on the map" opens the game's map in explore mode at the
// place, where the store layers (Snappfood, Torob, Divar) and every mapped shop and café load around it.
// Positions and Persian names are OpenStreetMap's (© OpenStreetMap contributors, ODbL; read 2026-11-28).
import { msg } from "../i18n";
import { distanceM, type LatLng } from "../geo";

export type GuideKind = "beach" | "sight" | "fun" | "shop" | "park" | "go" | "health";
export const GUIDE_KINDS: Record<GuideKind, { emoji: string; label: string; color: string }> = {
  beach: { emoji: "🏖️", label: msg("Beaches"), color: "#2bb3c0" },
  sight: { emoji: "🏛️", label: msg("Sights"), color: "#d9a441" },
  fun: { emoji: "🎢", label: msg("Fun"), color: "#e0568a" },
  shop: { emoji: "🛍️", label: msg("Shopping"), color: "#8a6be0" },
  park: { emoji: "🌴", label: msg("Parks"), color: "#4caf6a" },
  go: { emoji: "⛴️", label: msg("Getting there"), color: "#5f8de0" },
  health: { emoji: "🏥", label: msg("Hospitals"), color: "#e05a4c" },
};
export const GUIDE_KIND_KEYS = Object.keys(GUIDE_KINDS) as [GuideKind, ...GuideKind[]];

export type GuidePlace = {
  /** `<city>:<slug>`, unique. */
  id: string;
  city: string;
  kind: GuideKind;
  fa: string;
  en: string;
  lat: number;
  lng: number;
  /** One line worth knowing (English, translated with t()). */
  note?: string;
  /** The outing in lib/travel/activities.ts it is, to add to the trip. */
  act?: string;
};
export type Guide = { city: string; centre: LatLng; zoom: number; places: GuidePlace[] };

type Row = [slug: string, kind: GuideKind, fa: string, en: string, lat: number, lng: number, note?: string, act?: string];
const guide = (city: string, centre: LatLng, zoom: number, rows: Row[]): Guide => ({
  city,
  centre,
  zoom,
  places: rows.map(([slug, kind, fa, en, lat, lng, note, act]) => ({ id: `${city}:${slug}`, city, kind, fa, en, lat, lng, ...(note ? { note } : {}), ...(act ? { act } : {}) })),
});

const KISH = guide("kish", { lat: 26.535, lng: 53.975 }, 12, [
  // ---- beaches
  ["coral-beach", "beach", "ساحل مرجان", "Coral Beach", 26.52656, 54.0394, msg("Clear water over coral — the best snorkelling"), "kish:coral"],
  ["simorgh-beach", "beach", "ساحل سیمرغ", "Simorgh Beach", 26.51587, 54.04804],
  ["marina-beach", "beach", "ساحل مارینا", "Marina Beach", 26.52207, 54.04624],
  ["maryam-beach", "beach", "ساحل مریم", "Maryam Beach", 26.55553, 54.02329],
  ["mens-beach", "beach", "پلاژ آقایان", "Men's beach", 26.53781, 54.02738, msg("Men only — water sports and swimming")],
  ["womens-beach", "beach", "پلاژ بانوان", "Women's beach", 26.5625, 54.0189, msg("Women only — closed to men and cameras")],
  // ---- sights
  ["greek-ship", "sight", "کشتی یونانی", "Greek Ship", 26.52614, 53.90812, msg("Come for the sunset"), "kish:greek"],
  ["kariz", "sight", "شهر زیرزمینی کاریز", "Kariz Underground City", 26.55657, 53.96872, msg("Cool underground tunnels, cafés and shops"), "kish:kariz"],
  ["harireh", "sight", "شهر تاریخی حریره", "Harireh Old City", 26.56689, 53.97408, msg("Ruins of the island's medieval town"), "kish:harireh"],
  ["banyan", "sight", "درخت انجیر معابد", "Sacred fig tree", 26.56482, 53.97343, msg("A huge old banyan near Harireh")],
  ["baghu", "sight", "روستای گردشگری باغو", "Baghu village", 26.52482, 53.92674, msg("An old fishing village by the Greek ship")],
  ["farah-palace", "sight", "کاخ فرح", "Farah Palace", 26.52624, 54.03886],
  ["ethnology", "sight", "خانه مردم‌شناسی بومیان کیش", "Kish ethnology house", 26.57094, 53.94258],
  ["windcatcher", "sight", "مجموعه تک‌بادگیر تاریخی کیش", "Historic windcatcher house", 26.57179, 53.95322],
  // ---- fun
  ["dolphins", "fun", "پارک دلفین‌ها و باغ پرندگان", "Dolphin Park & Bird Garden", 26.50607, 54.03584, undefined, "kish:dolphin"],
  ["aquarium", "fun", "آکواریوم کیش", "Kish Aquarium", 26.50511, 54.039],
  ["ocean-park", "fun", "پارک آبی اوشن", "Ocean Water Park", 26.49723, 53.98102, msg("Slides and pools by the sea"), "kish:waterpark"],
  ["snow-park", "fun", "پارک برفی پنگوئن", "Penguin Snow Park", 26.55088, 54.01524, msg("Real snow indoors — bring something warm"), "kish:snow"],
  ["cable-car", "fun", "تله‌کابین میکا", "Mica cable car", 26.54741, 54.02267, undefined, "kish:cable"],
  ["cable-ski", "fun", "پارک کیبل اسکی", "Cable ski park", 26.54304, 54.02465, undefined, "kish:cable"],
  ["gyrocopter", "fun", "جایروکوپتر", "Gyrocopter flights", 26.54902, 53.98067],
  ["safari", "fun", "پارس سافاری کیش", "Pars Safari", 26.54589, 53.95696, undefined, "kish:safari"],
  ["cruise", "fun", "کشتی تفریحی رویای دریا", "Royaye Darya cruise ship", 26.56541, 54.00005, msg("Evening cruises with dinner and music"), "kish:cruise"],
  ["highland", "fun", "شهربازی هایلند", "Highland funfair", 26.54072, 54.01312],
  ["iran-ship", "fun", "مجتمع تفریحی کشتی ایران", "Iran Ship fun centre", 26.54831, 54.02108],
  ["mica-cinema", "fun", "پردیس سینمایی میکا", "Mica cinema", 26.53743, 54.02447],
  // ---- shopping
  ["pardis-1", "shop", "مرکز خرید پردیس یک", "Pardis 1 Shopping Center", 26.53669, 54.02131],
  ["pardis-2", "shop", "مرکز خرید پردیس دو", "Pardis 2 Shopping Center", 26.53612, 54.02024],
  ["kish-mall", "shop", "مرکز خرید کیش", "Kish Mall", 26.53458, 54.01892],
  ["mica-mall", "shop", "مرکز خرید میکا", "Mica Mall", 26.53702, 54.02445],
  ["marjan-mall", "shop", "مرکز خرید مرجان", "Marjan Shopping Center", 26.52589, 54.03822],
  ["zeytoon", "shop", "مرکز خرید زیتون", "Zeytoon Shopping Center", 26.544, 54.0184],
  ["damoon", "shop", "مرکز خرید دامون", "Damoon Shopping Center", 26.56213, 53.98711],
  ["maryam-mall", "shop", "مرکز خرید مریم", "Maryam Mall", 26.55249, 54.01944],
  ["venus", "shop", "مرکز خرید ونوس", "Venus Mall", 26.5494, 54.02005],
  ["trade-center", "shop", "مرکز تجاری کیش", "Kish Trade Center", 26.54189, 54.0191],
  ["paniz", "shop", "مرکز خرید پانیذ", "Paniz Mall", 26.53939, 54.01977],
  ["morvarid", "shop", "بازار مروارید", "Morvarid Mall", 26.54294, 54.01034],
  ["sarina", "shop", "سارینا مال", "Sarina Mall", 26.54282, 54.01225],
  ["roya", "shop", "رویا مال", "Roya Mall", 26.53779, 54.01757],
  ["hormoz", "shop", "بازار هرمز", "Hormoz Mall", 26.55357, 53.97866],
  ["pars-khalij", "shop", "بازار پارس خلیج", "Pars Khalij Mall", 26.56759, 53.95271],
  ["arab-bazaar", "shop", "بازار عرب‌ها", "Arab Bazaar", 26.57283, 53.94978, msg("The old market in Safein, the island's town")],
  // ---- parks
  ["mir-mohanna", "park", "بوستان میرمهنا", "Mir Mohanna Park", 26.57366, 53.95185],
  ["simorgh-park", "park", "پارک ساحلی سیمرغ", "Simorgh Coastal Park", 26.51612, 54.04789],
  ["marjan-park", "park", "بوستان ساحلی مرجان", "Marjan Coastal Park", 26.5264, 54.03929],
  ["niloufar", "park", "بوستان ساحلی نیلوفر", "Niloufar Coastal Park", 26.50771, 54.04375],
  ["tolou", "park", "پارک ساحلی طلوع", "Tolou Coastal Park", 26.50228, 54.0357, msg("Watch the sunrise over the sea")],
  ["hendourabi", "park", "پارک ساحلی هندورابی", "Hendourabi Coastal Park", 26.51507, 53.92391],
  ["hour", "park", "بوستان ساحلی هور", "Hour Coastal Park", 26.53845, 53.90457],
  ["sunset-palms", "park", "باغ نخل غروب", "Sunset Palm Garden", 26.52131, 53.92159],
  // ---- getting there and around
  ["airport", "go", "فرودگاه بین‌المللی کیش", "Kish International Airport", 26.53005, 53.98258],
  ["sea-terminal", "go", "پایانه مسافربری دریایی", "Passenger sea terminal", 26.56376, 53.99702, msg("Ferries to and from the mainland")],
  ["car-ferry", "go", "اسکله ورودی و خروجی خودرو", "Car ferry quay", 26.56257, 54.01262, msg("Where cars come on and off the island")],
  // ---- health
  ["hospital", "health", "بیمارستان کیش", "Kish Hospital", 26.55963, 53.98542],
  ["intl-hospital", "health", "بیمارستان بین‌المللی کیش", "Kish International Hospital", 26.50456, 53.95693],
  ["red-crescent", "health", "هلال احمر", "Red Crescent", 26.54062, 54.01001],
]);

export const GUIDES: Record<string, Guide> = { kish: KISH };

export const guideOf = (city: string): Guide | null => GUIDES[city] ?? null;
export const hasGuide = (city: string) => city in GUIDES;

/** A guide's places of one kind (all of them for "all"), nearest to `at` first when given. */
export function guidePlaces(city: string, kind: GuideKind | "all" = "all", at?: LatLng | null): GuidePlace[] {
  const list = (guideOf(city)?.places ?? []).filter((p) => kind === "all" || p.kind === kind);
  return at ? list.map((p) => ({ p, d: distanceM(at, p) })).sort((a, b) => a.d - b.d).map((x) => x.p) : list;
}

/** How many places of each kind a guide has (kinds it lacks left out), in GUIDE_KINDS order. */
export function guideCounts(city: string): { kind: GuideKind; n: number }[] {
  const places = guideOf(city)?.places ?? [];
  return GUIDE_KIND_KEYS.map((kind) => ({ kind, n: places.filter((p) => p.kind === kind).length })).filter((x) => x.n > 0);
}

/** A guide place's name in the reader's language (Persian, else English). */
export const guideName = (p: GuidePlace, locale: string) => (locale === "fa" ? p.fa : p.en);
