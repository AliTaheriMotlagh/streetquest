// What a player's shop can sell (pure — client and server; tests/shopKinds.test.ts): every kind of thing the store
// sites feed the game, with the same details they carry —
//   item     like Torob: brand, model, condition, warranty, colour
//   food     like a Snappfood menu line: its section, what's in it, how long it takes, size, veggie / spicy
//   ticket   a "bilit" like cinematicket / Jabama Events / a bus or flight: what, when, where, from → to, seat; stock = seats
//   ad       an "agahi" like Divar: its category, condition, negotiable, any facts ("Area: 85 m²"), neighbourhood, phone
//   deal     like Takhfifan: the price before, until when, the terms
//   service  how long, at your place or not, by appointment
// One list of fields per kind (KINDS) drives the seller's form, the cleaning of what's sent (cleanDetails) and the
// buyer's page (detailRows). A product is priced in coins (bought in the game: the coins are held until pickup) or
// in toman (paid to the seller directly, like a Divar ad — the game never touches that money).
import { msg } from "./i18n";

export type ProductKind = "item" | "food" | "ticket" | "ad" | "deal" | "service";
export const PRODUCT_KIND_KEYS: ProductKind[] = ["item", "food", "ticket", "ad", "deal", "service"];
export type Currency = "coins" | "toman";
export const CURRENCIES: Currency[] = ["coins", "toman"];

type Opt = { key: string; label: string };
export type FieldDef =
  | { key: string; label: string; type: "text" | "long" | "phone"; max: number; hint?: string }
  | { key: string; label: string; type: "number"; max: number; unit?: string; hint?: string }
  | { key: string; label: string; type: "datetime"; required?: boolean }
  | { key: string; label: string; type: "select"; options: Opt[] }
  | { key: string; label: string; type: "bool" }
  | { key: string; label: string; type: "pairs"; max: number };

const CONDITION: Opt[] = [
  { key: "new", label: msg("New") },
  { key: "used", label: msg("Used") },
  { key: "refurbished", label: msg("Refurbished") },
];

export type KindDef = { emoji: string; label: string; what: string; currency: Currency; stock: string; fields: FieldDef[] };
export const KINDS: Record<ProductKind, KindDef> = {
  item: {
    emoji: "📦", label: msg("Product"), what: msg("Anything you sell: brand, model, condition"), currency: "coins", stock: msg("In stock"),
    fields: [
      { key: "brand", label: msg("Brand"), type: "text", max: 40 },
      { key: "model", label: msg("Model"), type: "text", max: 40 },
      { key: "condition", label: msg("Condition"), type: "select", options: CONDITION },
      { key: "color", label: msg("Colour"), type: "text", max: 30 },
      { key: "warranty", label: msg("Warranty"), type: "text", max: 60, hint: msg("e.g. 18 months, official") },
    ],
  },
  food: {
    emoji: "🍽️", label: msg("Food"), what: msg("A dish or a drink on your menu"), currency: "coins", stock: msg("Portions left"),
    fields: [
      { key: "section", label: msg("Menu section"), type: "text", max: 30, hint: msg("e.g. Pizzas, Drinks") },
      { key: "ingredients", label: msg("What's in it"), type: "long", max: 200 },
      { key: "size", label: msg("Size"), type: "text", max: 30, hint: msg("e.g. Large, 500 g") },
      { key: "prepMin", label: msg("Ready in"), type: "number", max: 240, unit: msg("min") },
      { key: "veg", label: msg("Vegetarian"), type: "bool" },
      { key: "spicy", label: msg("Spicy"), type: "bool" },
    ],
  },
  ticket: {
    emoji: "🎟️", label: msg("Ticket"), what: msg("A seat at a show, a match, a tour or a trip"), currency: "toman", stock: msg("Seats left"),
    fields: [
      {
        key: "category", label: msg("Ticket for"), type: "select",
        options: [
          { key: "cinema", label: msg("Cinema") }, { key: "concert", label: msg("Concert") }, { key: "theater", label: msg("Theatre") },
          { key: "sport", label: msg("Sport") }, { key: "tour", label: msg("Tour") }, { key: "workshop", label: msg("Workshop") },
          { key: "bus", label: msg("Bus") }, { key: "train", label: msg("Train") }, { key: "flight", label: msg("Flight") }, { key: "other", label: msg("Other") },
        ],
      },
      { key: "when", label: msg("Date and time"), type: "datetime", required: true },
      { key: "ends", label: msg("Ends"), type: "datetime" },
      { key: "venue", label: msg("Venue"), type: "text", max: 80 },
      { key: "from", label: msg("From"), type: "text", max: 40, hint: msg("A trip: where it leaves from") },
      { key: "to", label: msg("To"), type: "text", max: 40 },
      { key: "seat", label: msg("Seat or class"), type: "text", max: 40, hint: msg("e.g. Row 5, seat 12 · VIP") },
      { key: "age", label: msg("Age limit"), type: "text", max: 20 },
    ],
  },
  ad: {
    emoji: "📣", label: msg("Classified ad"), what: msg("A classified ad: a flat, a car, a phone, a job"), currency: "toman", stock: msg("How many"),
    fields: [
      {
        key: "category", label: msg("Category"), type: "select",
        options: [
          { key: "realestate", label: msg("Real estate") }, { key: "vehicle", label: msg("Vehicles") }, { key: "phone", label: msg("Phones") },
          { key: "electronics", label: msg("Electronics") }, { key: "home", label: msg("Home & kitchen") }, { key: "fashion", label: msg("Clothes & shoes") },
          { key: "jobs", label: msg("Jobs") }, { key: "services", label: msg("Services") }, { key: "pets", label: msg("Pets") }, { key: "other", label: msg("Other") },
        ],
      },
      { key: "condition", label: msg("Condition"), type: "select", options: CONDITION },
      { key: "negotiable", label: msg("Price negotiable"), type: "bool" },
      { key: "facts", label: msg("Details"), type: "pairs", max: 10 },
      { key: "area", label: msg("Neighbourhood"), type: "text", max: 60 },
      { key: "phone", label: msg("Phone (shown to buyers)"), type: "phone", max: 15 },
    ],
  },
  deal: {
    emoji: "🏷️", label: msg("Deal"), what: msg("A discount voucher for your store"), currency: "toman", stock: msg("Vouchers left"),
    fields: [
      { key: "was", label: msg("Price before"), type: "number", max: 1_000_000_000 },
      { key: "until", label: msg("Valid until"), type: "datetime" },
      { key: "terms", label: msg("Terms"), type: "long", max: 300, hint: msg("e.g. Weekdays only, one per table") },
    ],
  },
  service: {
    emoji: "🛠️", label: msg("Service"), what: msg("Something you do: a haircut, a repair, a lesson"), currency: "toman", stock: msg("Slots left"),
    fields: [
      { key: "minutes", label: msg("Takes"), type: "number", max: 1440, unit: msg("min") },
      { key: "atHome", label: msg("At the customer's place"), type: "bool" },
      { key: "booking", label: msg("By appointment"), type: "bool" },
    ],
  },
};
export const kindOf = (k: unknown): ProductKind => (PRODUCT_KIND_KEYS as unknown[]).includes(k) ? (k as ProductKind) : "item";
export const currencyOf = (c: unknown): Currency => (c === "toman" ? "toman" : "coins");

