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
import { S } from "@/lib/settings";
import { askConfirm } from "@/components/Dialogs";

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
export function HeroTab({ onTab }: { onTab?: (t: "gear") => void } = {}) {
  const { me } = useGame();
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

  const b = h.bonus;
  const st = h.stats;
  const equipped = h.gear.filter((g) => g.equipped);
  const RW = { common: 1, rare: 2, epic: 3, legendary: 5 } as const;
  const power = Math.round(h.level * 30 + (h.attrs.str + h.attrs.agi + h.attrs.int + h.attrs.cha) * 6 + equipped.reduce((s, g) => s + g.level * 4 * RW[g.rarity], 0) + h.research.length * 25);
  const maxAttr = Math.max(20, ...Object.values(h.attrs));
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const speed = (t: number) => pct(1 / t - 1);
  const winRate = st.battles ? Math.round((st.battlesWon / st.battles) * 100) : 0;
  const SLOT = { weapon: "🔫", armor: "🦺", gadget: "📻" } as const;

  return (
    <div className="hero-sheet">
      <div className="hero-banner">
        <div className="hero-portrait">
          <span className="hp-face">{me.avatar}</span>
          <span className="class-badge" title={c.name}>{c.emoji}</span>
          <span className="lvl-badge">{h.level}</span>
          <span className="sr-only">{c.blurb}</span>
        </div>
        <div className="grow">
          <div className="hero-name">{me.username}</div>
          <div className="small" style={{ color: "var(--yellow)" }}>{c.name} · {me.title}</div>
          <div className="xpbar" style={{ width: "100%" }}><i style={{ width: `${me.levelPct * 100}%` }} /></div>
          <div className="small muted">{me.xp.toLocaleString()} / {me.nextLevelXp.toLocaleString()} XP</div>
          <div className="power-pill">⚡ Power <b>{power.toLocaleString()}</b></div>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile"><b>❤️ {st.maxHp}</b><span>Max HP</span></div>
        <div className="stat-tile"><b>🔫 {WEAPONS[h.weapon as keyof typeof WEAPONS]?.name ?? "Rifle"}</b><span>FPS weapon</span></div>
        <div className="stat-tile"><b>{me.league.emoji} {st.trophies}</b><span>{me.league.name}</span></div>
        {h.buffUntil && <div className="stat-tile glow"><b>📯 Active</b><span>Battle Cry</span></div>}
      </div>

      <div className="sec-head">
        <b>Attributes</b>
        {h.freePoints > 0 && <span className="points-glow">{h.freePoints} points to spend!</span>}
        <span className="grow" />
        <button className="btn ghost small" onClick={() => askConfirm(`Reset all attribute points for ${RESPEC_COST} coins?`, { ok: "Reset", danger: true }).then((ok) => ok && doAct({ action: "respec" }))}>↺ Respec</button>
      </div>
      {ATTRS.map((a) => (
        <div key={a.key} className="attr-row">
          <span className="attr-ic">{a.emoji}</span>
          <div className="grow">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{a.name}</b>
              <b className="mono" style={{ color: "var(--cyan)" }}>{h.attrs[a.key]}</b>
            </div>
            <div className="meter"><i style={{ width: `${(h.attrs[a.key] / maxAttr) * 100}%` }} /></div>
            <div className="small muted">{a.blurb} per point</div>
          </div>
          <div className="attr-btns">
            <button className="btn small" disabled={h.freePoints < 1} onClick={() => doAct({ action: "allocate", attr: a.key, n: 1 })}>+1</button>
            {h.freePoints >= 5 && <button className="btn ghost small" onClick={() => doAct({ action: "allocate", attr: a.key, n: 5 })}>+5</button>}
          </div>
        </div>
      ))}

      <div className="sec-head"><b>Equipment</b><span className="grow" />{onTab && <button className="btn ghost small" onClick={() => onTab("gear")}>Open stash →</button>}</div>
      <div className="slots">
        {(["weapon", "armor", "gadget"] as const).map((slot) => {
          const g = equipped.find((x) => x.slot === slot);
          return (
            <button key={slot} className={`slot ${g ? g.rarity : "empty"}`} style={g ? { borderColor: RARITY_COLOR[g.rarity] } : undefined} onClick={() => onTab?.("gear")}>
              <span className="slot-ic">{g ? GEAR_BASE_BY_KEY[g.base]?.emoji ?? SLOT[slot] : SLOT[slot]}</span>
              <span className="slot-name" style={g ? { color: RARITY_COLOR[g.rarity] } : undefined}>{g ? g.name : `No ${slot}`}</span>
              {g && <span className="tag">Lv {g.level}</span>}
            </button>
          );
        })}
      </div>

      <StatGroup title="🔫 Combat" rows={[
        ["Health (street & FPS)", `${st.maxHp} HP`, (st.maxHp - 100) / 150],
        ["Weapon damage", pct(b.fpsDmg - 1), b.fpsDmg - 1],
        ["Headshot bonus", `+${b.headBonus.toFixed(2)}×`, b.headBonus / 1.5],
        ["Move speed", pct(b.fpsSpeed - 1), (b.fpsSpeed - 1) * 3],
        ["Street shot", `${Math.round(S.shootDmg * b.fpsDmg)} dmg`, (b.fpsDmg - 1) * 2],
      ]} />
      <StatGroup title="🎖️ Army" rows={[
        ["Army attack", pct(b.armyAtk - 1), b.armyAtk - 1],
        ["Army health", pct(b.armyHp - 1), b.armyHp - 1],
        ["Infantry attack", pct(b.atkBy.infantry - 1), b.atkBy.infantry - 1],
        ["Vehicle attack", pct(b.atkBy.vehicle - 1), b.atkBy.vehicle - 1],
        ["Air attack", pct(b.atkBy.air - 1), b.atkBy.air - 1],
        ["Rocket attack", pct(b.rocketAtk - 1), b.rocketAtk - 1],
        ["Vehicle armor", pct(b.vehicleHp - 1), b.vehicleHp - 1],
        ["Turret power", pct(b.turret - 1), b.turret - 1],
        ["Fewer casualties", pct(1 - b.losses), (1 - b.losses) * 2],
      ]} />
      <StatGroup title="💰 Economy" rows={[
        ["Income & tribute", pct(b.income - 1), b.income - 1],
        ["Raid loot", pct(b.loot - 1), b.loot - 1],
        ["XP gain", pct(b.xp - 1), (b.xp - 1) * 2],
        ["Build speed", speed(b.buildTime), 1 - b.buildTime],
        ["Training speed", speed(b.trainTime), 1 - b.trainTime],
        ["Research speed", speed(b.researchTime), 1 - b.researchTime],
      ]} />

      <div className="sec-head"><b>📜 Service record</b></div>
      <div className="record">
        <div><b>{(st.walkedM / 1000).toFixed(1)} km</b><span>Walked</span></div>
        <div><b>{st.battlesWon}/{st.battles}</b><span>Battles won · {winRate}%</span></div>
        <div><b>{st.kills}</b><span>FPS kills</span></div>
        <div><b>{st.bossDmg.toLocaleString()}</b><span>Boss damage</span></div>
        <div><b>{st.raiders}</b><span>Raiders stopped</span></div>
        <div><b>{st.claims}</b><span>Items collected</span></div>
        <div><b>{st.units}</b><span>Troops</span></div>
        <div><b>{st.outposts}</b><span>Outposts held</span></div>
        <div><b>{st.flags}</b><span>Flags held</span></div>
        <div><b>{st.towers}</b><span>Towers</span></div>
        <div><b>{st.story}</b><span>Story chapters</span></div>
        <div><b>{st.gpsGames}</b><span>GPS games won</span></div>
        <div><b>{st.achievements}</b><span>Achievements</span></div>
        <div><b>🔥 {st.streak}</b><span>Day streak</span></div>
        <div><b>{h.research.length}</b><span>Research done</span></div>
        <div><b>{st.memberDays}</b><span>Days served</span></div>
      </div>
      {modList.length > 0 && (
        <details className="small" style={{ marginTop: 10 }}>
          <summary className="muted">All bonus sources (class + attributes + gear + research)</summary>
          <div className="mods">{modList.map(([m, v]) => <span key={m}>{fmtMod(m, v)}</span>)}</div>
        </details>
      )}
    </div>
  );
}

/** A titled list of stats, each with a bar that fills with how far above base it is. */
function StatGroup({ title, rows }: { title: string; rows: [string, string, number][] }) {
  return (
    <>
      <div className="sec-head"><b>{title}</b></div>
      <div className="stat-group">
        {rows.map(([label, value, fill]) => (
          <div key={label} className="stat-line">
            <span className="grow">{label}</span>
            <span className="meter thin"><i style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }} /></span>
            <b className={fill > 0.001 ? "up" : "muted"}>{value}</b>
          </div>
        ))}
      </div>
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
                <button className="btn ghost small" onClick={() => askConfirm(`Salvage ${g.name} for scrap?`, { ok: "Salvage", danger: true }).then((ok) => ok && doAct({ action: "salvage", gearId: g.id }))}>♻️ +{SALVAGE_SCRAP[g.rarity] + Math.floor(g.level / 2)}🔩</button>
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
        Reward: {q.reward.xp} XP · {q.reward.coins} 🪙 · {q.campaign ? S.questGemsCampaign : S.questGemsDaily} 💎{q.reward.scrap ? ` · ${q.reward.scrap} 🔩` : ""}
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
