"use client";
// Location UX: the "where are you?" screen, the GPS health chip and the quick
// "walking or from home?" question when a player comes back to the game.
import { useEffect, useMemo, useState } from "react";
import { S } from "@/lib/settings";
import { msg, t } from "@/lib/i18n";
import { browserInfo, browserLabel, desktopUnavailableSteps, locationSteps, openInBrowserUrl, preciseSteps } from "./location/browser";
import type { GeoError, GeoState } from "./useLocation";
import { TOUR_KEY } from "./Help";
import { Button } from "@/components/Button";

// ---------------------------------------------------------------- "where are you?" screen
const TITLE: Record<GeoError, string> = {
  insecure: msg("Location needs a secure link"),
  unsupported: msg("No location in this browser"),
  denied: msg("Location is blocked"),
  unavailable: msg("Can't get a GPS fix"),
  timeout: msg("GPS is taking a while"),
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
        {t("You opened the game inside {app}, which usually can't share your location.", { app: b.inApp })}
        <br />
        {b.os === "ios" ? t("Tap ••• or the share icon → Open in browser.") : t("Open it in Chrome (or your usual browser).")}
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
    body = <>{t("Phones only share GPS with https:// sites. Open the game through its https link.")}</>;
  } else if (error === "unsupported") {
    body = <>{t("{browser} can't share a location here. Try Chrome, Safari, Firefox or Samsung Internet.", { browser: browserLabel(b) })}</>;
  } else if (b.desktop && (error === "unavailable" || error === "timeout")) {
    // Computers have no GPS: they ask an online service where their Wi-Fi networks are.
    body = (
      <>
        {t("This computer couldn't work out where it is.")}
        <ol className="steps" style={{ textAlign: "start" }}>
          {desktopUnavailableSteps(b).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {t("The game is made for walking with your phone — on a computer, Play from home works anywhere.")}
      </>
    );
  } else if (error === "unavailable") {
    body = <>{t("Turn on Location/GPS on your phone (Wi-Fi helps too), step near a window, then Retry.")}</>;
  } else if (error === "timeout") {
    body = <>{t("Still searching for satellites. Moving outdoors or near a window usually helps.")}</>;
  } else {
    body = <>{t("Tap Allow when {browser} asks for your location — the streets around you become the game map.", { browser: browserLabel(b) })}</>;
  }

  return (
    <div className="modal-bg" style={{ zIndex: 900 }}>
      <div className="modal" role="dialog" aria-labelledby="gate-title">
        <div style={{ fontSize: 50 }} aria-hidden>{error || b.inApp ? "⚠️" : "📡"}</div>
        <h2 id="gate-title">{b.inApp ? (b.os === "ios" ? t("Open in Safari") : t("Open in your browser")) : error ? (b.desktop && (error === "unavailable" || error === "timeout") ? t("Can't find this computer") : t(TITLE[error])) : t("Finding you…")}</h2>
        <div className="muted small" style={{ lineHeight: 1.6, textAlign: error === "denied" && !b.inApp ? "start" : "center", margin: "10px 0 14px" }}>{body}</div>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {inApp && openUrl && (
            <a className="btn cyan" href={openUrl}>
              {t("Open in Chrome")}
            </a>
          )}
          {inApp && !openUrl && (
            <Button className="btn cyan" onClick={copy}>
              {copied ? t("✓ Link copied") : t("Copy link")}
            </Button>
          )}
          {error && error !== "insecure" && error !== "unsupported" && !inApp && (
            <Button className="btn cyan" onClick={onRetry}>
              {t("Retry")}
            </Button>
          )}
          {onHome && (
            <Button className="btn green" onClick={onHome}>
              {t("🛋️ Play from home")}
            </Button>
          )}
          {onSimulate && (
            <Button className="btn yellow" onClick={onSimulate}>
              {t("🕹️ Test mode — no GPS")}
            </Button>
          )}
        </div>
        {onHome && <p className="small muted" style={{ marginTop: 10 }}>{t("No GPS needed: tap the map and you travel there. Each pickup pays {n} toman instead of {gps}.", { n: S.moneyHome, gps: S.moneyGps })}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- GPS health chip
/** Only visible when something's off, so a healthy GPS stays out of the way. */
export function GpsChip({ geo }: { geo: GeoState }) {
  const [help, setHelp] = useState(false);
  if (geo.simulated || !geo.pos) return null;
  if (geo.stale)
    return (
      <Button className="chip small gps-chip lost" onClick={geo.retry} title={t("GPS stopped answering — tap to reconnect")} aria-label={t("GPS signal lost, tap to reconnect")}>
        📡 <span className="hide-sm">{t("GPS LOST")}</span>
      </Button>
    );
  if (geo.approximate)
    return (
      <>
        <Button className="chip small gps-chip lost" onClick={() => setHelp(true)} aria-label={t("Only an approximate location — tap for how to fix it")}>
          📡 <span className="hide-sm">{t("APPROX")}</span> ±{geo.accuracy && geo.accuracy >= 1000 ? t("{n} km", { n: Math.round(geo.accuracy / 100) / 10 }) : "?"}
        </Button>
        {help && <PreciseHelp onClose={() => setHelp(false)} onRetry={() => (setHelp(false), geo.retry())} />}
      </>
    );
  if (geo.accuracy && geo.accuracy > 60)
    return (
      <div className="chip small gps-chip weak" title={t("Weak GPS: your position may be off. Being outdoors helps.")} role="status">
        📡 ±{t("{n} m", { n: Math.round(geo.accuracy) })}
      </div>
    );
  return null;
}

function PreciseHelp({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const b = useMemo(() => browserInfo(), []);
  return (
    <div className="modal-bg" style={{ zIndex: 900 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="precise-title">
        <div style={{ fontSize: 50 }} aria-hidden>🎯</div>
        <h2 id="precise-title">{t("Your location is only approximate")}</h2>
        <p className="muted small" style={{ lineHeight: 1.6 }}>
          {t("{browser} is sharing a spot that can be a few kilometres off, so the map can't follow you down the street. Turn on Precise Location:", { browser: browserLabel(b) })}
        </p>
        <ol className="steps muted small" style={{ lineHeight: 1.6, textAlign: "start", margin: "10px 0 14px" }}>
          {preciseSteps(b).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <Button className="btn cyan" onClick={onRetry}>
            {t("Retry")}
          </Button>
          <Button className="btn ghost" onClick={onClose}>
            {t("Close")}
          </Button>
        </div>
      </div>
    </div>
  );
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

/** The two ways to play as big pickable cards: the welcome-back prompt and Hero → Profile. */
export function ModeCards({ home, onPick, homeLocked, focus }: { home: boolean; onPick: (home: boolean) => unknown; homeLocked?: boolean; focus?: boolean }) {
  const modes = [
    { h: false, tone: "walk", ic: "🚶", title: t("Walk with GPS"), desc: t("Move in the real world. Every goal counts."), toman: S.moneyGps },
    { h: true, tone: "home", ic: "🛋️", title: t("Play from home"), desc: t("Tap the map — you travel there at {n} km/h.", { n: S.remoteSpeedKmh }), toman: S.moneyHome },
  ];
  return (
    <div className="mode-pick" role="group" aria-label={t("Play mode")}>
      {modes.map((m) => {
        const on = m.h === home;
        return (
          <Button key={m.tone} className={`mode ${m.tone} ${on ? "on" : ""}`} aria-pressed={on} disabled={m.h && homeLocked && !on} onClick={() => onPick(m.h)} autoFocus={focus && on}>
            {on && <span className="mode-check" aria-hidden>✓</span>}
            <span className="mode-ic" aria-hidden>{m.ic}</span>
            <b>{m.title}</b>
            <span className="mode-desc">{m.desc}</span>
            <span className="mode-reward">
              <span className="mode-meter"><i style={{ width: `${Math.min(100, (100 * m.toman) / Math.max(1, S.moneyGps))}%` }} /></span>
              {t("{n} toman per pickup", { n: m.toman })}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

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
  // Esc, ✕ and a tap outside all mean "keep what I had".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && pick(home);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-bg" style={{ zIndex: 950 }} onClick={(e) => e.target === e.currentTarget && pick(home)}>
      <div className="modal mode-prompt" role="dialog" aria-modal="true" aria-labelledby="mode-title" aria-describedby="mode-sub">
        <button className="close mode-x" onClick={() => pick(home)} aria-label={t("Keep the current mode")} title={t("Keep the current mode")}>✕</button>
        <div className="mode-wave" aria-hidden>👋</div>
        <span className="eyebrow">{t("Play mode")}</span>
        <h2 id="mode-title">{t("Welcome back, {name}!", { name })}</h2>
        <p id="mode-sub" className="muted small">{t("How are you playing right now?")}</p>
        <ModeCards home={home} onPick={pick} focus />
        <div className="mode-foot">
          <button type="button" className={`toggle ${never ? "on" : ""}`} aria-pressed={never} onClick={() => setNever(!never)}>
            <i /> {t("Don't ask again")}
          </button>
          <span className="small muted">{t("Change it any time in 🦸 Hero → Profile")}</span>
        </div>
      </div>
    </div>
  );
}
