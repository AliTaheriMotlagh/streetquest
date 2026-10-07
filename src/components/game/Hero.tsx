"use client";
// RPG layer UI: class & attributes, gear stash (equip / forge / salvage), quest log,
// and the General's Powers tree.
import { useCallback, useEffect, useState } from "react";
import { RARITY_COLOR } from "@/lib/catalog";
import { affixValue, forgeCost, GEAR_BASE_BY_KEY, SALVAGE_SCRAP } from "@/lib/gear";
import { WEAPONS } from "@/lib/arena";
import { ATTRS, CLASSES, classOf, fmtMod, RESPEC_COST, type ModKey } from "@/lib/hero";
import { cooldownMs, MAX_POWER_RANK, POWERS } from "@/lib/powers";
import { api, type HeroView } from "./client";
import { useGame } from "./ui";

export function useHero() {
  const [h, setH] = useState<HeroView | null>(null);
  const load = useCallback(() => api<HeroView>("/api/hero").then(setH).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  return { h, load };
}

function useHeroAct(load: () => void) {
  const { act, refresh } = useGame();
  return (body: unknown, path = "/api/hero") => act(() => api(path, { body })).then((ok) => ok && (load(), refresh()));
}

// ---------------------------------------------------------------- Hero
export function HeroTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return <div className="empty">Loading…</div>;
  const c = classOf(h.heroClass);
  const modList = (Object.entries(h.mods) as [ModKey, number][]).filter(([, v]) => v);

  if (!c)
    return (
      <>
        <p className="small muted">Choose a class. It shapes how you fight in first person, how your army performs and how your economy runs. (Changing later costs 500 🪙.)</p>
        {CLASSES.map((k) => (
          <div key={k.key} className="card list-item">
            <div className="icon-tile" style={{ fontSize: 30 }}>{k.emoji}</div>
            <div className="grow">
              <b>{k.name}</b>
              <div className="small muted">{k.blurb}</div>
              <div className="small">{(Object.entries(k.mods) as [ModKey, number][]).map(([m, v]) => fmtMod(m, v)).join(" · ")}</div>
            </div>
            <button className="btn small" onClick={() => doAct({ action: "class", heroClass: k.key })}>Choose</button>
          </div>
        ))}
      </>
    );

  return (
    <>
      <div className="card row">
        <div style={{ fontSize: 40 }}>{c.emoji}</div>
        <div className="grow">
          <b style={{ fontFamily: "var(--display)" }}>{c.name}</b> <span className="small muted">· hero level {h.level}</span>
          <div className="small muted">{c.blurb}</div>
          <div className="small">🔫 FPS weapon: {WEAPONS[h.weapon as keyof typeof WEAPONS]?.name ?? "Assault Rifle"}{h.buffUntil && " · 📯 Battle Cry active"}</div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label style={{ margin: "6px 0" }}>Attributes {h.freePoints > 0 && <span style={{ color: "var(--yellow)" }}>· {h.freePoints} points to spend</span>}</label>
        <button className="btn ghost small" onClick={() => confirm(`Reset all attribute points for ${RESPEC_COST} coins?`) && doAct({ action: "respec" })}>Respec</button>
      </div>
      {ATTRS.map((a) => (
        <div key={a.key} className="card list-item">
          <div className="icon-tile">{a.emoji}</div>
          <div className="grow">
            <b>{a.name}</b> <span className="tag">{h.attrs[a.key]}</span>
            <div className="small muted">{a.blurb} per point</div>
          </div>
          <button className="btn small" disabled={h.freePoints < 1} onClick={() => doAct({ action: "allocate", attr: a.key, n: 1 })}>+1</button>
          {h.freePoints >= 5 && <button className="btn ghost small" onClick={() => doAct({ action: "allocate", attr: a.key, n: 5 })}>+5</button>}
        </div>
      ))}
      <label>Total bonuses (class + attributes + gear + research)</label>
      <div className="mods">{modList.length ? modList.map(([m, v]) => <span key={m}>{fmtMod(m, v)}</span>) : <span className="muted">None yet</span>}</div>
    </>
  );
}

