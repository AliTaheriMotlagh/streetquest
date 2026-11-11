"use client";
// "Navigate with…": a button that opens a chooser of real navigation apps for a place
// (lib/navApps.ts builds the links). A sheet of its own over everything (portal), so it's
// never cut off inside a card; the app picked last time is first next time.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import type { LatLng } from "@/lib/geo";
import { coordsText, navLinks, platformOf, type NavApp } from "@/lib/navApps";
import { Button } from "@/components/Button";

const FAV_KEY = "sq_nav_app";
const readFav = () => {
  try {
    return localStorage.getItem(FAV_KEY);
  } catch {
    return null;
  }
};
const saveFav = (app: NavApp) => {
  try {
    localStorage.setItem(FAV_KEY, app);
  } catch {
    /* private window: just not remembered */
  }
};

/** How each app is shown: a coloured tile, its name and what tapping it does. */
const LOOK: Record<NavApp, { tile: string; color: string; name: () => string; sub: () => string }> = {
  geo: { tile: "📍", color: "#3b4252", name: () => t("Any map app"), sub: () => t("Neshan, Balad, Google Maps… on this phone") },
  neshan: { tile: "ن", color: "#1e6fd9", name: () => t("Neshan"), sub: () => t("Opens the place — tap Route") },
  balad: { tile: "ب", color: "#0a9e6e", name: () => t("Balad"), sub: () => t("Opens the place — tap Route") },
  google: { tile: "G", color: "#ea4335", name: () => t("Google Maps"), sub: () => t("Route by car") },
  googleWalk: { tile: "🚶", color: "#34a853", name: () => t("Google Maps"), sub: () => t("Walking route") },
  waze: { tile: "W", color: "#33ccff", name: () => t("Waze"), sub: () => t("Route by car") },
  apple: { tile: "", color: "#111", name: () => t("Apple Maps"), sub: () => t("Route by car") },
  osm: { tile: "O", color: "#7ebc6f", name: () => t("OpenStreetMap"), sub: () => t("Route by car, in the browser") },
};

function NavSheet({ to, name, from, onClose }: { to: LatLng; name?: string; from?: LatLng | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [fav] = useState(readFav);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  const links = navLinks(to, { platform, from, name, favourite: fav });
  const copy = () =>
    void navigator.clipboard
      ?.writeText(coordsText(to))
      .then(() => setCopied(true))
      .catch(() => {});
  const canShare = typeof navigator.share === "function";
  return createPortal(
    <div className="nav-pick" role="dialog" aria-modal="true" aria-label={t("Navigate with…")} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nav-card">
        <div className="nav-head">
          <b>{t("Navigate with…")}</b>
          {name && <span className="small muted" dir="auto">{name}</span>}
        </div>
        <div className="nav-apps">
          {links.map(({ app, href }) => {
            const l = LOOK[app];
            return (
              <a
                key={app}
                className="nav-app"
                href={href}
                target={app === "geo" ? undefined : "_blank"}
                rel="noreferrer"
                onClick={() => {
                  saveFav(app);
                  // Let the link open first: closing on the same tap can swallow it on some phones.
                  setTimeout(onClose, 50);
                }}
              >
                <span className="nav-tile" style={{ background: l.color }} aria-hidden>{l.tile}</span>
                <span className="grow">
                  <b>{l.name()}</b>
                  <span className="small muted">{l.sub()}</span>
                </span>
                {app === fav && <span className="nav-fav">{t("Last used")}</span>}
              </a>
            );
          })}
        </div>
        <div className="row wrap nav-tools">
          <Button className="btn ghost small" onClick={copy}>{copied ? t("✅ Copied") : t("📋 Copy coordinates")}</Button>
          {canShare && (
            <Button className="btn ghost small" onClick={() => void navigator.share({ title: name, text: name ? `${name} — ${coordsText(to)}` : coordsText(to), url: links.find((l) => l.app === "google")?.href }).catch(() => {})}>
              {t("📤 Share")}
            </Button>
          )}
          <Button className="btn small grow" onClick={onClose}>{t("Cancel")}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens the "Navigate with…" chooser (Neshan, Balad, Google Maps, Waze, Apple Maps…). */
export function Directions({ to, label, className = "btn cyan", name, from }: { to: LatLng; label?: string; className?: string; name?: string; from?: LatLng | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>{label ?? t("🧭 Directions")}</Button>
      {open && <NavSheet to={to} name={name} from={from} onClose={() => setOpen(false)} />}
    </>
  );
}
