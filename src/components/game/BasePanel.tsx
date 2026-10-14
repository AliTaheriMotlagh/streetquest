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
  LEVEL_CAP,
  RELOCATE_COST,
  RESEARCH,
  rushCost,
  UNITS,
  unitCost,
  vetRank,
  type UnitKey,
} from "@/lib/rts";
import { distanceM, formatDistance } from "@/lib/geo";
import { fmtNum, msg, t } from "@/lib/i18n";
import { outpostLabel } from "@/lib/outposts";
import { api, fmtTime, type BaseView } from "./client";
import { MoveIcon, Sheet, Tabs, useGame } from "./ui";
import { DefenseTab } from "./Defense";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? t("{h}h {m}m", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) }) : s >= 60 ? t("{m}m {s}s", { m: Math.floor(s / 60), s: s % 60 }) : t("{s}s", { s });
};
const REPORT_KIND: Record<string, string> = { superweapon: msg("Superweapon strike"), siege: msg("Raid"), derrick: msg("Derrick raid"), boss: msg("Bombarded"), breach: msg("Breach (FPS)"), raid: msg("Boss raid (FPS)"), outpost: msg("Outpost assault"), skirmish: msg("Skirmish"), wave: msg("Raider wave") };
const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);
const CLS_ICON = { infantry: "🚶", vehicle: "🚙", air: "✈️", structure: "🏰" } as const;

type Territory = { outposts: { id: string; name: string; garrison: Partial<Record<UnitKey, number>>; pending: number }[]; war: { faction: string; outposts: number }[] };

