"use client";
// Product search: everything on sale in the stores the game knows, as one list — no map needed.
// (the rules are lib/productSearch.ts, the gathering server/productSearch.ts, GET /api/local?products=)
//  - type what you want ("pizza", "phone case") — or nothing, and browse what's round you;
//  - narrow it: a price range in toman (with one-tap caps worked out from the results), only
//    what's discounted, which sources (food near you, deals near you, Torob, Basalam);
//  - sort it: best match, cheapest, most expensive, nearest, best rated, biggest discount;
//  - a tap on a dish opens its restaurant's card (menu, reviews, route); on a product, its page
//    with the way out to its own site;
//  - compare: the same product sold by several stores (a strip over the list: the price spread and
//    what the cheapest saves), or up to three picked with ⇄, side by side.
// Typing waits a moment before asking; the list on screen stays until the new one arrives.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { formatDistance, type LatLng } from "@/lib/geo";
import { msg } from "@/lib/i18n";
import { snappfoodMenuUrl, type Vendor } from "@/lib/localData";
import { LOCAL_SOURCES, offOf, priceSteps, PRODUCT_SORT_KEYS, PRODUCT_SORTS, PRODUCT_SOURCES, productSourcesAt, sameProducts, type ProductHit, type ProductSort, type ProductSource } from "@/lib/productSearch";
import { api } from "./client";
import { Sheet } from "./ui";
import { Chip, FindTabs, FilterBar, FilterGroup, FilterPanel, Meta, openTravel, SearchField, Stars } from "./Filters";
import { parseQuery, PART_LABEL, scaleBare, shopQuery, withoutPart, type Parsed } from "@/lib/search/query";
import { fresh, keep, kept } from "./keep";
import { LISTING_SOURCES } from "@/lib/stores/listing";
import { countryAt, deliveryAt } from "@/lib/region";
import { Pic, ProductPage, VendorCard, type ExtProduct } from "./StoreInfo";

type Answer = { hits: ProductHit[]; total: number; bySource?: Partial<Record<ProductSource, number>>; stores: number; more: boolean; failed: ProductSource[] };
const RECENT = "sq-product-recent";
/** A search's answer kept on the phone is used as is for this long. */
const PRODUCTS_FRESH_MS = 10 * 60_000;
/** Shops the game can't read (they refuse other sites, browsers and servers alike): one tap searches them for the same words. */
const ELSEWHERE: { name: string; url: (q: string) => string }[] = [
  { name: msg("Digikala"), url: (q) => `https://www.digikala.com/search/?q=${encodeURIComponent(q)}` },
  { name: msg("Torob"), url: (q) => `https://torob.com/search/?query=${encodeURIComponent(q)}` },
  { name: msg("Emalls"), url: (q) => `https://emalls.ir/Search/?q=${encodeURIComponent(q)}` },
  { name: msg("Basalam"), url: (q) => `https://basalam.com/search?q=${encodeURIComponent(q)}` },
];
const VIEW = "sq-product-view";
const RATINGS = [4, 4.5];
const DISTANCES = [500, 1000, 3000];
const readLocal = <T,>(k: string, none: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? none;
  } catch {
    return none;
  }
};
const writeLocal = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
/**
 * Words worth a tap, in the language the stores there write their menus in (Iran: Persian; Turkey:
 * Turkish; elsewhere the map's English). The label is in the player's language, the search in the stores'.
 */
