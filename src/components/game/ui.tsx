"use client";
import { createContext, useContext } from "react";
import type { LatLng, Me, World } from "./client";

export type Toast = { id?: number; title: string; body?: string; kind?: "info" | "reward" | "social" | "delivery" | "event" | "error" };
export type PanelId = "nearby" | "base" | "jobs" | "crew" | "events" | "me" | "play" | "store";

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
  setPanel: (p: PanelId | null) => void;
  /** Test mode: jump straight to a spot. Play from home: travel there at the capped speed. */
  teleport: ((p: LatLng) => void) | null;
  /** 🕹️ in test mode, 🛋️ when playing from home. */
  moveIcon: string;
  /** Switch between walking with GPS and playing from home. */
  setHomeMode: (on: boolean) => Promise<boolean>;
  /** Drop into a first-person fight. */
  enterMatch: (matchId: string) => void;
};

export const Ctx = createContext<GameCtx | null>(null);
export const useGame = () => useContext(Ctx)!;
/** The icon on "go there" buttons: 🕹️ test mode, 🛋️ play from home. */
export const MoveIcon = () => <>{useGame().moveIcon}</>;

export function Sheet({ title, onClose, children, peek, actions }: { title: string; onClose: () => void; children: React.ReactNode; peek?: boolean; actions?: React.ReactNode }) {
  return (
    <div className={`sheet ${peek ? "peek" : ""}`} role="dialog" aria-label={title}>
      <div className="sheet-grip" />
      <div className="sheet-head">
        <h2>{title}</h2>
        {actions}
        <button className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => (
        <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
