"use client";
// The store you're passing in the 3D city, in two sizes (the data is one /api/local lookup,
// shared by both through StoreInfo's useLocal cache):
//  - StoreChip: the card under the street name — name, rating, open now, the first menu line —
//    that also feeds the in-world panel and the store's sign (logo, hours, deal);
//  - StoreSheet: tapped, the full card — a photo carousel, rating and hours, the deals, and
//    the whole menu / reviews / info by tabs with item photos and toman prices (StoreExtras).
// Slides in and out with transform/opacity only; reduced motion turns that off (storeCard.css).
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { dealsNear, sameName, weekFromOsm, type Deal, type StoreData } from "@/lib/localData";
import { menuHighlights, STORE_LOOK, storeKind } from "@/lib/storeKinds";
import { Button } from "@/components/Button";
import { OpenBadge, StoreExtras, useLocal } from "../game/StoreInfo";
import { Sheet } from "../game/ui";
import type { StorePanel } from "./storefronts";

export type StoreTarget = { id: string; name: string; cls?: string; lat: number; lng: number; emoji: string; color: string; sub: string };

/** The /api/local query for a store seen in the city. */
const queryOf = (s: StoreTarget) => ({ store: "place", name: s.name, lat: s.lat.toFixed(6), lng: s.lng.toFixed(6), cat: STORE_LOOK[storeKind(s.cls, s.name)].cat });

/** Takhfifan deals at this very store (same name, within 150 m). */
function useDeals(s: StoreTarget | null) {
  const { data } = useLocal<{ deals: Deal[] }>(s ? { deals: "1", lat: s.lat.toFixed(3), lng: s.lng.toFixed(3) } : null);
  return useMemo(() => (s && data ? dealsNear(data.deals, s, 150).filter((d) => sameName(d.name, s.name)) : []), [data, s]);
}

/** What the sign and the panel want from a card's data. */
export function panelOf(data: StoreData | null, deals: Deal[]): StorePanel {
  const m = data?.menu;
  return {
    name: data?.about.name,
    logo: data?.about.logo || undefined,
    photo: data?.about.photo || undefined,
    rating: m?.vendor.rating || undefined,
    reviews: m?.reviews,
    week: data ? (data.about.week ?? weekFromOsm(data.about.hours) ?? m?.week ?? null) : undefined,
    deal: deals.reduce((n, d) => Math.max(n, d.off), 0) || undefined,
    items: m ? menuHighlights(m.sections, 4) : undefined,
  };
}

export function StoreChip({ s, onOpen, onInfo, onShow }: { s: StoreTarget; onOpen: () => void; onInfo: (id: string, info: StorePanel) => void; onShow: (id: string | null) => void }) {
  // Only a store you stay by is looked up (not every one driven past).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    onShow(s.id);
    const id = setTimeout(() => setReady(true), 700);
    return () => (clearTimeout(id), onShow(null));
  }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useLocal<StoreData>(ready ? queryOf(s) : null);
  const deals = useDeals(ready ? s : null);
  const info = useMemo(() => panelOf(data, deals), [data, deals]);
  const sent = useRef("");
  useEffect(() => {
    const sig = JSON.stringify(info);
    if (data && sig !== sent.current) (sent.current = sig, onInfo(s.id, info));
  }, [data, info, s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = info.week;
  const first = data?.menu ? menuHighlights(data.menu.sections, 1)[0] : null;
  return (
    <button type="button" className="drive-store rich" style={{ "--trade": s.color } as React.CSSProperties} onClick={onOpen}>
      <span className="ic">{s.emoji}</span>
      <span className="tx">
        <b dir="auto">{s.name}</b>
        <span>{s.sub}</span>
        {(info.rating || week || info.deal) && (
          <span className="store-chip-meta">
            {!!info.rating && <span className="tag ext-rating">⭐ {fmtNum(info.rating)}</span>}
            <OpenBadge week={week} at={s} />
            {!!info.deal && <span className="tag deal-tag">🏷️ {t("Up to {n}% off", { n: fmtNum(info.deal) })}</span>}
          </span>
        )}
        {first && <span className="store-chip-item" dir="auto">{first.title} · {t("{n} toman", { n: fmtNum(first.price) })}</span>}
      </span>
    </button>
  );
}

/** Photos of the store: its cover, logo, and the pictures of its dishes. */
function photosOf(data: StoreData | null, deals: Deal[]) {
  const out: string[] = [];
  const add = (u?: string) => u && u.startsWith("http") && !out.includes(u) && out.length < 10 && out.push(u);
  add(data?.about.photo);
  add(data?.menu?.cover);
  for (const d of deals) d.photos.slice(0, 3).forEach(add);
  for (const sec of data?.menu?.sections ?? []) for (const it of sec.items.slice(0, 2)) add(it.image || it.photo);
  add(data?.about.logo);
  return out;
}

function Carousel({ photos, name }: { photos: string[]; name: string }) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  if (!photos.length) return null;
  return (
    <div className="store-carousel" role="group" aria-label={t("Photos of {name}", { name })}>
      <div
        ref={ref}
        className="store-slides"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((p) => (
          <img key={p} src={p} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="store-dots" aria-hidden>
          {photos.map((p, i) => <i key={p} className={i === at ? "on" : ""} />)}
        </div>
      )}
    </div>
  );
}

export function StoreSheet({ s, onClose, onGo }: { s: StoreTarget; onClose: () => void; onGo: () => void }) {
  const { data } = useLocal<StoreData>(queryOf(s));
  const deals = useDeals(s);
  const photos = useMemo(() => photosOf(data, deals), [data, deals]);
  const info = panelOf(data, deals);
  const best = deals[0];
  return (
    <Sheet title={`${s.emoji} ${s.name}`} onClose={onClose} tall>
      <div className="store-sheet">
        <Carousel photos={photos} name={s.name} />
        <div className="store-meta">
          {!!info.rating && <span className="tag ext-rating">⭐ {fmtNum(info.rating)}{info.reviews ? <span className="muted"> ({fmtNum(info.reviews)})</span> : null}</span>}
          <OpenBadge week={info.week} at={s} />
          <span className="small muted">{s.sub}</span>
        </div>
        {best && (
          <div className="store-deals">
            {best.off > 0 && <span className="deal-big">{t("Up to {n}% off", { n: fmtNum(best.off) })}</span>}
            {best.cashback > 0 && <span className="deal-big back">{t("{n}% back when you pay there", { n: fmtNum(best.cashback) })}</span>}
            <a className="btn small ghost ext-link ext-takhfifan" href={best.url} target="_blank" rel="noopener noreferrer">{t("Takhfifan")}</a>
            {best.items.slice(0, 3).map((i) => (
              <span key={i.id} className="deal-item" dir="auto">{i.name} · <b>{t("{n} toman", { n: fmtNum(i.price) })}</b>{i.retail > i.price && <s>{fmtNum(i.retail)}</s>}</span>
            ))}
          </div>
        )}
        <div className="store-actions">
          <Button className="btn small yellow" onClick={onGo}>🧭 {t("Go there")}</Button>
        </div>
        <StoreExtras query={queryOf(s)} at={s} bare />
      </div>
    </Sheet>
  );
}
