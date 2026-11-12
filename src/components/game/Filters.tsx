"use client";
// The one look for searching and filtering, wherever a list can be narrowed: the store list on
// the map, product search, the Places panel in the 3D city. Styles: app/filters.css.
//
//   <SearchField>   the box (clears with ✕, Enter hides the phone keyboard)
//   <FilterBar>     one row under it: [Filters •n] [quick chips…] — never wraps, scrolls sideways
//   <FilterPanel>   opens in place under the bar (no sheet on a sheet): groups of chips, then
//                   "Clear" and "Show n results"
//   <Chip>          a toggle; a site's chip wears its brand colour (`color`) and a count (`n`)
//   <Meta>          "Store · 300 m · ★ 4.3": each part isolated (<bdi>) so Persian and English,
//                   digits and units never run into each other
//   <Sources>       the sites that list a store, as small coloured badges
import { useId, type ReactNode } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { LISTING_SOURCES, type ListingSource } from "@/lib/stores/listing";

export function SearchField({ value, onChange, placeholder, label, onSubmit, max = 60 }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; onSubmit?: () => void; max?: number }) {
  return (
    <form
      className="fx-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <span className="fx-search-ic" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} dir="auto" maxLength={max} enterKeyHint="search" autoComplete="off" />
      {value && (
        <button type="button" className="fx-clear" onClick={() => onChange("")} aria-label={t("Clear")}>
          ✕
        </button>
      )}
    </form>
  );
}

export function Chip({ on, onClick, label, emoji, n, color, disabled, title }: { on?: boolean; onClick: () => void; label: string; emoji?: string; n?: number; color?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={`fx-chip${on ? " on" : ""}${color ? " site" : ""}`}
      aria-pressed={on ?? false}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={color ? ({ "--site": color } as React.CSSProperties) : undefined}
    >
      {emoji && <span className="fx-em" aria-hidden>{emoji}</span>}
      <span className="fx-lb" dir="auto">{label}</span>
      {n != null && <span className="fx-n">{fmtNum(n)}</span>}
    </button>
  );
}

/** [Filters •n] then the quick chips; `open` shows the panel id'd `panelId` below. */
export function FilterBar({ count, open, onToggle, panelId, children }: { count: number; open: boolean; onToggle: () => void; panelId: string; children?: ReactNode }) {
  return (
    <div className="fx-bar">
      <button type="button" className={`fx-chip fx-filters${open ? " on" : ""}${count ? " set" : ""}`} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        <span className="fx-lb">{t("Filters")}</span>
        {count > 0 && <span className="fx-n dot">{fmtNum(count)}</span>}
      </button>
      {children}
    </div>
  );
}

export function FilterPanel({ id, open, onClear, onDone, results, children }: { id: string; open: boolean; onClear?: () => void; onDone: () => void; results: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fx-panel" id={id} role="group" aria-label={t("Filters")}>
      {children}
      <div className="fx-panel-end">
        {onClear && (
          <button type="button" className="btn ghost small" onClick={onClear}>
            {t("Clear all")}
          </button>
        )}
        <button type="button" className="btn small fx-done" onClick={onDone}>
          {results}
        </button>
      </div>
    </div>
  );
}

export function FilterGroup({ title, children, wrap = true }: { title: string; children: ReactNode; wrap?: boolean }) {
  const id = useId();
  return (
    <section className="fx-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <div className={`fx-chips${wrap ? " wrap" : ""}`}>{children}</div>
    </section>
  );
}

/** Parts joined by " · ", each one isolated so mixed scripts and numbers keep their order. */
export function Meta({ parts, className = "fx-meta" }: { parts: (ReactNode | false | null | undefined | "")[]; className?: string }) {
  const shown = parts.filter((p) => p !== false && p != null && p !== "");
  return (
    <span className={className}>
      {shown.map((p, i) => (
        <span key={i} className="fx-part">
          {i > 0 && <span className="fx-dot" aria-hidden> · </span>}
          <bdi>{p}</bdi>
        </span>
      ))}
    </span>
  );
}

export const Stars = ({ r }: { r: number }) => (r > 0 ? <span className="fx-stars">★ {fmtNum(r)}</span> : null);

export function Sources({ list, max = 3 }: { list: ListingSource[]; max?: number }) {
  return (
    <span className="fx-sources">
      {list.slice(0, max).map((s) => (
        <span key={s} className="fx-src" style={{ "--site": LISTING_SOURCES[s].color } as React.CSSProperties} title={t(LISTING_SOURCES[s].name)}>
          {t(LISTING_SOURCES[s].name)}
        </span>
      ))}
      {list.length > max && <span className="fx-src more">+{fmtNum(list.length - max)}</span>}
    </span>
  );
}

/** Stores | Products: the one Search screen's two halves (StoreBrowser, ProductSearch). */
export function FindTabs({ on, onStores, onProducts }: { on: "stores" | "products"; onStores?: () => void; onProducts?: () => void }) {
  return (
    <div className="fx-seg" role="tablist" aria-label={t("Search")}>
      <button type="button" role="tab" aria-selected={on === "stores"} className={on === "stores" ? "on" : ""} onClick={on === "stores" ? undefined : onStores}>
        {t("Stores")}
      </button>
      <button type="button" role="tab" aria-selected={on === "products"} className={on === "products" ? "on" : ""} onClick={on === "products" ? undefined : onProducts}>
        {t("Products & prices")}
      </button>
    </div>
  );
}
