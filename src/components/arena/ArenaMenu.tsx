"use client";
// The 3D city menu's Street Arena tab: start or join a match on the streets around you,
// the lobby (teams, your gun, start), and fighting in the open city (passive mode).
import { useEffect, useState } from "react";
import { formatDistance } from "@/lib/geo";
import { fmtNum, t } from "@/lib/i18n";
import { MAX_BOTS, MODE_KEYS, MODES, RADII, TEAM_COLORS, TEAM_NAMES, type Difficulty, type ModeKey } from "@/lib/arena/modes";
import { PRIMARIES, WEAPONS, type WeaponKey } from "@/lib/arena/weapons";
import { Button } from "@/components/Button";
import type { Combat } from "./combat";
import { useCombat } from "./CombatHud";

const SIZE_LABEL: Record<number, string> = { 150: "Small", 250: "Medium", 400: "Large" };
const DIFF: Difficulty[] = ["easy", "normal", "hard"];
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export function ArenaMenu({ combat, canDrive, onGo, onClose }: { combat: Combat; canDrive: boolean; onGo: (p: { lat: number; lng: number }, label: string) => void; onClose: () => void }) {
  const s = useCombat(combat);
  const [mode, setMode] = useState<ModeKey>("tdm");
  const [radius, setRadius] = useState<number>(250);
  const [bots, setBots] = useState(6);
  const [diff, setDiff] = useState<Difficulty>("normal");
  const [primary, setPrimary] = useState<WeaponKey>(combat.primary);

  // Nearby lobbies, refreshed while the tab is open.
  useEffect(() => {
    if (s?.inMatch || s?.rt !== "on") return;
    combat.lobbiesRefresh();
    const id = setInterval(() => combat.lobbiesRefresh(), 3000);
    return () => clearInterval(id);
  }, [combat, s?.inMatch, s?.rt]);

  if (!s) return null;
  if (s.rt === "off") return <div className="drive-tab"><p className="small muted">{t("Live multiplayer is offline right now — you can still walk around and drive.")}</p></div>;
  if (s.rt === "connecting") return <div className="drive-tab"><p className="small muted"><i className="drive-spinner" aria-hidden /> {t("Connecting to the live city…")}</p></div>;

  const pickPrimary = (w: WeaponKey) => {
    setPrimary(w);
    combat.setPrimary(w);
  };
  const guns = (
    <div className="arena-row">
      <span className="lbl">{t("Your gun")}</span>
      <div className="arena-chips">
        {PRIMARIES.map((w) => (
          <button key={w} className={`chip ${primary === w ? "on" : ""}`} onClick={() => pickPrimary(w)}>{t(WEAPONS[w].name)}</button>
        ))}
      </div>
    </div>
  );

  // ---- in a match: the lobby / match panel
  const m = s.match;
  if (m) {
    const def = MODES[m.mode];
    const host = m.hostSid === combat.sid;
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
        {guns}
        <p className="small muted">{t("Bots: {n} · {d}", { n: m.bots, d: t(DIFF_LABEL[m.difficulty]) })}</p>
        <div className="arena-actions">
          {m.phase === "lobby" && (host ? <Button className="btn yellow" onClick={() => (combat.start(), onClose())}>{t("Start match")}</Button> : <span className="small muted">{t("Waiting for the host to start…")}</span>)}
          <Button className="btn" onClick={() => combat.leave()}>{t("Leave")}</Button>
        </div>
      </div>
    );
  }

  // ---- free roam: start / join
  return (
    <div className="drive-tab arena-tab">
      {!canDrive && <p className="small muted">{t("Switch to Play from home to fight in Street Arena")}</p>}
      <div className="arena-pvp">
        <div className="grow">
          <b>{s.passive ? t("🕊️ Passive mode") : t("⚔️ Fighting on")}</b>
          <span className="small muted">{s.passive ? t("Nobody can shoot you in the open city, and you can't shoot them.") : t("Other players who turned fighting on can shoot you — and you them.")}</span>
        </div>
        <Button className={`btn small ${s.passive ? "yellow" : ""}`} onClick={() => combat.setPassive(!s.passive)}>{s.passive ? t("Turn fighting on") : t("Go passive")}</Button>
      </div>

      <h4>{t("New match here")}</h4>
      <div className="arena-modes">
        {MODE_KEYS.map((k) => (
          <button key={k} className={`arena-mode ${mode === k ? "on" : ""}`} onClick={() => setMode(k)}>
            <span className="ic">{MODES[k].emoji}</span>
            <b>{t(MODES[k].name)}</b>
            <small>{t(MODES[k].blurb, { n: MODES[k].killLimit })}</small>
          </button>
        ))}
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Arena")}</span>
        <div className="arena-chips">
          {RADII.map((r) => (
            <button key={r} className={`chip ${radius === r ? "on" : ""}`} onClick={() => setRadius(r)}>{t(SIZE_LABEL[r])} · {formatDistance(r * 2)}</button>
          ))}
        </div>
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Bots")}</span>
        <input type="range" min={0} max={MAX_BOTS} value={bots} onChange={(e) => setBots(Number(e.target.value))} aria-label={t("Bots")} />
        <b className="val">{fmtNum(bots)}</b>
      </div>
      <div className="arena-row">
        <span className="lbl">{t("Difficulty")}</span>
        <div className="arena-chips">
          {DIFF.map((d) => (
            <button key={d} className={`chip ${diff === d ? "on" : ""}`} onClick={() => setDiff(d)}>{t(DIFF_LABEL[d])}</button>
          ))}
        </div>
      </div>
      {guns}
      <Button className="btn yellow wide" disabled={!canDrive} onClick={() => combat.create(mode, radius, bots, diff)}>{t("Create match on these streets")}</Button>

      {s.local ? (
        <p className="small muted">{t("Matches here are practice against bots. Fights in the open city work with everyone nearby — matches with friends need the live server.")}</p>
      ) : (
        <h4>{t("Matches nearby")}</h4>
      )}
      {!s.local && s.lobbies.length === 0 && <p className="small muted">{t("No matches around here yet — start one and invite your friends.")}</p>}
      {!s.local && s.lobbies.map((l) => {
        const close = l.dist <= l.radius + 250;
        return (
          <div key={l.id} className="drive-job drive-place">
            <span className="ic">{MODES[l.mode].emoji}</span>
            <span className="grow">
              <b>{t(MODES[l.mode].name)} · {l.hostName}</b>
              <span className="small muted">{t("{n} players · {b} bots", { n: l.players, b: l.bots })} · {l.phase === "lobby" ? t("in the lobby") : t("playing")} · {formatDistance(l.dist)}</span>
            </span>
            {close ? (
              <Button className="btn small yellow" disabled={!canDrive} onClick={() => combat.join(l.id)}>{t("Join")}</Button>
            ) : (
              <Button className="btn small" onClick={() => onGo({ lat: l.lat, lng: l.lng }, t(MODES[l.mode].name))}>{t("Go")}</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
