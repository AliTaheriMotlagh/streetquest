"use client";
// What you see while fighting: crosshair and hit marker (painted by combat.ts every
// frame), health and ammo, the kill feed, red arrows toward whoever shot you, the match
// bar (mode, clock, score), bomb status, the death screen, the scoreboard and the results.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { bombSide, MODES, TEAM_COLORS, TEAM_NAMES, type MatchView } from "@/lib/arena/modes";
import { WEAPONS } from "@/lib/arena/weapons";
import { ActButton } from "./CombatPad";
import type { Combat, CombatHud as Hud } from "./combat";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${fmtNum(Math.floor(s / 60))}:${fmtNum(s % 60).padStart(2, fmtNum(0))}`;
};

const WEAPON_ICON: Record<string, string> = { pistol: "🔫", smg: "🔫", rifle: "🔫", sniper: "🎯", shotgun: "💥", zone: "☠️", bomb: "💣" };

export function useCombat(c: Combat | null): Hud | null {
  return useSyncExternalStore(c?.subscribe ?? noop, c ? c.getSnapshot : nil, nil);
}
const noop = () => () => {};
const nil = () => null;

export function CombatHud({ combat, touch }: { combat: Combat; touch: boolean }) {
  const s = useCombat(combat);
  const cross = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState(false);

  useEffect(() => {
    combat.bindHud(cross.current, hit.current);
    return () => combat.bindHud(null, null);
  }, [combat, s?.onFoot]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => e.key === "Tab" && combat.onFoot && (e.preventDefault(), setBoard(true));
    const ku = (e: KeyboardEvent) => e.key === "Tab" && setBoard(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [combat]);

  if (!s) return null;
  const m = s.match;
  const now = combat.serverNow();
  const W = WEAPONS[s.weapon];
  const me = combat.sid;
  const ended = m?.phase === "ended";

  return (
    <div className={`chud ${s.onFoot ? "foot" : ""} ${touch ? "touch" : ""}`}>
      {s.onFoot && (
        <>
          <div className="chud-cross" ref={cross} aria-hidden>
            <i /><i /><i /><i /><b />
          </div>
          <div className="chud-hit" ref={hit} aria-hidden>
            <i /><i /><i /><i />
          </div>
          {s.scoped && <div className="chud-scope" aria-hidden />}
          {s.hurt.map((h) => (
            <div key={h.id} className="chud-hurt" style={{ transform: `rotate(${(-h.angle * 180) / Math.PI}deg)` }} aria-hidden />
          ))}
          {s.hp < 35 && !s.dead && <div className="chud-low" aria-hidden />}
        </>
      )}

      {m && (
        <MatchBar m={m} now={now} me={me} team={s.team}>
          {touch && s.onFoot && !ended && (
            <button className="chud-board-btn" onPointerDown={() => setBoard(true)} onPointerUp={() => setBoard(false)} onPointerCancel={() => setBoard(false)} aria-label={t("Scores")}>
              ☰
            </button>
          )}
        </MatchBar>
      )}

      {s.feed.length > 0 && (
        <ul className="chud-feed" aria-live="polite">
          {s.feed.map((f) => (
            <li key={f.id} className={f.mine ? "mine" : f.me ? "me" : ""}>
              {f.killer && <b style={{ color: f.kc }}>{f.killer}</b>}
              <span className="w">{WEAPON_ICON[f.w] ?? "🔫"}{f.head && " 🎯"}</span>
              <b style={{ color: f.vc }}>{f.victim}</b>
            </li>
          ))}
        </ul>
      )}

      {s.onFoot && !s.dead && (
        <div className="chud-stats">
          <div className="chud-hp" style={{ "--hp": s.hp / 100 } as React.CSSProperties}>
            <span>✚ {fmtNum(s.hp)}</span>
            <i />
          </div>
          <div className="chud-ammo">
            <b className={s.ammo === 0 ? "out" : s.ammo <= W.mag * 0.25 ? "low" : ""}>{s.reloading ? t("Reloading…") : fmtNum(s.ammo)}</b>
            {!s.reloading && <span>/ {fmtNum(s.mag)}</span>}
            <small>{t(W.name)}</small>
          </div>
        </div>
      )}

      {s.outside && <div className="chud-warn">{t("Get back inside the arena!")}</div>}
      {s.carrying && m?.phase === "live" && !s.act?.can && <div className="chud-tip">💣 {t("You have the bomb — plant it at site A or B")}</div>}
      {s.act && (touch ? (
        <ActButton input={combat.input} label={s.act.kind === "plant" ? (s.act.can ? t("Hold to plant") : t("Go to a site")) : t("Hold to defuse")} progress={s.act.progress} />
      ) : (
        <div className="chud-tip act" style={{ "--p": s.act.progress } as React.CSSProperties}>
          {s.act.kind === "plant" ? (s.act.can ? t("Hold E to plant the bomb") : t("Go to site A or B to plant")) : t("Hold E to defuse")}
          <i />
        </div>
      ))}

      {s.dead && !ended && (
        <div className="chud-dead">
          <b>{t("You were taken down")}</b>
          {m && !MODES[m.mode].respawn ? (
            <span>{t("Back next round — watch your team")}</span>
          ) : s.canRespawn ? (
            <button className="btn yellow" onClick={() => combat.respawn()}>{t("Respawn")}</button>
          ) : (
            <span>{t("Back in {s} s", { s: s.respawnIn })}</span>
          )}
        </div>
      )}

      {(board || ended) && m && <Scoreboard m={m} me={me} now={now} onLeave={() => combat.leave()} />}
    </div>
  );
}

function MatchBar({ m, now, me, team, children }: { m: MatchView; now: number; me: number; team: number; children?: React.ReactNode }) {
  const def = MODES[m.mode];
  const left = m.until ? m.until - now : 0;
  const myLine = m.players.find((p) => p.sid === me);
  const leader = m.players[0];
  let banner: string | null = null;
  if (m.phase === "lobby") banner = t("Lobby — the host starts the match");
  else if (m.phase === "warmup") banner = m.mode === "bomb" ? t("Round {n} — you {side}", { n: m.round, side: bombSide(team as 1 | 2, m.round) === "attack" ? t("attack") : t("defend") }) : t("Get ready…");
  else if (m.phase === "roundEnd" && m.winner) banner = t("{team} wins the round", { team: t(TEAM_NAMES[m.winner.team]) });
  const bomb = m.bomb;
  return (
    <div className="chud-match">
      <div className="chud-mrow">
      <div className="chud-mbar">
        {def.teams ? (
          <>
            <b className="score red" style={{ background: TEAM_COLORS[1] }}>{fmtNum(m.teamScore[1])}</b>
            <span className="mid">
              <small>{def.emoji} {t(def.name)}</small>
              <b>{m.phase === "lobby" ? "—" : clock(left)}</b>
            </span>
            <b className="score blue" style={{ background: TEAM_COLORS[2] }}>{fmtNum(m.teamScore[2])}</b>
          </>
        ) : (
          <>
            <b className="score">{fmtNum(myLine?.kills ?? 0)}</b>
            <span className="mid">
              <small>{def.emoji} {t(def.name)} · {fmtNum(def.killLimit)}</small>
              <b>{m.phase === "lobby" ? "—" : clock(left)}</b>
            </span>
            <b className="score lead" title={leader?.name}>{fmtNum(leader?.kills ?? 0)}</b>
          </>
        )}
      </div>
      {children}
      </div>
      {bomb?.state === "planted" && <div className="chud-bomb">💣 {t("Bomb planted at {s}", { s: bomb.site })} · <b>{clock(bomb.at - now)}</b></div>}
      {bomb?.state === "dropped" && <div className="chud-bomb soft">💣 {t("The bomb is on the ground")}</div>}
      {banner && <div className="chud-banner" key={banner}>{banner}{m.phase === "warmup" && <b> {fmtNum(Math.max(0, Math.ceil(left / 1000)))}</b>}</div>}
    </div>
  );
}

function Scoreboard({ m, me, now, onLeave }: { m: MatchView; me: number; now: number; onLeave: () => void }) {
  const def = MODES[m.mode];
  const ended = m.phase === "ended";
  const groups = def.teams ? ([1, 2] as const).map((tm) => ({ tm, rows: m.players.filter((p) => p.team === tm) })) : [{ tm: 0 as const, rows: m.players }];
  let title = t(def.name);
  if (ended) {
    if (def.teams) title = m.winner?.team ? t("{team} wins!", { team: t(TEAM_NAMES[m.winner.team]) }) : t("It's a draw");
    else title = t("{name} wins!", { name: m.players.find((p) => p.sid === m.winner?.sid)?.name ?? "—" });
  }
  return (
    <div className={`chud-board ${ended ? "ended" : ""}`} role="dialog" aria-label={t("Scores")}>
      <h3>{title}</h3>
      {groups.map((g) => (
        <table key={g.tm}>
          <thead>
            <tr style={g.tm ? { color: TEAM_COLORS[g.tm] } : undefined}>
              <th>{g.tm ? t(TEAM_NAMES[g.tm]) : t("Player")}</th>
              <th>{t("Kills")}</th>
              <th>{t("Deaths")}</th>
              <th>{t("Score")}</th>
              <th>{t("Ping")}</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((p) => (
              <tr key={p.sid} className={`${p.sid === me ? "me" : ""} ${p.alive ? "" : "down"}`}>
                <td>{p.avatar} {p.name}</td>
                <td>{fmtNum(p.kills)}</td>
                <td>{fmtNum(p.deaths)}</td>
                <td>{fmtNum(p.score)}</td>
                <td>{p.bot ? "—" : fmtNum(p.ping)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {ended && (
        <p className="small muted">
          {t("Back to the city in {s} s", { s: Math.max(0, Math.ceil((m.until - now) / 1000)) })}{" "}
          <button className="btn small" onClick={onLeave}>{t("Leave now")}</button>
        </p>
      )}
    </div>
  );
}
