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

export function ProductSearch({ at, onClose }: { at: LatLng | null; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [maxDraft, setMaxDraft] = useState("");
  const [minDraft, setMinDraft] = useState("");
  const [range, setRange] = useState({ min: 0, max: 0 });
  const [sort, setSort] = useState<ProductSort>("match");
  const [onlyOff, setOnlyOff] = useState(false);
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

  // A restaurant's card replaces the list while it's open (the search keeps its state underneath).
  if (vendor) return <VendorCard v={vendor} onClose={() => setVendor(null)} />;
  return (
    <Sheet title={`🔎 ${t("Find a product")}`} onClose={onClose} tall>
      <div className="psearch">
        <form className="ps-find" role="search" onSubmit={(e) => (e.preventDefault(), setQ(draft.trim()), (document.activeElement as HTMLElement | null)?.blur())}>
          <input className="dir-search" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Pizza, coffee, phone case…")} aria-label={t("Search products")} dir="auto" maxLength={60} enterKeyHint="search" />
        </form>
        {!draft && (
          <div className="filter-chips dir-chips" aria-label={t("Ideas")}>
            {IDEAS.map((i) => (
              <button key={i.q} className="filter-chip" onClick={() => setDraft(i.q)}>
                <span className="lb" dir="auto">{t(i.label)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="filter-chips dir-chips" role="group" aria-label={t("Where to look")}>
          {PRODUCT_SOURCE_KEYS.map((s) => {
            const off = idle && !LOCAL_SOURCES.includes(s);
            return (
              <button key={s} className={`filter-chip ${sources.includes(s) ? "on" : ""}`} aria-pressed={sources.includes(s)} disabled={off} title={off ? t("Type a name to search {site}", { site: t(PRODUCT_SOURCES[s].site) }) : t(PRODUCT_SOURCES[s].site)} onClick={() => flip(s)}>
                <span aria-hidden>{PRODUCT_SOURCES[s].emoji}</span>
                <span className="lb">{t(PRODUCT_SOURCES[s].label)}</span>
              </button>
            );
          })}
        </div>
        <div className="ps-price">
          <label>
            <span className="small muted">{t("From")}</span>
            <input className="input" inputMode="numeric" value={minDraft} onChange={(e) => setMinDraft(e.target.value)} placeholder="0" aria-label={t("Lowest price, toman")} />
          </label>
          <label>
            <span className="small muted">{t("Up to")}</span>
            <input className="input" inputMode="numeric" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)} placeholder={t("any price")} aria-label={t("Highest price, toman")} />
          </label>
          <label>
            <span className="small muted">{t("Sort")}</span>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as ProductSort)} aria-label={t("Sort")}>
              {PRODUCT_SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t(PRODUCT_SORTS[k])}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-chips dir-chips" role="group" aria-label={t("Price")}>
          {steps.map((s) => (
            <button key={s} className={`filter-chip ${range.max === s ? "on" : ""}`} aria-pressed={range.max === s} onClick={() => (setMaxDraft(range.max === s ? "" : String(s)), setRange((r) => ({ ...r, max: r.max === s ? 0 : s })))}>
              <span className="lb">{t("Under {n}", { n: fmtNum(s) })}</span>
            </button>
          ))}
          <button className={`filter-chip ${onlyOff ? "on" : ""}`} aria-pressed={onlyOff} onClick={() => setOnlyOff(!onlyOff)}>
            <span aria-hidden>🏷️</span>
            <span className="lb">{t("Discounted only")}</span>
          </button>
          {(range.min > 0 || range.max > 0 || onlyOff || sources.length > 0 || sort !== "match") && (
            <button className="filter-chip" onClick={() => (setMinDraft(""), setMaxDraft(""), setRange({ min: 0, max: 0 }), setOnlyOff(false), setSources([]), setSort("match"))}>
              <span className="lb">✕ {t("Clear")}</span>
            </button>
          )}
        </div>
        <p className={`small muted ps-note ${loading ? "busy" : ""}`} aria-live="polite">
          {loading && data ? `${t("Searching…")} ` : ""}
          {note}
        </p>
        {data && !data.hits.length && !loading && (
          <p className="small muted">{idle ? t("Nothing on sale around here matches — widen the price or type what you're after.") : t("Nothing matches — try another word, a wider price, or more sources.")}</p>
        )}
        <div className={`ext-items compact ps-list ${loading ? "busy" : ""}`}>
          {(data?.hits ?? []).map((h) => {
            const off = offOf(h);
            return (
              <button key={h.id} type="button" className="ext-item tap" onClick={() => openHit(h)}>
                {h.photo ? <Pic src={h.photo} /> : <span className="ext-ph">{PRODUCT_SOURCES[h.source].emoji}</span>}
                <div className="grow">
                  <b dir="auto">{h.title}</b>
                  <p className="small muted" dir="auto">
                    {PRODUCT_SOURCES[h.source].emoji} {[h.store, h.dist != null ? formatDistance(h.dist) : "", h.rating ? `⭐ ${fmtNum(h.rating)}` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {h.price > 0 ? (
                  <span className="price-tag">
                    <b>{h.from ? t("from {n} toman", { n: fmtNum(h.price) }) : toman(h.price)}</b>
                    {!!h.was && <s>{fmtNum(h.was)}</s>}
                    {off > 0 && <span className="deal-tag">−{fmtNum(off)}%</span>}
                  </span>
                ) : (
                  <span className="small muted">{t("No price")}</span>
                )}
              </button>
            );
          })}
        </div>
        {data && data.total > data.hits.length && <p className="small muted">{t("Showing the first {n} — narrow the price or the words to see the rest.", { n: fmtNum(data.hits.length) })}</p>}
        {data?.more && shownSources.includes("food") && (
          <button className="btn small cyan ps-more" disabled={loading} onClick={() => setRound((n) => n + 1)}>
            🍽️ {t("Look in more restaurants")}
          </button>
        )}
        <p className="small muted ext-source">{t("Prices are the stores' own, in toman, as last read from Snappfood, Takhfifan, Torob and Basalam.")}</p>
      </div>
      {page && <ProductPage p={pageOf(page)} onClose={() => setPage(null)} />}
    </Sheet>
  );
}