const IDEAS: Record<"IR" | "TR" | "EN", { label: string; q: string }[]> = {
  IR: [
    { label: msg("Pizza"), q: "پیتزا" },
    { label: msg("Burger"), q: "برگر" },
    { label: msg("Kebab"), q: "کباب" },
    { label: msg("Sandwich"), q: "ساندویچ" },
    { label: msg("Coffee"), q: "قهوه" },
    { label: msg("Ice cream"), q: "بستنی" },
    { label: msg("Cake"), q: "کیک" },
    { label: msg("Phone"), q: "گوشی" },
    { label: msg("Shoes"), q: "کفش" },
  ],
  TR: [
    { label: msg("Döner"), q: "döner" },
    { label: msg("Kebab"), q: "kebap" },
    { label: msg("Pide & lahmacun"), q: "pide" },
    { label: msg("Burger"), q: "burger" },
    { label: msg("Pizza"), q: "pizza" },
    { label: msg("Köfte"), q: "köfte" },
    { label: msg("Coffee"), q: "kahve" },
    { label: msg("Dessert"), q: "tatlı" },
    { label: msg("Breakfast"), q: "kahvaltı" },
  ],
  EN: [
    { label: msg("Pizza"), q: "pizza" },
    { label: msg("Burger"), q: "burger" },
    { label: msg("Sandwich"), q: "sandwich" },
    { label: msg("Coffee"), q: "coffee" },
    { label: msg("Ice cream"), q: "ice cream" },
    { label: msg("Cake"), q: "cake" },
  ],
};
/** The ideas for where the player is. */
export const ideasAt = (at: LatLng | null) => {
  const c = at ? countryAt(at.lat, at.lng) : "IR";
  return IDEAS[c === "IR" || c === "TR" ? c : "EN"];
};
const TYPE_WAIT_MS = 450;
const PANEL = "product-filters";
/** Each source wears its site's colour, as in the store list. */
const SOURCE_COLOR: Record<ProductSource, string> = { food: LISTING_SOURCES.snappfood.color, deal: LISTING_SOURCES.takhfifan.color, torob: LISTING_SOURCES.torob.color, basalam: "#f05a28" };
const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
/** A hit's price in its own money: lira for a Yemeksepeti dish (Turkey), toman for the rest. */
const priceOf = (h: ProductHit) => (h.currency === "TRY" ? t("{n} lira", { n: fmtNum(h.price) }) : h.from ? t("from {n} toman", { n: fmtNum(h.price) }) : toman(h.price));
/** The site a source is at a point: the food is Yemeksepeti's in Turkey. */
const siteOf = (s: ProductSource, at: LatLng | null) => (s === "food" && deliveryAt(at) === "yemeksepeti" ? t("Yemeksepeti") : t(PRODUCT_SOURCES[s].site));
/** "۲۵۰٬۰۰۰" / "250,000" / "250000" → 250000 (0: nothing usable typed). */
const numberOf = (s: string) => {
  const digits = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
  return digits ? Math.min(1e10, Number(digits)) : 0;
};

const pageOf = (h: ProductHit): ExtProduct => ({
  source: h.source === "deal" ? "takhfifan" : h.source === "food" ? (h.currency === "TRY" ? "yemeksepeti" : "snappfood") : h.source,
  title: h.title,
  photo: h.photo,
  url: h.url ?? (h.code ? snappfoodMenuUrl(h.code) : ""),
  price: h.price > 0 ? priceOf(h) : "",
  lines: [h.store, h.was ? (h.currency === "TRY" ? t("Was {n} lira", { n: fmtNum(h.was) }) : t("Was {n} toman", { n: fmtNum(h.was) })) : "", h.about],
  desc: h.about,
});

