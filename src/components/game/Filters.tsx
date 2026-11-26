"use client";
// The one look for searching and filtering, wherever a list can be narrowed: the store list on
// the map, product search, the Places panel in the 3D city. Styles: app/filters.css.
//
//   <SearchField>   the box (clears with ✕, Enter hides the phone keyboard)
//   <FilterBar>     one row under it: [Filters •n] [quick chips…] — never wraps, scrolls sideways
//   <FilterPanel>   its own sheet over everything: groups of chips scrolling inside it, "Clear all"
//                   at the top, "Show n results" always at the bottom
//   <Chip>          a toggle; a site's chip wears its brand colour (`color`) and a count (`n`)
//   <Meta>          "Store · 300 m · ★ 4.3": each part isolated (<bdi>) so Persian and English,
//                   digits and units never run into each other
//   <Sources>       the sites that list a store, as small coloured badges
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pushBack } from "./backStack";
import { usePage } from "./pageMode";
import { fmtNum, t, dot } from "@/lib/i18n";
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
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} dir={value ? "auto" : undefined} maxLength={max} enterKeyHint="search" autoComplete="off" />
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
  // Docked beside the results (List view, wide screen): no button needed.
  const page = usePage();
  const docked = !!page?.wide && !!page.dock;
  return (
    <div className="fx-bar">
      {!docked && <button type="button" className={`fx-chip fx-filters${open ? " on" : ""}${count ? " set" : ""}`} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        <span className="fx-lb">{t("Filters")}</span>
        {count > 0 && <span className="fx-n dot">{fmtNum(count)}</span>}
      </button>}
      {children}
    </div>
  );
}

/**
 * The filters, as their own sheet over everything (a bottom sheet on a phone, a dialog on a wide
 * screen): a head with "Clear all" and ✕, the groups scrolling on their own — never the list or
 * the sheet behind — and "Show n results" always in reach at the bottom. Back and the backdrop close it.
 */
export function FilterPanel({ id, open, onClear, onDone, results, children, title }: { id: string; open: boolean; onClear?: () => void; onDone: () => void; results: string; children: ReactNode; title?: string }) {
  const done = useRef(onDone);
  done.current = onDone;
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  // In the List view on a wide screen the filters stay open beside the results (pageMode.tsx).
  const page = usePage();
  const docked = !!page?.wide && !!page.dock;
  useEffect(() => (open && !docked ? pushBack(() => done.current()) : undefined), [open, docked]);
  // Escape closes it on a keyboard.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && done.current();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open]);
  if (docked)
    return createPortal(
      <section className="fx-dock" id={id} aria-label={title ?? t("Filters")}>
        <header className="fx-dock-head">
          <h2>{title ?? t("Filters")}</h2>
          {onClear && (
            <button type="button" className="fx-sheet-clear" onClick={onClear}>
              {t("Clear all")}
            </button>
          )}
        </header>
        <div className="fx-dock-body">{children}</div>
      </section>,
      page.dock!,
    );
  if (!open || !host) return null;
  return createPortal(
    <div className="fx-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onDone()}>
      <div className="fx-sheet" id={id} role="dialog" aria-modal="true" aria-label={title ?? t("Filters")} data-no-drag>
        <div className="fx-sheet-grip" aria-hidden />
        <header className="fx-sheet-head">
          <h2>{title ?? t("Filters")}</h2>
          {onClear && (
            <button type="button" className="fx-sheet-clear" onClick={onClear}>
              {t("Clear all")}
            </button>
          )}
          <button type="button" className="fx-sheet-x" onClick={onDone} aria-label={t("Close")}>
            ✕
          </button>
        </header>
        <div className="fx-sheet-body">{children}</div>
        <footer className="fx-sheet-foot">
          <button type="button" className="btn fx-done" onClick={onDone}>
            {results}
          </button>
        </footer>
      </div>
    </div>,
    host,
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

/** Parts joined by dot(), each one isolated so mixed scripts and numbers keep their order. */
export function Meta({ parts, className = "fx-meta" }: { parts: (ReactNode | false | null | undefined | "")[]; className?: string }) {
  const shown = parts.filter((p) => p !== false && p != null && p !== "");
  return (
    <span className={className}>
      {shown.map((p, i) => (
        <span key={i} className="fx-part">
          {/* "•", not "·": in Persian a middle dot reads as the digit zero (۰). */}
          {i > 0 && <span className="fx-dot" aria-hidden> • </span>}
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

/** Open the travel planner (components/game/Travel.tsx) from anywhere: the map and the 3D city listen. `to`: a city key. */
export const openTravel = (to?: string) => window.dispatchEvent(new CustomEvent("sq-travel", { detail: { to } }));

/** Stores | Products: the Search screen's two parts (StoreBrowser, ProductSearch). Travel has its own screen. */
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

/**
 * The sort, always in reach at the start of the filter bar: a pill that says how the list is
 * ordered now ("⇅ Nearest first ▾"), opening a short menu of the other orders — one tap to see,
 * one to change. (A bare <select> hid what each order was until it was opened, and looked like text.)
 */
export function SortMenu<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string; emoji?: string }[]; onChange: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away, true);
    addEventListener("keydown", key);
    return () => (document.removeEventListener("pointerdown", away, true), removeEventListener("keydown", key));
  }, [open]);
  const cur = options.find((o) => o.key === value) ?? options[0];
  return (
    <div className="fx-sortm" ref={box}>
      <button type="button" className={`fx-chip fx-sortm-btn${open ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span aria-hidden>⇅</span>
        <span className="fx-lb">{cur?.label}</span>
        <span aria-hidden className="fx-sortm-car">▾</span>
      </button>
      {open && (
        <ul className="fx-sortm-list" role="listbox" id={id} aria-label={t("Sort")}>
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value}>
              <button type="button" className={o.key === value ? "on" : ""} onClick={() => (onChange(o.key), setOpen(false))}>
                {o.emoji && <span aria-hidden>{o.emoji}</span>}
                <span className="grow">{o.label}</span>
                {o.key === value && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
