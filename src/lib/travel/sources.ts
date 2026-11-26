// More travel sites (pure; tests/travelSources.test.ts): one adapter per site, each with a `deepLink`
// to the right page for a query (a route's tickets, a city's stays, a city's events) and, where the
// site serves its data to anyone, a `read` — the page or API to fetch and a parser into one Offer shape
// (toman, source, link, duration, checked-at), so every site's answer is deduped and sorted the same way.
//
// Probed from Iran on 2026-11-26 (curl, plain UA): every site's pages answer, but only Jajiga carries
// prices in its server-rendered page (`__NEXT_DATA__`, 6 stays and the city's cheapest night); the rest
// render prices in the browser from private APIs, so they're link-only. Slugs are each site's own
// (Bandar Abbas is "bandarabbas" on Safar724/Flytoday/Jajiga, "BandarAbbas" on Snapptrip; Isfahan is
// "Esfahan" on Eghamat24, which has pages for only some cities). Emruzkojaberam didn't answer from here.
import { msg } from "../i18n";
import { jalaliIso, type City, type Mode, type Route } from "./index";

export type Vertical = "ticket" | "stay" | "event";
export type SourceSite =
  | "sepehr360" | "threeclick" | "flytoday" | "snapptrip" | "ghasedak24" | "safar724" | "raja" | "payaneh"
  | "eghamat24" | "otaghak" | "jajiga" | "shab"
  | "vadoostan" | "emruzkojaberam" | "evand" | "tiwall";

export type SourceQuery =
  | { vertical: "ticket"; mode: Mode; route: Route }
  | { vertical: "stay"; city: City }
  | { vertical: "event"; city: City };

/** One thing for sale on one site, in the shape every site's answer is turned into. */
export type SourceOffer = {
  /** Same thing on the same site (dedupe). */
  key: string;
  source: SourceSite;
  vertical: Vertical;
  title: string;
  /** Toman (a stay: a night; a ticket: one adult; an event: one person). 0 = ask the site. */
  price: number;
  url: string;
  /** A ticket's journey (minutes). */
  minutes?: number;
  photo?: string;
  rating?: number;
  guests?: number;
  lat?: number;
  lng?: number;
  /** When it was read (ms). */
  checkedAt: number;
};

export type SourceAdapter = {
  site: SourceSite;
  name: string;
  color: string;
  verticals: Vertical[];
  /** The site's page for this query, or null when it has none (a site without that mode or city). */
  deepLink(q: SourceQuery): string | null;
  /** Where its data is and how to read it (only sites that serve it openly). */
  read?: { url(q: SourceQuery): string | null; parse(body: string, q: SourceQuery, now: number): SourceOffer[] };
};

const dashless = (c: City) => c.key.replace(/-/g, "");
const camel = (c: City) => c.en.replace(/[^A-Za-z]+/g, " ").trim().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
const fa = (c: City) => encodeURIComponent(c.fa);
const iataPair = (r: Route, sep = "-") => (r.from.iata && r.to.iata ? `${r.from.iata}${sep}${r.to.iata}` : null);
/** Eghamat24's city pages (their spelling): only these exist. */
const EGHAMAT: Record<string, string> = { tehran: "Tehran", mashhad: "Mashhad", isfahan: "Esfahan", shiraz: "Shiraz", tabriz: "Tabriz", kish: "Kish", qeshm: "Qeshm", yazd: "Yazd", gorgan: "Gorgan", bushehr: "Bushehr" };

const ticket = (q: SourceQuery) => (q.vertical === "ticket" ? q : null);
const cityOf = (q: SourceQuery) => (q.vertical === "ticket" ? null : q.city);

