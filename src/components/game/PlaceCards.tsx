"use client";
// Map cards for real places: a job at a real restaurant/café/shop, any other real place
// (its menu, contacts and how to get there), and a business with its campaigns (check in
// on the spot; coupon campaigns show the code for the till).
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { distanceM, formatDistance } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import { BIZ_CHECKIN_M } from "@/lib/business";
import { CUSTOMER_DOOR, PLACE_CATS, type PlaceCat } from "@/lib/places";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { Button } from "@/components/Button";
import { api, type WorldBusiness, type WorldPlace, type WorldSpot } from "./client";
import { Directions } from "./Play";
import { celebrate } from "./Play";
import { MoveIcon, Sheet, useGame } from "./ui";
import { RouteButton, StoreExtras } from "./StoreInfo";

const catOf = (c: string) => PLACE_CATS[c as PlaceCat] ?? PLACE_CATS.shop;

/** "Go there" for whatever way the player moves: teleport/travel, the 3D car, or directions. */
function GoThere({ to, dist, label, name }: { to: { lat: number; lng: number }; dist: number; label?: string; name?: string }) {
  const { teleport, drive } = useGame();
  return (
    <div className="row wrap">
      {teleport ? (
        <Button className="btn yellow grow" onClick={() => teleport(to)}><MoveIcon /> {label ?? t("Go here · {d}", { d: formatDistance(dist) })}</Button>
      ) : (
        <Button className="btn grow" disabled>{t("Get closer · {d}", { d: formatDistance(dist) })}</Button>
      )}
      {drive && <Button className="btn cyan" onClick={() => drive(to)}>🚗 {t("Drive there")}</Button>}
      {!teleport && dist > 150 && <RouteButton to={to} name={name} className="btn cyan" />}
      {!teleport && dist > 150 && <Directions to={to} />}
    </div>
  );
}

/** Any real place on the map (no job there right now): what it is, its menu and contacts. */
export function SpotCard({ p, onClose }: { p: WorldSpot; onClose: () => void }) {
  const { pos } = useGame();
  const cat = catOf(p.cat);
  const dist = pos ? distanceM(pos, p) : Infinity;
  return (
    <Sheet title={`${cat.emoji} ${p.name}`} onClose={onClose} tall>
      <div className="place-card" style={{ ["--cat" as string]: cat.color }}>
        <div className="place-head">
          <div className="icon-tile place-ic">{cat.emoji}</div>
          <div className="grow">
            <b dir="auto">{p.name}</b>
            <div className="small muted">{t(cat.label)}{Number.isFinite(dist) ? ` · ${formatDistance(dist)}` : ""}</div>
            <span className="tag real-tag">📍 {t("Real place")}</span>
          </div>
        </div>
      </div>
      {dist > INTERACT_RADIUS_M ? <GoThere to={p} dist={dist} name={p.name} /> : <p className="small muted">{t("You're here — new jobs show up at real places every 30 minutes.")}</p>}
      <StoreExtras query={{ store: "place", id: p.id, name: p.name, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), cat: p.cat }} at={p} />
    </Sheet>
  );
}

export function PlaceCard({ m, onClose }: { m: WorldPlace; onClose: () => void }) {
  const { pos, act, me, refresh } = useGame();
  const cat = catOf(m.place.cat);
  const dist = pos ? distanceM(pos, m.place) : Infinity;
  const here = dist <= INTERACT_RADIUS_M;
  const vars = { place: m.place.name, dest: m.dest?.name ?? t(CUSTOMER_DOOR) };
  const item = m.item ? ITEM_BY_KEY[m.item] : null;
  const left = Math.max(0, Math.round((m.expiresAt - Date.now()) / 60000));
  const start = () =>
    act(() => api("/api/places", { body: { id: m.id } })).then((ok) => {
      if (!ok) return;
      if (m.kind === "visit") celebrate({ title: t("CHECKED IN!"), art: item ? undefined : "check", body: m.place.name });
      onClose();
      refresh();
    });
  return (
    <Sheet title={`${m.emoji} ${t(m.title)}`} onClose={onClose}>
      <div className="place-card" style={{ ["--cat" as string]: cat.color }}>
        <div className="place-head">
          <div className="icon-tile place-ic">{cat.emoji}</div>
          <div className="grow">
            <b>{m.place.name}</b>
            <div className="small muted">{t(cat.label)}{m.place.brand ? ` · ${m.place.brand}` : ""} · {formatDistance(dist)}</div>
            <span className="tag real-tag">📍 {t("Real place")}</span>
          </div>
        </div>
        <p className="small" style={{ margin: "10px 0" }}>{t(m.brief, vars)}</p>
        {m.kind === "deliver" && m.dest && (
          <div className="route-line small">
            <span>{cat.emoji} {m.place.name}</span>
            <span className="muted">→ {formatDistance(m.distanceM)} →</span>
            <span>🎯 {m.dest.name}</span>
          </div>
        )}
        <div className="small muted" style={{ marginTop: 6 }}>
          <b className="money-amount">💵 {t("{n} toman", { n: m.toman })}</b> · {t("+{n} XP", { n: m.rewardXp })}{item ? ` · ${item.emoji} ${t(item.name)}` : ""}
          {m.kind === "deliver" ? ` · ⏱️ ${t("{n} min", { n: Math.round(m.timeLimitS / 60) })}` : ""} · {t("new jobs in {n} min", { n: left })}
        </div>
      </div>
      {m.done ? (
        <Button className="btn block" disabled>{t("Done — new jobs here soon")}</Button>
      ) : !here ? (
        <GoThere to={m.place} dist={dist} name={m.place.name} />
      ) : m.kind === "deliver" ? (
        <Button className="btn yellow block big-btn" disabled={!!me.activeRun} onClick={start}>
          {me.activeRun ? t("Finish your current delivery first") : t("📦 Pick up the order")}
        </Button>
      ) : (
        <Button className="btn green block big-btn" onClick={start}>{t("✅ Check in")}</Button>
      )}
      <StoreExtras query={{ store: "place", id: m.place.id, name: m.place.name, lat: m.place.lat.toFixed(6), lng: m.place.lng.toFixed(6), cat: m.place.cat }} at={m.place} />
    </Sheet>
  );
}

