// Things to do where you're going (pure; tests/travelPlan.test.ts): the well-known outings of the
// popular destinations — diving off Qeshm, the Greek ship at sunset on Kish, Persepolis from
// Shiraz — each with a rough price a person (toman) so the trip planner can count it in the
// budget. The prices are estimates to plan with, not offers: every one can be changed in the
// planner, and the "find it" link searches for who runs it now.
import { msg } from "../i18n";

export type ActKind = "sea" | "nature" | "history" | "adventure" | "food" | "city";
export const ACT_KINDS: Record<ActKind, { emoji: string; label: string }> = {
  sea: { emoji: "🌊", label: msg("Sea") },
  nature: { emoji: "🌿", label: msg("Nature") },
  history: { emoji: "🏛️", label: msg("History") },
  adventure: { emoji: "🧗", label: msg("Adventure") },
  food: { emoji: "🍲", label: msg("Food") },
  city: { emoji: "🏙️", label: msg("City") },
};

export type Activity = {
  id: string;
  city: string;
  emoji: string;
  title: string;
  kind: ActKind;
  /** A rough price a person (toman); 0 = free. */
  price: number;
  /** About how long it takes (hours). */
  hours: number;
  /** What to search for to find who runs it (Persian). */
  q: string;
};

const A = (city: string, id: string, emoji: string, title: string, kind: ActKind, price: number, hours: number, q: string): Activity => ({ id: `${city}:${id}`, city, emoji, title, kind, price, hours, q });

