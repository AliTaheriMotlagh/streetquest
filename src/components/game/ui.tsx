"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { HELP, HelpCard, helpSeen, markHelpSeen } from "./Help";
import type { LatLng, Me, World } from "./client";

export type Toast = { id?: number; title: string; body?: string; kind?: "info" | "reward" | "social" | "delivery" | "event" | "error"; tag?: string | null };
export type PanelId = "nearby" | "base" | "jobs" | "market" | "crew" | "events" | "me" | "play" | "store" | "inbox";

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
  /** Drop into a first-person fight. */
  enterMatch: (matchId: string) => void;
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
  return (
    <div className={`sheet ${peek ? "peek" : ""} ${tall ? "tall" : ""}`} role="dialog" aria-label={title}>
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
    row.current?.querySelector<HTMLElement>("button.on")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
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