export type Pair = { k: string; v: string };
export type Details = Record<string, string | number | boolean | Pair[]>;
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "");
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const ascii = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));

/**
 * What a seller sent for a kind, cleaned: only that kind's fields, text trimmed and cut to size, numbers whole and in
 * range, dates as ms, choices from the list, facts as up to `max` short pairs, a phone as digits. `problem`: a msg
 * key when a required field is missing (a ticket needs its date).
 */
export function cleanDetails(kind: ProductKind, raw: unknown): { details: Details; problem: string | null } {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Details = {};
  let problem: string | null = null;
  for (const f of KINDS[kind].fields) {
    const v = src[f.key];
    if (f.type === "text" || f.type === "long") {
      const s = clip(v, f.max);
      if (s) out[f.key] = s;
    } else if (f.type === "phone") {
      const s = cleanPhone(v).slice(0, f.max);
      if (s) out[f.key] = s;
    } else if (f.type === "number") {
      const n = Math.round(Number(typeof v === "string" ? ascii(v).replace(/[^\d.]/g, "") : v));
      if (Number.isFinite(n) && n > 0) out[f.key] = Math.min(f.max, n);
    } else if (f.type === "datetime") {
      const n = typeof v === "number" ? v : typeof v === "string" && v ? Date.parse(v) : NaN;
      if (Number.isFinite(n) && n > 946_684_800_000) out[f.key] = Math.round(n);
      else if (f.required) problem = msg("Pick the date and time");
    } else if (f.type === "select") {
      if (typeof v === "string" && f.options.some((o) => o.key === v)) out[f.key] = v;
    } else if (f.type === "bool") {
      if (v === true) out[f.key] = true;
    } else if (f.type === "pairs" && Array.isArray(v)) {
      const pairs = v
        .map((p) => ({ k: clip((p as Pair)?.k, 30), v: clip((p as Pair)?.v, 60) }))
        .filter((p) => p.k && p.v)
        .slice(0, f.max);
      if (pairs.length) out[f.key] = pairs;
    }
  }
  return { details: out, problem };
}

