// What a shopkeeper says (pure; tests/shopTalk.test.ts) when you walk into a store in the 3D city
// (drive/ShopScreen.tsx): a welcome by the time of day (or "we're closed"), today's favourite from the
// real menu, the discounts, the hours, a dish's price when you point at it, the bill at the counter.
// Every answer is an i18n key + params (said aloud by voices.talk, in the conversation panel as text).
import { msg } from "../i18n";
import { clockOf, dayClock, openState, type MenuSection, type Week } from "../localData";

export type ShopAct = "welcome" | "recommend" | "offers" | "hours" | "price" | "checkout" | "bye";
export type ShopLine = { key: string; params?: Record<string, string | number> };
export type ShopItem = { title: string; price: number; priceNow: number };
export type ShopCtx = {
  store: string;
  /** Its menu or catalogue (empty: we don't know what it sells). */
  sections: MenuSection[];
  week: Week | null;
  at: Date;
  timeZone?: string;
  /** The dish asked about ("price"). */
  item?: ShopItem;
  /** At the counter ("checkout"): how many things and the total (toman). */
  basket?: { n: number; total: number };
  /** Numbers in words ("120,000"). */
  num: (n: number) => string;
};

/** Sections that are the store's own "most popular" list (Snappfood's «پرطرفدارها»). */
const POPULAR = /پرطرفدار|محبوب|popular|best ?sell/i;

/** The dish to recommend: the top of its popular list, else the first priced dish. */
export function favourite(sections: MenuSection[]): ShopItem | null {
  const pop = sections.find((s) => POPULAR.test(s.title))?.items.find((i) => i.price > 0);
  if (pop) return pop;
  for (const s of sections) for (const i of s.items) if (i.price > 0) return i;
  return null;
}

/** Discounted dishes, the biggest discount first (each dish once). */
export function offers(sections: MenuSection[]): (ShopItem & { off: number })[] {
  const seen = new Set<string>();
  const out: (ShopItem & { off: number })[] = [];
  for (const s of sections)
    for (const i of s.items)
      if (i.price > 0 && i.priceNow > 0 && i.priceNow < i.price && !seen.has(i.title)) {
        seen.add(i.title);
        out.push({ ...i, off: Math.round((1 - i.priceNow / i.price) * 100) });
      }
  return out.sort((a, b) => b.off - a.off);
}

/** The shopkeeper's line for `act`. */
export function shopSay(act: ShopAct, c: ShopCtx): ShopLine {
  const state = c.week ? openState(c.week, c.at, c.timeZone) : null;
  const price = (i: ShopItem) => c.num(i.priceNow || i.price);
  switch (act) {
    case "welcome": {
      if (state && !state.open) return state.next != null ? { key: msg("Sorry, we're closed — we open again at {time}."), params: { time: clockOf(state.next) } } : { key: msg("Sorry, we're closed today.") };
      const { min } = dayClock(c.at, c.timeZone);
      const key = min < 12 * 60 && min >= 5 * 60 ? msg("Good morning, welcome to {store}!") : min >= 18 * 60 || min < 5 * 60 ? msg("Good evening, welcome to {store}!") : msg("Hello, welcome to {store}!");
      return { key, params: { store: c.store } };
    }
    case "recommend": {
      const f = favourite(c.sections);
      return f ? { key: msg("Everyone orders our {item} — {price} toman."), params: { item: f.title, price: price(f) } } : { key: msg("Have a look around, everything's fresh today.") };
    }
    case "offers": {
      const o = offers(c.sections);
      if (!o.length) return { key: msg("No discounts today, sorry — but the prices are good.") };
      const best = o[0];
      return o.length > 1
        ? { key: msg("{item} is {off}% off today — {price} toman. And {n} more on offer."), params: { item: best.title, off: best.off, price: price(best), n: o.length - 1 } }
        : { key: msg("{item} is {off}% off today — {price} toman."), params: { item: best.title, off: best.off, price: price(best) } };
    }
    case "hours": {
      if (!c.week) return { key: msg("I'm not sure about today's hours, sorry.") };
      const { day } = dayClock(c.at, c.timeZone);
      if (day >= 0 && c.week[day].some(([a, b]) => a === 0 && b >= 1440)) return { key: msg("We're open all day and all night.") };
      if (state?.open && state.next != null) return { key: msg("We're open until {time} today."), params: { time: clockOf(state.next) } };
      if (state?.next != null) return { key: msg("We open at {time}."), params: { time: clockOf(state.next) } };
      return { key: msg("We're closed for the rest of today.") };
    }
    case "price":
      return c.item ? (c.item.priceNow && c.item.priceNow < c.item.price ? { key: msg("{item}: {price} toman — it's on offer today."), params: { item: c.item.title, price: price(c.item) } } : { key: msg("{item}: {price} toman."), params: { item: c.item.title, price: price(c.item) } }) : { key: msg("Which one?") };
    case "checkout":
      return c.basket?.n ? { key: msg("That's {n} things — {total} toman altogether."), params: { n: c.basket.n, total: c.num(c.basket.total) } } : { key: msg("Your basket's empty — take your time.") };
    case "bye":
      return { key: msg("Thank you, come again!") };
  }
}
