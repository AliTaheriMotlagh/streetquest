"use client";
// Before any link takes the player out of the game (a store's site, a menu on Snappfood, an ad on
// Divar, a booking on Achareh…): a page that says where it goes — the site's name and what it's for,
// the address and whether it's secure — with "Open" and "Stay". One listener on the document catches
// every external link the game draws (target="_blank"), in the map and in the 3D city alike.
// "Don't ask again for this site" is remembered on this device only.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { leaveInfo, type LeaveInfo } from "@/lib/stores/directory";
import { Button } from "@/components/Button";

const SKIP_KEY = "sq_leave_skip";
function skipped(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function skip(host: string) {
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify([...new Set([...skipped(), host])]));
  } catch {
    /* private window: ask again next time */
  }
}
const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");

export function LeaveGuard() {
  const [ask, setAsk] = useState<{ href: string; info: LeaveInfo } | null>(null);
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target !== "_blank" || a.hasAttribute("data-no-leave")) return;
      const href = a.href;
      let same = false;
      try {
        same = new URL(href).origin === window.location.origin;
      } catch {
        return;
      }
      const info = same ? null : leaveInfo(href);
      if (!info || skipped().includes(info.host)) return;
      e.preventDefault();
      setRemember(false);
      setAsk({ href, info });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsk(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask]);
  if (!ask) return null;
  const { info, href } = ask;
  const site = info.site;
  const name = site ? t(site.name) : info.known ? t(info.known) : info.host;
  const go = () => {
    if (remember) skip(info.host);
    open(href);
    setAsk(null);
  };
  return (
    <div className="leave-back" role="presentation" onClick={() => setAsk(null)}>
      <div className="leave-card" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(e) => e.stopPropagation()} style={site ? ({ "--site": site.color } as React.CSSProperties) : undefined}>
        <div className="leave-ico" aria-hidden>{site?.emoji ?? "🌐"}</div>
        <h3 id="leave-title">{t("You're leaving StreetQuest")}</h3>
        <p className="leave-to">{t("Opening {site} in a new tab", { site: name })}</p>
        {site && <p className="small muted leave-what">{t(site.what)}</p>}
        <div className="leave-url" dir="ltr">
          <span aria-hidden>{info.secure ? "🔒" : "⚠️"}</span>
          <span className="host">{info.host}</span>
        </div>
        {!info.secure && <p className="small warn-text">{t("This link isn't secure (no https) — don't enter passwords or card details there.")}</p>}
        <ul className="small muted leave-notes">
          <li>{t("Prices, stock and bookings are the site's own and may have changed.")}</li>
          <li>{t("StreetQuest doesn't see what you do there; come back any time — the game keeps your place.")}</li>
        </ul>
        <label className="leave-skip small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t("Don't ask again for {site}", { site: name })}
        </label>
        <div className="row">
          <Button className="btn ghost grow" onClick={() => setAsk(null)} autoFocus>{t("Stay in the game")}</Button>
          <Button className="btn yellow grow" onClick={go}>{t("Open {site}", { site: name })} ↗</Button>
        </div>
      </div>
    </div>
  );
}