export const ACTIVITIES: Activity[] = [
  A("qeshm", "dive", "🤿", msg("Scuba diving"), "sea", 3_500_000, 3, "غواصی قشم"),
  A("qeshm", "hara", "🛶", msg("Boat through the Hara mangrove forest"), "nature", 600_000, 2, "قایق سواری جنگل حرا قشم"),
  A("qeshm", "chahkooh", "🏜️", msg("Chahkooh canyon"), "nature", 150_000, 2, "دره چاهکوه قشم"),
  A("qeshm", "stars", "✨", msg("Valley of the Stars"), "nature", 150_000, 1.5, "دره ستاره ها قشم"),
  A("qeshm", "hengam", "🐬", msg("Hengam island and the dolphins"), "sea", 1_200_000, 4, "تور جزیره هنگام دلفین"),
  A("qeshm", "tour", "🚙", msg("Day tour of the island"), "nature", 1_500_000, 8, "تور یک روزه قشم"),
  A("kish", "dive", "🤿", msg("Scuba diving"), "sea", 3_000_000, 2, "غواصی کیش"),
  A("kish", "para", "🪂", msg("Parasailing"), "adventure", 2_000_000, 1, "پاراسل کیش"),
  A("kish", "jetski", "🚤", msg("Jet ski"), "sea", 1_500_000, 0.5, "جت اسکی کیش"),
  A("kish", "greek", "🚢", msg("Sunset at the Greek ship"), "sea", 0, 1.5, "کشتی یونانی کیش"),
  A("kish", "dolphin", "🐬", msg("Dolphin park"), "sea", 700_000, 2, "پارک دلفین های کیش"),
  A("kish", "kariz", "🕳️", msg("Kariz underground city"), "history", 300_000, 1.5, "شهر زیرزمینی کاریز کیش"),
  A("kish", "harireh", "🏚️", msg("Harireh old city"), "history", 0, 1, "شهر تاریخی حریره کیش"),
  A("kish", "coral", "🐠", msg("Snorkelling at Coral Beach"), "sea", 500_000, 2, "اسنورکل ساحل مرجان کیش"),
  A("kish", "cruise", "🛳️", msg("Dinner cruise"), "sea", 2_000_000, 3, "کشتی تفریحی شام کیش"),
  A("kish", "waterpark", "🌊", msg("Ocean water park"), "adventure", 1_500_000, 4, "پارک آبی اوشن کیش"),
  A("kish", "snow", "❄️", msg("Penguin snow park"), "adventure", 1_000_000, 2, "پارک برفی پنگوئن کیش"),
  A("kish", "cable", "🚡", msg("Cable car and cable ski"), "adventure", 800_000, 1, "تله کابین میکا کیش"),
  A("kish", "safari", "🦁", msg("Pars Safari"), "nature", 600_000, 2, "پارس سافاری کیش"),
  A("kish", "bike", "🚲", msg("Cycling round the island"), "nature", 300_000, 3, "اجاره دوچرخه کیش"),
  A("isfahan", "naqsh", "🕌", msg("Naqsh-e Jahan square, Ali Qapu and the mosques"), "history", 400_000, 4, "میدان نقش جهان بلیت"),
  A("isfahan", "chehel", "🏛️", msg("Chehel Sotoun palace"), "history", 150_000, 1.5, "کاخ چهلستون اصفهان"),
  A("isfahan", "vank", "⛪", msg("Vank cathedral and Jolfa"), "history", 150_000, 2, "کلیسای وانک"),
  A("isfahan", "bridges", "🌉", msg("Evening walk on Si-o-se-pol and Khaju"), "city", 0, 2, "سی و سه پل"),
  A("isfahan", "bazaar", "🛍️", msg("The grand bazaar"), "food", 0, 2, "بازار اصفهان"),
  A("shiraz", "persepolis", "🏛️", msg("Persepolis and Naqsh-e Rostam"), "history", 900_000, 6, "تور تخت جمشید"),
  A("shiraz", "pink", "🌈", msg("Nasir al-Mulk (the pink mosque) at sunrise"), "history", 200_000, 1, "مسجد نصیرالملک"),
  A("shiraz", "eram", "🌳", msg("Eram garden"), "nature", 150_000, 1.5, "باغ ارم شیراز"),
  A("shiraz", "hafez", "📜", msg("Hafez's tomb at night"), "history", 100_000, 1, "حافظیه"),
  A("yazd", "desert", "🐪", msg("Desert night: camels and stars"), "adventure", 2_500_000, 10, "تور کویر یزد"),
  A("yazd", "old", "🏘️", msg("Old town, windcatchers and rooftops"), "history", 0, 3, "بافت تاریخی یزد"),
  A("yazd", "dowlat", "🌬️", msg("Dowlatabad garden"), "history", 150_000, 1, "باغ دولت آباد یزد"),
  A("yazd", "fire", "🔥", msg("The Zoroastrian fire temple"), "history", 100_000, 1, "آتشکده یزد"),
  A("mashhad", "shrine", "🕌", msg("The holy shrine"), "history", 0, 3, "حرم امام رضا"),
  A("mashhad", "tus", "📜", msg("Tus and Ferdowsi's tomb"), "history", 200_000, 3, "آرامگاه فردوسی"),
  A("mashhad", "torghabeh", "🍢", msg("Dinner up in Torghabeh or Shandiz"), "food", 800_000, 3, "طرقبه شاندیز"),
  A("tabriz", "bazaar", "🛍️", msg("The covered bazaar"), "history", 0, 3, "بازار تبریز"),
  A("tabriz", "kandovan", "🏔️", msg("Kandovan cave village"), "nature", 1_200_000, 6, "تور کندوان"),
  A("tabriz", "elgoli", "🌊", msg("Evening at El Goli"), "city", 0, 2, "ائل گلی"),
  A("tehran", "tochal", "🚡", msg("Tochal cable car"), "nature", 700_000, 4, "تله کابین توچال"),
  A("tehran", "milad", "🗼", msg("Milad tower"), "city", 500_000, 2, "برج میلاد بلیت"),
  A("tehran", "golestan", "🏛️", msg("Golestan palace"), "history", 300_000, 2.5, "کاخ گلستان"),
  A("tehran", "darband", "🥾", msg("Darband walk and tea"), "food", 300_000, 3, "دربند"),
  A("rasht", "masuleh", "🏔️", msg("Masuleh village"), "nature", 1_000_000, 6, "تور ماسوله"),
  A("rasht", "food", "🍲", msg("Gilan food tour"), "food", 600_000, 3, "غذاهای گیلانی رشت"),
  A("rasht", "anzali", "🛶", msg("Boat on the Anzali lagoon"), "nature", 500_000, 1.5, "قایق سواری تالاب انزلی"),
  A("kerman", "kaluts", "🏜️", msg("The Kaluts of Shahdad"), "adventure", 2_000_000, 10, "تور کلوت شهداد"),
  A("kerman", "shazdeh", "🌳", msg("Shazdeh garden, Mahan"), "history", 200_000, 2, "باغ شاهزاده ماهان"),
  A("kerman", "ganjali", "🛁", msg("Ganjali Khan bath and bazaar"), "history", 150_000, 2, "مجموعه گنجعلی خان"),
  A("bandar-abbas", "hormuz", "🌈", msg("Hormuz, the rainbow island"), "nature", 1_000_000, 8, "تور جزیره هرمز"),
  A("bandar-abbas", "fish", "🐟", msg("The fish market and the sea front"), "food", 300_000, 2, "بازار ماهی بندرعباس"),
  A("kashan", "fin", "⛲", msg("Fin garden"), "history", 200_000, 1.5, "باغ فین کاشان"),
  A("kashan", "houses", "🏠", msg("The old houses (Tabatabaei, Boroujerdi)"), "history", 250_000, 2.5, "خانه طباطبایی ها"),
  A("kashan", "maranjab", "🐪", msg("Maranjab desert"), "adventure", 1_800_000, 8, "تور کویر مرنجاب"),
  A("hamedan", "alisadr", "🛶", msg("Boat in the Ali-Sadr cave"), "nature", 600_000, 3, "غار علیصدر"),
  A("hamedan", "ganjnameh", "🏞️", msg("Ganjnameh and the waterfall"), "nature", 0, 2, "گنجنامه"),
  A("ramsar", "telecabin", "🚡", msg("Ramsar cable car"), "nature", 400_000, 2, "تله کابین رامسر"),
  A("chabahar", "mars", "🪐", msg("The Martian mountains"), "nature", 800_000, 4, "کوه های مریخی چابهار"),
  A("chabahar", "beach", "🏖️", msg("Darak beach at sunset"), "sea", 0, 2, "ساحل درک چابهار"),
  A("ardabil", "sarein", "♨️", msg("Sarein hot springs"), "nature", 300_000, 3, "آبگرم سرعین"),
  // Fun in the big cities (2026-11-28): theme and water parks, cable cars, sleds, bowling — each on its city's
  // guide map (lib/travel/guide.ts). Rough 1405 prices a person.
  A("tehran", "tabiat", "🌉", msg("Evening on Tabiat bridge"), "city", 0, 2, "پل طبیعت"),
  A("tehran", "sled", "🛷", msg("Mountain sled ride"), "adventure", 400_000, 1, "سورتمه توچال"),
  A("tehran", "waterpark", "🌊", msg("Water park"), "adventure", 900_000, 4, "پارک آبی تهران"),
  A("tehran", "wonderland", "🎢", msg("Indoor theme park"), "city", 700_000, 3, "سرزمین عجایب تهران"),
  A("tehran", "bowling", "🎳", msg("Bowling"), "city", 350_000, 1.5, "بولینگ برج میلاد"),
  A("tehran", "chitgar", "🚲", msg("Bike round Chitgar lake"), "nature", 200_000, 2, "دریاچه چیتگر دوچرخه"),
  A("mashhad", "waterpark", "🌊", msg("Water park"), "adventure", 700_000, 4, "پارک آبی مشهد"),
  A("mashhad", "quantum", "🎢", msg("Indoor theme park"), "city", 600_000, 3, "تم پارک کوانتوم مشهد"),
  A("mashhad", "zoo", "🦁", msg("The zoo"), "nature", 150_000, 2, "باغ وحش وکیل آباد"),
  A("mashhad", "koohsangi", "🪨", msg("Evening in Kooh Sangi park"), "nature", 0, 2, "پارک کوهسنگی"),
  A("isfahan", "soffeh", "🚡", msg("Cable car and zip-line on Soffeh"), "adventure", 500_000, 3, "تله کابین صفه"),
  A("isfahan", "nazhvan", "🐠", msg("Nazhvan: aquarium, birds and rides"), "nature", 300_000, 3, "ناژوان اصفهان"),
  A("isfahan", "zurkhaneh", "💪", msg("Watch a zurkhaneh session"), "history", 200_000, 1, "زورخانه اصفهان"),
  A("shiraz", "qavam", "🍊", msg("Naranjestan-e Qavam"), "history", 150_000, 1, "نارنجستان قوام"),
  A("shiraz", "afif", "🌳", msg("Afifabad garden"), "history", 150_000, 1.5, "باغ عفیف آباد"),
  A("shiraz", "waterpark", "🌊", msg("Water park"), "adventure", 600_000, 4, "پارک آبی علی بابا شیراز"),
  A("shiraz", "derak", "🥾", msg("Hike up Derak"), "nature", 0, 3, "کوه دراک شیراز"),
  A("tabriz", "museum", "🏺", msg("Azerbaijan museum"), "history", 100_000, 1.5, "موزه آذربایجان تبریز"),
  A("tabriz", "sled", "🛷", msg("Mountain sled ride"), "adventure", 300_000, 1, "سورتمه ائل گلی"),
  A("yazd", "silence", "🌄", msg("Towers of Silence at sunset"), "history", 100_000, 1.5, "دخمه زرتشتیان یزد"),
  A("yazd", "paraglide", "🪂", msg("Tandem paragliding"), "adventure", 2_500_000, 1, "پاراگلایدر یزد"),
  A("yazd", "escape", "🔐", msg("Escape room"), "city", 400_000, 1.5, "اتاق فرار یزد"),
  A("qeshm", "namakdan", "🧂", msg("Namakdan salt cave"), "nature", 200_000, 2, "غار نمکدان قشم"),
  A("qeshm", "kharbas", "🕳️", msg("Kharbas caves"), "history", 100_000, 1, "غار خربس قشم"),
  A("qeshm", "portuguese", "🏰", msg("The Portuguese castle"), "history", 100_000, 1, "قلعه پرتغالی ها قشم"),
];

