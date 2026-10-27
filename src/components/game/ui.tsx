"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { HELP, HelpCard, helpSeen, markHelpSeen } from "./Help";
import type { LatLng, Me, World } from "./client";

export type Toast = { id?: number; title: string; body?: string | null; kind?: "info" | "reward" | "social" | "delivery" | "event" | "error"; tag?: string | null; link?: string | null };
export type PanelId = "nearby" | "wallet" | "jobs" | "market" | "crew" | "events" | "me" | "play" | "store" | "inbox" | "social" | "biz";

export type GameCtx = {
  me: Me;
  pos: LatLng | null;
  world: World | null;
  toast: (t: Toast) => void;
  /** Run an API action: toast its message (or error) and refresh state. Returns true on success. */
  act: (fn: () => Promise<{ message?: string }>) => Promise<boolean>;
  refresh: () => void;
  pick: (label: string, cb: (p: LatLng) => void) => void;
  openChat: (room: string, label: string) => void;
  /** Ring a crew member: a video call, or a voice call with `video` false. */
  startCall: (peer: { id: string; username: string; avatar: string }, video?: boolean) => void;
  setPanel: (p: PanelId | null) => void;
  /** Open what a notification links to: a panel id, or "me:<tab>" for a Hero tab. */
  openLink: (link: string) => void;
  /** Open the Market on one shop (tapped on the map). */
  openShop: (shopId: string) => void;
  /** Test mode: jump straight to a spot. Play from home: travel there at the capped speed. */
  teleport: ((p: LatLng) => void) | null;
  /** 🕹️ in test mode, 🛋️ when playing from home. */
  moveIcon: string;
  /** Switch between walking with GPS and playing from home. */
  setHomeMode: (on: boolean) => Promise<boolean>;
  /** Replay the first-run tutorial. */
  startTour: () => void;
  /** Get in the car: the 3D city, optionally heading for a spot. Null when it can't open. */
  drive: ((to?: LatLng) => void) | null;
  /** A player's profile in the social feed. */
  openProfile: (userId: string) => void;
};

export const Ctx = createContext<GameCtx | null>(null);
export const useGame = () => useContext(Ctx)!;
/** The icon on "go there" buttons: 🕹️ test mode, 🛋️ play from home. */
export const MoveIcon = () => <>{useGame().moveIcon}</>;

export function Sheet({ title, onClose, children, peek, actions, help, tall }: { title: string; onClose: () => void; children: React.ReactNode; peek?: boolean; actions?: React.ReactNode; help?: string; tall?: boolean }) {
  // "How this works" card: shown automatically the first time, then from the ? button.
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    if (help && HELP[help] && !helpSeen(help)) setShowHelp(true);
  }, [help]);
  const closeHelp = () => {
    if (help) markHelpSeen(help);
    setShowHelp(false);
  };
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useSwipeToClose(ref, !peek, closeRef);
  return (
    <div ref={ref} className={`sheet ${peek ? "peek" : ""} ${tall ? "tall" : ""}`} role="dialog" aria-label={title}>
      <div className="sheet-grip" />
      <div className="sheet-head">
        <h2>{title}</h2>
        {actions}
        {help && HELP[help] && (
          <button className={`close help-btn ${showHelp ? "on" : ""}`} onClick={() => (showHelp ? closeHelp() : setShowHelp(true))} aria-label={t("How this works")} title={t("How this works")}>
            ?
          </button>
        )}
        <button className="close" onClick={onClose} aria-label={t("Close")}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {showHelp && help && <HelpCard k={help} onClose={closeHelp} />}
        {children}
      </div>
    </div>
  );
}

/** Scroll `el` into view inside its panel only (scrollIntoView would also move the sheet and the game). */
export function revealInSheet(el: HTMLElement | null) {
  const body = el?.closest<HTMLElement>(".sheet-body");
  if (!el || !body) return;
  const bb = body.getBoundingClientRect(), r = el.getBoundingClientRect();
  const dy = r.top < bb.top ? r.top - bb.top - 8 : r.bottom > bb.bottom ? Math.min(r.bottom - bb.bottom + 8, r.top - bb.top - 8) : 0;
  if (dy) body.scrollBy({ top: dy, behavior: "smooth" });
}

/** Things inside a panel that own their own touch gestures. */
const NO_DRAG = "input, textarea, select, canvas, video, [contenteditable], .arena, .hold-btn, .leaflet-container, [data-no-drag]";

/**
 * Bottom-sheet gesture for phones: drag the panel down (by its header anywhere, or by
 * its content once that content is scrolled to the top) and let go to close it.
 * Off where the panel is a side panel (tablets/desktop hide the grip).
 */
