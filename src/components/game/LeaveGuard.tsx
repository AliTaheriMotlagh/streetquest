"use client";
// Before any link takes the player out of the game (a store's site, a menu on Snappfood, an ad on
// Divar, a booking on Achareh…): a page that says where it goes — the site's name and what it's for,
// the address and whether it's secure — with "Open" and "Stay". One listener on the document catches
// every external link the game draws (target="_blank"), in the map and in the 3D city alike.
// "Don't ask again for this site" is remembered on this device only.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

/** What's being opened, when the link says (data-leave-title / -photo / -price / -sub): shown in the dialog. */
type Item = { title: string; photo?: string; price?: string; sub?: string };
function itemOf(a: HTMLAnchorElement): Item | null {
  const d = a.closest<HTMLElement>("[data-leave-title]")?.dataset ?? a.dataset;
  if (!d.leaveTitle) return null;
  return { title: d.leaveTitle, photo: d.leavePhoto || undefined, price: d.leavePrice || undefined, sub: d.leaveSub || undefined };
}

/**
 * A link out of the game with what it opens, for the leave dialog's preview: `item` — the
 * product, hotel, ticket or outing (its name, photo, price). Any `<a target="_blank">` gets the
 * dialog; this one also says what's behind it.
 */
export function LeaveLink({ href, item, className, children, site: _site }: { href: string; item?: Item; className?: string; children: React.ReactNode; site?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className} data-leave-title={item?.title} data-leave-photo={item?.photo} data-leave-price={item?.price} data-leave-sub={item?.sub}>
      {children}
    </a>
  );
}

export function LeaveGuard() {
  const [ask, setAsk] = useState<{ href: string; info: LeaveInfo; item: Item | null } | null>(null);
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
      setAsk({ href, info, item: itemOf(a) });
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
  const { info, href, item } = ask;
  const site = info.site;
  const name = site ? t(site.name) : info.known ? t(info.known) : info.host;
  const go = () => {
    if (remember) skip(info.host);
    open(href);
    setAsk(null);
  };
  // On body, not inside the game: a panel, the 3D view or a transformed parent can't cover it.
  return createPortal(
    <div className="leave-back" role="presentation" onClick={() => setAsk(null)}>
      <div className="leave-card" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(e) => e.stopPropagation()} style={site ? ({ "--site": site.color } as React.CSSProperties) : undefined}>
        <div className="leave-hero" aria-hidden>
          <span className="leave-from">🎮</span>
          <span className="leave-path"><i /><i /><i /></span>
          <span className="leave-ico">{site?.emoji ?? "🌐"}</span>
        </div>
        <h3 id="leave-title">{t("You're leaving StreetQuest")}</h3>
        <p className="leave-to">{t("Opening {site} in a new tab", { site: name })}</p>
        {item && (
          <div className="leave-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.photo && <img src={item.photo} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => e.currentTarget.remove()} />}
            <span className="grow">
              <b dir="auto">{item.title}</b>
              {item.sub && <small dir="auto">{item.sub}</small>}
            </span>
            {item.price && <span className="leave-price">{item.price}</span>}
          </div>
        )}
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
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t("Don't ask again for {site}", { site: name })}</span>
        </label>
        <div className="row">
          <Button className="btn ghost grow" onClick={() => setAsk(null)} autoFocus>{t("Stay in the game")}</Button>
          <Button className="btn yellow grow" onClick={go}>{t("Open {site}", { site: name })} ↗</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
