"use client";
// Life-sim layer UI: needs, mood and the actions that refill them.
import { useEffect, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
import { AT_BASE_M, currentNeeds, MESS_HALL_COST, moodOf, NEEDS, REST_COOLDOWN_MS, SOCIAL_COOLDOWN_MS, type Needs } from "@/lib/sims";
import { api, type Me } from "./client";
import { MoveIcon, useGame } from "./ui";

/** Needs drain live on the client between /api/me refreshes. */
export function useLiveNeeds(me: Me): Needs {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return currentNeeds(me.needs, new Date(me.needsAt), Math.max(now, me.needsAt));
}

export function NeedsHud({ onClick }: { onClick: () => void }) {
  const { me } = useGame();
  const needs = useLiveNeeds(me);
  const mood = moodOf(needs);
  return (
    <button className="needs-hud" onClick={onClick} title={`Mood: ${mood.label}`}>
      <span className="mood">{mood.emoji}</span>
      {NEEDS.map((n) => (
        <span key={n.key} className={`need ${needs[n.key] < 25 ? "low" : ""}`}>
          <i style={{ height: `${needs[n.key]}%`, background: n.color }} />
        </span>
      ))}
    </button>
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
          <b style={{ fontFamily: "var(--display)" }}>{mood.label}</b> <span className="small muted">mood {mood.score}</span>
          <div className="small muted">
            XP ×{mood.xpMult} · combat HP ×{mood.hpMult}
          </div>
        </div>
      </div>
      {NEEDS.map((n) => (
        <div key={n.key} style={{ marginBottom: 10 }}>
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <b>{n.emoji} {n.name}</b>
            <span className="muted">{Math.round(needs[n.key])}% · −{n.perHour}/h</span>
          </div>
          <div className="need-bar"><i style={{ width: `${needs[n.key]}%`, background: n.color }} /></div>
          <div className="small muted">{n.how}</div>
        </div>
      ))}

      <label>Eat</label>
      <div className="row wrap">
        {food.map((i) => (
          <button key={i.key} className="btn ghost small" onClick={() => act(() => api("/api/sims", { body: { action: "eat", itemKey: i.key } }))}>
            {i.def.emoji} ×{i.qty} (+{i.def.food})
          </button>
        ))}
        <button className="btn ghost small" disabled={!atHome} onClick={() => act(() => api("/api/sims", { body: { action: "mess" } }))}>
          🍲 Mess hall · {MESS_HALL_COST} 🪙
        </button>
      </div>
      {!food.length && <p className="small muted">No food in your bag — 🍩🍔🥫 spawn around the city.</p>}

      <label>Rest</label>
      <button className="btn cyan small" disabled={!atHome || restLeft > 0} onClick={() => act(() => api("/api/sims", { body: { action: "rest" } }))}>
        😴 {restLeft > 0 ? `Rested — ${Math.ceil(restLeft / 60000)} min` : "Sleep at base"}
      </button>
      {!me.base ? (
        <span className="small muted"> Plant a base first.</span>
      ) : (
        !atHome &&
        home != null &&
        (teleport ? (
          <button className="btn yellow small" style={{ marginLeft: 6 }} onClick={() => teleport(me.base!)}><MoveIcon /> Go home</button>
        ) : (
          <span className="small muted"> Home is {formatDistance(home)} away.</span>
        ))
      )}

      <label>Hang out (players within 150 m)</label>
      {near.length ? (
        <div className="row wrap">
          {near.map((p) => (
            <button key={p.id} className="btn ghost small" disabled={socialLeft > 0} onClick={() => act(() => api("/api/sims", { body: { action: "socialize", userId: p.id } }))}>
              👋 {p.avatar} {p.username}
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">Nobody close by right now. Chatting with your crew also helps a little.</p>
      )}
      {socialLeft > 0 && <p className="small muted">Next hangout in {Math.ceil(socialLeft / 60000)} min.</p>}
    </>
  );
}
