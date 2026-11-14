"use client";
// Street Arena's pieces of the city menu's Play together tab (drive/PlayTogether.tsx): the
// match I'm in (lobby: teams, my gun, start), a new match's settings, matches nearby, and
// fighting in the open city (passive mode).
import { useEffect, useState } from "react";
import { formatDistance } from "@/lib/geo";
import { fmtNum, t } from "@/lib/i18n";
import { JOIN_MARGIN_M, MAX_BOTS, MODES, RADII, TEAM_COLORS, TEAM_NAMES, type Difficulty } from "@/lib/arena/modes";
import { PRIMARIES, SECONDARIES, WEAPONS, type WeaponKey } from "@/lib/arena/weapons";
import { Button } from "@/components/Button";
import type { Combat, CombatHud as Hud } from "./combat";

const SIZE_LABEL: Record<number, string> = { 70: "Small", 120: "Medium", 200: "Large" };
const DIFF: Difficulty[] = ["easy", "normal", "hard"];
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export type ArenaSettings = { radius: number; bots: number; diff: Difficulty };
export const ARENA_DEFAULTS: ArenaSettings = { radius: 120, bots: 6, diff: "normal" };

/** The main gun I take into matches, and the sidearm that goes with it. */
export function GunPicker({ combat }: { combat: Combat }) {
  const [primary, setPrimary] = useState<WeaponKey>(combat.primary);
  const [secondary, setSecondary] = useState<WeaponKey>(combat.secondary);
  return (
    <>
      <div className="arena-row">
        <span className="lbl">{t("Your gun")}</span>
        <div className="arena-chips">
          {PRIMARIES.map((w: WeaponKey) => (
            <button key={w} className={`chip ${primary === w ? "on" : ""}`} onClick={() => (setPrimary(w), combat.setPrimary(w))}>
              {t(WEAPONS[w].name)}
            </button>
          ))}
        </div>
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Sidearm")}</span>
        <div className="arena-chips">
          {SECONDARIES.map((w: WeaponKey) => (
            <button key={w} className={`chip ${secondary === w ? "on" : ""}`} onClick={() => (setSecondary(w), combat.setSecondary(w))}>
              {t(WEAPONS[w].name)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** A new match's arena: how big, how many bots, how good. */
export function ArenaSetup({ value, onChange }: { value: ArenaSettings; onChange: (v: ArenaSettings) => void }) {
  return (
    <>
      <div className="arena-row">
        <span className="lbl">{t("Arena")}</span>
        <div className="arena-chips">
          {RADII.map((r) => (
            <button key={r} className={`chip ${value.radius === r ? "on" : ""}`} onClick={() => onChange({ ...value, radius: r })}>
              {t(SIZE_LABEL[r])} · {formatDistance(r * 2)}
            </button>
          ))}
        </div>
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Bots")}</span>
        <input type="range" min={0} max={MAX_BOTS} value={value.bots} onChange={(e) => onChange({ ...value, bots: Number(e.target.value) })} aria-label={t("Bots")} />
        <b className="val">{fmtNum(value.bots)}</b>
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Difficulty")}</span>
        <div className="arena-chips">
          {DIFF.map((d) => (
            <button key={d} className={`chip ${value.diff === d ? "on" : ""}`} onClick={() => onChange({ ...value, diff: d })}>
              {t(DIFF_LABEL[d])}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** The match I'm in: who's on which team, my gun, start (host) or wait, leave. */
export function MatchPanel({ combat, s, onClose }: { combat: Combat; s: Hud; onClose: () => void }) {
  const m = s.match!;
  const def = MODES[m.mode];
  const host = m.hostSid === combat.sid;
  const humans = m.players.filter((p) => !p.bot).length;
  return (
    <div className="drive-tab arena-tab">
      <div className="arena-head">
        <span className="ic">{def.emoji}</span>
        <div className="grow">
          <b>{t(def.name)}</b>
          <span className="small muted">{t(def.blurb, { n: def.killLimit })}</span>
        </div>
      </div>
      {def.teams ? (
        <div className="arena-teams">
          {([1, 2] as const).map((tm) => (
            <div key={tm} className="arena-team" style={{ "--team": TEAM_COLORS[tm] } as React.CSSProperties}>
              <b>{t(TEAM_NAMES[tm])}</b>
              {m.players.filter((p) => p.team === tm).map((p) => <span key={p.sid} className={p.sid === combat.sid ? "me" : ""}>{p.avatar} {p.name}</span>)}
              {m.phase === "lobby" && s.team !== tm && <button className="btn small" onClick={() => combat.setTeam(tm)}>{t("Join {team}", { team: t(TEAM_NAMES[tm]) })}</button>}
            </div>
          ))}
        </div>
      ) : (
        <div className="arena-team solo">
          {m.players.map((p) => <span key={p.sid} className={p.sid === combat.sid ? "me" : ""}>{p.avatar} {p.name}</span>)}
        </div>
      )}
      <GunPicker combat={combat} />
      <p className="small muted">
        {t("Bots: {n} · {d}", { n: m.bots, d: t(DIFF_LABEL[m.difficulty]) })} · {t("{n} players", { n: humans })}
      </p>
      {s.relay && <p className="small muted">{s.relay === "host" ? t("Your phone runs this match — keep the game open until it's over.") : t("Played through the game server: others move a moment behind, that's normal.")}</p>}
      <div className="arena-actions">
        {m.phase === "lobby" && (host ? <Button className="btn yellow" onClick={() => (combat.start(), onClose())}>{t("Start match")}</Button> : <span className="small muted">{t("Waiting for the host to start…")}</span>)}
        <Button className="btn" onClick={() => combat.leave()}>{t("Leave")}</Button>
      </div>
    </div>
  );
}

/** Matches around me (and my party's, wherever it is): join, or go there. */
export function NearbyMatches({ combat, s, canDrive, onGo }: { combat: Combat; s: Hud; canDrive: boolean; onGo: (p: { lat: number; lng: number }, label: string) => void }) {
  useEffect(() => {
    if (s.inMatch || s.rt !== "on") return;
    combat.lobbiesRefresh();
    const id = setInterval(() => combat.lobbiesRefresh(), 3000);
    return () => clearInterval(id);
  }, [combat, s.inMatch, s.rt]);
  if (s.rt !== "on") return null;
  return (
    <>
      {s.lobbies.length === 0 && <p className="small muted">{t("No matches around here yet — start one and invite your friends.")}</p>}
      {s.lobbies.map((l) => {
        const close = l.party || l.dist <= l.radius + JOIN_MARGIN_M;
        return (
          <div key={l.id} className="drive-job drive-place">
            <span className="ic">{MODES[l.mode].emoji}</span>
            <span className="grow">
              <b>
                {t(MODES[l.mode].name)} · {l.hostName}
                {l.party ? ` · 🎉 ${t("your party")}` : ""}
              </b>
              <span className="small muted">
                {t("{n} players · {b} bots", { n: l.players, b: l.bots })} · {l.phase === "lobby" ? t("in the lobby") : t("playing")} · {formatDistance(l.dist)}
              </span>
            </span>
            {close ? (
              <Button className="btn small yellow" disabled={!canDrive} onClick={() => combat.join(l.id, l.kind)}>{t("Join")}</Button>
            ) : (
              <Button className="btn small" onClick={() => onGo({ lat: l.lat, lng: l.lng }, t(MODES[l.mode].name))}>{t("Go")}</Button>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Fighting in the open city: opt-in (passive by default). */
export function FightToggle({ combat, s }: { combat: Combat; s: Hud }) {
  return (
    <div className="arena-pvp">
      <div className="grow">
        <b>{s.passive ? t("🕊️ Passive mode") : t("⚔️ Fighting on")}</b>
        <span className="small muted">{s.passive ? t("Nobody can shoot you in the open city, and you can't shoot them.") : t("Other players who turned fighting on can shoot you — and you them.")}</span>
      </div>
      <Button className={`btn small ${s.passive ? "yellow" : ""}`} onClick={() => combat.setPassive(!s.passive)}>{s.passive ? t("Turn fighting on") : t("Go passive")}</Button>
    </div>
  );
}
