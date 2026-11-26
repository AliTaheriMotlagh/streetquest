// What a store's product is, as a 3D thing (pure; tests/product3d.test.ts). Every menu or catalogue item — a Snappfood
// dish, a supermarket's pack of tea, a florist's pot plant — gets a `ProductKind`: the template body the game builds it
// from (components/drive/product3d.ts), its real size, how the item's own photo goes onto it, and whether a model made
// from the photo by the reconstruction pipeline (scripts/product3d/, .github/workflows/product3d.yml) is worth having.
//
// Why both: TripoSR (the pipeline's open image→3D model) does well on a single object on a plain background — a can,
// a bottle, a burger, a cake, a pot plant — and badly on a top-down photo of a plate of rice. Plates, pizzas, bowls and
// bread are better as a template with the real photo laid on top. So every kind says which one it wants (`ai`), the
// admin can override it per product, and a model that comes out badly falls back to the template on its own.
//
// Classification is rules first (Persian, English, Turkish words, ~instant, free); what the rules can't place with
// confidence goes to the pipeline's LLM (scripts/product3d/classify.ts) in batches, and the admin has the last word.
import type { StoreKind } from "../storeKinds";

/** How a template is built (components/drive/product3d.ts). */
export type Body =
  | "plate" | "pizza" | "burger" | "sandwich" | "wrap" | "bucket" | "fries" | "bowl" | "pan" | "dizi" | "cone"
  | "cakeSlice" | "cake" | "pastryBox" | "tin" | "can" | "bottle" | "carton" | "paperCup" | "clearCup" | "teaGlass"
  | "flatbread" | "loaf" | "bag" | "box" | "jar" | "pouch" | "sack" | "tub" | "fruit" | "herbs" | "tray" | "pot"
  | "card" | "phone" | "laptop" | "shirt" | "shoe" | "handbag" | "tube" | "pillBox";

/** How the item's photo goes on: laid on the food (a round crop, from above), projected on the front, a standing
 *  cut-out card, or not at all (plain colours). */
export type PhotoMap = "top" | "front" | "card" | "none";

export type KindSpec = {
  body: Body;
  /** Real size in metres: width (x), height (y), depth (z). */
  size: [number, number, number];
  photo: PhotoMap;
  /** A model made from the photo is worth it (the pipeline reconstructs it); else the template is the look. */
  ai: boolean;
  /** Colour when there's no photo (the body's main colour). */
  tint: string;
};

const K = (body: Body, size: [number, number, number], photo: PhotoMap, ai: boolean, tint: string): KindSpec => ({ body, size, photo, ai, tint });