// ---------------------------------------------------------------- Gear
export function GearTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  const [slot, setSlot] = useState<"all" | "weapon" | "armor" | "gadget">("all");
  if (!h) return <div className="empty">Loading…</div>;
  const items = h.gear.filter((g) => slot === "all" || g.slot === slot);
  return (
    <>
      <div className="row wrap small" style={{ marginBottom: 8, gap: 12 }}>
        <span>🔩 {h.scrap} scrap</span>
        <span>🪙 {h.coins}</span>
        <span className="muted">{h.gear.length}/40 in stash</span>
      </div>
      <div className="tabs">
        {(["all", "weapon", "armor", "gadget"] as const).map((s) => (
          <button key={s} className={slot === s ? "on" : ""} onClick={() => setSlot(s)}>{s === "all" ? "All" : s === "weapon" ? "🔫 Weapon" : s === "armor" ? "🦺 Armor" : "📻 Gadget"}</button>
        ))}
      </div>
      {items.map((g) => {
        const base = GEAR_BASE_BY_KEY[g.base];
        const cost = forgeCost(g.level);
        return (
          <div key={g.id} className={`card ${g.equipped ? "hl" : ""}`} style={{ borderColor: RARITY_COLOR[g.rarity] }}>
            <div className="list-item">
              <div className="icon-tile" style={{ boxShadow: `inset 0 0 0 2px ${RARITY_COLOR[g.rarity]}` }}>{base?.emoji}</div>
              <div className="grow">
                <b style={{ color: RARITY_COLOR[g.rarity] }}>{g.name}</b> <span className="tag">Lv {g.level}</span> {g.equipped && <span className="tag" style={{ color: "var(--green)" }}>Equipped</span>}
                <div className="small muted">
                  {g.rarity} {g.slot}
                  {base?.weapon && ` · ${WEAPONS[base.weapon].dmg} dmg, ${WEAPONS[base.weapon].mag} rounds`}
                </div>
                <div className="mods small">
                  {(Object.entries(base?.implicit ?? {}) as [ModKey, number][]).map(([k, v]) => <span key={`i${k}`} className="muted">{fmtMod(k, v)}</span>)}
                  {g.affixes.map((a) => <span key={a.key}>{fmtMod(a.key, affixValue(a, g.level))}</span>)}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              {g.equipped ? (
                <button className="btn ghost small" onClick={() => doAct({ action: "unequip", gearId: g.id })}>Unequip</button>
              ) : (
                <button className="btn green small" onClick={() => doAct({ action: "equip", gearId: g.id })}>Equip</button>
              )}
              <button className="btn ghost small" disabled={h.scrap < cost.scrap || h.coins < cost.coins} onClick={() => doAct({ action: "forge", gearId: g.id })}>🔨 Forge {cost.scrap}🔩 {cost.coins}🪙</button>
              {!g.equipped && (
                <button className="btn ghost small" onClick={() => confirm(`Salvage ${g.name} for scrap?`) && doAct({ action: "salvage", gearId: g.id })}>♻️ +{SALVAGE_SCRAP[g.rarity] + Math.floor(g.level / 2)}🔩</button>
              )}
            </div>
          </div>
        );
      })}
      {!items.length && <div className="empty">No gear yet. Loot drops from chests, derricks, outposts, raids, boss kills and quests.</div>}
    </>
  );
}

// ---------------------------------------------------------------- Quests
export function QuestsTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return <div className="empty">Loading…</div>;
  const camp = h.quests.find((q) => q.campaign);
  const daily = h.quests.filter((q) => !q.campaign);
  const Q = ({ q }: { q: HeroView["quests"][number] }) => (
    <div className={`card ${q.done && !q.claimed ? "hl" : ""}`} style={{ opacity: q.claimed ? 0.5 : 1 }}>
      <div className="row">
        <div className="grow">
          <b>{q.title}</b>
          <div className="small muted">{q.desc}</div>
        </div>
        {q.claimed ? (
          <span className="small muted">✓</span>
        ) : q.done ? (
          <button className="btn yellow small" onClick={() => doAct({ action: "claimQuest", key: q.key })}>Claim</button>
        ) : (
          <span className="small mono">{q.progress}/{q.target}</span>
        )}
      </div>
      <div className="need-bar"><i style={{ width: `${(q.progress / q.target) * 100}%`, background: "var(--yellow)" }} /></div>
      <div className="small muted">
        Reward: {q.reward.xp} XP · {q.reward.coins} 🪙 · {q.campaign ? 5 : 2} 💎{q.reward.scrap ? ` · ${q.reward.scrap} 🔩` : ""}
        {q.reward.gear && <span style={{ color: RARITY_COLOR[q.reward.gear] }}> · {q.reward.gear} gear</span>}
      </div>
    </div>
  );
  return (
    <>
      <label>📜 Campaign · chapter {h.campaignStep + 1}</label>
      {camp ? (
        <>
          {camp.lore && <p className="small" style={{ fontStyle: "italic", color: "#c8c8dc" }}>“{camp.lore}”</p>}
          <Q q={camp} />
        </>
      ) : (
        <div className="empty">Campaign complete — you&apos;re a legend. Daily orders keep coming.</div>
      )}
      <label>🗓️ Daily orders (reset at your midnight)</label>
      {daily.map((q) => <Q key={q.key} q={q} />)}
    </>
  );
}

