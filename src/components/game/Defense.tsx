"use client";
// Base → Defense: towers on the street (tower defense), field squads (RTS on the real
// map) and raider waves.
import { useCallback, useEffect, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
import { fmtNum, msg, t } from "@/lib/i18n";
import { UNITS, type Army, type UnitKey } from "@/lib/rts";
import { maxTowers, PROVOKE_DELAY_MS, squadPos, TOWER_MAX_LEVEL, TOWER_TERRITORY_M, TOWERS, towerCost, towerStats, unitCount, type TowerKey } from "@/lib/td";
import { api } from "./client";
import { MoveIcon, useGame } from "./ui";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";

type TowerRow = { id: string; type: string; level: number; lat: number; lng: number; hp: number; kills: number; readyAt: string };
type SquadRow = { id: string; units: Army; fromLat: number; fromLng: number; toLat: number; toLng: number; departAt: string; arriveAt: string; order: string; status: string; targetKind: string | null };

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? t("{m}m {s}s", { m: Math.floor(s / 60), s: s % 60 }) : t("{s}s", { s });
};
const armyStr = (a: Army) => Object.entries(a).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji}${fmtNum(q ?? 0)}`).join(" ");
const TARGET_KIND: Record<string, string> = { tower: msg("tower"), squad: msg("squad"), base: msg("base"), outpost: msg("outpost") };

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
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(load, 10_000);
    return () => {
      clearInterval(tick);
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
            <b>{t("🏴‍☠️ Raider waves")}</b>
            <div className="small muted">
              {!wave
                ? hq >= 2 ? t("Quiet for now. Raiders show up every hour or two.") : t("Raiders start hitting bases at Command Center level 2. Provoke them early for bounties.")
                : now < wave.startAt
                  ? `${t("Next wave in {time}", { time: fmtLeft(wave.startAt - now) })}${wave.boost > 1 ? ` · ${t("provoked ×1.5 bounty")}` : ""}`
                  : t("⚠️ Wave in progress! {time} left", { time: fmtLeft(wave.endAt - now) })}
            </div>
          </div>
          <Button className="btn yellow small" disabled={!!wave && now >= wave.startAt - PROVOKE_DELAY_MS} onClick={() => askConfirm(t("Provoke a raider wave against your base in 60 s? Bounties ×1.5, but leaked raiders still steal coins."), { ok: t("Provoke") }).then((ok) => ok && doAct("/api/waves", { action: "provoke" }))}>
            {t("📯 Provoke")}
          </Button>
        </div>
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {t("Raiders march in from 550 m out. Towers, guard squads and your base turrets shoot them — your crew's too. Be within 400 m of the base to call in ✈️ airstrikes. Leakers steal coins (the 🏦 Vault protects some).")}
        </p>
      </div>

      {/* ---------- towers */}
      <div className="row" style={{ justifyContent: "space-between", margin: "4px 0 6px" }}>
        <b>{t("🗼 Towers ({n}/{max})", { n: towers.length, max: maxTowers(hq) })}</b>
        <span className="small muted">{inTerritory ? t("📍 {d} from base — you can build here", { d: formatDistance(fromBase) }) : t("Walk within {n} km of your base to build", { n: TOWER_TERRITORY_M / 1000 })}</span>
      </div>
      <div className="tower-shop">
        {TOWERS.map((def) => {
          const c = towerCost(def.key, 1);
          const locked = hq < def.hqLevel;
          return (
            <Button
              key={def.key}
              className="tower-card"
              disabled={locked || !inTerritory || towers.length >= maxTowers(hq) || coins < c.coins || scrap < c.scrap}
              onClick={() => doAct("/api/towers", { action: "build", type: def.key })}
              title={t(def.blurb)}
            >
              <span style={{ fontSize: 26 }}>{def.emoji}</span>
              <b>{t(def.name)}</b>
              <span className="small muted">{locked ? t("HQ {n}", { n: def.hqLevel }) : `${fmtNum(c.coins)}🪙${c.scrap ? ` ${fmtNum(c.scrap)}🔩` : ""}`}</span>
              <span className="small muted">⌖{t("{n} m", { n: def.range })} · {t("{n} dps", { n: def.dps })}</span>
            </Button>
          );
        })}
      </div>
      <p className="small muted">{t("Towers go up exactly where you stand. They shoot any rival commander who walks into range (players below level 3 are spared) and every raider that passes. 🔫 shreds raiders on foot, 💣 kills technicals, 🚀 swats drones, 🎯 punishes players.")}</p>
      {towers.map((tw) => {
        const st = towerStats(tw);
        const left = new Date(tw.readyAt).getTime() - now;
        const d = pos ? distanceM(pos, tw) : null;
        const up = tw.level < TOWER_MAX_LEVEL ? towerCost(tw.type as TowerKey, tw.level + 1) : null;
        return (
          <div key={tw.id} className={`card list-item ${left > 0 ? "hl" : ""}`}>
            <div className="icon-tile">{st.def.emoji}</div>
            <div className="grow">
              <b>{t(st.def.name)}</b> <span className="tag">{t("Lv {n}", { n: tw.level })}</span> {tw.kills > 0 && <span className="tag" style={{ color: "var(--red)" }}>☠️ {fmtNum(tw.kills)}</span>}
              <div className="need-bar"><i style={{ width: `${(tw.hp / st.maxHp) * 100}%`, background: tw.hp < st.maxHp * 0.4 ? "var(--red)" : "var(--green)" }} /></div>
              <div className="small muted">
                {t("{hp}/{max} HP · range {r} m · {dps} dps", { hp: tw.hp, max: st.maxHp, r: st.range, dps: Number(st.dps.toFixed(1)) })} {d != null && `· ${formatDistance(d)}`}
                {left > 0 && <span style={{ color: "var(--yellow)" }}> · 🚧 {fmtLeft(left)}</span>}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              {up && left <= 0 && <Button className="btn small" onClick={() => doAct("/api/towers", { action: "upgrade", towerId: tw.id })}>↑ {fmtNum(up.coins)}🪙</Button>}
              {tw.hp < st.maxHp && <Button className="btn ghost small" onClick={() => doAct("/api/towers", { action: "repair", towerId: tw.id })}>🔧 {fmtNum(Math.ceil((st.maxHp - tw.hp) * 0.4))}</Button>}
              {teleport && d != null && d > 30 && <Button className="btn ghost small" onClick={() => teleport(tw)}><MoveIcon /></Button>}
              <Button className="btn ghost small" onClick={() => askConfirm(t("Demolish this {tower}? You get 30% back.", { tower: t(st.def.name) }), { ok: t("Demolish"), danger: true }).then((ok) => ok && doAct("/api/towers", { action: "demolish", towerId: tw.id }))}>🏚️</Button>
            </div>
          </div>
        );
      })}

      {/* ---------- field squads */}
      <div className="row" style={{ justifyContent: "space-between", margin: "14px 0 6px" }}>
        <b>{t("🎖️ Field squads ({n}/{max})", { n: squads.length, max: maxSquads })}</b>
        <span className="small muted">{t("At home:")} {armyStr(home) || t("nobody")}</span>
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
                {marching
                  ? `${s.order === "attack" ? t("Attacking a {target}", { target: t(TARGET_KIND[s.targetKind ?? ""] ?? s.targetKind ?? "") }) : s.order === "return" ? t("Heading home") : t("Moving")} · ${t("arrives in {time}", { time: fmtLeft(new Date(s.arriveAt).getTime() - now) })}`
                  : t("Guarding · {d} from base", { d: formatDistance(distanceM(p, base)) })}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <Button className="btn ghost small" onClick={() => pick(t("Tap where this squad should move"), (to) => doAct("/api/squads", { action: "move", squadId: s.id, to }))}>{t("📍 Move")}</Button>
              {s.order !== "return" && <Button className="btn ghost small" onClick={() => doAct("/api/squads", { action: "recall", squadId: s.id })}>{t("↩️ Recall")}</Button>}
            </div>
          </div>
        );
      })}
      {unitCount(home) > 0 && squads.length < maxSquads && (
        <div className="card">
          <label style={{ marginTop: 0 }}>{t("Deploy a squad")} {unitCount(pickUnits) ? "" : t("(all units at home)")}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {UNITS.filter((u) => (home[u.key] ?? 0) > 0).map((u) => {
              const n = pickUnits[u.key as UnitKey] ?? 0;
              const max = home[u.key as UnitKey] ?? 0;
              return (
                <div key={u.key} className="stepper">
                  <Button onClick={() => setPickUnits({ ...pickUnits, [u.key]: Math.max(0, n - 1) })}>−</Button>
                  <span>{u.emoji} {n ? fmtNum(n) : "·"}/{fmtNum(max)}</span>
                  <Button onClick={() => setPickUnits({ ...pickUnits, [u.key]: Math.min(max, n + 1) })}>+</Button>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {pos && <Button className="btn small" onClick={() => deploy(pos)}>{t("🛡️ Guard where I stand")}</Button>}
            <Button className="btn cyan small" onClick={() => pick(t("Tap where the squad should take position"), deploy)}>{t("📍 Guard a spot")}</Button>
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {t("Squads march at their slowest unit (🚶 3 m/s · 🚙 8 m/s · ✈️ 25 m/s) and everyone sees them on the map. Guards shoot rival commanders within {r} m, defend against raiders and reinforce nearby bases and outposts.", { r: 55 })}{" "}
            {t("To attack, tap an enemy 🗼 tower, squad, 🏰 base or 🚩 outpost on the map →")} <b>{t("March a squad")}</b>.
          </p>
        </div>
      )}
      {!unitCount(home) && !squads.length && <div className="empty">{t("Train units in the Army tab, then deploy them onto the map.")}</div>}
    </>
  );
}
