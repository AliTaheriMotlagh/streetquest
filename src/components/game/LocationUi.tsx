"use client";
// Location UX: the "where are you?" screen, the GPS health chip and the quick
// "walking or from home?" question when a player comes back to the game.
import { useEffect, useMemo, useState } from "react";
import { S } from "@/lib/settings";
import { browserInfo, browserLabel, locationSteps, openInBrowserUrl } from "./location/browser";
import type { GeoError, GeoState } from "./useLocation";
import { TOUR_KEY } from "./Help";

// ---------------------------------------------------------------- "where are you?" screen
const TITLE: Record<GeoError, string> = {
  insecure: "Location needs a secure link",
  unsupported: "No location in this browser",
  denied: "Location is blocked",
  unavailable: "Can't get a GPS fix",
  timeout: "GPS is taking a while",
};

export function LocationGate({ error, onRetry, onSimulate, onHome }: { error: GeoError | null; onRetry: () => void; onSimulate?: () => void; onHome?: () => void }) {
  const b = useMemo(() => browserInfo(), []);
  const [copied, setCopied] = useState(false);
  const openUrl = openInBrowserUrl(b);
  // In-app browsers (Instagram, TikTok…) often never answer the location request at all.
  const inApp = !!b.inApp;
  const copy = () =>
    navigator.clipboard
      ?.writeText(location.href)
      .then(() => setCopied(true))
      .catch(() => {});

  let body: React.ReactNode;
  if (b.inApp) {
    body = (
      <>
        You opened the game inside <b>{b.inApp}</b>, which usually can&apos;t share your location.
        <br />
        {b.os === "ios" ? <>Tap <b>•••</b> or the share icon → <b>Open in browser</b>.</> : <>Open it in Chrome (or your usual browser).</>}
      </>
    );
  } else if (error === "denied") {
    body = (
      <ol className="steps">
        {locationSteps(b).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    );
  } else if (error === "insecure") {
    body = <>Phones only share GPS with <b>https://</b> sites. Open the game through its https link.</>;
  } else if (error === "unsupported") {
    body = <>{browserLabel(b)} can&apos;t share a location here. Try Chrome, Safari, Firefox or Samsung Internet.</>;
  } else if (error === "unavailable") {
    body = <>Turn on Location/GPS on your phone (Wi-Fi helps too), step near a window, then Retry.</>;
  } else if (error === "timeout") {
    body = <>Still searching for satellites. Moving outdoors or near a window usually helps.</>;
  } else {
    body = <>Tap <b>Allow</b> when {browserLabel(b)} asks for your location — the streets around you become the game map.</>;
  }

  return (
    <div className="modal-bg" style={{ zIndex: 900 }}>
      <div className="modal" role="dialog" aria-labelledby="gate-title">
        <div style={{ fontSize: 50 }} aria-hidden>{error || b.inApp ? "⚠️" : "📡"}</div>
        <h2 id="gate-title">{b.inApp ? `Open in ${b.os === "ios" ? "Safari" : "your browser"}` : error ? TITLE[error] : "Finding you…"}</h2>
        <div className="muted small" style={{ lineHeight: 1.6, textAlign: error === "denied" && !b.inApp ? "left" : "center", margin: "10px 0 14px" }}>{body}</div>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {inApp && openUrl && (
            <a className="btn cyan" href={openUrl}>
              Open in Chrome
            </a>
          )}
          {inApp && !openUrl && (
            <button className="btn cyan" onClick={copy}>
              {copied ? "✓ Link copied" : "Copy link"}
            </button>
          )}
          {error && error !== "insecure" && error !== "unsupported" && !inApp && (
            <button className="btn cyan" onClick={onRetry}>
              Retry
            </button>
          )}
          {onHome && (
            <button className="btn green" onClick={onHome}>
              🛋️ Play from home
            </button>
          )}
          {onSimulate && (
            <button className="btn yellow" onClick={onSimulate}>
              🕹️ Test mode — no GPS
            </button>
          )}
        </div>
        {onHome && <p className="small muted" style={{ marginTop: 10 }}>No GPS needed: tap the map and your commander travels there, for {Math.round(S.remoteRewardMult * 100)}% of the usual XP and coins.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- GPS health chip
/** Only visible when something's off, so a healthy GPS stays out of the way. */
export function GpsChip({ geo }: { geo: GeoState }) {
  if (geo.simulated || !geo.pos) return null;
  if (geo.stale)
    return (
      <button className="chip small gps-chip lost" onClick={geo.retry} title="GPS stopped answering — tap to reconnect" aria-label="GPS signal lost, tap to reconnect">
        📡 <span className="hide-sm">GPS LOST</span>
      </button>
    );
  if (geo.accuracy && geo.accuracy > 60)
    return (
      <div className="chip small gps-chip weak" title="Weak GPS: your position may be off. Being outdoors helps." role="status">
        📡 ±{Math.round(geo.accuracy)} m
      </div>
    );
  return null;
}

// ---------------------------------------------------------------- "how are you playing?"
const ASKED_KEY = "sq_mode_asked"; // sessionStorage: asked during this visit
const NEVER_KEY = "sq_mode_never"; // localStorage: the player said don't ask again
const AWAY_MS = 30 * 60_000;

/** Coming back to the game (new visit, or after 30+ min away): ask once how they're playing. */
export function useModePrompt(enabled: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const ask = () => {
      try {
        if (localStorage.getItem(NEVER_KEY) || !localStorage.getItem(TOUR_KEY)) return; // first visit: the tour asks
        if (sessionStorage.getItem(ASKED_KEY)) return;
        sessionStorage.setItem(ASKED_KEY, "1");
      } catch {
        return;
      }
      setOpen(true);
    };
    ask();
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) {
        try {
          sessionStorage.removeItem(ASKED_KEY);
        } catch {}
        ask();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
  return [open, () => setOpen(false)] as const;
}

/** Mark this visit as asked (e.g. the tour just asked the same question). */
export const markModeAsked = () => {
  try {
    sessionStorage.setItem(ASKED_KEY, "1");
  } catch {}
};

export function ModePrompt({ name, home, onPick, onClose }: { name: string; home: boolean; onPick: (home: boolean) => void; onClose: () => void }) {
  const [never, setNever] = useState(false);
  const pick = (h: boolean) => {
    if (never)
      try {
        localStorage.setItem(NEVER_KEY, "1");
      } catch {}
    if (h !== home) onPick(h);
    onClose();
  };
  return (
    <div className="modal-bg" style={{ zIndex: 950 }} onClick={(e) => e.target === e.currentTarget && pick(home)}>
      <div className="modal mode-prompt" role="dialog" aria-labelledby="mode-title">
        <h2 id="mode-title">Welcome back, {name}!</h2>
        <p className="muted small">How are you playing right now?</p>
        <div className="mode-pick">
          <button className={`mode ${!home ? "on" : ""}`} onClick={() => pick(false)} autoFocus={!home}>
            <span className="mode-ic">🚶</span>
            <b>Out walking</b>
            <span className="small muted">Real GPS. Full rewards.</span>
            <span className="mode-tag">100%</span>
          </button>
          <button className={`mode ${home ? "on" : ""}`} onClick={() => pick(true)} autoFocus={home}>
            <span className="mode-ic">🛋️</span>
            <b>From home</b>
            <span className="small muted">Tap the map to travel.</span>
            <span className="mode-tag">{Math.round(S.remoteRewardMult * 100)}%</span>
          </button>
        </div>
        <label className="row small muted" style={{ justifyContent: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Don&apos;t ask again (change it in Hero → Profile)
        </label>
      </div>
    </div>
  );
}
