"use client";
// Product search: everything on sale in the stores the game knows, as one list — no map needed.
// (the rules are lib/productSearch.ts, the gathering server/productSearch.ts, GET /api/local?products=)
//  - type what you want ("pizza", "phone case") — or nothing, and browse what's round you;
//  - narrow it: a price range in toman (with one-tap caps worked out from the results), only
//    what's discounted, which sources (food near you, deals near you, Torob, Basalam);
//  - sort it: best match, cheapest, most expensive, nearest, best rated, biggest discount;
//  - a tap on a dish opens its restaurant's card (menu, reviews, route); on a product, its page
//    with the way out to its own site.
// Typing waits a moment before asking; the list on screen stays until the new one arrives.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { formatDistance, type LatLng } from "@/lib/geo";
import { msg } from "@/lib/i18n";
import { snappfoodMenuUrl, type Vendor } from "@/lib/localData";
import { LOCAL_SOURCES, offOf, priceSteps, PRODUCT_SORT_KEYS, PRODUCT_SORTS, PRODUCT_SOURCE_KEYS, PRODUCT_SOURCES, type ProductHit, type ProductSort, type ProductSource } from "@/lib/productSearch";
import { api } from "./client";
import { Sheet } from "./ui";
import { Chip, FindTabs, FilterBar, FilterGroup, FilterPanel, Meta, SearchField, Stars } from "./Filters";
import { LISTING_SOURCES } from "@/lib/stores/listing";
import { Pic, ProductPage, VendorCard, type ExtProduct } from "./StoreInfo";

type Answer = { hits: ProductHit[]; total: number; stores: number; more: boolean; failed: ProductSource[] };
/** Words worth a tap (the stores' data is Persian, so the search words are too). */
const IDEAS: { label: string; q: string }[] = [
  { label: msg("Pizza"), q: "پیتزا" },
  { label: msg("Burger"), q: "برگر" },
  { label: msg("Kebab"), q: "کباب" },
  { label: msg("Sandwich"), q: "ساندویچ" },
  { label: msg("Coffee"), q: "قهوه" },
  { label: msg("Ice cream"), q: "بستنی" },
  { label: msg("Cake"), q: "کیک" },
  { label: msg("Phone"), q: "گوشی" },
  { label: msg("Shoes"), q: "کفش" },
];
const TYPE_WAIT_MS = 450;
const PANEL = "product-filters";
/** Each source wears its site's colour, as in the store list. */
const SOURCE_COLOR: Record<ProductSource, string> = { food: LISTING_SOURCES.snappfood.color, deal: LISTING_SOURCES.takhfifan.color, torob: LISTING_SOURCES.torob.color, basalam: "#f05a28" };
const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
/** "۲۵۰٬۰۰۰" / "250,000" / "250000" → 250000 (0: nothing usable typed). */
const numberOf = (s: string) => {
  const digits = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
  return digits ? Math.min(1e10, Number(digits)) : 0;
};

const pageOf = (h: ProductHit): ExtProduct => ({
  source: h.source === "deal" ? "takhfifan" : h.source === "food" ? "snappfood" : h.source,
  title: h.title,
  photo: h.photo,
  url: h.url ?? (h.code ? snappfoodMenuUrl(h.code) : ""),
  price: h.price > 0 ? (h.from ? t("from {n} toman", { n: fmtNum(h.price) }) : toman(h.price)) : "",
  lines: [h.store, h.was ? t("Was {n} toman", { n: fmtNum(h.was) }) : "", h.about],
  desc: h.about,
});

