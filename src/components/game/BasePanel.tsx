"use client";
// Strategy layer UI: faction, your base's buildings, army training and battle reports.
import { useCallback, useEffect, useState } from "react";
import {
  BUILDINGS,
  buildCost,
  buildSeconds,
  effectiveLevel,
  FACTION_BY_KEY,
  FACTIONS,
  levelOf,
  MAX_LEVEL,
  RELOCATE_COST,
  UNITS,
  unitCost,
  type UnitKey,
} from "@/lib/rts";
import { distanceM, formatDistance } from "@/lib/geo";
import { api, fmtTime, type BaseView } from "./client";
import { Sheet, Tabs, useGame } from "./ui";

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};

export function BasePanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { act, pos, refresh } = useGame();
  const [v, setV] = useState<BaseView | null>(null);
  const [tab, setTab] = useState<"base" | "army" | "reports">("base");
  const [name, setName] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => api<BaseView>("/api/base").then(setV).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(load, 15_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);
  // Reload when a timer finishes so levels/units appear.
  const nextDone = v ? Math.min(...[...(v.base?.buildings ?? []).map((b) => new Date(b.readyAt).getTime()), ...v.queue.map((q) => new Date(q.readyAt).getTime())].filter((t) => t > now - 1000)) : Infinity;
  useEffect(() => {
    if (Number.isFinite(nextDone) && nextDone <= now) load();
  }, [nextDone <= now]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAct = (b: unknown) => act(() => api("/api/base", { body: b })).then((ok) => ok && (load(), refresh()));

  if (!v) return <Sheet title="Base" onClose={onClose} peek={peek}><div className="empty">Loading…</div></Sheet>;
  const f = v.faction ? FACTION_BY_KEY[v.faction] : null;

  if (!f) {
    return (
      <Sheet title="Choose your side" onClose={onClose} peek={peek}>
        <p className="small muted">Your faction shapes your army. Generals-style: build a base on a real street, train an army, take derricks, siege rivals — and when they&apos;re online nearby, fight it out in first person.</p>
        {FACTIONS.map((x) => (
          <div key={x.key} className="card list-item" style={{ borderColor: x.color }}>
            <div className="icon-tile" style={{ fontSize: 30 }}>{x.emoji}</div>
            <div className="grow">
              <b style={{ color: x.color }}>{x.name}</b>
              <div className="small muted">{x.blurb}</div>
              <div className="small">ATK ×{x.atk} · HP ×{x.hp} · cost ×{x.cost}{!x.needsPower && " · no power grid"}</div>
            </div>
            <button className="btn small" onClick={() => doAct({ action: "faction", faction: x.key })}>Join</button>
          </div>
        ))}
      </Sheet>
    );
  }

  if (!v.base) {
    return (
      <Sheet title={`${f.emoji} Plant your base`} onClose={onClose} peek={peek}>
        <p className="small muted">Your base goes exactly where you&apos;re standing. Pick somewhere you visit often — you rest and eat there, and rivals have to come to it in person to breach it.</p>
        <label>Base name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fort Midnight" maxLength={30} />
        <button className="btn block" style={{ marginTop: 12 }} disabled={!pos || name.trim().length < 2} onClick={() => doAct({ action: "found", name })}>
          🏛️ Establish base here
        </button>
      </Sheet>
    );
  }

  const b = v.base;
  const hq = levelOf(b.buildings, "hq", now);
  const busy = b.buildings.some((x) => new Date(x.readyAt).getTime() > now);
  const shield = b.shieldUntil && new Date(b.shieldUntil).getTime() > now ? new Date(b.shieldUntil).getTime() - now : 0;
  const dist = pos ? distanceM(pos, b) : null;

  return (
    <Sheet title={`${f.emoji} ${b.name}`} onClose={onClose} peek={peek}>
      <div className="grid3" style={{ marginBottom: 10 }}>
        <div className="stat"><b style={{ color: b.power.ok ? "var(--green)" : "var(--red)" }}>⚡ {b.power.made}/{b.power.used}</b><span>{f.needsPower ? (b.power.ok ? "Power" : "Low power!") : "No grid"}</span></div>
        <div className="stat"><b style={{ color: b.hp < 500 ? "var(--red)" : undefined }}>{b.hp}</b><span>Integrity</span></div>
        <div className="stat"><b>🛡️ {b.defense.atk}</b><span>Defense</span></div>
      </div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <button className="btn yellow small" disabled={b.pending <= 0} onClick={() => doAct({ action: "collect" })}>📦 Collect {b.pending} 🪙</button>
        {b.hp < 1000 && <button className="btn ghost small" onClick={() => doAct({ action: "repair" })}>🔧 Repair ({Math.ceil((1000 - b.hp) / 2)} 🪙)</button>}
        {shield > 0 && <span className="tag" style={{ color: "var(--cyan)" }}>🛡️ Shield {fmtLeft(shield)}</span>}
        {dist != null && <span className="small muted">{dist < 80 ? "🏠 You're home" : `${formatDistance(dist)} away`}</span>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[["base", "Buildings"], ["army", `Army (${v.attack.count})`], ["reports", "Reports"]]} />

      {tab === "base" && (
        <>
          {BUILDINGS.map((def) => {
            const cur = b.buildings.find((x) => x.type === def.key);
            const lvl = cur ? effectiveLevel(cur, now) : 0;
            const building = cur && new Date(cur.readyAt).getTime() > now;
            const next = lvl + 1;
            const locked = hq < def.hqLevel;
            const capped = next > MAX_LEVEL || (def.key !== "hq" && next > hq);
            return (
              <div key={def.key} className={`card list-item ${building ? "hl" : ""}`} style={{ opacity: locked ? 0.5 : 1 }}>
                <div className="icon-tile">{def.emoji}</div>
                <div className="grow">
                  <b>{def.name}</b> {lvl > 0 && <span className="tag">Lv {lvl}</span>}
                  <div className="small muted">{def.blurb}</div>
                  {building && <div className="small" style={{ color: "var(--yellow)" }}>🚧 Building Lv {cur!.level} · {fmtLeft(new Date(cur!.readyAt).getTime() - now)}</div>}
                </div>
                {locked ? (
                  <span className="small muted">HQ {def.hqLevel}</span>
                ) : building ? null : capped ? (
                  <span className="small muted">{next > MAX_LEVEL ? "MAX" : "HQ ↑"}</span>
                ) : (
                  <button className="btn small" disabled={busy} onClick={() => doAct({ action: "build", type: def.key })} title={`${Math.round(buildSeconds(def, next) / 60)} min`}>
                    {lvl ? "↑" : "Build"} {buildCost(def, next, f)}🪙
                  </button>
                )}
              </div>
            );
          })}
          <p className="small muted">One construction at a time. {f.needsPower ? "Keep power positive or everything slows down." : ""} Relocating costs {RELOCATE_COST} 🪙.</p>
          <button className="btn ghost small" onClick={() => confirm(`Move ${b.name} to where you're standing for ${RELOCATE_COST} coins?`) && doAct({ action: "found", name: b.name })}>🚚 Move base here</button>
        </>
      )}

      {tab === "army" && (
        <>
          <div className="grid3" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{v.attack.count}</b><span>Units</span></div>
            <div className="stat"><b>⚔️ {v.attack.atk}</b><span>Attack</span></div>
            <div className="stat"><b>❤️ {v.attack.hp}</b><span>HP</span></div>
          </div>
          {UNITS.map((u) => {
            const have = levelOf(b.buildings, u.building, now) >= u.buildingLevel;
            return (
              <div key={u.key} className="card list-item" style={{ opacity: have ? 1 : 0.5 }}>
                <div className="icon-tile">{u.emoji}</div>
                <div className="grow">
                  <b>{u.name}</b> <span className="tag">×{v.army[u.key as UnitKey] ?? 0}</span>
                  <div className="small muted">ATK {u.atk} · HP {u.hp} · {u.seconds}s{u.siege > 1 ? ` · siege ×${u.siege}` : ""}</div>
                  {!have && <div className="small muted">Needs {BUILDINGS.find((x) => x.key === u.building)!.name} Lv {u.buildingLevel}</div>}
                </div>
                {have && (
                  <div className="row">
                    <button className="btn ghost small" onClick={() => doAct({ action: "train", unit: u.key, qty: 1 })}>+1 · {unitCost(u, f)}</button>
                    <button className="btn small" onClick={() => doAct({ action: "train", unit: u.key, qty: 5 })}>+5</button>
                  </div>
                )}
              </div>
            );
          })}
          {v.queue.length > 0 && (
            <>
              <label>Training queue</label>
              {v.queue.map((q) => (
                <div key={q.id} className="small row" style={{ justifyContent: "space-between", padding: "4px 0" }}>
                  <span>{UNITS.find((u) => u.key === q.unitType)?.emoji} {q.qty}× {UNITS.find((u) => u.key === q.unitType)?.name}</span>
                  <span className="mono">{fmtLeft(new Date(q.readyAt).getTime() - now)}</span>
                </div>
              ))}
            </>
          )}
          <p className="small muted">Use your army to capture 🛢️ derricks (in person), siege rival bases within 5 km of yours, or bombard bosses.</p>
        </>
      )}

      {tab === "reports" && (
        <>
          {[...v.battles, ...v.defended].sort((a, c) => +new Date(c.createdAt) - +new Date(a.createdAt)).map((r) => (
            <div key={r.id + r.side} className="card list-item">
              <div className="icon-tile">{r.won ? "🏆" : "☠️"}</div>
              <div className="grow">
                <b>
                  {r.side === "defend" ? `${r.won ? "Held off" : "Raided by"} ${r.targetName}` : { siege: "Siege", derrick: "Derrick raid", boss: "Bombarded", breach: "Breach (FPS)", raid: "Boss raid (FPS)" }[r.kind] ?? r.kind}
                  {r.side === "attack" && ` · ${r.targetName}`}
                </b>
                <div className="small muted">{fmtTime(r.createdAt)} {r.loot ? `· ${r.side === "defend" ? "−" : "+"}${r.loot} 🪙` : ""}</div>
              </div>
            </div>
          ))}
          {!v.battles.length && !v.defended.length && <div className="empty">No battles yet.</div>}
        </>
      )}
    </Sheet>
  );
}
