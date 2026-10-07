"use client";
// Strategy layer UI: faction, base buildings (builders, camps, vault), army with
// veterancy + counters, research tree, territory (outposts) and star-rated reports.
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
  RESEARCH,
  rushCost,
  UNITS,
  unitCost,
  vetRank,
  type UnitKey,
} from "@/lib/rts";
import { distanceM, formatDistance } from "@/lib/geo";
import { api, fmtTime, type BaseView } from "./client";
import { Sheet, Tabs, useGame } from "./ui";
import { DefenseTab } from "./Defense";

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};
const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);
const CLS_ICON = { infantry: "🚶", vehicle: "🚙", air: "✈️", structure: "🏰" } as const;

type Territory = { outposts: { id: string; name: string; garrison: Partial<Record<UnitKey, number>>; pending: number }[]; war: { faction: string; outposts: number }[] };

export function BasePanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { act, pos, refresh, teleport, me } = useGame();
  const [v, setV] = useState<BaseView | null>(null);
  const [terr, setTerr] = useState<Territory | null>(null);
  const [tab, setTab] = useState<"base" | "defense" | "army" | "research" | "territory" | "reports">("base");
  const [name, setName] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    api<BaseView>("/api/base").then(setV).catch(() => {});
    api<Territory>("/api/outposts").then(setTerr).catch(() => {});
  }, []);
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
  const timers = v ? [...(v.base?.buildings ?? []).map((b) => b.readyAt), ...v.queue.map((q) => q.readyAt), ...v.research.map((r) => r.readyAt)].map((t) => new Date(t).getTime()) : [];
  const justFinished = timers.some((t) => t <= now && t > now - 1500);
  useEffect(() => {
    if (justFinished) load();
  }, [justFinished]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAct = (b: unknown, path = "/api/base") => act(() => api(path, { body: b })).then((ok) => ok && (load(), refresh()));
  const rush = (what: string, msLeft: number, type?: string) => (
    <button className="btn ghost small" disabled={(v?.gems ?? 0) < rushCost(msLeft)} onClick={() => doAct({ action: "rush", what, type })}>
      💎 {rushCost(msLeft)}
    </button>
  );

  if (!v) return <Sheet title="Base" onClose={onClose} peek={peek}><div className="empty">Loading…</div></Sheet>;
  const f = v.faction ? FACTION_BY_KEY[v.faction] : null;

  if (!f) {
    return (
      <Sheet title="Choose your side" onClose={onClose} peek={peek}>
        <p className="small muted">Your faction shapes your army. Build a base on a real street, train an army, take derricks and outposts, raid rivals for stars and trophies — and when they&apos;re online nearby, fight it out in first person.</p>
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
  const busy = b.buildings.filter((x) => new Date(x.readyAt).getTime() > now).length;
  const shield = b.shieldUntil && new Date(b.shieldUntil).getTime() > now ? new Date(b.shieldUntil).getTime() - now : 0;
  const dist = pos ? distanceM(pos, b) : null;
  const queueLeft = v.queue.length ? Math.max(...v.queue.map((q) => new Date(q.readyAt).getTime())) - now : 0;
  const researching = v.research.find((r) => new Date(r.readyAt).getTime() > now);
  const tribute = terr?.outposts.reduce((s, o) => s + o.pending, 0) ?? 0;

  return (
    <Sheet title={`${f.emoji} ${b.name}`} onClose={onClose} peek={peek}>
      <div className="res-bar">
        <span title="Trophies & league">{v.league.emoji} {v.trophies} 🏆</span>
        <span title="Gems">💎 {v.gems}</span>
        <span title="Scrap (from salvaged gear)">🔩 {v.scrap}</span>
        <span title="Builders busy / total">🔨 {busy}/{v.builders}</span>
        <span title="Army Camp housing" style={{ color: v.housing.used >= v.housing.cap ? "var(--red)" : undefined }}>⛺ {v.housing.used}/{v.housing.cap}</span>
      </div>
      <div className="grid3" style={{ marginBottom: 10 }}>
        <div className="stat"><b style={{ color: b.power.ok ? "var(--green)" : "var(--red)" }}>⚡ {b.power.made}/{b.power.used}</b><span>{f.needsPower ? (b.power.ok ? "Power" : "Low power!") : "No grid"}</span></div>
        <div className="stat"><b style={{ color: b.hp < 500 ? "var(--red)" : undefined }}>{b.hp}</b><span>Integrity</span></div>
        <div className="stat"><b>🏦 {Math.round(v.protection * 100)}%</b><span>Coins safe</span></div>
      </div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <button className="btn yellow small" disabled={b.pending <= 0} onClick={() => doAct({ action: "collect" })}>📦 Collect {b.pending} 🪙</button>
        {b.hp < 1000 && <button className="btn ghost small" onClick={() => doAct({ action: "repair" })}>🔧 Repair ({Math.ceil((1000 - b.hp) / 2)} 🪙)</button>}
        {shield > 0 && <span className="tag" style={{ color: "var(--cyan)" }}>🛡️ Shield {fmtLeft(shield)}</span>}
        {dist != null && (dist < 80 ? <span className="small muted">🏠 You&apos;re home</span> : teleport ? <button className="btn ghost small" onClick={() => teleport(b)}>🕹️ Go home</button> : <span className="small muted">{formatDistance(dist)} away</span>)}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[["base", "Buildings"], ["defense", "🗼 Defense"], ["army", `Army (${v.attack.count})`], ["research", "Research"], ["territory", `Territory${tribute ? " 🪙" : ""}`], ["reports", "Reports"]]}
      />

      {tab === "base" && (
        <>
          {BUILDINGS.map((def) => {
            const cur = b.buildings.find((x) => x.type === def.key);
            const lvl = cur ? effectiveLevel(cur, now) : 0;
            const left = cur ? new Date(cur.readyAt).getTime() - now : 0;
            const building = left > 0;
            const next = lvl + 1;
            const locked = hq < def.hqLevel;
            const capped = next > MAX_LEVEL || (def.key !== "hq" && next > hq);
            return (
              <div key={def.key} className={`card list-item ${building ? "hl" : ""}`} style={{ opacity: locked ? 0.5 : 1 }}>
                <div className="icon-tile">{def.emoji}</div>
                <div className="grow">
                  <b>{def.name}</b> {lvl > 0 && <span className="tag">Lv {lvl}</span>}
                  <div className="small muted">{def.blurb}</div>
                  {building && <div className="small" style={{ color: "var(--yellow)" }}>🚧 Building Lv {cur!.level} · {fmtLeft(left)}</div>}
                </div>
                {locked ? (
                  <span className="small muted">HQ {def.hqLevel}</span>
                ) : building ? (
                  rush("build", left, def.key)
                ) : capped ? (
                  <span className="small muted">{next > MAX_LEVEL ? "MAX" : "HQ ↑"}</span>
                ) : (
                  <button className="btn small" disabled={busy >= v.builders} onClick={() => doAct({ action: "build", type: def.key })} title={`${Math.max(1, Math.round((buildSeconds(def, next) * v.timeMult.build) / 60))} min`}>
                    {lvl ? "↑" : "Build"} {buildCost(def, next, f)}🪙
                  </button>
                )}
              </div>
            );
          })}
          <p className="small muted">{busy >= v.builders ? "All builders busy — rush with 💎 or build a Builder's Hut." : `${v.builders - busy} builder${v.builders - busy > 1 ? "s" : ""} free.`} {f.needsPower ? "Keep power positive or everything slows down." : ""}</p>
          <button className="btn ghost small" onClick={() => confirm(`Move ${b.name} to where you're standing for ${RELOCATE_COST} coins?`) && doAct({ action: "found", name: b.name })}>🚚 Move base here ({RELOCATE_COST} 🪙)</button>
        </>
      )}

      {tab === "defense" && <DefenseTab base={b} hq={hq} coins={me.coins} scrap={v.scrap} reload={load} />}

      {tab === "army" && (
        <>
          <div className="grid3" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{v.attack.count}</b><span>Units</span></div>
            <div className="stat"><b>⚔️ {v.attack.atk}</b><span>Attack</span></div>
            <div className="stat"><b>❤️ {v.attack.hp}</b><span>HP</span></div>
          </div>
          {UNITS.map((u) => {
            const have = levelOf(b.buildings, u.building, now) >= u.buildingLevel;
            const rank = vetRank(v.vets[u.key as UnitKey]);
            const best = (Object.entries(u.vs) as [keyof typeof CLS_ICON, number][]).sort((a, c) => c[1] - a[1])[0][0];
            const worst = (Object.entries(u.vs) as [keyof typeof CLS_ICON, number][]).sort((a, c) => a[1] - c[1])[0][0];
            return (
              <div key={u.key} className="card list-item" style={{ opacity: have ? 1 : 0.5 }}>
                <div className="icon-tile">{u.emoji}</div>
                <div className="grow">
                  <b>{u.name}</b> <span className="tag">×{v.army[u.key as UnitKey] ?? 0}</span>{" "}
                  {(v.army[u.key as UnitKey] ?? 0) > 0 && rank.stars && <span className="tag" style={{ color: "var(--yellow)" }}>{rank.stars} {rank.name}</span>}
                  <div className="small muted">{u.role} Strong vs {CLS_ICON[best]} · weak vs {CLS_ICON[worst]}</div>
                  <div className="small muted">ATK {u.atk} · HP {u.hp} · ⛺{u.housing} · {Math.round(u.seconds * v.timeMult.train)}s</div>
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
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                <label style={{ margin: 0 }}>Training queue</label>
                {rush("train", queueLeft)}
              </div>
              {v.queue.map((q) => (
                <div key={q.id} className="small row" style={{ justifyContent: "space-between", padding: "4px 0" }}>
                  <span>{UNITS.find((u) => u.key === q.unitType)?.emoji} {q.qty}× {UNITS.find((u) => u.key === q.unitType)?.name}</span>
                  <span className="mono">{fmtLeft(new Date(q.readyAt).getTime() - now)}</span>
                </div>
              ))}
            </>
          )}
          <p className="small muted">Counters matter: Rangers shred infantry, Rockets kill tanks and jets, Artillery wrecks bases. Units that survive battles rank up ⭐ (Veteran → Elite → Heroic). New recruits dilute a stack&apos;s rank.</p>
        </>
      )}

      {tab === "research" && (
        <>
          <p className="small muted">Research costs coins and 🔩 scrap (salvage gear in Hero → Gear). One project at a time.</p>
          {RESEARCH.map((r) => {
            const row = v.research.find((x) => x.key === r.key);
            const left = row ? new Date(row.readyAt).getTime() - now : 0;
            const done = row && left <= 0;
            const have = levelOf(b.buildings, r.building, now) >= r.level;
            return (
              <div key={r.key} className={`card list-item ${left > 0 ? "hl" : ""}`} style={{ opacity: have || row ? 1 : 0.5 }}>
                <div className="icon-tile">{r.emoji}</div>
                <div className="grow">
                  <b>{r.name}</b> {done && <span className="tag" style={{ color: "var(--green)" }}>✓ Done</span>}
                  <div className="small muted">{r.blurb}</div>
                  {!have && !row && <div className="small muted">Needs {BUILDINGS.find((x) => x.key === r.building)!.name} Lv {r.level}</div>}
                  {left > 0 && <div className="small" style={{ color: "var(--yellow)" }}>🔬 {fmtLeft(left)}</div>}
                </div>
                {left > 0 ? rush("research", left) : !row && have && (
                  <button className="btn small" disabled={!!researching || v.scrap < r.scrap} onClick={() => doAct({ action: "research", key: r.key })}>
                    {r.coins}🪙 {r.scrap}🔩
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "territory" && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <b>🚩 Your outposts ({terr?.outposts.length ?? 0})</b>
            <button className="btn yellow small" disabled={!tribute} onClick={() => doAct({ action: "collect" }, "/api/outposts")}>Collect {tribute} 🪙</button>
          </div>
          {terr?.outposts.map((o) => (
            <div key={o.id} className="card small row" style={{ justifyContent: "space-between" }}>
              <span>🚩 {o.name}</span>
              <span className="muted">
                {Object.entries(o.garrison).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji}${q}`).join(" ") || "no garrison!"} · {o.pending} 🪙
              </span>
            </div>
          ))}
          {!terr?.outposts.length && <div className="empty">Tap a 🏴 outpost on the map and assault it with your army. Held outposts pay tribute every hour — garrison them or rivals will take them.</div>}
          <label>Faction war</label>
          {terr?.war.map((w, i) => {
            const fd = FACTION_BY_KEY[w.faction as keyof typeof FACTION_BY_KEY];
            return (
              <div key={w.faction} className={`card small row ${w.faction === f.key ? "hl" : ""}`} style={{ justifyContent: "space-between" }}>
                <span>{i === 0 && w.outposts > 0 ? "👑 " : ""}{fd.emoji} <b style={{ color: fd.color }}>{fd.name}</b></span>
                <span>{w.outposts} outposts</span>
              </div>
            );
          })}
        </>
      )}

      {tab === "reports" && (
        <>
          {[...v.battles, ...v.defended].sort((a, c) => +new Date(c.createdAt) - +new Date(a.createdAt)).map((r) => (
            <div key={r.id + r.side} className="card list-item">
              <div className="icon-tile" style={{ fontSize: r.kind === "siege" ? 14 : 26, color: "var(--yellow)" }}>{r.kind === "siege" ? stars(r.stars) : r.won ? "🏆" : "☠️"}</div>
              <div className="grow">
                <b>
                  {r.side === "defend" ? `${r.won ? "Held off" : "Raided by"} ${r.targetName}` : { siege: "Raid", derrick: "Derrick raid", boss: "Bombarded", breach: "Breach (FPS)", raid: "Boss raid (FPS)", outpost: "Outpost assault", skirmish: "Skirmish", wave: "Raider wave" }[r.kind] ?? r.kind}
                  {r.side === "attack" && ` · ${r.targetName}`}
                </b>
                <div className="small muted">
                  {fmtTime(r.createdAt)}
                  {r.kind === "siege" && ` · ${r.destruction}%`}
                  {r.loot ? ` · ${r.side === "defend" ? "−" : "+"}${r.loot} 🪙` : ""}
                  {r.trophies ? ` · ${r.trophies > 0 ? "+" : ""}${r.trophies} 🏆` : ""}
                </div>
              </div>
              {r.side === "defend" && !r.won && r.revengeBaseId && (
                <button className="btn small" onClick={() => confirm(`Send your army for revenge on ${r.targetName}?`) && doAct({ kind: "siege", targetId: r.revengeBaseId }, "/api/battle")}>⚔️ Revenge</button>
              )}
            </div>
          ))}
          {!v.battles.length && !v.defended.length && <div className="empty">No battles yet.</div>}
        </>
      )}
    </Sheet>
  );
}
