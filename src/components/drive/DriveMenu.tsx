"use client";
// The 3D city's pause menu: a full-height panel (full screen on a phone, a column at the start
// edge on a desktop) with a tab rail. Keyboard and pad driven: arrows / D-pad move between
// tabs, Esc / B go back. Styles: app/hud.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { Icon, type IconName } from "./icons";

export type PmTab<K extends string> = { key: K; icon: IconName; label: string; /** The heading when it differs from the rail label. */ title?: string; badge?: number };

const LEAVE_MS = 170;

export function DriveMenu<K extends string>({ tabs, active, onTab, onClose, children }: { tabs: PmTab<K>[]; active: K; onTab: (k: K) => void; onClose: () => void; children: ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const cur = useRef({ tabs, active, onTab });
  cur.current = { tabs, active, onTab };
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_MS);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Focus lands on the open tab, and goes back to where it was when the menu closes.
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    rail.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    return () => was?.focus?.({ preventScroll: true });
  }, []);

  const step = (d: number) => {
    const { tabs: ts, active: a, onTab: go } = cur.current;
    const i = ts.findIndex((x) => x.key === a);
    const next = ts[(i + d + ts.length) % ts.length];
    go(next.key);
    requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(`[data-k="${next.key}"]`)?.focus({ preventScroll: true }));
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Esc closes anywhere in the menu; arrows move between tabs while the rail has focus.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return e.preventDefault(), e.stopPropagation(), close();
    if (!(e.target as HTMLElement).closest?.(".pm-rail")) return;
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowRight") return e.preventDefault(), step(1);
    if (k === "ArrowUp" || k === "ArrowLeft") return e.preventDefault(), step(-1);
    if (k === "Home") return e.preventDefault(), void cur.current.onTab(cur.current.tabs[0].key);
    if (k === "End") return e.preventDefault(), void cur.current.onTab(cur.current.tabs[cur.current.tabs.length - 1].key);
  };

  // A pad: D-pad up/down (or the stick) change tab, B backs out, A presses what has focus.
  useEffect(() => {
    let raf = 0;
    let held = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pads = navigator.getGamepads?.();
      if (!pads) return;
      let mask = 0;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (!p?.connected) continue;
        if (p.buttons[1]?.pressed) mask |= 1; // B
        if (p.buttons[12]?.pressed || (p.axes[1] ?? 0) < -0.6) mask |= 2; // up
        if (p.buttons[13]?.pressed || (p.axes[1] ?? 0) > 0.6) mask |= 4; // down
        if (p.buttons[0]?.pressed) mask |= 8; // A
      }
      const fresh = mask & ~held;
      held = mask;
      if (fresh & 1) closeRef.current();
      else if (fresh & 2) stepRef.current(-1);
      else if (fresh & 4) stepRef.current(1);
      else if (fresh & 8) (document.activeElement as HTMLElement | null)?.click?.();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const on = tabs.find((x) => x.key === active);
  return (
    <>
      <div className={`pm-scrim ${leaving ? "out" : ""}`} onClick={close} aria-hidden />
      <aside className={`pm ${leaving ? "out" : ""}`} role="dialog" aria-modal="true" aria-label={t("Menu")} onKeyDown={onKey}>
        <div className="pm-rail" role="tablist" aria-orientation="vertical" aria-label={t("Menu")} ref={rail}>
          {tabs.map((tb) => (
            <button key={tb.key} data-k={tb.key} role="tab" id={`pm-t-${tb.key}`} aria-selected={active === tb.key} aria-controls="pm-panel" tabIndex={active === tb.key ? 0 : -1} className="pm-tab" onClick={() => onTab(tb.key)}>
              <Icon name={tb.icon} size={22} />
              <span className="pm-lb">{tb.label}</span>
              {!!tb.badge && <span className="pm-badge">{fmtNum(tb.badge)}</span>}
            </button>
          ))}
          <button className="pm-tab pm-exit" onClick={close} aria-label={t("Close")}>
            <Icon name="close" size={22} />
            <span className="pm-lb">{t("Close")}</span>
          </button>
        </div>
        <section className="pm-body" id="pm-panel" role="tabpanel" aria-labelledby={`pm-t-${active}`}>
          <header className="pm-head">
            <h2>{on?.title ?? on?.label}</h2>
            <button className="pm-x" onClick={close} aria-label={t("Close")} title={t("Close")}>
              <Icon name="close" size={20} />
            </button>
          </header>
          <div className="pm-scroll">{children}</div>
        </section>
      </aside>
    </>
  );
}