/** What there is to do in a city (a city with none: an empty list). */
export const activitiesIn = (city: string) => ACTIVITIES.filter((a) => a.city === city);

/** Where to find who runs it now. */
export const activityUrl = (a: Activity) => `https://www.google.com/search?q=${encodeURIComponent(a.q)}`;

/** Trips by what you're in the mood for: the cities that are best at it. */
export type Mood = "sea" | "history" | "green" | "desert" | "pilgrim";
export const MOODS: Record<Mood, { emoji: string; label: string; cities: string[]; tint: string }> = {
  sea: { emoji: "🏝️", label: msg("Sea & islands"), cities: ["kish", "qeshm", "chabahar", "bandar-abbas", "bushehr"], tint: "#2bb3c0" },
  history: { emoji: "🏛️", label: msg("History"), cities: ["isfahan", "shiraz", "yazd", "kashan", "tabriz", "hamedan"], tint: "#d9a441" },
  green: { emoji: "🌲", label: msg("The green north"), cities: ["rasht", "ramsar", "sari", "gorgan", "ardabil"], tint: "#4caf6a" },
  desert: { emoji: "🐪", label: msg("Desert"), cities: ["yazd", "kerman", "kashan"], tint: "#e08a3c" },
  pilgrim: { emoji: "🕌", label: msg("Pilgrimage"), cities: ["mashhad", "qom"], tint: "#5f8de0" },
};
export const MOOD_KEYS = Object.keys(MOODS) as Mood[];
/** A city's look on a destination card: the mood it's best known for. */
export const moodOf = (city: string): Mood | null => MOOD_KEYS.find((m) => MOODS[m].cities.includes(city)) ?? null;
