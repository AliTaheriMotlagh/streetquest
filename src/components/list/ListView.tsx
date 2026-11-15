"use client";
// The List view (lib/appView.ts "list"): StreetQuest as an ordinary website — no map, no game. One
// full screen with a header (name, the sections, the way to the map and the game) and, under it, the
// section's page: every store round you, products and prices, the trip planner, hotels and stays.
// The screens are the same ones the map opens as sheets, drawn as pages (game/pageMode.tsx): on a
// wide screen the filters sit in the sidebar beside the results, which become a grid of cards; on a
// phone the filters stay one button away and the results one column. Styles: app/list.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { APP_VIEWS, type AppView } from "@/lib/appView";
import type { LatLng } from "@/lib/geo";
import { LIST_TABS, parseListTab, LIST_TAB_KEY, type ListTab } from "@/lib/listTabs";
import { PageMode } from "../game/pageMode";
import { Icon } from "../drive/icons";

export type ListSections = Record<ListTab, () => ReactNode>;

export function ListView({ sections, view, onView, place }: {
  /** Each section's page, drawn only while it's open. */
  sections: ListSections;
  view: AppView;
  onView: (v: AppView) => void;
  /** Where the lists are round (the neighbourhood's name, when known). */
  place?: string | null;
  at?: LatLng | null;
}) {
  const [tab, setTabState] = useState<ListTab>("stores");
  useEffect(() => {
    try {
      const asked = new URLSearchParams(location.search).get("tab");
      setTabState(parseListTab(asked ?? localStorage.getItem(LIST_TAB_KEY)));
    } catch {}
  }, []);
  const setTab = (k: ListTab) => {
    setTabState(k);
    try {
      localStorage.setItem(LIST_TAB_KEY, k);
    } catch {}
    main.current?.scrollTo({ top: 0 });
  };
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const main = useRef<HTMLElement>(null);
  // The sliding marker under the open tab (app/list.css .lv-tabs::after): its place and width from the
  // tab's own box, again when the bar resizes (a phone turned, the language switched).
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabs.current;
    if (!nav) return;
    const place = () => {
      const on = nav.querySelector<HTMLElement>("button.on");
      if (!on) return;
      nav.style.setProperty("--ix", `${on.offsetLeft}px`);
      nav.style.setProperty("--iw", `${on.offsetWidth}px`);
      on.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(nav);
    return () => ro?.disconnect();
  }, [tab]);
  return (
    <div className="lv" data-tab={tab}>
      <header className="lv-top">
        <div className="lv-brand">
          <b>StreetQuest</b>
          {place && <small dir="auto">📍 {place}</small>}
        </div>
        <nav className="lv-tabs" ref={tabs} role="tablist" aria-label={t("Sections")}>
          {LIST_TABS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} className={tab === s.key ? "on" : ""} onClick={() => setTab(s.key)}>
              <span aria-hidden>{s.emoji}</span>
              <span>{t(s.label)}</span>
            </button>
          ))}
        </nav>
        <div className="lv-views" role="group" aria-label={t("View")}>
          {APP_VIEWS.map((v) => (
            <button key={v.key} type="button" className={view === v.key ? "on" : ""} aria-pressed={view === v.key} onClick={() => onView(v.key)} title={t(v.hint)}>
              <Icon name={v.icon} size={18} />
              <span>{t(v.label)}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="lv-body">
        <aside className="lv-side" ref={setDock} aria-label={t("Filters")} />
        <main className="lv-main" ref={main}>
          <PageMode dock={dock}>{sections[tab]()}</PageMode>
        </main>
      </div>
    </div>
  );
}