function useSwipeToClose(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, onClose: React.RefObject<() => void>) {
  useEffect(() => {
    const sheet = ref.current;
    if (!sheet || !enabled) return;
    let startY = 0, startX = 0, lastY = 0, lastT = 0, vel = 0;
    let mode: "idle" | "maybe" | "drag" | "off" = "idle";
    const grip = () => sheet.querySelector<HTMLElement>(".sheet-grip");
    const atTop = (target: Element) => {
      // Every scroller between the finger and the sheet must be at its top.
      for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
      }
      return true;
    };
    const set = (dy: number, animate: boolean) => {
      sheet.style.transition = animate ? "transform .22s cubic-bezier(.2,.9,.3,1)" : "none";
      sheet.style.transform = dy ? `translateY(${dy}px)` : "";
    };
    const start = (e: TouchEvent) => {
      const g = grip();
      const target = e.target as Element;
      // Touch screens only, and only where the panel is a bottom sheet (the grip shows).
      if (e.touches.length !== 1 || !g || getComputedStyle(g).display === "none" || target.closest(NO_DRAG)) {
        mode = "off";
        return;
      }
      const inHead = !!target.closest(".sheet-head, .sheet-grip");
      if (!inHead && !atTop(target)) {
        mode = "off";
        return;
      }
      mode = "maybe";
      startY = lastY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      lastT = e.timeStamp;
      vel = 0;
    };
    const move = (e: TouchEvent) => {
      if (mode === "off" || mode === "idle") return;
      const y = e.touches[0].clientY, dy = y - startY, dx = e.touches[0].clientX - startX;
      if (mode === "maybe") {
        // Sideways (tab rows, carousels) or upward: leave it to the content.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dy) >= 4 || Math.abs(dx) >= 4) mode = "off";
          return;
        }
        // Downward from the top: claim it now, or iOS starts its own scroll and won't let go.
        if (e.cancelable) e.preventDefault();
        if (dy < 8) return;
        mode = "drag";
      }
      if (e.cancelable) e.preventDefault();
      const dt = Math.max(1, e.timeStamp - lastT);
      vel = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
      set(Math.max(0, dy), false);
    };
    const end = () => {
      if (mode === "drag") {
        const dy = lastY - startY;
        if (dy > Math.min(140, sheet.offsetHeight * 0.3) || (vel > 0.6 && dy > 40)) {
          set(sheet.offsetHeight + 40, true);
          setTimeout(() => onClose.current(), 200);
        } else {
          set(0, true);
        }
      }
      mode = "idle";
    };
    sheet.addEventListener("touchstart", start, { passive: true });
    sheet.addEventListener("touchmove", move, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    return () => {
      sheet.removeEventListener("touchstart", start);
      sheet.removeEventListener("touchmove", move);
      sheet.removeEventListener("touchend", end);
      sheet.removeEventListener("touchcancel", end);
      sheet.style.transform = "";
      sheet.style.transition = "";
    };
  }, [ref, enabled, onClose]);
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  const row = useRef<HTMLDivElement>(null);
  // More tabs before / after what's visible. Right-to-left rows start at scrollLeft 0
  // and go negative, so measure the distance from the start either way.
  const [edge, setEdge] = useState({ start: false, end: false });
  const measure = () => {
    const r = row.current;
    if (!r) return;
    const from = Math.abs(r.scrollLeft);
    setEdge({ start: from > 2, end: from < r.scrollWidth - r.clientWidth - 2 });
  };
  // Keep the selected tab visible, and know whether there's more to either side.
  useEffect(() => {
    // Scroll only the row: scrollIntoView also scrolls every ancestor, which knocked the
    // panel body (and the whole sheet) out of place on phones.
    const r = row.current;
    const on = r?.querySelector<HTMLElement>("button.on");
    if (r && on) {
      const rb = r.getBoundingClientRect(), b = on.getBoundingClientRect();
      const pad = 24;
      const dx = b.left < rb.left + pad ? b.left - rb.left - pad : b.right > rb.right - pad ? b.right - rb.right + pad : 0;
      if (dx) r.scrollBy({ left: dx, behavior: "smooth" });
    }
    const t = setTimeout(measure, 350);
    return () => clearTimeout(t);
  }, [value]);
  useEffect(() => {
    measure();
    const r = row.current;
    if (!r) return;
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    return () => ro.disconnect();
  }, [tabs.length]);
  const page = (dir: 1 | -1) => {
    const r = row.current;
    if (r) r.scrollBy({ left: dir * r.clientWidth * 0.7 * (getComputedStyle(r).direction === "rtl" ? -1 : 1), behavior: "smooth" });
  };
  return (
    <div className={`tabs-wrap ${edge.start ? "more-start" : ""} ${edge.end ? "more-end" : ""}`}>
      {edge.start && <button className="tabs-arrow start" aria-label={t("Previous tabs")} onClick={() => page(-1)}>‹</button>}
      <div className="tabs" ref={row} onScroll={measure} role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
            {label}
          </button>
        ))}
      </div>
      {edge.end && <button className="tabs-arrow end" aria-label={t("More tabs")} onClick={() => page(1)}>›</button>}
    </div>
  );
}
