"use client";
// Life-sim layer UI: needs, mood and the actions that refill them.
import { useEffect, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
import { fmtNum, t } from "@/lib/i18n";
import { AT_BASE_M, currentNeeds, MESS_HALL_COST, moodOf, NEEDS, REST_COOLDOWN_MS, SOCIAL_COOLDOWN_MS, type Needs } from "@/lib/sims";
import { api, type Me } from "./client";
import { MoveIcon, useGame } from "./ui";
import { Button } from "@/components/Button";

/** Needs drain live on the client between /api/me refreshes. */
export function useLiveNeeds(me: Me): Needs {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return currentNeeds(me.needs, new Date(me.needsAt), Math.max(now, me.needsAt));
}

export function NeedsHud({ onClick }: { onClick: () => void }) {
  const { me } = useGame();
  const needs = useLiveNeeds(me);
  const mood = moodOf(needs);
  return (
    <Button className="needs-hud" onClick={onClick} title={t("Mood: {mood}", { mood: t(mood.label) })}>
      <span className="mood">{mood.emoji}</span>
      {NEEDS.map((n) => (
        <span key={n.key} className={`need ${needs[n.key] < 25 ? "low" : ""}`}>
          <i style={{ height: `${needs[n.key]}%`, background: n.color }} />
        </span>
      ))}
    </Button>
  );
}

export function LifeTab() {
  const { me, pos, world, act, teleport } = useGame();
  const needs = useLiveNeeds(me);
  const mood = moodOf(needs);
  const food = me.inventory.filter((i) => i.def.food);
  const home = me.base && pos ? distanceM(pos, me.base) : null;
  const atHome = home != null && home <= AT_BASE_M;
  const restLeft = me.restedAt ? new Date(me.restedAt).getTime() + REST_COOLDOWN_MS - Date.now() : 0;
  const socialLeft = me.socialAt ? new Date(me.socialAt).getTime() + SOCIAL_COOLDOWN_MS - Date.now() : 0;
  const near = (world?.players ?? []).filter((p) => pos && distanceM(pos, p) <= 150);

  return (
    <>
      <div className="card row">
        <div style={{ fontSize: 40 }}>{mood.emoji}</div>
        <div className="grow">
          <b style={{ fontFamily: "var(--display)" }}>{t(mood.label)}</b> <span className="small muted">{t("mood {n}", { n: mood.score })}</span>
          <div className="small muted">{t("XP ×{xp} · combat HP ×{hp}", { xp: mood.xpMult, hp: mood.hpMult })}</div>
        </div>
      </div>
      {NEEDS.map((n) => (
        <div key={n.key} style={{ marginBottom: 10 }}>
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <b>{n.emoji} {t(n.name)}</b>
            <span className="muted">{t("{n}%", { n: Math.round(needs[n.key]) })} · {t("−{n}/h", { n: n.perHour })}</span>
          </div>
          <div className="need-bar"><i style={{ width: `${needs[n.key]}%`, background: n.color }} /></div>
          <div className="small muted">{t(n.how)}</div>
        </div>
      ))}

      <label>{t("Eat")}</label>
      <div className="row wrap">
        {food.map((i) => (
          <Button key={i.key} className="btn ghost small" onClick={() => act(() => api("/api/sims", { body: { action: "eat", itemKey: i.key } }))}>
            {i.def.emoji} ×{fmtNum(i.qty)} (+{fmtNum(i.def.food ?? 0)})
          </Button>
        ))}
        <Button className="btn ghost small" disabled={!atHome} onClick={() => act(() => api("/api/sims", { body: { action: "mess" } }))}>
          {t("🍲 Mess hall · {n} 🪙", { n: MESS_HALL_COST })}
        </Button>
      </div>
      {!food.length && <p className="small muted">{t("No food in your bag — 🍩🍔🥫 spawn around the city.")}</p>}

      <label>{t("Rest")}</label>
      <Button className="btn cyan small" disabled={!atHome || restLeft > 0} onClick={() => act(() => api("/api/sims", { body: { action: "rest" } }))}>
        😴 {restLeft > 0 ? t("Rested — {n} min", { n: Math.ceil(restLeft / 60000) }) : t("Sleep at base")}
      </Button>
      {!me.base ? (
        <span className="small muted"> {t("Plant a base first.")}</span>
      ) : (
        !atHome &&
        home != null &&
        (teleport ? (
          <Button className="btn yellow small" style={{ marginInlineStart: 6 }} onClick={() => teleport(me.base!)}><MoveIcon /> {t("Go home")}</Button>
        ) : (
          <span className="small muted"> {t("Home is {d} away.", { d: formatDistance(home) })}</span>
        ))
      )}

      <label>{t("Hang out (players within 150 m)")}</label>
      {near.length ? (
        <div className="row wrap">
          {near.map((p) => (
            <Button key={p.id} className="btn ghost small" disabled={socialLeft > 0} onClick={() => act(() => api("/api/sims", { body: { action: "socialize", userId: p.id } }))}>
              👋 {p.avatar} <span dir="auto">{p.username}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="small muted">{t("Nobody close by right now. Chatting with your crew also helps a little.")}</p>
      )}
      {socialLeft > 0 && <p className="small muted">{t("Next hangout in {n} min.", { n: Math.ceil(socialLeft / 60000) })}</p>}
    </>
  );
}