export const KINDS = {
  // Food on a plate or in a box (Snappfood's top-down photos: the photo on the food)
  pizza: K("pizza", [0.3, 0.035, 0.3], "top", false, "#d98c3a"),
  burger: K("burger", [0.12, 0.1, 0.12], "front", true, "#c98a3c"),
  sandwich: K("sandwich", [0.24, 0.08, 0.09], "front", true, "#d7a35c"),
  wrap: K("wrap", [0.2, 0.06, 0.06], "front", true, "#e1c08a"),
  friedChicken: K("bucket", [0.16, 0.16, 0.16], "front", true, "#b0452b"),
  fries: K("fries", [0.09, 0.14, 0.06], "front", true, "#e8b93a"),
  kebabPlate: K("plate", [0.3, 0.05, 0.22], "top", false, "#d9b46a"),
  riceDish: K("plate", [0.28, 0.06, 0.28], "top", false, "#efe4c8"),
  stew: K("bowl", [0.16, 0.07, 0.16], "top", false, "#5f6b2b"),
  soup: K("bowl", [0.18, 0.08, 0.18], "top", false, "#b8863b"),
  salad: K("bowl", [0.2, 0.08, 0.2], "top", false, "#6fa64a"),
  pasta: K("plate", [0.26, 0.05, 0.26], "top", false, "#e0a94f"),
  omelette: K("pan", [0.2, 0.05, 0.2], "top", false, "#e7b53c"),
  dizi: K("dizi", [0.14, 0.15, 0.14], "front", true, "#6b4a33"),
  sauce: K("tub", [0.05, 0.035, 0.05], "front", false, "#c8392b"),
  // Sweets
  cakeSlice: K("cakeSlice", [0.08, 0.08, 0.12], "front", true, "#e7c9a2"),
  cake: K("cake", [0.22, 0.12, 0.22], "front", true, "#f0d9c0"),
  pastries: K("pastryBox", [0.24, 0.07, 0.17], "top", false, "#f4ede2"),
  sohan: K("tin", [0.2, 0.05, 0.2], "top", false, "#c4902f"),
  iceCream: K("cone", [0.07, 0.17, 0.07], "front", true, "#f3e3c3"),
  dessertCup: K("clearCup", [0.09, 0.1, 0.09], "front", true, "#e9c7d6"),
  // Drinks
  can: K("can", [0.066, 0.122, 0.066], "front", true, "#c62828"),
  bottle: K("bottle", [0.09, 0.31, 0.09], "front", true, "#2e7d32"),
  glassBottle: K("bottle", [0.065, 0.23, 0.065], "front", true, "#5d4037"),
  doogh: K("bottle", [0.085, 0.27, 0.085], "front", true, "#f5f5f0"),
  water: K("bottle", [0.065, 0.21, 0.065], "front", true, "#9ad0ec"),
  carton: K("carton", [0.07, 0.2, 0.07], "front", true, "#f2f2f2"),
  coffee: K("paperCup", [0.085, 0.11, 0.085], "front", false, "#6d4c41"),
  coldCup: K("clearCup", [0.09, 0.16, 0.09], "front", true, "#c9a17a"),
  tea: K("teaGlass", [0.06, 0.075, 0.06], "none", false, "#9e2a12"),
  // Groceries
  flatbread: K("flatbread", [0.6, 0.02, 0.3], "top", false, "#c99a5b"),
  loaf: K("loaf", [0.3, 0.09, 0.11], "front", true, "#c48a46"),
  snackBag: K("bag", [0.16, 0.22, 0.06], "front", true, "#f2b632"),
  box: K("box", [0.14, 0.2, 0.06], "front", true, "#3f6fb5"),
  jar: K("jar", [0.08, 0.11, 0.08], "front", true, "#d99a2b"),
  saffron: K("jar", [0.04, 0.05, 0.04], "front", true, "#b71c1c"),
  pouch: K("pouch", [0.14, 0.22, 0.07], "front", true, "#4e342e"),
  sack: K("sack", [0.3, 0.45, 0.14], "front", true, "#e8e0cc"),
  oil: K("bottle", [0.08, 0.28, 0.08], "front", true, "#f0c419"),
  tub: K("tub", [0.12, 0.09, 0.12], "front", true, "#fafafa"),
  eggs: K("tray", [0.3, 0.06, 0.3], "none", false, "#e8d3b0"),
  // Fresh
  fruit: K("fruit", [0.09, 0.09, 0.09], "front", true, "#e53935"),
  melon: K("fruit", [0.22, 0.2, 0.22], "front", true, "#4c8c3a"),
  herbs: K("herbs", [0.18, 0.08, 0.3], "none", false, "#3d8b37"),
  meat: K("tray", [0.24, 0.05, 0.16], "top", false, "#b3473b"),
  // Plants & garden
  plant: K("pot", [0.22, 0.45, 0.22], "card", true, "#3f7d32"),
  flowers: K("card", [0.25, 0.45, 0.1], "card", true, "#d63c6a"),
  soil: K("sack", [0.3, 0.42, 0.12], "front", true, "#5a3d27"),
  tool: K("card", [0.12, 0.35, 0.04], "card", true, "#777777"),
  // Pharmacy
  pills: K("pillBox", [0.1, 0.05, 0.03], "front", true, "#ffffff"),
  syrup: K("bottle", [0.06, 0.14, 0.06], "front", true, "#8d5524"),
  cream: K("tube", [0.04, 0.16, 0.03], "front", true, "#e3f2fd"),
  // Things
  phone: K("phone", [0.075, 0.16, 0.009], "front", true, "#1d1d1f"),
  laptop: K("laptop", [0.32, 0.02, 0.22], "top", true, "#9e9e9e"),
  headphones: K("card", [0.17, 0.19, 0.08], "card", true, "#222222"),
  shirt: K("shirt", [0.5, 0.7, 0.04], "front", false, "#3d5a80"),
  shoe: K("shoe", [0.28, 0.11, 0.1], "front", true, "#6d4c41"),
  handbag: K("handbag", [0.3, 0.24, 0.12], "front", true, "#8d6e63"),
  // Anything else with a photo: a standing cut-out; without one, a plain box.
  standee: K("card", [0.2, 0.25, 0.04], "card", true, "#9e9e9e"),
} satisfies Record<string, KindSpec>;

