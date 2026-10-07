"use client";
// Base → Defense: towers on the street (tower defense), field squads (RTS on the real
// map) and raider waves.
import { useCallback, useEffect, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
import { UNITS, type Army, type UnitKey } from "@/lib/rts";
import { maxTowers, PROVOKE_DELAY_MS, squadPos, TOWER_MAX_LEVEL, TOWER_TERRITORY_M, TOWERS, towerCost, towerStats, unitCount, type TowerKey } from "@/lib/td";
import { api } from "./client";
import { MoveIcon, useGame } from "./ui";
import { askConfirm } from "@/components/Dialogs";

type TowerRow = { id: string; type: string; level: number; lat: number; lng: number; hp: number; kills: number; readyAt: string };
type SquadRow = { id: string; units: Army; fromLat: number; fromLng: number; toLat: number; toLng: number; departAt: string; arriveAt: string; order: string; status: string; targetKind: string | null };

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};
const armyStr = (a: Army) => Object.entries(a).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji}${q}`).join(" ");

export function DefenseTab({ base, hq, coins, scrap, reload }: { base: { id: string; lat: number; lng: number }; hq: number; coins: number; scrap: number; reload: () => void }) {
  const { act, pos, pick, teleport, world, refresh } = useGame();
  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [home, setHome] = useState<Army>({});
  const [maxSquads, setMaxSquads] = useState(4);
  const [pickUnits, setPickUnits] = useState<Army>({});
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    api<{ towers: TowerRow[] }>("/api/towers").then((r) => setTowers(r.towers)).catch(() => {});
    api<{ squads: SquadRow[]; home: Army; max: number }>("/api/squads")
      .then((r) => {
        setSquads(r.squads);
        setHome(r.home);
        setMaxSquads(r.max);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(load, 10_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);

  const doAct = (path: string, b: unknown) =>
    act(() => api(path, { body: b })).then((ok) => {
      if (ok) {
        load();
        reload();
        refresh();
      }
      return ok;
    });

  const fromBase = pos ? distanceM(pos, base) : Infinity;
  const inTerritory = fromBase <= TOWER_TERRITORY_M;
  const wave = world?.waves.find((w) => w.baseId === base.id && !w.resolved);
  const chosen = unitCount(pickUnits) ? pickUnits : home;
  const deploy = (to: { lat: number; lng: number }) => doAct("/api/squads", { action: "deploy", units: chosen, to }).then((ok) => ok && setPickUnits({}));

  return (
    <>
      {/* ---------- raider waves */}
      <div className={`card ${wave && now >= wave.startAt ? "hl" : ""}`} style={{ marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <b>🏴‍☠️ Raider waves</b>
            <div className="small muted">
              {!wave
                ? hq >= 2 ? "Quiet for now. Raiders show up every hour or two." : "Raiders start hitting bases at Command Center level 2. Provoke them early for bounties."
                : now < wave.startAt
                  ? `Next wave in ${fmtLeft(wave.startAt - now)}${wave.boost > 1 ? " · provoked ×1.5 bounty" : ""}`
                  : `⚠️ Wave in progress! ${fmtLeft(wave.endAt - now)} left`}
            </div>
          </div>
          <button className="btn yellow small" disabled={!!wave && now >= wave.startAt - PROVOKE_DELAY_MS} onClick={() => askConfirm("Provoke a raider wave against your base in 60 s? Bounties ×1.5, but leaked raiders still steal coins.", { ok: "Provoke" }).then((ok) => ok && doAct("/api/waves", { action: "provoke" }))}>
            📯 Provoke
          </button>
        </div>
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          Raiders march in from 550 m out. Towers, guard squads and your base turrets shoot them — your crew&apos;s too. Be within 400 m of the base to call in ✈️ airstrikes. Leakers steal coins (the 🏦 Vault protects some).
        </p>
      </div>

      {/* ---------- towers */}
      <div className="row" style={{ justifyContent: "space-between", margin: "4px 0 6px" }}>
        <b>🗼 Towers ({towers.length}/{maxTowers(hq)})</b>
        <span className="small muted">{inTerritory ? `📍 ${formatDistance(fromBase)} from base — you can build here` : `Walk within ${TOWER_TERRITORY_M / 1000} km of your base to build`}</span>
      </div>
      <div className="tower-shop">
        {TOWERS.map((t) => {
          const c = towerCost(t.key, 1);
          const locked = hq < t.hqLevel;
          return (
            <button
              key={t.key}
              className="tower-card"
              disabled={locked || !inTerritory || towers.length >= maxTowers(hq) || coins < c.coins || scrap < c.scrap}
              onClick={() => doAct("/api/towers", { action: "build", type: t.key })}
              title={t.blurb}
            >
              <span style={{ fontSize: 26 }}>{t.emoji}</span>
              <b>{t.name}</b>
              <span className="small muted">{locked ? `HQ ${t.hqLevel}` : `${c.coins}🪙${c.scrap ? ` ${c.scrap}🔩` : ""}`}</span>
              <span className="small muted">⌖{t.range}m · {t.dps}dps</span>
            </button>
          );
        })}
      </div>
      <p className="small muted">Towers go up exactly where you stand. They shoot any rival commander who walks into range (players below level 3 are spared) and every raider that passes. 🔫 shreds raiders on foot, 💣 kills technicals, 🚀 swats drones, 🎯 punishes players.</p>
      {towers.map((t) => {
        const st = towerStats(t);
        const left = new Date(t.readyAt).getTime() - now;
        const d = pos ? distanceM(pos, t) : null;
        const up = t.level < TOWER_MAX_LEVEL ? towerCost(t.type as TowerKey, t.level + 1) : null;
        return (
          <div key={t.id} className={`card list-item ${left > 0 ? "hl" : ""}`}>
            <div className="icon-tile">{st.def.emoji}</div>
            <div className="grow">
              <b>{st.def.name}</b> <span className="tag">Lv {t.level}</span> {t.kills > 0 && <span className="tag" style={{ color: "var(--red)" }}>☠️ {t.kills}</span>}
              <div className="need-bar"><i style={{ width: `${(t.hp / st.maxHp) * 100}%`, background: t.hp < st.maxHp * 0.4 ? "var(--red)" : "var(--green)" }} /></div>
              <div className="small muted">
                {t.hp}/{st.maxHp} HP · range {st.range} m · {st.dps.toFixed(1)} dps {d != null && `· ${formatDistance(d)}`}
                {left > 0 && <span style={{ color: "var(--yellow)" }}> · 🚧 {fmtLeft(left)}</span>}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              {up && left <= 0 && <button className="btn small" onClick={() => doAct("/api/towers", { action: "upgrade", towerId: t.id })}>↑ {up.coins}🪙</button>}
              {t.hp < st.maxHp && <button className="btn ghost small" onClick={() => doAct("/api/towers", { action: "repair", towerId: t.id })}>🔧 {Math.ceil((st.maxHp - t.hp) * 0.4)}</button>}
              {teleport && d != null && d > 30 && <button className="btn ghost small" onClick={() => teleport(t)}><MoveIcon /></button>}
              <button className="btn ghost small" onClick={() => askConfirm(`Demolish this ${st.def.name}? You get 30% back.`, { ok: "Demolish", danger: true }).then((ok) => ok && doAct("/api/towers", { action: "demolish", towerId: t.id }))}>🏚️</button>
            </div>
          </div>
        );
      })}

      {/* ---------- field squads */}
      <div className="row" style={{ justifyContent: "space-between", margin: "14px 0 6px" }}>
        <b>🎖️ Field squads ({squads.length}/{maxSquads})</b>
        <span className="small muted">At home: {armyStr(home) || "nobody"}</span>
      </div>
      {squads.map((s) => {
        const marching = s.status === "MARCH" && new Date(s.arriveAt).getTime() > now;
        const p = s.status === "HOLD" ? { lat: s.toLat, lng: s.toLng } : squadPos(s, now);
        return (
          <div key={s.id} className="card list-item">
            <div className="icon-tile" style={{ fontSize: 20 }}>{s.order === "attack" ? "⚔️" : s.order === "return" ? "↩️" : "🛡️"}</div>
            <div className="grow">
              <b>{armyStr(s.units)}</b>
              <div className="small muted">
                {marching ? `${s.order === "attack" ? `Attacking ${s.targetKind}` : s.order === "return" ? "Heading home" : "Moving"} · arrives in ${fmtLeft(new Date(s.arriveAt).getTime() - now)}` : `Guarding · ${formatDistance(distanceM(p, base))} from base`}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <button className="btn ghost small" onClick={() => pick("Tap where this squad should move", (to) => doAct("/api/squads", { action: "move", squadId: s.id, to }))}>📍 Move</button>
              {s.order !== "return" && <button className="btn ghost small" onClick={() => doAct("/api/squads", { action: "recall", squadId: s.id })}>↩️ Recall</button>}
            </div>
          </div>
        );
      })}
      {unitCount(home) > 0 && squads.length < maxSquads && (
        <div className="card">
          <label style={{ marginTop: 0 }}>Deploy a squad {unitCount(pickUnits) ? "" : "(all units at home)"}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {UNITS.filter((u) => (home[u.key] ?? 0) > 0).map((u) => {
              const n = pickUnits[u.key as UnitKey] ?? 0;
              const max = home[u.key as UnitKey] ?? 0;
              return (
                <div key={u.key} className="stepper">
                  <button onClick={() => setPickUnits({ ...pickUnits, [u.key]: Math.max(0, n - 1) })}>−</button>
                  <span>{u.emoji} {n || "·"}/{max}</span>
                  <button onClick={() => setPickUnits({ ...pickUnits, [u.key]: Math.min(max, n + 1) })}>+</button>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {pos && <button className="btn small" onClick={() => deploy(pos)}>🛡️ Guard where I stand</button>}
            <button className="btn cyan small" onClick={() => pick("Tap where the squad should take position", deploy)}>📍 Guard a spot</button>
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Squads march at their slowest unit (🚶 3 m/s · 🚙 8 m/s · ✈️ 25 m/s) and everyone sees them on the map. Guards shoot rival commanders within {55} m, defend against raiders and reinforce nearby bases and outposts. To attack, tap an enemy 🗼 tower, squad, 🏰 base or 🚩 outpost on the map → <b>March a squad</b>.
          </p>
        </div>
      )}
      {!unitCount(home) && !squads.length && <div className="empty">Train units in the Army tab, then deploy them onto the map.</div>}
    </>
  );
}