export function BasePanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { act, pos, teleport, me } = useGame();
  const [v, setV] = useState<BaseView | null>(null);
  const [terr, setTerr] = useState<Territory | null>(null);
  const [tab, setTab] = useState<"base" | "defense" | "army" | "research" | "territory" | "reports">("base");
  const [name, setName] = useState("");
  const [now, setNow] = useState(Date.now());

  const [loadedAt, setLoadedAt] = useState(0);
  const load = useCallback(() => {
    const at = Date.now();
    api<BaseView>("/api/base")
      .then((d) => {
        setV(d);
        setLoadedAt(at);
      })
      .catch(() => {});
    api<Territory>("/api/outposts").then(setTerr).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(load, 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(r);
    };
  }, [load]);
  // Reload as soon as any timer finishes (a building, research, or the next unit in a
  // training batch) so levels and the army count update on their own.
  const timers = v
    ? [
        ...(v.base?.buildings ?? []).map((b) => new Date(b.readyAt).getTime()),
        ...v.research.map((r) => new Date(r.readyAt).getTime()),
        ...v.queue.map((q) => new Date(q.readyAt).getTime() - (q.unitMs > 0 ? (q.qty - 1) * q.unitMs : 0)),
      ]
    : [];
  const nextDue = Math.min(Infinity, ...timers.filter((at) => at > loadedAt));
  const due = now >= nextDue + 300;
  useEffect(() => {
    if (due) load();
  }, [due, nextDue]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAct = (b: unknown, path = "/api/base") => act(() => api(path, { body: b })).then((ok) => {
      load(); // also after a refusal: the panel was showing something out of date
      return ok;
    });
  const rush = (what: string, msLeft: number, type?: string) => (
    <Button className="btn ghost small" disabled={(v?.gems ?? 0) < rushCost(msLeft)} onClick={() => doAct({ action: "rush", what, type })}>
      💎 {fmtNum(rushCost(msLeft))}
    </Button>
  );

  if (!v) return <Sheet title={t("Base")} onClose={onClose} peek={peek} help="base"><div className="empty">{t("Loading…")}</div></Sheet>;
  const f = v.faction ? FACTION_BY_KEY[v.faction] : null;

  if (!f) {
    return (
      <Sheet title={t("Choose your side")} onClose={onClose} peek={peek} help="base">
        <p className="small muted">{t("Your faction shapes your army. Build a base on a real street, train an army, take derricks and outposts, raid rivals for stars and trophies — and when they're online nearby, fight it out in first person.")}</p>
        {FACTIONS.map((x) => (
          <div key={x.key} className="card list-item" style={{ borderColor: x.color }}>
            <div className="icon-tile" style={{ fontSize: 30 }}>{x.emoji}</div>
            <div className="grow">
              <b style={{ color: x.color }}>{t(x.name)}</b>
              <div className="small muted">{t(x.blurb)}</div>
              <div className="small">{t("ATK ×{atk} · HP ×{hp} · cost ×{cost}", { atk: x.atk, hp: x.hp, cost: x.cost })}{!x.needsPower && ` · ${t("no power grid")}`}</div>
            </div>
            <Button className="btn small" onClick={() => doAct({ action: "faction", faction: x.key })}>{t("Join")}</Button>
          </div>
        ))}
      </Sheet>
    );
  }

  if (!v.base) {
    return (
      <Sheet title={`${f.emoji} ${t("Plant your base")}`} onClose={onClose} peek={peek} help="base">
        <p className="small muted">{t("Your base goes exactly where you're standing. Pick somewhere you visit often — you rest and eat there, and rivals have to come to it in person to breach it.")}</p>
        <label>{t("Base name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Fort Midnight")} maxLength={30} dir="auto" />
        <Button className="btn block" style={{ marginTop: 12 }} disabled={!pos || name.trim().length < 2} onClick={() => doAct({ action: "found", name })}>
          {t("🏛️ Establish base here")}
        </Button>
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
    <Sheet title={`${f.emoji} ${b.name}`} onClose={onClose} peek={peek} help="base">
      <div className="res-bar">
        <span title={t("Trophies & league")}>{v.league.emoji} {fmtNum(v.trophies)} 🏆</span>
        <span title={t("Gems")}>💎 {fmtNum(v.gems)}</span>
        <span title={t("Scrap (from salvaged gear)")}>🔩 {fmtNum(v.scrap)}</span>
        <span title={t("Builders busy / total")}>🔨 {fmtNum(busy)}/{fmtNum(v.builders)}</span>
        <span title={t("Army Camp housing")} style={{ color: v.housing.used >= v.housing.cap ? "var(--red)" : undefined }}>⛺ {fmtNum(v.housing.used)}/{fmtNum(v.housing.cap)}</span>
      </div>
      <div className="grid3" style={{ marginBottom: 10 }}>
        <div className="stat"><b style={{ color: b.power.ok ? "var(--green)" : "var(--red)" }}>⚡ {fmtNum(b.power.made)}/{fmtNum(b.power.used)}</b><span>{f.needsPower ? (b.power.ok ? t("Power") : t("Low power!")) : t("No grid")}</span></div>
        <div className="stat"><b style={{ color: b.hp < 500 ? "var(--red)" : undefined }}>{fmtNum(b.hp)}</b><span>{t("Integrity")}</span></div>
        <div className="stat"><b>🏦 {t("{n}%", { n: Math.round(v.protection * 100) })}</b><span>{t("Coins safe")}</span></div>
      </div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Button className="btn yellow small" disabled={b.pending <= 0} onClick={() => doAct({ action: "collect" })}>{t("📦 Collect {n} 🪙", { n: b.pending })}</Button>
        {b.hp < 1000 && <Button className="btn ghost small" onClick={() => doAct({ action: "repair" })}>{t("🔧 Repair ({n} 🪙)", { n: Math.ceil((1000 - b.hp) / 2) })}</Button>}
        {shield > 0 && <span className="tag" style={{ color: "var(--cyan)" }}>{t("🛡️ Shield {time}", { time: fmtLeft(shield) })}</span>}
        {dist != null && (dist < 80 ? <span className="small muted">{t("🏠 You're home")}</span> : teleport ? <Button className="btn ghost small" onClick={() => teleport(b)}><MoveIcon /> {t("Go home")}</Button> : <span className="small muted">{t("{d} away", { d: formatDistance(dist) })}</span>)}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[["base", t("Buildings")], ["defense", t("🗼 Defense")], ["army", t("Army ({n})", { n: v.attack.count })], ["research", t("Research")], ["territory", `${t("Territory")}${tribute ? " 🪙" : ""}`], ["reports", t("Reports")]]}
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
            const cap = LEVEL_CAP[def.key] ?? MAX_LEVEL;
            const capped = next > cap || (def.key !== "hq" && next > hq);
            return (
              <div key={def.key} className={`card list-item ${building ? "hl" : ""}`} style={{ opacity: locked ? 0.5 : 1 }}>
                <div className="icon-tile">{def.emoji}</div>
                <div className="grow">
                  <b>{t(def.name)}</b> {lvl > 0 && <span className="tag">{t("Lv {n}", { n: lvl })}</span>}
                  <div className="small muted">{t(def.blurb)}</div>
                  {building && <div className="small" style={{ color: "var(--yellow)" }}>{t("🚧 Building Lv {n} · {time}", { n: cur!.level, time: fmtLeft(left) })}</div>}
                </div>
                {locked ? (
                  <span className="small muted">{t("HQ {n}", { n: def.hqLevel })}</span>
                ) : building ? (
                  rush("build", left, def.key)
                ) : capped ? (
                  <span className="small muted">{next > cap ? t("MAX") : t("HQ ↑")}</span>
                ) : (
                  <Button className="btn small" disabled={busy >= v.builders} onClick={() => doAct({ action: "build", type: def.key })} title={t("{n} min", { n: Math.max(1, Math.round((buildSeconds(def, next) * v.timeMult.build) / 60)) })}>
                    {lvl ? "↑" : t("Build")} {fmtNum(buildCost(def, next, f))}🪙
                  </Button>
                )}
              </div>
            );
          })}
          <p className="small muted">{busy >= v.builders ? t("All builders busy — rush with 💎 or build a Builder's Hut.") : t("{n, plural, one {# builder} other {# builders}} free.", { n: v.builders - busy })} {f.needsPower ? t("Keep power positive or everything slows down.") : ""}</p>
          <Button className="btn ghost small" onClick={() => askConfirm(t("Move {name} to where you're standing for {n} coins?", { name: b.name, n: RELOCATE_COST }), { ok: t("Move base") }).then((ok) => ok && doAct({ action: "found", name: b.name }))}>{t("🚚 Move base here ({n} 🪙)", { n: RELOCATE_COST })}</Button>
        </>
      )}

      {tab === "defense" && <DefenseTab base={b} hq={hq} coins={me.coins} scrap={v.scrap} reload={load} />}

      {tab === "army" && (
        <>
          <div className="grid3" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{fmtNum(v.attack.count)}</b><span>{t("Units")}</span></div>
            <div className="stat"><b>⚔️ {fmtNum(v.attack.atk)}</b><span>{t("Attack")}</span></div>
            <div className="stat"><b>❤️ {fmtNum(v.attack.hp)}</b><span>{t("HP")}</span></div>
          </div>
          {UNITS.map((u) => {
            const have = levelOf(b.buildings, u.building, now) >= u.buildingLevel;
            const training = v.queue.filter((q) => q.unitType === u.key).reduce((s, q) => s + q.qty, 0);
            const room = v.housing.cap - v.housing.used;
            const rank = vetRank(v.vets[u.key as UnitKey]);
            const best = (Object.entries(u.vs) as [keyof typeof CLS_ICON, number][]).sort((a, c) => c[1] - a[1])[0][0];
            const worst = (Object.entries(u.vs) as [keyof typeof CLS_ICON, number][]).sort((a, c) => a[1] - c[1])[0][0];
            return (
              <div key={u.key} className="card list-item" style={{ opacity: have ? 1 : 0.5 }}>
                <div className="icon-tile">{u.emoji}</div>
                <div className="grow">
                  <b>{t(u.name)}</b> <span className="tag count-pop" key={v.army[u.key as UnitKey] ?? 0}>×{fmtNum(v.army[u.key as UnitKey] ?? 0)}</span>{" "}
                  {training > 0 && <span className="tag" style={{ color: "var(--yellow)" }}>{t("+{n} training", { n: training })}</span>}{" "}
                  {(v.army[u.key as UnitKey] ?? 0) > 0 && rank.stars && <span className="tag" style={{ color: "var(--yellow)" }}>{rank.stars} {t(rank.name)}</span>}
                  <div className="small muted">{t(u.role)} {t("Strong vs {good} · weak vs {bad}", { good: CLS_ICON[best], bad: CLS_ICON[worst] })}</div>
                  <div className="small muted">{t("ATK {atk} · HP {hp}", { atk: u.atk, hp: u.hp })} · ⛺{fmtNum(u.housing)} · {t("{s}s", { s: Math.round(u.seconds * v.timeMult.train) })}</div>
                  {!have && <div className="small muted">{t("Needs {building} Lv {n}", { building: t(BUILDINGS.find((x) => x.key === u.building)!.name), n: u.buildingLevel })}</div>}
                </div>
                {have && (
                  <div className="row">
                    <Button className="btn ghost small" disabled={room < u.housing} onClick={() => doAct({ action: "train", unit: u.key, qty: 1 })}>+{fmtNum(1)} · {fmtNum(unitCost(u, f))}</Button>
                    <Button className="btn small" disabled={room < u.housing * 5} onClick={() => doAct({ action: "train", unit: u.key, qty: 5 })}>+{fmtNum(5)} · {fmtNum(unitCost(u, f) * 5)}</Button>
                  </div>
                )}
              </div>
            );
          })}
          {v.queue.length > 0 && (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                <label style={{ margin: 0 }}>{t("Training queue")}</label>
                {rush("train", queueLeft)}
              </div>
              {v.queue.map((q) => {
                const end = new Date(q.readyAt).getTime();
                const nextUnit = q.unitMs > 0 ? end - (q.qty - 1) * q.unitMs : end;
                const pct = q.unitMs > 0 ? Math.max(0, Math.min(1, 1 - (nextUnit - now) / q.unitMs)) : 0;
                return (
                  <div key={q.id} className="small" style={{ padding: "4px 0" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span>{UNITS.find((u) => u.key === q.unitType)?.emoji} {fmtNum(q.qty)}× {t(UNITS.find((u) => u.key === q.unitType)?.name ?? "")}</span>
                      <span className="mono">{t("next {a} · all {b}", { a: fmtLeft(nextUnit - now), b: fmtLeft(end - now) })}</span>
                    </div>
                    {q.unitMs > 0 && <div className="need-bar"><i style={{ width: `${pct * 100}%`, background: "var(--yellow)" }} /></div>}
                  </div>
                );
              })}
            </>
          )}
          <p className="small muted">{t("Counters matter: Rangers shred infantry, Rockets kill tanks and jets, Artillery wrecks bases. Units that survive battles rank up ⭐ (Veteran → Elite → Heroic). New recruits dilute a stack's rank.")}</p>
        </>
      )}

      {tab === "research" && (
        <>
          <p className="small muted">{t("Research costs coins and 🔩 scrap (salvage gear in Hero → Gear). One project at a time.")}</p>
          {RESEARCH.map((r) => {
            const row = v.research.find((x) => x.key === r.key);
            const left = row ? new Date(row.readyAt).getTime() - now : 0;
            const done = row && left <= 0;
            const have = levelOf(b.buildings, r.building, now) >= r.level;
            return (
              <div key={r.key} className={`card list-item ${left > 0 ? "hl" : ""}`} style={{ opacity: have || row ? 1 : 0.5 }}>
                <div className="icon-tile">{r.emoji}</div>
                <div className="grow">
                  <b>{t(r.name)}</b> {done && <span className="tag" style={{ color: "var(--green)" }}>{t("✓ Done")}</span>}
                  <div className="small muted">{t(r.blurb)}</div>
                  {!have && !row && <div className="small muted">{t("Needs {building} Lv {n}", { building: t(BUILDINGS.find((x) => x.key === r.building)!.name), n: r.level })}</div>}
                  {left > 0 && <div className="small" style={{ color: "var(--yellow)" }}>🔬 {fmtLeft(left)}</div>}
                </div>
                {left > 0 ? rush("research", left) : !row && have && (
                  <Button className="btn small" disabled={!!researching || v.scrap < r.scrap} onClick={() => doAct({ action: "research", key: r.key })}>
                    {fmtNum(r.coins)}🪙 {fmtNum(r.scrap)}🔩
                  </Button>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "territory" && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <b>{t("🚩 Your outposts ({n})", { n: terr?.outposts.length ?? 0 })}</b>
            <Button className="btn yellow small" disabled={!tribute} onClick={() => doAct({ action: "collect" }, "/api/outposts")}>{t("Collect {n} 🪙", { n: tribute })}</Button>
          </div>
          {terr?.outposts.map((o) => (
            <div key={o.id} className="card small row" style={{ justifyContent: "space-between" }}>
              <span>🚩 {outpostLabel(o.name)}</span>
              <span className="muted">
                {Object.entries(o.garrison).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji}${fmtNum(q ?? 0)}`).join(" ") || t("no garrison!")} · {fmtNum(o.pending)} 🪙
              </span>
            </div>
          ))}
          {!terr?.outposts.length && <div className="empty">{t("Tap a 🏴 outpost on the map and assault it with your army. Held outposts pay tribute every hour — garrison them or rivals will take them.")}</div>}
          <label>{t("Faction war")}</label>
          {terr?.war.map((w, i) => {
            const fd = FACTION_BY_KEY[w.faction as keyof typeof FACTION_BY_KEY];
            return (
              <div key={w.faction} className={`card small row ${w.faction === f.key ? "hl" : ""}`} style={{ justifyContent: "space-between" }}>
                <span>{i === 0 && w.outposts > 0 ? "👑 " : ""}{fd.emoji} <b style={{ color: fd.color }}>{t(fd.name)}</b></span>
                <span>{t("{n, plural, one {# outpost} other {# outposts}}", { n: w.outposts })}</span>
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
                  {r.side === "defend" ? (r.won ? t("Held off {name}", { name: r.targetName }) : t("Raided by {name}", { name: r.targetName })) : REPORT_KIND[r.kind] ? t(REPORT_KIND[r.kind]) : r.kind}
                  {r.side === "attack" && ` · ${r.targetName}`}
                </b>
                <div className="small muted">
                  {fmtTime(r.createdAt)}
                  {r.kind === "siege" && ` · ${t("{n}%", { n: r.destruction })}`}
                  {r.loot ? ` · ${r.side === "defend" ? "−" : "+"}${fmtNum(r.loot)} 🪙` : ""}
                  {r.trophies ? ` · ${r.trophies > 0 ? "+" : "−"}${fmtNum(Math.abs(r.trophies))} 🏆` : ""}
                </div>
              </div>
              {r.side === "defend" && !r.won && r.revengeBaseId && (
                <Button className="btn small" onClick={() => askConfirm(t("Send your army for revenge on {name}?", { name: r.targetName }), { ok: t("Attack") }).then((ok) => ok && doAct({ kind: "siege", targetId: r.revengeBaseId }, "/api/battle"))}>{t("⚔️ Revenge")}</Button>
              )}
            </div>
          ))}
          {!v.battles.length && !v.defended.length && <div className="empty">{t("No battles yet.")}</div>}
        </>
      )}
    </Sheet>
  );
}