export type ProductKind = keyof typeof KINDS;
export const KIND_NAMES = Object.keys(KINDS) as ProductKind[];
export const isKind = (s: unknown): s is ProductKind => typeof s === "string" && Object.prototype.hasOwnProperty.call(KINDS, s);

/** Persian/Arabic letters and digits made one way, ZWNJ and punctuation to spaces, lower case. */
export function normText(s: string): string {
  return s
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, (c) => (c === "آ" ? "آ" : "ا"))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[‌‍‏‎]/g, " ")
    .replace(/[()[\]{}«»"'،,؛;:!?|/\\*+_=<>~`^%#@&$-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** `weak`: a generic word (غذا، نوشیدنی، بسته) — used only when nothing more telling is there. `fresh`: raw produce/meat
 *  words — only at a greengrocer, butcher or supermarket, or in a fresh section (in a restaurant «قارچ» is a topping).
 *  `pharm`: medicine words — only at a chemist or a supermarket. */
type Flag = "weak" | "fresh" | "pharm";
type Rule = [ProductKind, RegExp, Flag?];
// Persian names lead with the head noun («ساندویچ خوراک بندری با قارچ و پنیر پیتزا» is a sandwich), so the rule whose
// word comes first in the text wins; a tie goes to the rule higher in this list (the more specific one). Patterns run on
// ` ${normText(text)} ` (no ZWNJ, ی/ک unified, Latin lower case, a space at each end for whole-word ` x ` patterns).
const RULES: Rule[] = [
  ["saffron", /زعفران|saffron|safran/],
  ["sohan", /سوهان| گز |sohan| gaz /],
  ["iceCream", /بستنی قیفی|قیفی|ice ?cream cone| cone |külah/],
  ["coldCup", /شیک|اسموتی|بابل ?تی|موهیتو|موکتل|ماکتل|فراپ|آیس|ایس |سردنوش|لیموناد|افوگاتو|آفوگاتو|ماچا|کلد ?برو|گلاسه|شربت|آب ?(پرتقال|سیب|انار|هویج|طالبی|هندوانه|آلبالو|انگور|لیمو|هلو|آناناس)|shake|smoothie|bubble|frappe|iced|mojito|mocktail|cold ?brew|matcha|lemonade|soğuk/],
  ["dessertCup", /بستنی|دسر|ژله|موس |پاناکوتا|تیرامیسو|موچی|فالوده|شله ?زرد|فرنی|شیر ?برنج|پودینگ|dessert|pudding|mousse|tiramisu|mochi|ice ?cream|dondurma|sütlaç/],
  ["coffee", /قهوه|هات |اسپرسو|لاته|لته|کاپوچینو|موکا|آمریکانو|امریکانو|ماکیاتو|هات ?چاکلت|کورتادو|فلت ?وایت|ماسالا|نسکافه|coffee|espresso|latte|cappuccino|mocha|americano|macchiato|cortado|flat ?white|hot ?chocolate|kahve/],
  ["tea", /چای|دمنوش|استکان| tea |herbal|çay/],
  ["pizza", /پیتزا|pizza|pide/],
  ["burger", /برگر|همبرگر|چیزبرگر|burger/],
  ["friedChicken", /سوخاری|استریپس|کرانچی|ناگت| بال |کتف|wings?|nugget|crispy|fried chicken|strips|kanat/],
  ["fries", /سیب ?زمینی|فرنچ ?فرایز|فرایز|ودجز|wedges?|fries|patates/],
  ["pastries", /شیرینی|نان ?برنجی|نان ?نخودچی|باقلوا|کلوچه|کوکی|بیسکویت|ماکارون|دونات|کروسان|کرواسان|پیراشکی|سمبوسه|ناپلئونی|نان ?خامه|پن ?شکلات|رول ?دارچین|سینابون|پای |cookie|biscuit|baklava|donut|croissant|pastry|samosa|cinnamon|kurabiye/],
  ["wrap", /رپ |رول |تورتیلا|بوریتو|تاکو|کوزادیا|wrap|burrito|taco|quesadilla|dürüm/],
  ["sandwich", /ساندویچ|ساندویج|هات ?داگ|سوسیس|کالباس|فلافل|لقمه|کتلت|الویه|باگت|پنینی|زاپاتا|چاپاتا|سیاباتا|sandwich|hot ?dog| sub |panini|baguette|falafel|ciabatta|tost|döner/],
  ["dizi", /دیزی|آبگوشت|dizi|abgoosht/],
  ["omelette", /املت|نیمرو|خاگینه|کوکو سبزی|کوکو سیب|شکشوکا|omelet|shakshuka|menemen/],
  ["soup", /سوپ|آش |حلیم|عدسی|کله ?پاچه|بورانی|soup|haleem|çorba/],
  ["salad", /سالاد|سزار|salad|salata/],
  ["pasta", /پاستا|اسپاگتی|ماکارونی|لازانیا|فتوچینی|پنه |راویولی|pasta|spaghetti|lasagna|macaroni|fettuccine|penne|ravioli|makarna/],
  ["stew", /قورمه|قرمه|قیمه|خورش|خورشت|فسنجان|کشک|میرزا ?قاسمی|stew|khoresh|ghormeh/],
  ["kebabPlate", /کباب|بشقاب|استیک|کوبیده|برگ |بختیاری|سلطانی|جوجه|شیشلیک|چنجه|سینی|kebab|kabab|kebap|şiş|shish|platter/],
  ["riceDish", /پلو|زرشک|ته ?چین|بریانی|استانبولی|biryani|plov|pilav/],
  ["riceDish", /چلو|خوراک|پرسی|غذا| rice /, "weak"],
  ["cakeSlice", /کیک|چیزکیک|براونی|تارت|cake|brownie|tart/],
  ["doogh", /دوغ|ayran|doogh/],
  ["water", /آب ?معدنی| آب |water| su /],
  ["can", /قوطی|انرژی ?زا|ردبول|هایپ|red ?bull|energy|redbull/],
  ["carton", /آبمیوه|آب ?میوه|شیر کاکائو|شیر |پاکتی|تتراپک|juice|milk|süt|meyve suyu/],
  ["glassBottle", /ماء ?الشعیر|دلستر|شیشه ای|شیشه| عرق |beer|malt/],
  ["bottle", /نوشابه|کوکا|پپسی|فانتا|زمزم|سون ?آپ|اسپرایت|بطری|cola|pepsi|fanta|soda|sprite|7up|gazoz/],
  ["bottle", /نوشیدنی|لیتر|drink|bottle|içecek/, "weak"],
  ["sauce", /سس|ساید|ترشی|زیتون|ماست ?و ?خیار|sauce| dip | sos |olive/],
  ["flatbread", /سنگک|بربری|لواش|تافتون|نان ?محلی|نان ?روغنی|نان ?بازاری|lavash|sangak|barbari|lavaş/],
  ["loaf", /نان|باگت|تست|سیمیت|bread|loaf|toast|ekmek|simit/],
  ["eggs", /شانه ?تخم|تخم ?مرغ ?(محلی|شانه|\d+ ?عدد)|egg tray|yumurta/],
  ["jar", /عسل|مربا|شیره|کنسرو| رب |نوتلا|کره ?بادام|honey| jam |jar|nutella|conserve| bal |reçel/],
  ["tub", /ماست|پنیر|کره|خامه|سرشیر|لبنه| حلوا |کاچی|yogurt|yoghurt|cheese|butter|labneh|halva|peynir|tereyağ/],
  ["oil", /روغن| oil | yağ /],
  ["sack", /برنج ?(ایرانی|هندی|طارم|هاشمی|\d+ ?کیلو)|آرد|کیسه|rice bag|flour|pirinç| un /],
  ["snackBag", /چیپس|پفک|اسنک|پاپ ?کورن|chips|crisps|popcorn|snack|cips/],
  ["pouch", /آجیل|پسته|بادام|گردو|فندق|تخمه|کشمش|خرما|انجیر|قهوه ?دان|دان ?قهوه|پودر ?قهوه|ادویه|زردچوبه|nuts|pistachio|almond|walnut|dates|coffee beans|spice|kuruyemiş/],
  ["box", /غلات|کورن ?فلکس|cereal/],
  ["box", /بسته|پاکت|جعبه|کارتن| box | pack |kutu/, "weak"],
  ["melon", /هندوانه|خربزه|طالبی|کدو|watermelon|melon|pumpkin|karpuz|kavun/, "fresh"],
  ["herbs", /سبزی|سبزیجات|ریحان|نعناع|جعفری|گشنیز|تره|شوید|روکولا|مارچوبه|اسفناج|کرفس|herbs|basil|mint|parsley|coriander|spinach|maydanoz/, "fresh"],
  ["fruit", /میوه|سیب|پرتقال|نارنگی|موز|انار|انگور|گلابی|هلو|زردآلو|آلو|گیلاس|کیوی|لیمو|خیار|گوجه|پیاز|بادمجان|فلفل|هویج|کاهو|کلم|قارچ|زنجبیل| سیر |لوبیا|نخود|بامیه|ذرت|فیسالیس|fruit|apple|orange|banana|pomegranate|grape|pear|peach|cherry|kiwi|lemon|cucumber|tomato|onion|potato|pepper|carrot|lettuce|cabbage|mushroom|garlic|ginger|elma|portakal| muz |domates|salatalık/, "fresh"],
  ["meat", /گوشت|مرغ|ران |سینه|فیله|چرخ ?کرده|ماهی|میگو|meat|chicken|beef|lamb|mince|fish|shrimp| et |tavuk|balık/, "fresh"],
  ["flowers", /دسته ?گل|گل ?رز| رز |باکس ?گل|سبد ?گل|بوکه|bouquet|roses?|flowers|çiçek/],
  ["soil", /خاک|کود|سم |پیت ?ماس|کوکوپیت|soil|fertili[sz]er|compost|toprak|gübre/],
  ["tool", /بیلچه|قیچی|سمپاش|آبپاش|شلنگ|دستکش|ابزار|trowel|shears|sprayer|hose|gloves|tool/],
  ["plant", /گلدان|گیاه|قلمه|کاکتوس|ساکولنت|بونسای|بنسای|آدنیوم|پتوس|سانسوریا|زامیفولیا|فیکوس|بنجامین|آگلونما|اسپاتی|پوتوس|شفلرا|دیفن|بامبو|plant|\bpot\b|cactus|succulent|bonsai|ficus|monstera|saksı/],
  ["pills", /قرص|کپسول|ویتامین|مکمل|pill|tablet|capsule|vitamin|supplement|ilaç/, "pharm"],
  ["syrup", /شربت ?(سرفه|دارویی)|قطره|syrup|drops|şurup/, "pharm"],
  ["cream", / کرم |پماد|ژل|لوسیون|cream|ointment|gel|lotion|krem/, "pharm"],
  ["phone", /گوشی|موبایل|آیفون|سامسونگ|شیائومی|تبلت|phone|iphone|samsung|xiaomi|galaxy|redmi|tablet|telefon/],
  ["laptop", /لپ ?تاپ|نوت ?بوک|مک ?بوک|laptop|notebook|macbook/],
  ["headphones", /هدفون|هندزفری|ایرپاد|هدست|اسپیکر|headphone|earbuds?|airpods|headset|speaker|kulaklık/],
  ["shoe", /کفش|کتونی|صندل| بوت |دمپایی|shoe|sneaker|sandal|boot|ayakkabı/],
  ["handbag", / کیف |handbag|wallet|çanta/],
  ["shirt", /پیراهن|شلوار|مانتو|کت |تیشرت|تی ?شرت|هودی|سویشرت|روسری|شال|دامن|shirt|dress|jacket|coat|hoodie|jeans|scarf|skirt|gömlek|elbise/],
];

/** «پنیر پیتزا» is a topping, «پای سیب» a pie: words that would mislead the rules are taken out first. */
const NOISE = /پنیر ?پیتزا|pizza cheese|سس ?(قارچ|پنیر)/g;
const FRESH_SECTION = /میوه|صیفی|سبزی|سبزیجات|گوشت|مرغ|پروتئین|ماهی|fruit|veg|meat|butcher/;

function bestRule(text: string, store: StoreKind, section: string): ProductKind | null {
  const s = ` ${normText(text).replace(NOISE, " ")} `;
  if (s.trim().length < 2) return null;
  const fresh = store === "produce" || store === "butcher" || store === "market" || store === "general" || FRESH_SECTION.test(normText(section));
  const pharm = store === "pharmacy" || store === "market" || store === "general";
  let pick: ProductKind | null = null, at = Infinity, weak: ProductKind | null = null;
  for (const [kind, re, flag] of RULES) {
    if ((flag === "fresh" && !fresh) || (flag === "pharm" && !pharm)) continue;
    const m = re.exec(s);
    if (!m) continue;
    if (flag === "weak") weak ??= kind;
    else if (m.index < at) (at = m.index), (pick = kind);
  }
  return pick ?? weak;
}

/** What a store sells most, when an item's words say nothing. */
const BY_STORE: Record<StoreKind, ProductKind> = {
  restaurant: "riceDish", fastfood: "sandwich", cafe: "coffee", bakery: "loaf", sweets: "pastries", market: "box", produce: "fruit",
  butcher: "meat", pharmacy: "pills", fashion: "shirt", tech: "phone", general: "standee",
};
/** In a supermarket «چای» and «قهوه» are packs on the shelf, not a glass on the table. */
const PACKED: Partial<Record<ProductKind, ProductKind>> = { tea: "box", coffee: "pouch", pastries: "box", cakeSlice: "box", iceCream: "box", dessertCup: "tub" };

/** At a greengrocer «سیب زمینی» is potatoes and «بادمجان» an aubergine, not fries or a stew. */
const FRESH: Partial<Record<ProductKind, ProductKind>> = { fries: "fruit", stew: "fruit", salad: "herbs" };

/** A drink's container word beats its name: «نوشابه قوطی» is a can, «دوغ شیشه‌ای» a glass bottle. */
const DRINKS = new Set<ProductKind>(["bottle", "glassBottle", "doogh", "water", "carton", "can", "coldCup"]);
const CONTAINER: [RegExp, ProductKind][] = [[/قوطی| can |kutu/, "can"], [/شیشه|glass bottle/, "glassBottle"], [/بطری|pet bottle/, "bottle"], [/پاکتی|tetra/, "carton"]];

export type Classified = { kind: ProductKind; conf: number; by: "rules" | "store" };
export type ProductText = { title: string; section?: string; about?: string };

/**
 * The kind by its words: the title first (most sure), then its section, then the description, else what the store
 * sells. `conf` (0–1) says how sure: under CONFIDENT the pipeline asks the LLM.
 */
export function classify(it: ProductText, store: StoreKind = "general"): Classified {
  const tries: [string, number][] = [[it.title, 0.9], [it.section ?? "", 0.65], [it.about ?? "", 0.55]];
  for (const [text, conf] of tries) {
    let k = bestRule(text, store, it.section ?? "");
    if (!k) continue;
    const s = normText(text);
    if ((store === "market" || store === "general") && PACKED[k] && !/فنجان|لیوان|cup|glass/.test(s)) k = PACKED[k]!;
    if (store === "produce" && FRESH[k]) k = FRESH[k]!;
    if (DRINKS.has(k)) for (const [re, c] of CONTAINER) if (re.test(` ${s} `)) (k = c);
    return { kind: k, conf, by: "rules" };
  }
  return { kind: BY_STORE[store] ?? "standee", conf: 0.3, by: "store" };
}
/** Below this the rules' answer is a guess: the pipeline's LLM is asked (and the admin sees it marked). */
export const CONFIDENT = 0.6;

/** Litres or kilograms written in the title («نوشابه ۱.۵ لیتری», «برنج ۱۰ کیلویی», «۳۰۰ سی‌سی», «۵۰۰ گرمی», «خانواده»). */
export function amountOf(title: string): { litres?: number; kg?: number } {
  const s = normText(title);
  const n = (x: string) => parseFloat(x.replace("/", "."));
  let m = s.match(/(\d+(?:[./]\d+)?) ?(?:لیتر|لیتری|liter|litre|lt|l\b)/);
  if (m) return { litres: n(m[1]) };
  m = s.match(/(\d+) ?(?:سی ?سی|میلی ?لیتر|میلی|cc|ml)/);
  if (m) return { litres: n(m[1]) / 1000 };
  m = s.match(/(\d+(?:[./]\d+)?) ?(?:کیلوگرم|کیلویی|کیلو|kg)/);
  if (m) return { kg: n(m[1]) };
  m = s.match(/(\d+) ?(?:گرمی|گرم|gr|g\b)/);
  if (m) return { kg: n(m[1]) / 1000 };
  if (/خانواده|family/.test(s)) return { litres: 1.5 };
  if (/نیم ?لیتر/.test(s)) return { litres: 0.5 };
  if (/کوچک|small|mini/.test(s)) return { litres: 0.25 };
  return {};
}

/** A pizza's diameter written in its title («۲۸ سانتی», «بزرگ», «مینی»). */
function pizzaCm(title: string): number | null {
  const s = normText(title);
  const m = s.match(/(\d{2}) ?(?:سانت|cm)/);
  if (m) return Math.min(45, Math.max(15, +m[1]));
  if (/خانواده|family|جامبو|بزرگ|large/.test(s)) return 36;
  if (/متوسط|medium/.test(s)) return 30;
  if (/مینی|کوچک|small|mini|یک ?نفره|تک ?نفره/.test(s)) return 23;
  return null;
}

/** The size (m) of this item: its kind's, scaled by what its title says (a 1.5 L bottle is taller than a 300 cc one). */
export function sizeOf(kind: ProductKind, title: string): [number, number, number] {
  const [w, h, d] = KINDS[kind].size;
  const a = amountOf(title);
  const body = KINDS[kind].body;
  if (kind === "pizza") {
    const cm = pizzaCm(title);
    return cm ? [cm / 100, h, cm / 100] : [w, h, d];
  }
  // Volume grows with the cube of size: a bottle grows mostly taller (h ~ v^0.45), a bit wider (w ~ v^0.28).
  const ref: Partial<Record<Body, number>> = { bottle: kind === "bottle" ? 1.5 : kind === "doogh" ? 1.5 : kind === "oil" ? 1.5 : 0.33, can: 0.33, carton: 1, clearCup: 0.4, paperCup: 0.3 };
  if (a.litres && ref[body]) {
    const r = Math.min(8, Math.max(0.08, a.litres / ref[body]!));
    return [w * r ** 0.28, h * r ** 0.45, d * r ** 0.28];
  }
  const refKg: Partial<Record<Body, number>> = { sack: 10, bag: 0.1, pouch: 0.25, box: 0.5, jar: 0.4, tub: 0.9 };
  if (a.kg && refKg[body]) {
    const r = Math.min(10, Math.max(0.03, a.kg / refKg[body]!));
    return [w * r ** 0.33, h * r ** 0.36, d * r ** 0.3];
  }
  return [w, h, d];
}

/** Fit a size into a shelf spot (m): scaled down evenly, never up. */
export function fitInto(size: [number, number, number], maxW: number, maxH: number, maxD: number): { scale: number; size: [number, number, number] } {
  const k = Math.min(1, maxW / size[0], maxH / size[1], maxD / size[2]);
  return { scale: k, size: [size[0] * k, size[1] * k, size[2] * k] };
}

/** Whether the photo should be reconstructed for this item: the admin's choice if any, else the kind's. */
export const wantsAi = (kind: ProductKind, strategy: string | null | undefined) => (strategy === "ai" ? true : strategy === "template" ? false : KINDS[kind].ai);
