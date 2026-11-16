// Bookable things to do (pure; tests/experiences.test.ts): Jabama Events (jabama.events) sells real tours, walks,
// workshops and shows in a city, each with its price a person, its next date and its reviews — the trip planner's
// outings link straight to the one that matches (server/travel.ts experiencesIn reads them):
//   GET https://api.jabama.events/events?city=<slug>[&cursor=…] → { items, nextCursor }
// Prices are TOMAN (the site shows «۲٬۶۰۰٬۰۰۰ تومان»; its JSON-LD calls it IRR, wrongly). A booking is finished on
// jabama.events/events/<id>, where the player picks the session — the site has no link that picks one for them.
// Cities it doesn't cover (Kish, Qeshm…) keep the planner's search link.
import type { Activity } from "./activities";

/** Our city keys → Jabama Events' city slugs (only the cities it has things in). */
export const JABAMA_CITIES: Record<string, string> = {
  tehran: "tehran", shiraz: "shiraz", isfahan: "isfahan", yazd: "yazd", mashhad: "mashhad", kashan: "kashan",
  rasht: "rasht", tabriz: "tabriz", ramsar: "ramsar", kerman: "kerman",
};
export const jabamaCity = (city: string) => JABAMA_CITIES[city] ?? null;

export type Experience = {
  id: string;
  title: string;
  /** Toman a person (the lowest after any discount); 0 = free or unknown. */
  price: number;
  /** As the site says it ("۹ ساعت"). */
  duration: string;
  /** Out of 5, null without reviews. */
  rating: number | null;
  reviews: number;
  image: string | null;
  /** The next session (ISO), null when none is open. */
  next: string | null;
  category: string;
  /** Where it meets ("کارگاه سفالگری زیتون"), and who runs it. */
  place: string;
  host: string;
};

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const num = (s: unknown) => {
  const n = Number(String(s ?? "").replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The rows of an /events answer, as experiences (anything without an id or a title is dropped). */
export function fromJabamaEvents(json: unknown): Experience[] {
  const items = (json as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: Experience[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    const id = str(r.id), title = str(r.title);
    if (!id || !title || r.active === false || r.linkOnly === true) continue;
    const price = num(r.minPriceAfterDiscount) || num(r.pricePerPerson) || num(r.unitPrice);
    const rating = num(r.rating);
    out.push({
      id,
      // (Every title starts "رزرو آنلاین …" — "book online" — which says nothing here.)
      title: title.replace(/^رزرو\s+آنلاین\s+/, ""),
      price,
      duration: str(r.duration),
      rating: rating > 0 ? Math.min(5, rating) : null,
      reviews: Math.max(0, Math.round(num(r.reviewCount))),
      image: str(r.coverImage) || str(r.landscapeImage) || null,
      next: str(r.firstAvailableSessionStartIso) || null,
      category: str((r.category as { label?: unknown } | null)?.label),
      place: str(r.locationLabel),
      host: str(r.organizerName),
    });
  }
  return out;
}

/** Words that say nothing about which outing it is. */
const STOP = new Set(["تور", "رزرو", "آنلاین", "بلیت", "بلیط", "با", "و", "در", "از", "به", "تا", "یک", "روزه", "گشت", "بازدید", "تاریخی", "بافت", "مجموعه", "تجربه"]);
const norm = (s: string) =>
  s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/[«»،,.:;!؟?()«»"'\-–—]/g, " ").toLowerCase();
const words = (s: string, city?: string) => norm(s).split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w) && w !== city);
/** One word stands for another: the same, or one the start of the other ("حافظ" / "حافظیه"), three letters at least. */
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/**
 * The bookable experience that is this outing, if there's one: the most of its search words in the title (all of
 * them when it has one or two, at least two otherwise); ties go to the better reviewed. `cityFa`: the city's Persian
 * name, which every title there may carry, so it doesn't count.
 */
export function matchExperience(a: Pick<Activity, "q">, list: readonly Experience[], cityFa?: string): Experience | null {
  const city = cityFa ? norm(cityFa).trim() : undefined;
  const want = [...new Set(words(a.q, city))];
  if (!want.length) return null;
  const need = Math.min(2, want.length);
  let best: Experience | null = null, bestScore = 0;
  for (const e of list) {
    const has = words(`${e.title} ${e.place}`, city);
    const score = want.filter((w) => has.some((h) => same(w, h))).length;
    if (score < need) continue;
    if (score > bestScore || (score === bestScore && best && (e.reviews > best.reviews || (e.reviews === best.reviews && (e.rating ?? 0) > (best.rating ?? 0))))) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

export const experienceUrl = (e: Pick<Experience, "id">) => `https://jabama.events/events/${encodeURIComponent(e.id)}`;
export const cityExperiencesUrl = (slug: string) => `https://jabama.events/all?city=${encodeURIComponent(slug)}`;
