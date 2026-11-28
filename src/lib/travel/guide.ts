// A destination's guide (pure; tests/travelGuide.test.ts) — Kish, and since 2026-11-28 Tehran, Mashhad, Isfahan,
// Shiraz, Tabriz, Yazd and Qeshm with their fun (theme and water parks, cable cars, sleds, bowling): the places a visitor looks for — beaches, sights,
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
export type Guide = { city: string; centre: LatLng; zoom: number; /** Every place is within this far of the centre (km). */ reachKm: number; places: GuidePlace[] };

type Row = [slug: string, kind: GuideKind, fa: string, en: string, lat: number, lng: number, note?: string, act?: string];
const guide = (city: string, centre: LatLng, zoom: number, rows: Row[], reachKm = 15): Guide => ({
  city,
  centre,
  zoom,
  reachKm,
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

// Positions from OpenStreetMap (read 2026-11-28, Overpass); kinds as a visitor looks for them.
const TEHRAN = guide("tehran", { lat: 35.72, lng: 51.39 }, 11, [
  // ---- sights
  ["golestan", "sight", "کاخ گلستان", "Golestan Palace", 35.68044, 51.42061, msg("Qajar palace and gardens — a world heritage site"), "tehran:golestan"],
  ["bazaar", "sight", "بازار بزرگ تهران", "Tehran Grand Bazaar", 35.67169, 51.42319],
  ["national-museum", "sight", "موزه ایران باستان", "National Museum of Iran", 35.68712, 51.41461],
  ["jewels", "sight", "موزه جواهرات ملی", "National Jewellery Museum", 35.69317, 51.41929, msg("Open a few afternoons a week — check before you go")],
  ["milad", "sight", "برج میلاد", "Milad Tower", 35.7447, 51.37527, msg("The city from 280 m — best at sunset"), "tehran:milad"],
  ["azadi", "sight", "برج آزادی", "Azadi Tower", 35.69974, 51.33806],
  ["tabiat", "sight", "پل طبیعت", "Tabiat Bridge", 35.75418, 51.42019, msg("A walk over the highway between two parks, lively at night"), "tehran:tabiat"],
  ["saadabad", "sight", "مجموعه فرهنگی تاریخی سعدآباد", "Sa'dabad Complex", 35.81677, 51.4244],
  ["niavaran", "sight", "کاخ موزه نیاوران", "Niavaran Palace", 35.81179, 51.47329],
  ["contemporary", "sight", "موزه هنرهای معاصر تهران", "Museum of Contemporary Art", 35.71148, 51.3904],
  ["carpet", "sight", "موزه فرش ایران", "Carpet Museum of Iran", 35.71397, 51.3906],
  ["tajrish", "sight", "بازار تجریش", "Tajrish Bazaar", 35.80563, 51.42963],
  // ---- fun
  ["tochal", "fun", "مجموعه تفریحی و ورزشی توچال", "Tochal cable car", 35.81362, 51.39888, msg("Cable car up the mountain; snow from December"), "tehran:tochal"],
  ["sled", "fun", "سورتمه توچال", "Tochal Slope Ride", 35.81981, 51.40604, undefined, "tehran:sled"],
  ["opark", "fun", "پارک آبی اُپارک", "Opark Water Park", 35.72087, 51.23988, undefined, "tehran:waterpark"],
  ["azadegan-water", "fun", "بوستان آبی آزادگان", "Azadegan Water Park", 35.63169, 51.47306],
  ["wonderland", "fun", "سرزمین عجایب", "Wonderland", 35.7485, 51.3309, msg("Indoor theme park — good on a cold or hot day"), "tehran:wonderland"],
  ["1001", "fun", "هزار و یک شهر", "Shahr-e Gheseh theme park", 35.76407, 51.18063],
  ["jurassic", "fun", "بوستان ژوراسیک", "Tehran's Jurassic Park", 35.79011, 51.35237],
  ["milad-bowling", "fun", "بولینگ برج میلاد", "Milad Tower Bowling", 35.747, 51.37248, undefined, "tehran:bowling"],
  ["eram-zoo", "fun", "باغ وحش ارم", "Eram Park Zoo", 35.71885, 51.29349],
  ["birds", "fun", "باغ پرندگان تهران", "Tehran Birds Garden", 35.76907, 51.53022],
  ["bam", "fun", "بام تهران", "Bame Tehran", 35.82178, 51.3997, msg("The city's lights from above — go at night")],
  // ---- shopping
  ["iran-mall", "shop", "بازار بزرگ ایران", "Iran Mall", 35.75375, 51.19267, msg("One of the world's biggest malls — cinemas, food court, a library")],
  ["lotus", "shop", "لوتوس مال", "Lotus Mall", 35.63924, 51.40485],
  ["golestan-mall", "shop", "مرکز خرید گلستان", "Golestan Shopping Center", 35.75339, 51.37467],
  // ---- parks
  ["chitgar", "park", "دریاچه چیتگر", "Chitgar Lake", 35.74617, 51.21214, msg("Bikes to rent round the lake"), "tehran:chitgar"],
  ["botanical", "park", "باغ گیاه‌ شناسی ملی ایران", "National Botanical Garden", 35.73983, 51.17569],
  ["mellat", "park", "بوستان ملت", "Mellat Park", 35.77804, 51.41002],
  ["ab-o-atash", "park", "بوستان آب و آتش", "Water and Fire Park", 35.7547, 51.41862],
  ["jamshidieh", "park", "بوستان جمشیدیه", "Jamshidieh Park", 35.82613, 51.4646],
  ["laleh", "park", "بوستان لاله", "Laleh Park", 35.71144, 51.39317],
  // ---- getting there
  ["mehrabad", "go", "فرودگاه بین المللی مهرآباد تهران", "Mehrabad Airport", 35.68965, 51.30305, msg("Domestic flights")],
  // ---- health
  ["imam", "health", "مجتمع بیمارستانی امام خمینی", "Imam Khomeini Hospital", 35.70783, 51.38069],
  ["shariati", "health", "بیمارستان دکتر شریعتی", "Shariati Hospital", 35.72138, 51.38655],
  ["milad-hospital", "health", "بیمارستان میلاد", "Milad Hospital", 35.74532, 51.38097],
], 25);

const MASHHAD = guide("mashhad", { lat: 36.3, lng: 59.57 }, 12, [
  ["shrine", "sight", "حرم امام رضا", "Imam Reza Shrine", 36.288, 59.61551, msg("Open day and night; chador for women at the gates"), "mashhad:shrine"],
  ["shrine-museums", "sight", "مجموعه موزه های آستان قدس رضوی", "Astan Quds museums", 36.28665, 59.61589],
  ["nader", "sight", "آرامگاه نادرشاه افشار", "Tomb of Nader Shah", 36.29494, 59.6104],
  ["green-dome", "sight", "گنبد سبز", "Green Dome", 36.28617, 59.6027],
  ["khorasan-museum", "sight", "موزه بزرگ خراسان رضوی", "Khorasan Grand Museum", 36.28143, 59.55747],
  ["malekabad", "sight", "موزه کاخ ملک آباد", "Malek Abad Palace", 36.30097, 59.54332],
  ["khooni", "sight", "عمارت باغ خونی", "Bagh-e Khooni", 36.27394, 59.60885],
  // ---- fun
  ["water-waves", "fun", "سرزمین موج های آبی", "Water Waves Land", 36.37581, 59.51924, msg("Men only"), "mashhad:waterpark"],
  ["aftab", "fun", "پارک ساحلی آفتاب", "Aftab beach park", 36.34758, 59.59537],
  ["quantum", "fun", "تم پارک تفریحی کوانتوم", "Quantum Theme Park", 36.2921, 59.50776, undefined, "mashhad:quantum"],
  ["wonderland", "fun", "شهربازی سرزمین عجایب", "Wonderland Amusement Park", 36.34631, 59.59631],
  ["randola", "fun", "راندولا پارک شکلاتی", "Randola Chocolate Park", 36.37058, 59.53459],
  ["koohestan", "fun", "کوهستان پارک شادی", "Koohestan Park-e Shadi", 36.33991, 59.44922],
  ["zoo", "fun", "باغ وحش وکیل آباد", "Vakilabad Zoo", 36.33833, 59.44732, undefined, "mashhad:zoo"],
  // ---- shopping
  ["proma", "shop", "مجتمع تجاری پروما", "Proma Shopping Center", 36.32573, 59.5644],
  ["almas", "shop", "مجتمع تجاری الماس شرق", "Almas-e Shargh", 36.34643, 59.59663],
  ["bazaar-reza", "shop", "بازار رضا", "Bazaar-e Reza", 36.28009, 59.61519, msg("Saffron, barberries and souvenirs near the shrine")],
  // ---- parks
  ["kooh-sangi", "park", "بوستان کوهسنگی", "Kooh Sangi Park", 36.28216, 59.55987, msg("Rocks, a lake and families out in the evening"), "mashhad:koohsangi"],
  ["mellat", "park", "بوستان ملت", "Mellat Park", 36.32092, 59.53744],
  ["melli", "park", "باغ ملی", "Melli Garden", 36.2896, 59.59979],
  // ---- getting there and health
  ["airport", "go", "فرودگاه بین‌المللی شهید هاشمی‌نژاد مشهد", "Mashhad Airport", 36.23381, 59.64214],
  ["ghaem", "health", "بیمارستان قائم", "Ghaem Hospital", 36.29151, 59.58272],
  ["sina", "health", "بیمارستان سینا", "Sina Hospital", 36.28148, 59.59974],
]);

const ISFAHAN = guide("isfahan", { lat: 32.65, lng: 51.67 }, 13, [
  ["lotfollah", "sight", "مسجد شیخ لطف الله", "Sheikh Lotfollah Mosque", 32.6574, 51.67869, msg("On Naqsh-e Jahan square, with Ali Qapu and the Imam mosque"), "isfahan:naqsh"],
  ["ali-qapu", "sight", "کاخ عالی قاپو", "Ali Qapu Palace", 32.6571, 51.67657],
  ["chehel-sotoun", "sight", "چهل ستون", "Chehel Sotoun Palace", 32.65739, 51.67177, undefined, "isfahan:chehel"],
  ["hasht-behesht", "sight", "کاخ هشت بهشت", "Hasht Behesht Palace", 32.65333, 51.67013],
  ["jameh", "sight", "مسجد جامع اصفهان", "Jameh Mosque of Isfahan", 32.66969, 51.68512],
  ["si-o-se", "sight", "سی و سه پل", "Si-o-se-pol Bridge", 32.64459, 51.66751, msg("Walk it after dark, when the arches light up"), "isfahan:bridges"],
  ["khaju", "sight", "پل خواجو", "Khaju Bridge", 32.63681, 51.68331],
  ["vank", "sight", "کلیسای وانک", "Vank Cathedral", 32.63503, 51.65581, undefined, "isfahan:vank"],
  ["menar", "sight", "منارجنبان", "Menar Jonban", 32.65046, 51.59411, msg("The shaking minarets")],
  ["atashgah", "sight", "کوه آتشگاه", "Fire Temple of Isfahan", 32.6486, 51.57071],
  ["grand-bazaar", "sight", "بازار بزرگ", "Grand Bazaar", 32.6658, 51.67445, undefined, "isfahan:bazaar"],
  // ---- fun
  ["soffeh-cable", "fun", "تله کابین صفه", "Soffeh Cable Car", 32.59164, 51.65649, msg("Cable car, zip-line and bowling on Soffeh mountain"), "isfahan:soffeh"],
  ["soffeh-zip", "fun", "زیپ لاین صفه", "Soffeh Zip-line", 32.59222, 51.63915],
  ["soffeh-park", "fun", "شهربازی صفه", "Soffeh Amusement Park", 32.59231, 51.65616],
  ["aquarium", "fun", "آکواریوم اصفهان", "Isfahan Aquarium", 32.63771, 51.61224, undefined, "isfahan:nazhvan"],
  ["nazhvan", "fun", "شهربازی ناژوان", "Nazhvan Amusement Park", 32.63584, 51.62233],
  ["birds", "fun", "باغ پرندگان", "Birds Garden", 32.64067, 51.60974],
  ["dreamland", "fun", "شهر رویاها", "Dream Land", 32.63623, 51.79097],
  ["phoenix", "fun", "مجموعه تفریحی و بولینگ فونیکس", "Phoenix bowling club", 32.6221, 51.65664],
  ["zurkhaneh", "fun", "زورخانه علیقلی آقا", "Ali Qoli Agha Zurkhaneh", 32.66917, 51.66758, msg("Watch the traditional strength training"), "isfahan:zurkhaneh"],
  // ---- shopping
  ["city-center", "shop", "سیتی سنتر اصفهان", "Isfahan City Center", 32.55203, 51.69013],
  ["honar", "shop", "بازار هنر", "Honar Bazaar", 32.65221, 51.66999],
  // ---- getting there and health
  ["airport", "go", "فرودگاه بین‌المللی شهید بهشتی اصفهان", "Isfahan Airport", 32.76276, 51.87409],
  ["isa", "health", "بیمارستان عیسی بن مریم", "Isa ibn Maryam Hospital", 32.64944, 51.66542],
], 25);

const SHIRAZ = guide("shiraz", { lat: 29.615, lng: 52.54 }, 13, [
  ["nasir", "sight", "مسجد نصیرالملک", "Nasir al-Mulk Mosque", 29.60851, 52.5485, msg("Come at sunrise for the coloured light"), "shiraz:pink"],
  ["karim-khan", "sight", "ارگ کریم خان", "Karim Khan Citadel", 29.61761, 52.54471],
  ["vakil-bazaar", "sight", "اردو بازار", "Vakil Bazaar", 29.6122, 52.54594],
  ["vakil-mosque", "sight", "مسجد وکیل", "Vakil Mosque", 29.61426, 52.54537],
  ["qavam", "sight", "باغ نارنجستان قوام", "Naranjestan-e Qavam", 29.60788, 52.55262, undefined, "shiraz:qavam"],
  ["hafez", "sight", "آرامگاه حافظ", "Tomb of Hafez", 29.62577, 52.5585, msg("Busiest and nicest in the evening"), "shiraz:hafez"],
  ["saadi", "sight", "سعدیه", "Tomb of Saadi", 29.62228, 52.5827],
  ["quran-gate", "sight", "دروازه قرآن", "Quran Gate", 29.63558, 52.56193],
  ["afifabad", "sight", "باغ عفیف‌آباد", "Afifabad Garden", 29.62216, 52.4985, undefined, "shiraz:afif"],
  ["jahan-nama", "sight", "باغ جهان نما", "Jahan Nama Garden", 29.62884, 52.55854],
  ["delgosha", "sight", "باغ دلگشا", "Delgosha Garden", 29.61939, 52.57487],
  ["pars-museum", "sight", "موزه پارس", "Pars Museum", 29.61595, 52.54502],
  // ---- fun
  ["luna", "fun", "لونا پارک", "Luna Park", 29.63483, 52.55797],
  ["alibaba-water", "fun", "مجموعه تفریحی آبی علی بابا شیراز", "Alibaba water park", 29.63403, 52.55829, undefined, "shiraz:waterpark"],
  ["derak", "fun", "پارک کوهستانی دراک", "Derak Highlands Park", 29.70509, 52.41057, msg("Hiking trails above the city"), "shiraz:derak"],
  ["ghahr-ashti", "fun", "کوچه قهر و آشتی", "Ghahr-o-Ashti Alley", 29.60297, 52.5536, msg("The narrowest alley in the old town")],
  // ---- parks
  ["khold", "park", "بوستان خلدبرین", "Khold-e Barin Park", 29.62374, 52.51313],
  ["azadi", "park", "پارک آزادی", "Azadi Park", 29.62947, 52.53952],
  // ---- getting there and health
  ["airport", "go", "فرودگاه بین‌المللی شهید دستغیب شیراز", "Shiraz Airport", 29.54154, 52.5876],
  ["namazi", "health", "بیمارستان نمازی", "Namazi Hospital", 29.63105, 52.51666],
  ["chamran", "health", "بیمارستان چمران", "Chamran Hospital", 29.66248, 52.49014],
], 20);

const TABRIZ = guide("tabriz", { lat: 38.07, lng: 46.3 }, 12, [
  ["bazaar", "sight", "بازار تبریز", "Tabriz Bazaar", 38.07617, 46.29781, msg("The biggest covered bazaar in the world — a world heritage site"), "tabriz:bazaar"],
  ["arg", "sight", "ارگ علیشاه", "Arg-e Alishah", 38.07245, 46.28887],
  ["azerbaijan-museum", "sight", "موزه آذربایجان", "Azerbaijan Museum", 38.07358, 46.30004, undefined, "tabriz:museum"],
  ["constitution", "sight", "خانه مشروطه", "Constitution House", 38.08171, 46.28867],
  ["poets", "sight", "مقبرة الشعرا", "Poets' Tomb", 38.08343, 46.30343],
  ["shahriar", "sight", "موزه شهریار", "Shahriar House Museum", 38.06971, 46.29529],
  ["municipality", "sight", "کاخ موزه شهرداری", "Municipality Palace", 38.07359, 46.2954],
  ["rabe-rashidi", "sight", "ربع رشیدی", "Rab'-e Rashidi", 38.07969, 46.33006, msg("Ruins on the hill with a view over the city")],
  // ---- fun
  ["el-goli", "fun", "ائل گؤلی", "El Goli", 38.02304, 46.36884, msg("A lake with a palace in it — the city's evening walk"), "tabriz:elgoli"],
  ["sled", "fun", "سورتمه سواری", "Tabriz Sledding", 38.01238, 46.37369, undefined, "tabriz:sled"],
  ["luna", "fun", "شهربازی لونا پارک", "Luna amusement park", 38.02409, 46.36383],
  ["baghlar", "fun", "باغلار باغی", "Baghlar Baghi", 38.06226, 46.34546],
  ["miniature", "fun", "پارک مینیاتور", "Miniature Park", 38.06592, 46.33452],
  // ---- shopping, parks, getting there, health
  ["laleh", "shop", "لاله پارک", "Laleh Park mall", 38.07249, 46.36883],
  ["golestan", "park", "باغ گلستان", "Golestan Garden", 38.07684, 46.28065],
  ["airport", "go", "فرودگاه بین‌المللی شهید مدنی تبریز", "Tabriz Airport", 38.13534, 46.23517],
  ["valiasr", "health", "بیمارستان ولیعصر تبریز", "Valiasr Hospital", 38.05224, 46.34249],
]);

const YAZD = guide("yazd", { lat: 31.895, lng: 54.365 }, 14, [
  ["jameh", "sight", "مسجد جامع یزد", "Jameh Mosque of Yazd", 31.90144, 54.36854, msg("The tallest portal in Iran; the old town starts here"), "yazd:old"],
  ["amir-chakhmaq", "sight", "میدان امیرچخماق", "Amir Chakhmaq Complex", 31.89386, 54.36942, msg("Lit up at night")],
  ["dowlatabad", "sight", "باغ دولت آباد", "Dowlatabad Garden", 31.90278, 54.35184, msg("The tallest windcatcher in the world"), "yazd:dowlat"],
  ["fire-temple", "sight", "آتشکده زرتشتیان", "Zoroastrian Fire Temple", 31.88114, 54.37331, undefined, "yazd:fire"],
  ["silence", "sight", "دخمه زرتشتیان", "Towers of Silence", 31.82296, 54.35485, msg("Climb up at sunset"), "yazd:silence"],
  ["alexander", "sight", "زندان اسکندر", "Alexander's Prison", 31.9052, 54.37062],
  ["water-museum", "sight", "موزه آب", "Water Museum", 31.895, 54.36843, msg("How the desert city got its water — the qanats")],
  ["lariha", "sight", "خانه لاری‌ها", "Lariha House", 31.90648, 54.36985],
  ["markar", "sight", "ساعت مارکار", "Markar Clock Tower", 31.88381, 54.3683],
  ["mirza-reza", "sight", "حمام عمومی میرزا رضا", "Mirza Reza Bath", 31.90286, 54.37041],
  // ---- fun
  ["paraglide", "fun", "پرواز تفریحی پاراگلایدر", "Tandem paragliding", 31.89977, 54.37085, undefined, "yazd:paraglide"],
  ["zurkhaneh", "fun", "زورخانه فهادان", "Fahadan Zurkhaneh", 31.90531, 54.37117],
  ["escape", "fun", "مجموعه اتاق فرار دارمیان", "Darmian escape rooms", 31.88347, 54.31539, undefined, "yazd:escape"],
  ["rooftops", "fun", "پله به پشت بام", "Stairs to the roof", 31.89658, 54.36879, msg("Windcatchers and domes from the rooftops")],
  ["dolls", "fun", "خانه عروسک ها", "Doll's House", 31.89993, 54.3695],
  // ---- getting there
  ["airport", "go", "فرودگاه بین المللی شهید صدوقی یزد", "Yazd Airport", 31.90143, 54.28107],
]);

const QESHM = guide("qeshm", { lat: 26.8, lng: 55.85 }, 10, [
  ["hara", "fun", "جنگل های حرا", "Hara mangrove forest", 26.8227, 55.80346, msg("Go by boat at high tide"), "qeshm:hara"],
  ["stars", "sight", "دره ستارگان", "Valley of the Stars", 26.87023, 56.12363, undefined, "qeshm:stars"],
  ["chahkooh", "sight", "چاه‌کوه", "Chahkooh Canyon", 26.68893, 55.53592, undefined, "qeshm:chahkooh"],
  ["namakdan", "sight", "غار نمکدان", "Namakdan salt cave", 26.61224, 55.51316, msg("One of the longest salt caves in the world"), "qeshm:namakdan"],
  ["tandis", "sight", "دره تندیس", "Valley of Statues", 26.73805, 55.6986],
  ["shour", "sight", "دره شور", "Darre Shour valley", 26.66596, 55.57905],
  ["kharbas", "sight", "غارهای تاریخی خربس", "Kharbas caves", 26.91466, 56.17082, undefined, "qeshm:kharbas"],
  ["portuguese", "sight", "قلعه پرتقالی‌ها قشم", "Portuguese Castle", 26.96038, 56.27737, undefined, "qeshm:portuguese"],
  ["lenj", "sight", "سرگردان لنج", "Stranded lenj boat", 26.98106, 55.64087],
  ["tella", "sight", "چاه های تاریخی", "Tella historic wells", 26.89428, 55.76219],
  ["saye-khosh", "sight", "کلوت های سایه خوش", "Saye Khosh kaluts", 26.84082, 55.35623, msg("Wind-carved rocks — come for the sunset")],
  ["qazi", "sight", "دیواره قاضی", "Qazi Wall", 26.60097, 55.38338],
  // ---- sea
  ["golden-beach", "beach", "ساحل طلایی", "Golden beach diving", 26.90673, 56.16713, msg("Water sports and diving"), "qeshm:dive"],
  ["mardu", "fun", "تورهای قایق جنگل حرا جزیره مردو", "Mardu mangrove boat tours", 26.98039, 55.63928],
  // ---- getting there
  ["airport", "go", "فرودگاه بین‌المللی قشم", "Qeshm Airport", 26.75409, 55.90199],
], 60);

export const GUIDES: Record<string, Guide> = { kish: KISH, tehran: TEHRAN, mashhad: MASHHAD, isfahan: ISFAHAN, shiraz: SHIRAZ, tabriz: TABRIZ, yazd: YAZD, qeshm: QESHM };

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