// ---------------------------------------------------------------- Powers
export function PowersTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  if (!h) return <div className="empty">Loading…</div>;
  return (
    <>
      <p className="small muted">
        Each hero level earns a ⭐ Command Point. Spend them to unlock and rank up General&apos;s Powers. You have <b style={{ color: "var(--yellow)" }}>{h.commandPoints}</b>. Targeted powers are used from a base, outpost or boss card on the map.
      </p>
      {[1, 2, 3].map((tier) => (
        <div key={tier}>
          <label>Tier {tier}</label>
          {POWERS.filter((p) => p.tier === tier).map((p) => {
            const st = h.powers.find((x) => x.key === p.key)!;
            const left = st.lastUsedAt ? new Date(st.lastUsedAt).getTime() + cooldownMs(p, st.rank) - now : 0;
            const locked = h.level < p.level;
            return (
              <div key={p.key} className="card list-item" style={{ opacity: locked ? 0.5 : 1 }}>
                <div className="icon-tile">{p.emoji}</div>
                <div className="grow">
                  <b>{p.name}</b> {st.rank > 0 && <span className="tag">Rank {st.rank}</span>}
                  <div className="small muted">{p.desc(Math.max(1, st.rank))}</div>
                  {locked && <div className="small muted">Hero level {p.level}</div>}
                </div>
                <div className="row" style={{ flexDirection: "column", gap: 4 }}>
                  {!locked && st.rank < MAX_POWER_RANK && (
                    <button className="btn ghost small" disabled={h.commandPoints < 1} onClick={() => doAct({ action: "unlock", key: p.key }, "/api/powers")}>{st.rank ? "Rank up" : "Unlock"} ⭐</button>
                  )}
                  {st.rank > 0 && p.target === "none" && (
                    <button className="btn small" disabled={left > 0} onClick={() => doAct({ action: "use", key: p.key }, "/api/powers")}>{left > 0 ? `${Math.ceil(left / 60000)}m` : "Use"}</button>
                  )}
                  {st.rank > 0 && p.target !== "none" && <span className="small muted">{left > 0 ? `${Math.ceil(left / 60000)}m` : "Ready · on map"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Buttons for targeted powers (Spy Drone, Barrage) on a map card. */
export function TargetPowers({ targetId, allow }: { targetId: string; allow: ("spy_drone" | "barrage")[] }) {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return null;
  const ready = POWERS.filter((p) => allow.includes(p.key as "spy_drone" | "barrage")).map((p) => ({ p, st: h.powers.find((x) => x.key === p.key)! })).filter(({ st }) => st.rank > 0);
  if (!ready.length) return null;
  return (
    <div className="row wrap" style={{ marginTop: 8 }}>
      {ready.map(({ p, st }) => {
        const left = st.lastUsedAt ? new Date(st.lastUsedAt).getTime() + cooldownMs(p, st.rank) - Date.now() : 0;
        return (
          <button key={p.key} className="btn ghost small" disabled={left > 0} onClick={() => doAct({ action: "use", key: p.key, targetId }, "/api/powers")}>
            {p.emoji} {p.name}{left > 0 ? ` · ${Math.ceil(left / 60000)}m` : ""}
          </button>
        );
      })}
    </div>
  );
}