export const ADAPTERS: SourceAdapter[] = [
  // ---- tickets
  {
    site: "sepehr360", name: msg("Sepehr360"), color: "#0d47a1", verticals: ["ticket"],
    // A single-page app: its routes aren't addressable, so the search page.
    deepLink: (q) => (ticket(q)?.mode === "flight" ? "https://www.sepehr360.ir/" : null),
  },
  {
    site: "threeclick", name: msg("3click"), color: "#00a19a", verticals: ["ticket"],
    deepLink: (q) => { const t = ticket(q); const p = t?.mode === "flight" ? iataPair(t.route) : null; return p ? `https://3click.com/flight/${p}` : null; },
  },
  {
    site: "flytoday", name: msg("Flytoday"), color: "#1b5bd8", verticals: ["ticket", "stay"],
    deepLink: (q) => {
      const t = ticket(q);
      if (!t) return `https://www.flytoday.ir/hotel/${encodeURIComponent(`هتل-های-${cityOf(q)!.fa}`)}`;
      const r = t.route;
      if (t.mode === "flight") return r.from.iata && r.to.iata ? `https://www.flytoday.ir/flight/search?departure=${r.from.iata},1&arrival=${r.to.iata},1&departureDate=${r.date}&adt=1&chd=0&inf=0&cabin=1&isDomestic=true` : null;
      return `https://www.flytoday.ir/${t.mode}/${dashless(r.from)}-${dashless(r.to)}`;
    },
  },
  {
    site: "snapptrip", name: msg("Snapptrip"), color: "#00b862", verticals: ["ticket", "stay"],
    deepLink: (q) => {
      const t = ticket(q);
      if (!t) return `https://www.snapptrip.com/${encodeURIComponent("رزرو-هتل")}/${fa(cityOf(q)!)}`;
      const r = t.route;
      if (t.mode === "flight") return r.from.iata && r.to.iata ? `https://www.snapptrip.com/flights/${r.from.iata}_city/${r.to.iata}_city?date=${r.date}` : null;
      return `https://www.snapptrip.com/${t.mode === "train" ? "train-ticket" : "bus"}/${camel(r.from)}/${camel(r.to)}`;
    },
  },
  {
    site: "ghasedak24", name: msg("Ghasedak24"), color: "#e53935", verticals: ["ticket"],
    deepLink: (q) => { const t = ticket(q); const p = t?.mode === "flight" ? iataPair(t.route) : null; return p ? `https://ghasedak24.com/flights/${p}` : null; },
  },
  {
    site: "safar724", name: msg("Safar724"), color: "#ff6f00", verticals: ["ticket"],
    deepLink: (q) => { const t = ticket(q); return t?.mode === "bus" ? `https://safar724.com/bus/${dashless(t.route.from)}-${dashless(t.route.to)}?date=${jalaliIso(t.route.date)}` : null; },
  },
  {
    site: "raja", name: msg("Raja (railways)"), color: "#0a7a3d", verticals: ["ticket"],
    deepLink: (q) => (ticket(q)?.mode === "train" ? "https://www.raja.ir/" : null),
  },
  {
    site: "payaneh", name: msg("Payaneh"), color: "#e3262f", verticals: ["ticket"],
    deepLink: (q) => (ticket(q)?.mode === "bus" ? "https://payaneh.ir/" : null),
  },
  // ---- stays
  {
    site: "eghamat24", name: msg("Eghamat24"), color: "#1e88e5", verticals: ["stay"],
    deepLink: (q) => { const c = cityOf(q); return c && q.vertical === "stay" ? `https://www.eghamat24.com/${EGHAMAT[c.key] ?? "Iran"}Hotels.html` : null; },
  },
  {
    site: "otaghak", name: msg("Otaghak"), color: "#7b1fa2", verticals: ["stay"],
    deepLink: (q) => { const c = cityOf(q); return c && q.vertical === "stay" ? `https://www.otaghak.com/city/${c.key}/` : null; },
  },
  {
    site: "jajiga", name: msg("Jajiga"), color: "#f9a825", verticals: ["stay"],
    deepLink: (q) => { const c = cityOf(q); return c && q.vertical === "stay" ? `https://www.jajiga.com/s/${dashless(c)}` : null; },
    read: {
      url: (q) => (q.vertical === "stay" ? `https://www.jajiga.com/s/${dashless(q.city)}` : null),
      parse: (body, q, now) => parseJajiga(body, now),
    },
  },
  {
    site: "shab", name: msg("Shab"), color: "#3949ab", verticals: ["stay"],
    deepLink: (q) => { const c = cityOf(q); return c && q.vertical === "stay" ? `https://www.shab.ir/search/city/${fa(c)}` : null; },
  },
  // ---- events
  {
    site: "evand", name: msg("Evand"), color: "#5e35b1", verticals: ["event"],
    deepLink: (q) => (q.vertical === "event" ? `https://evand.com/events?cities=${fa(q.city)}` : null),
  },
  {
    site: "tiwall", name: msg("Tiwall"), color: "#c62828", verticals: ["event"],
    deepLink: (q) => (q.vertical === "event" ? "https://www.tiwall.com/" : null),
  },
  {
    site: "vadoostan", name: msg("Vadoostan"), color: "#2e7d32", verticals: ["event"],
    // Tehran's walks and workshops only.
    deepLink: (q) => (q.vertical === "event" && q.city.key === "tehran" ? "https://vadoostan.ir/app/experiences" : null),
  },
  {
    site: "emruzkojaberam", name: msg("Emruzkojaberam"), color: "#ef6c00", verticals: ["event"],
    deepLink: (q) => (q.vertical === "event" && q.city.key === "tehran" ? "https://emruzkojaberam.com/" : null),
  },
];
const BY_SITE = new Map(ADAPTERS.map((a) => [a.site, a]));
export const adapterOf = (s: SourceSite) => BY_SITE.get(s)!;

