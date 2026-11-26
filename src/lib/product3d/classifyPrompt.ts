// The product classifier's prompt and the reading of its answer (pure; tests/product3d.test.ts). The runner's small
// LLM (scripts/product3d/ai-server.sh → worker.ts) gets the products the rules couldn't place, 25 to a request; the
// instructions (every kind with a few words) are the same each time, so llama-server keeps them cached and a request
// pays only for its own lines. The answer is held to a JSON schema whose `kind` is the list of kinds itself — it can't
// answer anything else — and is checked again here (a line it skipped or numbered wrong is simply left for next time).
import { KIND_NAMES, isKind, normText, type ProductKind } from "./kinds";

/** What each kind is, in the fewest words that tell them apart (the model's only guide besides the names). */
const HINT: Record<ProductKind, string> = {
  pizza: "pizza", burger: "burger", sandwich: "sandwich, hot dog, falafel, baguette", wrap: "wrap, roll, burrito", friedChicken: "fried chicken, wings, nuggets",
  fries: "french fries, potato wedges", kebabPlate: "kebab or grilled meat on a plate, platter, steak", riceDish: "rice dish, polo, chelo, plated meal",
  stew: "Iranian stew (khoresh, ghormeh, gheymeh)", soup: "soup, ash, haleem", salad: "salad", pasta: "pasta", omelette: "omelette, eggs in a pan",
  dizi: "dizi / abgoosht in a stone pot", sauce: "sauce, dip, side cup, olives", cakeSlice: "slice of cake, brownie, tart", cake: "whole cake",
  pastries: "pastries, cookies, donuts, croissant by the box", sohan: "sohan, gaz (Iranian sweets in a tin)", iceCream: "ice-cream cone",
  dessertCup: "dessert or ice cream in a cup", can: "drink can", bottle: "plastic drink bottle", glassBottle: "glass bottle, malt drink, distillate",
  doogh: "doogh", water: "mineral water", carton: "milk or juice carton", coffee: "hot coffee in a cup", coldCup: "cold drink in a clear cup, shake, smoothie, juice",
  tea: "tea in a glass", flatbread: "flat bread (sangak, barbari, lavash)", loaf: "loaf, baguette, toast", snackBag: "chips or puffs bag", box: "packaged box",
  jar: "jar (honey, jam, spread)", saffron: "saffron", pouch: "nuts, dried fruit, coffee beans in a pouch", sack: "rice or flour sack", oil: "cooking oil bottle",
  tub: "yogurt, cheese, butter tub", eggs: "egg tray", fruit: "fruit or vegetable", melon: "melon, watermelon, pumpkin", herbs: "fresh herbs bunch",
  meat: "raw meat or chicken tray", plant: "potted house plant", flowers: "flower bouquet", soil: "soil or fertiliser bag", tool: "garden tool",
  pills: "pills, vitamins box", syrup: "medicine syrup", cream: "cream or ointment tube", phone: "phone, tablet", laptop: "laptop", headphones: "headphones, speaker",
  shirt: "clothes", shoe: "shoes", handbag: "bag, wallet", standee: "anything else",
};

export const SYSTEM = [
  "You sort products from Iranian online menus and shops (titles in Persian) into 3D model kinds for a game.",
  "For each numbered line give its kind from this list, and a short plain English name of the product (2-5 words, the thing itself, no brand or size).",
  "Kinds:",
  ...KIND_NAMES.map((k) => `- ${k}: ${HINT[k]}`),
  'Answer only JSON: {"items":[{"i":1,"kind":"...","en":"..."}]} with one entry per line.',
].join("\n");

/** The JSON schema llama-server holds the answer to (grammar-constrained: only these kinds can come out). */
export const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { i: { type: "integer" }, kind: { type: "string", enum: KIND_NAMES }, en: { type: "string", maxLength: 60 } }, required: ["i", "kind", "en"] },
    },
  },
  required: ["items"],
} as const;

export type ToClassify = { key: string; title: string; section: string; about: string; storeKind: string };

/** One request's lines: number. title | section | store kind (the description only when the title is short). */
export function userPrompt(items: ToClassify[]): string {
  return items
    .map((it, i) => {
      const about = it.title.length < 14 && it.about ? ` (${it.about.slice(0, 60)})` : "";
      return `${i + 1}. ${it.title.trim()}${about} | ${it.section.trim() || "-"} | ${it.storeKind || "-"}`;
    })
    .join("\n");
}

/** The model's answer → {key, kind, en} for the lines it got right (any it skipped or garbled are left out). */
export function readAnswer(items: ToClassify[], text: string): { key: string; kind: ProductKind; en: string }[] {
  let j: { items?: { i?: unknown; kind?: unknown; en?: unknown }[] };
  try {
    j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const out = new Map<string, { key: string; kind: ProductKind; en: string }>();
  for (const a of j.items ?? []) {
    const i = Number(a.i) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= items.length || !isKind(a.kind)) continue;
    const en = typeof a.en === "string" ? a.en.replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
    out.set(items[i].key, { key: items[i].key, kind: a.kind, en });
  }
  return [...out.values()];
}

/** A title made into a search for a product photo: sizes, counts and filler taken out («نوشابه ۱.۵ لیتری کوکا (خانواده)» → «نوشابه کوکا»). */
export function searchText(title: string): string {
  return normText(title)
    .replace(/\d+([./]\d+)? ?(لیتری|لیتر|سی ?سی|میلی ?لیتر|گرمی|گرم|کیلوگرم|کیلویی|کیلو|عددی|عدد|تکه|تیکه|نفره|سانتی ?متری|سانتی|سانت|ml|cc|gr|g|kg|l|cm)(?=\s|$)/g, " ")
    .replace(/(?<=^|\s)(یک|دو|سه|چهار|پنج|ویژه|مخصوص|ساده|درجه ?\d|تا|الی|و)(?=\s|$)/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