export function ProductSearch({ at, onClose, onStores }: { at: LatLng | null; onClose: () => void; /** Switch to the store list (the Search screen's other half). */ onStores?: () => void }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [maxDraft, setMaxDraft] = useState("");
  const [minDraft, setMinDraft] = useState("");
  const [range, setRange] = useState({ min: 0, max: 0 });
  const [sort, setSort] = useState<ProductSort>("match");
  const [onlyOff, setOnlyOff] = useState(false);
  const [open, setOpen] = useState(false);
  /** "Look in more restaurants": the same question again reads the next few menus. */
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<{ key: string; data: Answer } | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [page, setPage] = useState<ProductHit | null>(null);
  /** The price caps of this search before any price was set (they'd shrink with the list otherwise). */
  const caps = useRef<{ key: string; steps: number[] }>({ key: "", steps: [] });
  /** The last search that was allowed to read new menus: changing the price or the order re-sorts what's already known. */
  const asked = useRef("");

  useEffect(() => {
    const id = setTimeout(() => (setQ(draft.trim()), setRange({ min: numberOf(minDraft), max: numberOf(maxDraft) })), TYPE_WAIT_MS);
    return () => clearTimeout(id);
  }, [draft, minDraft, maxDraft]);

  const where = at ? `${at.lat.toFixed(4)},${at.lng.toFixed(4)}` : "";
  const base = `${q}|${sources.join(",")}|${where}`;
  const key = at ? `${base}|${range.min}|${range.max}|${sort}|${onlyOff ? 1 : 0}|${round}` : "";
  useEffect(() => {
    if (!key || !at) return;
    let live = true;
    const p = new URLSearchParams({ products: q, lat: at.lat.toFixed(5), lng: at.lng.toFixed(5), sort, off: onlyOff ? "1" : "0" });
    if (sources.length) p.set("src", sources.join(","));
    if (range.min) p.set("min", String(range.min));
    if (range.max) p.set("max", String(range.max));
    if (asked.current !== `${base}|${round}`) (asked.current = `${base}|${round}`), p.set("read", "1");
    api<Answer>(`/api/local?${p}`)
      .then((data) => {
        if (!live) return;
        if (!range.min && !range.max && !onlyOff) caps.current = { key: base, steps: priceSteps(data.hits) };
        setRes({ key, data });
        setError(null);
      })
      .catch((e) => live && setError({ key, text: (e as Error).message }));
    return () => void (live = false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !!key && res?.key !== key && error?.key !== key;
  const data = res?.data ?? null;
  const steps = caps.current.key === base ? caps.current.steps : [];
  const flip = (s: ProductSource) => setSources((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const shownSources = sources.length ? sources : PRODUCT_SOURCE_KEYS;
  // With nothing typed only the nearby sources can answer.
  const idle = q.length < 2;
  const note = useMemo(() => {
    if (!at) return t("Waiting for your position…");
    if (error?.key === key) return error.text;
    if (!data) return t("Searching…");
    const parts = [t("{n} results", { n: fmtNum(data.total) })];
    if (shownSources.includes("food") && data.stores) parts.push(t("{n} menus read", { n: fmtNum(data.stores) }));
    if (data.failed.length) parts.push(t("{sites} didn't answer", { sites: data.failed.map((s) => t(PRODUCT_SOURCES[s].site)).join(", ") }));
    return parts.join(" · ");
  }, [at, data, error, key, shownSources]);

  const openHit = (h: ProductHit) => {
    if (h.source === "food" && h.code && h.lat != null && h.lng != null) setVendor({ code: h.code, title: h.store, kind: "food", lat: h.lat, lng: h.lng, rating: (h.rating ?? 0) * 2, logo: "", url: h.url ?? snappfoodMenuUrl(h.code), open: true, about: "" });
    else setPage(h);
  };

  const nSet = (sources.length ? 1 : 0) + (range.min || range.max ? 1 : 0) + (onlyOff ? 1 : 0);
  const clearAll = () => (setMinDraft(""), setMaxDraft(""), setRange({ min: 0, max: 0 }), setOnlyOff(false), setSources([]));
  const capTo = (s: number) => (setMaxDraft(range.max === s ? "" : String(s)), setRange((r) => ({ ...r, max: r.max === s ? 0 : s })));
  const srcChip = (s: ProductSource) => {
    const off = idle && !LOCAL_SOURCES.includes(s);
    return (
      <Chip key={s} label={t(PRODUCT_SOURCES[s].site)} color={SOURCE_COLOR[s]} on={sources.includes(s)} disabled={off} title={off ? t("Type a name to search {site}", { site: t(PRODUCT_SOURCES[s].site) }) : t(PRODUCT_SOURCES[s].label)} onClick={() => flip(s)} />
    );
  };

  // A restaurant's card replaces the list while it's open (the search keeps its state underneath).
  if (vendor) return <VendorCard v={vendor} onClose={() => setVendor(null)} />;
  return (
    <Sheet title={onStores ? t("Search") : t("Find a product")} onClose={onClose} tall>
      <div className="fx-stack">
        <div className="fx-sticky">
          {onStores && <FindTabs on="products" onStores={onStores} />}
          <SearchField value={draft} onChange={setDraft} onSubmit={() => setQ(draft.trim())} placeholder={t("Pizza, coffee, phone case…")} label={t("Search products")} />
          <FilterBar count={nSet} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
            <Chip label={t(PRODUCT_SORTS[sort === "match" ? "cheap" : sort])} on={sort !== "match"} onClick={() => setSort(sort === "match" ? "cheap" : "match")} />
            <Chip label={t("Discounted only")} on={onlyOff} onClick={() => setOnlyOff(!onlyOff)} />
            {steps.slice(0, 2).map((s) => (
              <Chip key={s} label={t("Under {n}", { n: fmtNum(s) })} on={range.max === s} onClick={() => capTo(s)} />
            ))}
            {PRODUCT_SOURCE_KEYS.map(srcChip)}
          </FilterBar>
          <FilterPanel id={PANEL} open={open} onDone={() => setOpen(false)} onClear={nSet ? clearAll : undefined} results={data ? t("Show {n} results", { n: fmtNum(data.total) }) : t("Done")}>
            <FilterGroup title={t("Sort")}>
              {PRODUCT_SORT_KEYS.map((k) => (
                <Chip key={k} label={t(PRODUCT_SORTS[k])} on={sort === k} onClick={() => setSort(k)} />
              ))}
            </FilterGroup>
            <FilterGroup title={t("Price, toman")}>
              <div className="fx-range" style={{ flex: "1 1 100%" }}>
                <input inputMode="numeric" value={minDraft} onChange={(e) => setMinDraft(e.target.value)} placeholder={t("From")} aria-label={t("Lowest price, toman")} />
                <input inputMode="numeric" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)} placeholder={t("Up to (any)")} aria-label={t("Highest price, toman")} />
              </div>
              {steps.map((s) => (
                <Chip key={s} label={t("Under {n}", { n: fmtNum(s) })} on={range.max === s} onClick={() => capTo(s)} />
              ))}
              <Chip label={t("Discounted only")} on={onlyOff} onClick={() => setOnlyOff(!onlyOff)} />
            </FilterGroup>
            <FilterGroup title={t("Sites")}>{PRODUCT_SOURCE_KEYS.map(srcChip)}</FilterGroup>
          </FilterPanel>
          {!draft && (
            <div className="fx-chips" aria-label={t("Ideas")}>
              {IDEAS.map((i) => (
                <Chip key={i.q} label={t(i.label)} onClick={() => setDraft(i.q)} />
              ))}
            </div>
          )}
          <p className={`fx-status${loading ? " busy" : ""}`} aria-live="polite">{note}</p>
        </div>
        {!data && loading ? (
          <div className="fx-list" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fx-skel" />)}</div>
        ) : data && !data.hits.length && !loading ? (
          <div className="fx-empty">
            <span className="em">🔍</span>
            {idle ? t("Nothing on sale around here matches — widen the price or type what you're after.") : t("Nothing matches — try another word, a wider price, or more sources.")}
            {nSet > 0 && <button className="btn small ghost" onClick={clearAll}>{t("Clear all")}</button>}
          </div>
        ) : (
          <ul className={`fx-list ps-list ${loading ? "busy" : ""}`}>
            {(data?.hits ?? []).map((h) => {
              const off = offOf(h);
              return (
                <li key={h.id}>
                  <button type="button" className="fx-row" onClick={() => openHit(h)}>
                    {h.photo ? <Pic src={h.photo} className="fx-thumb" /> : <span className="fx-thumb" aria-hidden>{PRODUCT_SOURCES[h.source].emoji}</span>}
                    <span className="fx-body">
                      <span className="fx-title" dir="auto">{h.title}</span>
                      <Meta parts={[h.store, h.dist != null && formatDistance(h.dist), h.rating ? <Stars r={h.rating} /> : null]} />
                      <span className="fx-tags">
                        <span className="fx-src" style={{ "--site": SOURCE_COLOR[h.source] } as React.CSSProperties}>{t(PRODUCT_SOURCES[h.source].site)}</span>
                        {off > 0 && <span className="fx-off">−{fmtNum(off)}%</span>}
                      </span>
                    </span>
                    <span className="fx-price">
                      {h.price > 0 ? <b>{h.from ? t("from {n} toman", { n: fmtNum(h.price) }) : toman(h.price)}</b> : <span className="small muted">{t("No price")}</span>}
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
        <p className="small muted ext-source">{t("Prices are the stores' own, in toman, as last read from Snappfood, Takhfifan, Torob and Basalam.")}</p>
      </div>
      {page && <ProductPage p={pageOf(page)} onClose={() => setPage(null)} />}
    </Sheet>
  );
}