/** Every site's page for a query ("Compare on" links), in the adapters' order. */
export function compareLinks(q: SourceQuery): { site: SourceSite; name: string; color: string; url: string }[] {
  const out: { site: SourceSite; name: string; color: string; url: string }[] = [];
  for (const a of ADAPTERS) {
    if (!a.verticals.includes(q.vertical)) continue;
    const url = a.deepLink(q);
    if (url) out.push({ site: a.site, name: a.name, color: a.color, url });
  }
  return out;
}

/** The sites that can be read for a query. */
export const readable = (q: SourceQuery) => ADAPTERS.filter((a) => a.read && a.verticals.includes(q.vertical) && a.read.url(q));

/** Offers from many sites as one list: each thing once (its cheapest), priced ones cheapest first, then the rest. */
export function mergeOffers(lists: SourceOffer[][]): SourceOffer[] {
  const best = new Map<string, SourceOffer>();
  for (const o of lists.flat()) {
    const had = best.get(o.key);
    if (!had || (o.price > 0 && (had.price <= 0 || o.price < had.price))) best.set(o.key, o);
  }
  return [...best.values()].sort((a, b) => (a.price > 0 ? a.price : Infinity) - (b.price > 0 ? b.price : Infinity) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- Jajiga (server-rendered page)
type JajigaRoom = { id?: number; title?: string; price?: number; priceAfterDiscount?: number; url?: string; guestNumber?: number; geo?: { lat?: number; lng?: number }; rating?: { total?: number }; pictures?: { items?: { url?: string }[] } };

/** The stays in a Jajiga city page's `__NEXT_DATA__` (prices in toman a night). */
export function parseJajiga(html: string, now: number): SourceOffer[] {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let rooms: JajigaRoom[] = [];
  try {
    rooms = (JSON.parse(m[1]) as { props?: { pageProps?: { initialData?: { rooms?: { items?: JajigaRoom[] } } } } }).props?.pageProps?.initialData?.rooms?.items ?? [];
  } catch {
    return [];
  }
  return rooms
    .filter((r): r is JajigaRoom & { id: number; title: string } => typeof r.id === "number" && !!r.title)
    .map((r) => {
      const pic = r.pictures?.items?.[0]?.url;
      const price = r.priceAfterDiscount && r.priceAfterDiscount > 0 ? r.priceAfterDiscount : r.price ?? 0;
      return {
        key: `jajiga:${r.id}`,
        source: "jajiga" as const,
        vertical: "stay" as const,
        title: r.title.trim(),
        price: Math.max(0, Math.round(price)),
        url: `https://www.jajiga.com${r.url?.startsWith("/") ? r.url : `/room/${r.id}`}`,
        ...(pic ? { photo: `https://storage.jajiga.com/public/pictures/medium/${pic}` } : {}),
        ...(r.rating?.total ? { rating: r.rating.total } : {}),
        ...(r.guestNumber ? { guests: r.guestNumber } : {}),
        ...(typeof r.geo?.lat === "number" && typeof r.geo?.lng === "number" ? { lat: Math.round(r.geo.lat * 1e5) / 1e5, lng: Math.round(r.geo.lng * 1e5) / 1e5 } : {}),
        checkedAt: now,
      };
    });
}
