"use client";
// Every store round you, from every site, as one list (lib/stores/listing.ts): Snappfood,
// Torob, Takhfifan, cinemas, Bilbooard, Irangaah, Okala, Netbarg and the map's own places —
// each store once, with the sites that list it. Search, then [Filters] for sites / types /
// open now / rating / deals / with prices, and an order. A tap opens the store's own card.
// The same pieces (Filters.tsx) are used by product search and the 3D city's Places panel.
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { formatDistance, type LatLng } from "@/lib/geo";
import { STORE_TYPE_KEYS, STORE_TYPES, type StoreType } from "@/lib/stores/directory";
import {
  filterCount, filterListings, hayOf, LISTING_SORT_KEYS, LISTING_SORTS, LISTING_SOURCE_KEYS, LISTING_SOURCES,
  type Listing, type ListingFilter, type ListingRef, type ListingSource,
} from "@/lib/stores/listing";
import { Chip, FindTabs, FilterBar, FilterGroup, FilterPanel, Meta, SearchField, Sources, Stars } from "./Filters";
import { Pic } from "./StoreInfo";
import { Sheet } from "./ui";

const PAGE = 40;
const PANEL = "stores-filters";
const flip = <T,>(l: T[] | undefined, x: T) => ((l ?? []).includes(x) ? (l ?? []).filter((y) => y !== x) : [...(l ?? []), x]);

export function StoreRow({ l, m, onPick }: { l: Listing; m: number | null; onPick: () => void }) {
  const ty = STORE_TYPES[l.type];
  return (
    <button type="button" className="fx-row" onClick={onPick}>
      {l.img ? <Pic src={l.img} className="fx-thumb" /> : <span className="fx-thumb" style={{ background: `color-mix(in srgb, ${ty.color} 35%, var(--panel-solid))` }} aria-hidden>{ty.emoji}</span>}
      <span className="fx-body">
        <span className="fx-title" dir="auto">{l.name}</span>
        <Meta parts={[l.cat || t(ty.label), m != null && formatDistance(m), l.rating > 0 && <Stars r={l.rating} />]} />
        <span className="fx-tags">
          {l.open != null && <span className={`fx-open${l.open ? "" : " shut"}`}>{l.open ? t("Open") : t("Closed")}</span>}
          {l.off > 0 && <span className="fx-off">−{fmtNum(l.off)}%</span>}
          <Sources list={l.sources} />
        </span>
      </span>
    </button>
  );
}