export function BizCard({ b, onClose }: { b: WorldBusiness; onClose: () => void }) {
  const { pos, act, refresh, setPanel } = useGame();
  const cat = catOf(b.category);
  const dist = pos ? distanceM(pos, b) : Infinity;
  const here = dist <= BIZ_CHECKIN_M;
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Count the view for the owner's stats (once per opening).
  useEffect(() => {
    if (!b.mine) api("/api/business", { body: { action: "view", businessId: b.id } }).catch(() => {});
  }, [b.id, b.mine]);
  const checkIn = (id: string) =>
    act(async () => {
      const r = await api<{ message: string; code: string | null }>("/api/business", { body: { action: "checkin", campaignId: id } });
      if (r.code) setCodes((c) => ({ ...c, [id]: r.code! }));
      celebrate({ title: t("CHECKED IN!"), art: "shop", body: b.name });
      refresh();
      return r;
    });
  return (
    <Sheet title={`${b.emoji} ${b.name}`} onClose={onClose}>
      <div className="place-card biz" style={{ ["--cat" as string]: cat.color }}>
        <div className="place-head">
          <div className="icon-tile place-ic">{b.emoji}</div>
          <div className="grow">
            <b>{b.name}</b> {b.verified && <span className="tag verified" title={t("Verified business")}>✔ {t("Verified")}</span>}
            <div className="small muted">{t(cat.label)} · {formatDistance(dist)}{b.address ? ` · ${b.address}` : ""}</div>
            {b.featured && <span className="tag featured-tag">⭐ {t("Featured")}</span>}
          </div>
        </div>
        {b.about && <p className="small" style={{ margin: "8px 0 0" }}>{b.about}</p>}
      </div>
      {b.campaigns.length === 0 && <p className="small muted">{t("No missions here right now — check back soon.")}</p>}
      {b.campaigns.map((c) => {
        const code = codes[c.id] ?? c.code;
        return (
          <div key={c.id} className="card biz-campaign">
            <div className="row">
              <b className="grow">🎯 {c.title}</b>
              <span className="tag" style={{ color: "var(--yellow)" }}>+{fmtNum(c.rewardCoins)} 🪙</span>
            </div>
            {c.description && <p className="small" style={{ margin: "4px 0" }}>{c.description}</p>}
            {c.kind === "coupon" && c.offer && <div className="small coupon-line">🎟️ {t("Coupon: {offer}", { offer: c.offer })}{c.bonusCoins ? ` · ${t("+{n} 🪙 when used", { n: c.bonusCoins })}` : ""}</div>}
            <div className="small muted">{t("{n} spots left", { n: c.left })}</div>
            {b.mine ? (
              <Button className="btn ghost block" onClick={() => (onClose(), setPanel("biz"))}>🛠️ {t("Manage in Business center")}</Button>
            ) : c.visited ? (
              code && c.kind === "coupon" ? (
                <div className={`coupon-code ${c.redeemed ? "used" : ""}`}>
                  <span className="small muted">{c.redeemed ? t("Used — thanks for visiting!") : t("Show this code at the till")}</span>
                  <b>{code}</b>
                </div>
              ) : (
                <Button className="btn block" disabled>✅ {t("Checked in")}</Button>
              )
            ) : here ? (
              <Button className="btn green block big-btn" onClick={() => checkIn(c.id)}>{t("✅ Check in")}</Button>
            ) : (
              <GoThere to={b} dist={dist} name={b.name} />
            )}
          </div>
        );
      })}
      <StoreExtras query={{ store: "biz", id: b.id }} at={b} />
    </Sheet>
  );
}