/** A product's price, by its currency: coins at least 1 (up to `maxCoins`); toman from 0 ("ask the seller"). */
export function priceProblem(currency: Currency, price: number, maxCoins: number): string | null {
  if (!Number.isInteger(price) || price < 0) return msg("Set a price");
  if (currency === "coins") return price < 1 ? msg("The price must be at least 1 coin") : price > maxCoins ? msg("The highest price allowed is {n} coins") : null;
  return price > 100_000_000_000 ? msg("That price is too high") : null;
}

/**
 * The buyer's page: each filled field as a row (not the phone: that's the "Call" button) — `label` and `value` are msg keys to translate when `tr` says so
 * (a choice's label, yes), else the value as written. `fmt` turns numbers and dates into the player's words.
 */
export function detailRows(kind: ProductKind, details: unknown, fmt: { num: (n: number) => string; date: (ms: number) => string }): { label: string; value: string; tr?: true; unit?: string }[] {
  const { details: d } = cleanDetails(kind, details);
  const rows: { label: string; value: string; tr?: true; unit?: string }[] = [];
  for (const f of KINDS[kind].fields) {
    const v = d[f.key];
    if (v == null || f.type === "phone") continue;
    if (f.type === "select") rows.push({ label: f.label, value: f.options.find((o) => o.key === v)!.label, tr: true });
    else if (f.type === "bool") rows.push({ label: f.label, value: msg("Yes"), tr: true });
    else if (f.type === "datetime") rows.push({ label: f.label, value: fmt.date(v as number) });
    else if (f.type === "number") rows.push({ label: f.label, value: fmt.num(v as number), ...(f.unit ? { unit: f.unit } : {}) });
    else if (f.type === "pairs") for (const p of v as Pair[]) rows.push({ label: p.k, value: p.v });
    else rows.push({ label: f.label, value: String(v) });
  }
  return rows;
}

/**
 * One short line under a product's name in a list: a ticket's date and venue (or from → to), a dish's section, an
 * ad's neighbourhood, a deal's end. Plain words and numbers — `fmt` as in detailRows.
 */
export function kindLine(kind: ProductKind, details: unknown, fmt: { date: (ms: number) => string }): string {
  const { details: d } = cleanDetails(kind, details);
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  if (kind === "ticket") return [typeof d.when === "number" ? fmt.date(d.when) : "", s("from") && s("to") ? `${s("from")} → ${s("to")}` : s("venue")].filter(Boolean).join(" · ");
  if (kind === "food") return s("section");
  if (kind === "ad") return s("area");
  if (kind === "deal") return typeof d.until === "number" ? fmt.date(d.until) : "";
  if (kind === "item") return [s("brand"), s("model")].filter(Boolean).join(" ");
  return "";
}

/** A ticket for something already over (or a deal past its date) can't be bought. */
export function expired(kind: ProductKind, details: unknown, now = Date.now()): boolean {
  const { details: d } = cleanDetails(kind, details);
  if (kind === "ticket") return typeof d.when === "number" && (typeof d.ends === "number" ? d.ends : d.when) < now;
  if (kind === "deal") return typeof d.until === "number" && d.until < now;
  return false;
}

// ---------------------------------------------------------------- paying in toman: the seller's contact
/** A phone a buyer can call: digits only (Persian/Arabic digits read too), an optional leading +; "" when too short. */
export function cleanPhone(raw: unknown): string {
  const s = ascii(clip(raw, 30)).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").slice(0, 15);
  return s.replace(/\D/g, "").length >= 5 ? s : "";
}

/**
 * The seller's own payment page (their Zarinpal / IDPay / bank link): https only, no credentials in it, ≤ 300
 * characters; "" when empty, null when it isn't a link we'd send buyers to.
 */
export function cleanPayLink(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (s.length > 300) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** How a buyer reaches the seller about a toman product: the ad's own phone first, then the shop's. */
export function contactOf(kind: ProductKind, details: unknown, shop: { phone: string; payLink: string }): { phone: string; payLink: string } {
  const { details: d } = cleanDetails(kind, details);
  return { phone: (typeof d.phone === "string" && d.phone) || cleanPhone(shop.phone), payLink: cleanPayLink(shop.payLink) || "" };
}

/** The private chat between one buyer and a shop: "shop:<shopId>:<buyerId>". */
export const shopRoom = (shopId: string, buyerId: string) => `shop:${shopId}:${buyerId}`;
export function parseShopRoom(room: string): { shopId: string; buyerId: string } | null {
  const m = /^shop:([A-Za-z0-9_-]{1,40}):([A-Za-z0-9_-]{1,40})$/.exec(room);
  return m ? { shopId: m[1], buyerId: m[2] } : null;
}