export function StoreBrowser({ listings, at, loading, onPick, onClose, onServices, onProducts }: {
  listings: Listing[];
  at: LatLng | null;
  /** Some sites are still being asked. */
  loading?: boolean;
  onPick: (ref: ListingRef) => void;
  onClose: () => void;
  onServices: () => void;
  onProducts?: () => void;
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<ListingFilter>({ sort: "near" });
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  // Typing never waits for the list: the box updates at once, the list a moment later; each
  // store's searchable text is built once.
  const dq = useDeferredValue(q);
  const hay = useMemo(() => {
    const m = new Map<string, string>();
    return (l: Listing) => m.get(l.key) ?? (m.set(l.key, hayOf(l, t)), m.get(l.key)!);
  }, [listings]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => filterListings(listings, { ...f, q: dq }, at, hay), [listings, f, dq, at, hay]);
  useEffect(() => setShown(PAGE), [dq, f]);
  const n = filterCount(f);
  const set = (p: Partial<ListingFilter>) => setF((x) => ({ ...x, ...p }));
  const srcs = LISTING_SOURCE_KEYS.filter((s) => res.bySource.get(s) || f.sources?.includes(s));
  const types = STORE_TYPE_KEYS.filter((k) => res.byType.get(k) || f.types?.includes(k));
  const results = t("Show {n} stores", { n: fmtNum(res.rows.length) });

  return (
    <Sheet title={t("Search")} onClose={onClose} tall>
      <div className="fx-stack">
        <div className="fx-sticky">
          {onProducts && <FindTabs on="stores" onProducts={onProducts} />}
          <SearchField value={q} onChange={setQ} placeholder={t("Search stores, food, doctors…")} />
          <FilterBar count={n} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
            <Chip label={t("Open now")} on={f.openNow} onClick={() => set({ openNow: !f.openNow })} />
            <Chip label={t("Deals")} on={f.deals} onClick={() => set({ deals: !f.deals })} />
            <Chip label="★ 4+" on={f.minRating === 4} onClick={() => set({ minRating: f.minRating === 4 ? 0 : 4 })} />
            {srcs.slice(0, 4).map((s) => (
              <Chip key={s} label={t(LISTING_SOURCES[s].name)} color={LISTING_SOURCES[s].color} on={f.sources?.includes(s)} onClick={() => set({ sources: flip(f.sources, s) })} />
            ))}
          </FilterBar>
          <FilterPanel id={PANEL} open={open} onDone={() => setOpen(false)} onClear={n ? () => setF({ sort: f.sort }) : undefined} results={results}>
            <FilterGroup title={t("Sort")}>
              {LISTING_SORT_KEYS.map((k) => (
                <Chip key={k} label={t(LISTING_SORTS[k])} on={(f.sort ?? "near") === k} onClick={() => set({ sort: k })} />
              ))}
            </FilterGroup>
            <FilterGroup title={t("Sites")}>
              {srcs.map((s: ListingSource) => (
                <Chip key={s} label={t(LISTING_SOURCES[s].name)} color={LISTING_SOURCES[s].color} n={res.bySource.get(s) ?? 0} on={f.sources?.includes(s)} onClick={() => set({ sources: flip(f.sources, s) })} />
              ))}
            </FilterGroup>
            <FilterGroup title={t("Type")}>
              {types.map((k: StoreType) => (
                <Chip key={k} emoji={STORE_TYPES[k].emoji} label={t(STORE_TYPES[k].label)} n={res.byType.get(k) ?? 0} on={f.types?.includes(k)} onClick={() => set({ types: flip(f.types, k) })} />
              ))}
            </FilterGroup>
            <FilterGroup title={t("Show only")}>
              <Chip label={t("Open now")} on={f.openNow} onClick={() => set({ openNow: !f.openNow })} />
              <Chip label={t("Deals")} on={f.deals} onClick={() => set({ deals: !f.deals })} />
              <Chip label={t("With prices")} on={f.priced} onClick={() => set({ priced: !f.priced })} />
              {[3.5, 4, 4.5].map((r) => (
                <Chip key={r} label={`★ ${fmtNum(r)}+`} on={f.minRating === r} onClick={() => set({ minRating: f.minRating === r ? 0 : r })} />
              ))}
            </FilterGroup>
          </FilterPanel>
          <p className={`fx-status${loading ? " busy" : ""}`} aria-live="polite">
            {t("{n} stores", { n: fmtNum(res.rows.length) })}
            {loading ? ` · ${t("still asking some sites…")}` : ""}
          </p>
        </div>

        {!listings.length ? (
          loading ? (
            <div className="fx-list" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fx-skel" />)}</div>
          ) : (
            <div className="fx-empty"><span className="em">🏪</span>{t("No stores here yet — turn store sites on in the map filter, or move the map.")}</div>
          )
        ) : !res.rows.length ? (
          <div className="fx-empty">
            <span className="em">🔍</span>
            {t("No store matches — try fewer filters.")}
            {(n > 0 || q) && <button className="btn small ghost" onClick={() => (setF({ sort: f.sort }), setQ(""))}>{t("Clear all")}</button>}
          </div>
        ) : (
          <ul className="fx-list">
            {res.rows.slice(0, shown).map(({ l, m }) => (
              <li key={l.key}>
                <StoreRow l={l} m={at ? m : null} onPick={() => onPick(l.ref)} />
              </li>
            ))}
          </ul>
        )}
        {res.rows.length > shown && <button className="btn small ghost fx-more" onClick={() => setShown(shown + PAGE)}>{t("Show more")} ({fmtNum(res.rows.length - shown)})</button>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn small ghost grow" onClick={onServices}>🛠️ {t("Services & shops")}</button>
        </div>
      </div>
    </Sheet>
  );
}