export function ProductSearch({ at, onClose, onStores }: { at: LatLng | null; onClose: () => void; /** Switch to the store list (the Search screen's other half). */ onStores?: () => void }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [maxDraft, setMaxDraft] = useState("");
  const [minDraft, setMinDraft] = useState("");
  const [range, setRange] = useState({ min: 0, max: 0 });
  const [chosenSort, setSort] = useState<ProductSort | null>(null);
  const [chosenOff, setOnlyOff] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxDist, setMaxDist] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [grid, setGrid] = useState(false);
  useEffect(() => (setRecent(readLocal<string[]>(RECENT, [])), setGrid(readLocal<boolean>(VIEW, false))), []);
  /** What the words say beyond the words ("under 300k", "cheapest", "on sale", "flight to Mashhad"). */
  const [parsed, setParsed] = useState<Parsed>(() => parseQuery(""));
  const [open, setOpen] = useState(false);
  /** "Look in more restaurants": the same question again reads the next few menus. */
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<{ key: string; data: Answer } | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [vendor, setVendor] = useState<{ v: Vendor; dish: string } | null>(null);
  const [page, setPage] = useState<ProductHit | null>(null);
  /** Picked with ⇄ to compare side by side (up to MAX_COMPARE), and the comparison open. */
  const [tray, setTray] = useState<ProductHit[]>([]);
  const [comparing, setComparing] = useState<{ title: string; hits: ProductHit[] } | null>(null);
  /** The price caps of this search before any price was set (they'd shrink with the list otherwise). */
  const caps = useRef<{ key: string; steps: number[] }>({ key: "", steps: [] });
  /** The last search that was allowed to read new menus: changing the price or the order re-sorts what's already known. */
  const asked = useRef("");

  const lira = deliveryAt(at) === "yemeksepeti";
  useEffect(() => {
    const id = setTimeout(() => {
      const p = parseQuery(draft);
      const said = scaleBare(p, lira);
      setParsed(p);
      setQ(p.words);
      // A price typed in the boxes wins over one said in the words.
      setRange({ min: numberOf(minDraft) || said.min || 0, max: numberOf(maxDraft) || said.max || 0 });
    }, TYPE_WAIT_MS);
    return () => clearTimeout(id);
  }, [draft, minDraft, maxDraft, lira]);
  const sort: ProductSort = chosenSort ?? parsed.sort ?? "match";
  const onlyOff = chosenOff || !!parsed.onlyOff;
  // A search that found something is remembered (the last 8, newest first).
  const remember = (text: string) => {
    const v = text.trim();
    if (v.length < 2) return;
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 8);
    setRecent(next);
    writeLocal(RECENT, next);
  };

  const where = at ? `${at.lat.toFixed(4)},${at.lng.toFixed(4)}` : "";
  const base = `${q}|${sources.join(",")}|${where}`;
  const key = at ? `${base}|${range.min}|${range.max}|${sort}|${onlyOff ? 1 : 0}|${minRating}|${maxDist}|${round}` : "";
  useEffect(() => {
    if (!key || !at) return;
    let live = true;
    // This phone's copy of the same search shows at once (offline too); while it's fresh nothing is asked.
    const mine = kept<Answer>(`products:${key}`);
    if (mine) setRes({ key, data: mine.data });
    if (fresh(mine, PRODUCTS_FRESH_MS) && asked.current === `${base}|${round}`) return;
    const p = new URLSearchParams({ products: q, lat: at.lat.toFixed(5), lng: at.lng.toFixed(5), sort, off: onlyOff ? "1" : "0" });
    if (sources.length) p.set("src", sources.join(","));
    if (range.min) p.set("min", String(range.min));
    if (range.max) p.set("max", String(range.max));
    if (minRating) p.set("rating", String(minRating));
    if (maxDist) p.set("dist", String(maxDist));
    if (asked.current !== `${base}|${round}`) (asked.current = `${base}|${round}`), p.set("read", "1");
    api<Answer>(`/api/local?${p}`)
      .then((data) => {
        if (!live) return;
        if (!range.min && !range.max && !onlyOff) caps.current = { key: base, steps: priceSteps(data.hits) };
        if (!data.total && data.failed.length && mine?.data.total) return;
        setRes({ key, data });
        setError(null);
        if (data.total) keep(`products:${key}`, data);
        if (data.total && draft.trim().length >= 2) remember(draft);
      })
      .catch((e) => live && !mine && setError({ key, text: (e as Error).message }));
    return () => void (live = false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !!key && res?.key !== key && error?.key !== key;
  const data = res?.data ?? null;
  const steps = caps.current.key === base ? caps.current.steps : [];
  const flip = (s: ProductSource) => setSources((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  // Only the sites that answer where the player is (Iran's in Iran; Yemeksepeti in Turkey).
  const here = useMemo(() => productSourcesAt(at), [at && countryAt(at.lat, at.lng)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownSources = sources.length ? sources : here;
  // With nothing typed only the nearby sources can answer.
  const idle = q.length < 2;
  const note = useMemo(() => {
    if (!at) return t("Waiting for your position…");
    if (error?.key === key) return error.text;
    if (!data) return t("Searching…");
    const parts = [t("{n} results", { n: fmtNum(data.total) })];
    if (shownSources.includes("food") && data.stores) parts.push(t("{n} menus read", { n: fmtNum(data.stores) }));
    if (data.failed.length) parts.push(t("{sites} didn't answer", { sites: data.failed.map((s) => siteOf(s, at)).join(", ") }));
    return parts.join(" · ");
  }, [at, data, error, key, shownSources]);

  const openHit = (h: ProductHit) => {
    if (h.source === "food" && h.code && h.lat != null && h.lng != null) setVendor({ v: { code: h.code, title: h.store, kind: "food", lat: h.lat, lng: h.lng, rating: (h.rating ?? 0) * 2, logo: "", url: h.url ?? snappfoodMenuUrl(h.code), open: true, about: "" }, dish: h.title });
    else setPage(h);
  };

  const nSet = (sources.length ? 1 : 0) + (range.min || range.max ? 1 : 0) + (onlyOff ? 1 : 0) + (minRating ? 1 : 0) + (maxDist ? 1 : 0);
  const clearAll = () => (setMinDraft(""), setMaxDraft(""), setRange({ min: 0, max: 0 }), setOnlyOff(false), setSources([]), setMinRating(0), setMaxDist(0), setDraft(parsed.words));
  const flipGrid = () => (setGrid(!grid), writeLocal(VIEW, !grid));
  const partText = (k: Parsed["parts"][number]) =>
    k.kind === "max" ? t("Under {n}", { n: fmtNum(range.max) }) : k.kind === "min" ? t("From {n}", { n: fmtNum(range.min) }) : k.kind === "range" ? t("{a} to {b}", { a: fmtNum(range.min), b: fmtNum(range.max) }) : k.kind === "sort" ? t(PRODUCT_SORTS[sort]) : k.kind === "off" ? t("Discounted only") : t(PART_LABEL[k.kind]);
  const capTo = (s: number) => (setMaxDraft(range.max === s ? "" : String(s)), setRange((r) => ({ ...r, max: r.max === s ? 0 : s })));
  const srcChip = (s: ProductSource) => {
    const off = idle && !LOCAL_SOURCES.includes(s);
    return (
      <Chip key={s} label={siteOf(s, at)} color={SOURCE_COLOR[s]} n={data?.bySource?.[s]} on={sources.includes(s)} disabled={off} title={off ? t("Type a name to search {site}", { site: siteOf(s, at) }) : t(PRODUCT_SOURCES[s].label)} onClick={() => flip(s)} />
    );
  };

  // A restaurant's card replaces the list while it's open, on the dish that was tapped (the search
  // keeps its words, filters and results underneath): ‹ or the phone's Back returns to the list.
  // (Every hook above this line: returning before one crashed React — "fewer hooks than expected".)
  const groups = useMemo(() => sameProducts(data?.hits ?? []), [data]);
  if (vendor) return <VendorCard v={vendor.v} focus={vendor.dish} onBack={() => setVendor(null)} onClose={onClose} />;
  const inTray = (h: ProductHit) => tray.some((x) => x.id === h.id);
  const flipTray = (h: ProductHit) => setTray((v) => (v.some((x) => x.id === h.id) ? v.filter((x) => x.id !== h.id) : [...v, h].slice(-MAX_COMPARE)));

  return (
    <Sheet title={onStores ? t("Search") : t("Find a product")} onClose={onClose} tall>
      <div className="fx-stack">
        <div className="fx-sticky">
          {onStores && <FindTabs on="products" onStores={onStores} />}
          <SearchField value={draft} onChange={setDraft} onSubmit={() => setQ(draft.trim())} placeholder={t("Pizza, coffee, phone case…")} label={t("Search products")} />
          <FilterBar count={nSet} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
            <Chip label={t(PRODUCT_SORTS[sort === "match" ? "cheap" : sort])} on={sort !== "match"} onClick={() => setSort(sort === "match" ? "cheap" : "match")} />
            <Chip label={t("Discounted only")} on={onlyOff} onClick={() => setOnlyOff(!chosenOff)} />
            <Chip label={grid ? t("List") : t("Grid")} emoji={grid ? "☰" : "▦"} onClick={flipGrid} />
            {steps.slice(0, 2).map((s) => (
              <Chip key={s} label={t("Under {n}", { n: fmtNum(s) })} on={range.max === s} onClick={() => capTo(s)} />
            ))}
            {here.length > 1 && here.map(srcChip)}
          </FilterBar>
          <FilterPanel id={PANEL} open={open} onDone={() => setOpen(false)} onClear={nSet ? clearAll : undefined} results={data ? t("Show {n} results", { n: fmtNum(data.total) }) : t("Done")}>
            <FilterGroup title={t("Sort")}>
              {PRODUCT_SORT_KEYS.map((k) => (
                <Chip key={k} label={t(PRODUCT_SORTS[k])} on={sort === k} onClick={() => setSort(k)} />
              ))}
            </FilterGroup>
            <FilterGroup title={lira ? t("Price, lira") : t("Price, toman")}>
              <div className="fx-range" style={{ flex: "1 1 100%" }}>
                <input inputMode="numeric" value={minDraft} onChange={(e) => setMinDraft(e.target.value)} placeholder={t("From")} aria-label={lira ? t("Lowest price, lira") : t("Lowest price, toman")} />
                <input inputMode="numeric" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)} placeholder={t("Up to (any)")} aria-label={lira ? t("Highest price, lira") : t("Highest price, toman")} />
              </div>
              {steps.map((s) => (
                <Chip key={s} label={t("Under {n}", { n: fmtNum(s) })} on={range.max === s} onClick={() => capTo(s)} />
              ))}
              <Chip label={t("Discounted only")} on={onlyOff} onClick={() => setOnlyOff(!chosenOff)} />
            </FilterGroup>
            <FilterGroup title={t("Store rating")}>
              <Chip label={t("Any")} on={!minRating} onClick={() => setMinRating(0)} />
              {RATINGS.map((r) => <Chip key={r} label={`★ ${fmtNum(r)}+`} on={minRating === r} onClick={() => setMinRating(minRating === r ? 0 : r)} />)}
            </FilterGroup>
            {here.some((s) => LOCAL_SOURCES.includes(s)) && (
              <FilterGroup title={t("Distance")}>
                <Chip label={t("Any")} on={!maxDist} onClick={() => setMaxDist(0)} />
                {DISTANCES.map((d) => <Chip key={d} label={t("Within {d}", { d: formatDistance(d) })} on={maxDist === d} onClick={() => setMaxDist(maxDist === d ? 0 : d)} />)}
              </FilterGroup>
            )}
            {here.length > 1 && <FilterGroup title={t("Sites")}>{here.map(srcChip)}</FilterGroup>}
          </FilterPanel>
          {parsed.parts.length > 0 && (
            <div className="fx-chips ps-understood" aria-label={t("Understood")}>
              {parsed.parts.filter((k) => k.kind !== "trip").map((k) => (
                <Chip key={k.kind + k.text} on label={`${partText(k)} ✕`} title={t("Remove “{w}” from the search", { w: k.text })} onClick={() => setDraft(withoutPart(draft, k.text))} />
              ))}
            </div>
          )}
          {parsed.trip && (
            <button className="ps-trip" onClick={() => openTravel(parsed.trip!.city.key)}>
              <span aria-hidden>{parsed.trip.kind === "hotel" ? "🏨" : parsed.trip.kind === "train" ? "🚆" : parsed.trip.kind === "bus" ? "🚌" : "✈️"}</span>
              <b className="grow">{t("Tickets & hotels in {city}", { city: getLocale() === "fa" ? parsed.trip.city.fa : parsed.trip.city.en })}</b>
              <span aria-hidden>›</span>
            </button>
          )}
          {!draft && recent.length > 0 && (
            <div className="fx-chips" aria-label={t("Recent searches")}>
              <span className="tiny muted">🕘</span>
              {recent.map((r) => <Chip key={r} label={r} onClick={() => setDraft(r)} />)}
              <button className="link-btn tiny" onClick={() => (setRecent([]), writeLocal(RECENT, []))}>{t("Clear")}</button>
            </div>
          )}
          {!draft && (
            <div className="fx-chips" aria-label={t("Ideas")}>
              {ideasAt(at).map((i) => (
                <Chip key={i.q} label={t(i.label)} onClick={() => setDraft(i.q)} />
              ))}
            </div>
          )}
          <p className={`fx-status${loading ? " busy" : ""}`} aria-live="polite">{note}</p>
        </div>
        {groups.length > 0 && (
          <section className="ps-same" aria-label={t("Same product, different stores")}>
            <h3 className="tiny muted">{t("Same product, different stores")}</h3>
            <div className="ps-same-row">
              {groups.map((g) => (
                <button key={g.hits[0].id} type="button" className="ps-same-card" onClick={() => setComparing({ title: g.title, hits: g.hits })}>
                  {g.hits[0].photo ? <Pic src={g.hits[0].photo} className="ps-same-pic" /> : <span className="ps-same-pic" aria-hidden>{PRODUCT_SOURCES[g.hits[0].source].emoji}</span>}
                  <span className="ps-same-body">
                    <b dir="auto">{g.title}</b>
                    <small>{t("{n} stores · {lo} – {hi}", { n: fmtNum(g.stores), lo: fmtNum(g.min), hi: fmtNum(g.max) })}</small>
                    {g.save > 0 && <span className="fx-off">{t("Save {n}%", { n: fmtNum(g.save) })}</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {!data && loading ? (
          <div className="fx-list" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fx-skel" />)}</div>
        ) : data && !data.hits.length && !loading ? (
          <div className="fx-empty">
            <span className="em">🔍</span>
            {idle ? t("Nothing on sale around here matches — widen the price or type what you're after.") : t("Nothing matches — try another word, a wider price, or more sources.")}
            {nSet > 0 && <button className="btn small ghost" onClick={clearAll}>{t("Clear all")}</button>}
          </div>
        ) : (
          <ul className={`fx-list ps-list ${grid ? "ps-grid" : ""} ${loading ? "busy" : ""}`}>
            {(data?.hits ?? []).map((h) => {
              const off = offOf(h);
              return (
                <li key={h.id} className="ps-li">
                  <button type="button" className={`ps-pick${inTray(h) ? " on" : ""}`} aria-pressed={inTray(h)} onClick={() => flipTray(h)} title={t("Compare")} aria-label={t("Compare {name}", { name: h.title })}>⇄</button>
                  <button type="button" className="fx-row" onClick={() => openHit(h)}>
                    {h.photo ? <Pic src={h.photo} className="fx-thumb" /> : <span className="fx-thumb" aria-hidden>{PRODUCT_SOURCES[h.source].emoji}</span>}
                    <span className="fx-body">
                      <span className="fx-title" dir="auto">{h.title}</span>
                      <Meta parts={[h.store, h.dist != null && formatDistance(h.dist), h.rating ? <Stars r={h.rating} /> : null]} />
                      <span className="fx-tags">
                        <span className="fx-src" style={{ "--site": SOURCE_COLOR[h.source] } as React.CSSProperties}>{siteOf(h.source, at)}</span>
                        {off > 0 && <span className="fx-off">−{fmtNum(off)}%</span>}
                      </span>
                    </span>
                    <span className="fx-price">
                      {h.price > 0 ? <b>{priceOf(h)}</b> : <span className="small muted">{t("No price")}</span>}
                      {!!h.was && <s>{fmtNum(h.was)}</s>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.hits.length && <p className="small muted">{t("Showing the first {n} — narrow the price or the words to see the rest.", { n: fmtNum(data.hits.length) })}</p>}
        {data?.more && shownSources.includes("food") && (
          <button className="btn small ghost fx-more" disabled={loading} onClick={() => setRound((n) => n + 1)}>
            🍽️ {t("Look in more restaurants")}
          </button>
        )}
        {q.length >= 2 && !lira && (
          <div className="fx-chips ps-elsewhere" aria-label={t("Search other shops")}>
            <span className="tiny muted">{t("Also search")}</span>
            {ELSEWHERE.map((e) => (
              <a key={e.name} className="fx-chip" href={e.url(shopQuery(q))} target="_blank" rel="noreferrer noopener">{t(e.name)} ↗</a>
            ))}
          </div>
        )}
        <p className="small muted ext-source">
          {!here.length
            ? t("No product site covers this area yet — the store list still shows the places around you.")
            : lira
              ? t("Prices are the restaurants' own, in lira, as last read from Yemeksepeti.")
              : t("Prices are the stores' own, in toman, as last read from Snappfood, Takhfifan, Torob and Basalam.")}
        </p>
      </div>
      {tray.length > 0 && (
        <div className="ps-tray" role="status">
          <span className="grow">{t("{n} picked to compare", { n: fmtNum(tray.length) })}</span>
          <button type="button" className="btn small ghost" onClick={() => setTray([])}>{t("Clear")}</button>
          <button type="button" className="btn small" disabled={tray.length < 2} onClick={() => setComparing({ title: t("Compare"), hits: [...tray].sort((a, b) => a.price - b.price) })}>{t("Compare")}</button>
        </div>
      )}
      {comparing && <Compare title={comparing.title} hits={comparing.hits} at={at} onOpen={(h) => (setComparing(null), openHit(h))} onClose={() => setComparing(null)} />}
      {page && <ProductPage p={pageOf(page)} onClose={() => setPage(null)} />}
    </Sheet>
  );
}

const MAX_COMPARE = 3;

/**
 * Products side by side: a column each (cheapest first, scrolling sideways when there are many), a row
 * per thing worth comparing — price, discount, store, site, distance, rating — the best of each marked.
 */
function Compare({ title, hits, at, onOpen, onClose }: { title: string; hits: ProductHit[]; at: LatLng | null; onOpen: (h: ProductHit) => void; onClose: () => void }) {
  const priced = hits.filter((h) => h.price > 0);
  const lo = priced.length ? Math.min(...priced.map((h) => h.price)) : 0;
  const near = Math.min(...hits.map((h) => h.dist ?? Infinity));
  const top = Math.max(...hits.map((h) => h.rating ?? 0));
  const rows: { label: string; cell: (h: ProductHit) => React.ReactNode; best?: (h: ProductHit) => boolean }[] = [
    { label: t("Price"), cell: (h) => (h.price > 0 ? priceOf(h) : t("No price")), best: (h) => h.price > 0 && h.price === lo && priced.length > 1 },
    { label: t("Over the cheapest"), cell: (h) => (h.price > 0 && lo && h.price > lo ? `+${fmtNum(h.price - lo)}` : "—") },
    { label: t("Discount"), cell: (h) => (offOf(h) ? `−${fmtNum(offOf(h))}%` : "—") },
    { label: t("Store"), cell: (h) => <bdi>{h.store}</bdi> },
    { label: t("Site"), cell: (h) => siteOf(h.source, at) },
    { label: t("Distance"), cell: (h) => (h.dist != null ? formatDistance(h.dist) : "—"), best: (h) => h.dist != null && h.dist === near && hits.length > 1 },
    { label: t("Store rating"), cell: (h) => (h.rating ? <Stars r={h.rating} /> : "—"), best: (h) => !!h.rating && h.rating === top && hits.length > 1 },
  ];
  return (
    <Sheet title={title} onBack={onClose} onClose={onClose} tall>
      <div className="ps-cmp" data-no-drag>
        <table>
          <thead>
            <tr>
              <th aria-hidden />
              {hits.map((h) => (
                <th key={h.id} scope="col">
                  <button type="button" className="ps-cmp-head" onClick={() => onOpen(h)}>
                    {h.photo ? <Pic src={h.photo} className="ps-cmp-pic" /> : <span className="ps-cmp-pic" aria-hidden>{PRODUCT_SOURCES[h.source].emoji}</span>}
                    <span dir="auto">{h.title}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {hits.map((h) => (
                  <td key={h.id} className={r.best?.(h) ? "best" : ""}>{r.cell(h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">{t("Tap a product to open it. Prices as last read from each site.")}</p>
    </Sheet>
  );
}
