"use client";
// RPG layer UI: class & attributes, gear stash (equip / forge / salvage), quest log,
// and the General's Powers tree.
import { useCallback, useEffect, useState } from "react";
import { RARITY_COLOR, RARITY_LABEL } from "@/lib/catalog";
import { affixValue, forgeCost, GEAR_BASE_BY_KEY, gearName, SALVAGE_SCRAP, SLOT_LABEL } from "@/lib/gear";
import { fmtNum, msg, t } from "@/lib/i18n";
import { WEAPONS } from "@/lib/arena";
import { ATTRS, CLASSES, classOf, fmtMod, RESPEC_COST, type ModKey } from "@/lib/hero";
import { cooldownMs, MAX_POWER_RANK, POWERS } from "@/lib/powers";
import { api, type HeroView } from "./client";
import { useGame } from "./ui";
import { S } from "@/lib/settings";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";

export function useHero() {
  const [h, setH] = useState<HeroView | null>(null);
  const load = useCallback(() => api<HeroView>("/api/hero").then(setH).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  return { h, load };
}

function useHeroAct(load: () => void) {
  const { act } = useGame();
  return (body: unknown, path = "/api/hero") => act(() => api(path, { body })).then((ok) => {
    load(); // also after a refusal: the sheet was showing something out of date
    return ok;
  });
}

// ---------------------------------------------------------------- Hero
export function HeroTab({ onTab }: { onTab?: (tab: "gear") => void } = {}) {
  const { me } = useGame();
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return <div className="empty">{t("Loading…")}</div>;
  const c = classOf(h.heroClass);
  const modList = (Object.entries(h.mods) as [ModKey, number][]).filter(([, v]) => v);

  if (!c)
    return (
      <>
        <p className="small muted">{t("Choose a class. It shapes how you fight in first person, how your army performs and how your economy runs. (Changing later costs {n} 🪙.)", { n: 500 })}</p>
        {CLASSES.map((k) => (
          <div key={k.key} className="card list-item">
            <div className="icon-tile" style={{ fontSize: 30 }}>{k.emoji}</div>
            <div className="grow">
              <b>{t(k.name)}</b>
              <div className="small muted">{t(k.blurb)}</div>
              <div className="small">{(Object.entries(k.mods) as [ModKey, number][]).map(([m, v]) => fmtMod(m, v)).join(" · ")}</div>
            </div>
            <Button className="btn small" onClick={() => doAct({ action: "class", heroClass: k.key })}>{t("Choose")}</Button>
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
  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${t("{n}%", { n: Math.abs(Math.round(v * 100)) })}`;
  const speed = (x: number) => pct(1 / x - 1);
  const winRate = st.battles ? Math.round((st.battlesWon / st.battles) * 100) : 0;
  const SLOT = { weapon: "🔫", armor: "🦺", gadget: "📻" } as const;

  return (
    <div className="hero-sheet">
      <div className="hero-banner">
        <div className="hero-portrait">
          <span className="hp-face">{me.avatar}</span>
          <span className="class-badge" title={t(c.name)}>{c.emoji}</span>
          <span className="lvl-badge">{fmtNum(h.level)}</span>
          <span className="sr-only">{t(c.blurb)}</span>
        </div>
        <div className="grow">
          <div className="hero-name" dir="auto">{me.username}</div>
          <div className="small" style={{ color: "var(--yellow)" }}>{t(c.name)} · {me.title}</div>
          <div className="xpbar" style={{ width: "100%" }}><i style={{ width: `${me.levelPct * 100}%` }} /></div>
          <div className="small muted">{t("{xp} / {next} XP", { xp: me.xp, next: me.nextLevelXp })}</div>
          <div className="power-pill">{t("⚡ Power")} <b>{fmtNum(power)}</b></div>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile"><b>❤️ {fmtNum(st.maxHp)}</b><span>{t("Max HP")}</span></div>
        <div className="stat-tile"><b>🔫 {t(WEAPONS[h.weapon as keyof typeof WEAPONS]?.name ?? "Rifle")}</b><span>{t("FPS weapon")}</span></div>
        <div className="stat-tile"><b>{me.league.emoji} {fmtNum(st.trophies)}</b><span>{t(me.league.name)}</span></div>
        {h.buffUntil && <div className="stat-tile glow"><b>{t("📯 Active")}</b><span>{t("Battle Cry")}</span></div>}
      </div>

      <div className="sec-head">
        <b>{t("Attributes")}</b>
        {h.freePoints > 0 && <span className="points-glow">{t("{n, plural, one {# point} other {# points}} to spend!", { n: h.freePoints })}</span>}
        <span className="grow" />
        <Button className="btn ghost small" onClick={() => askConfirm(t("Reset all attribute points for {n} coins?", { n: RESPEC_COST }), { ok: t("Reset"), danger: true }).then((ok) => ok && doAct({ action: "respec" }))}>{t("↺ Respec")}</Button>
      </div>
      {ATTRS.map((a) => (
        <div key={a.key} className="attr-row">
          <span className="attr-ic">{a.emoji}</span>
          <div className="grow">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{t(a.name)}</b>
              <b className="mono" style={{ color: "var(--cyan)" }}>{fmtNum(h.attrs[a.key])}</b>
            </div>
            <div className="meter"><i style={{ width: `${(h.attrs[a.key] / maxAttr) * 100}%` }} /></div>
            <div className="small muted">{t("{effect} per point", { effect: t(a.blurb) })}</div>
          </div>
          <div className="attr-btns">
            <Button className="btn small" disabled={h.freePoints < 1} onClick={() => doAct({ action: "allocate", attr: a.key, n: 1 })}>+{fmtNum(1)}</Button>
            {h.freePoints >= 5 && <Button className="btn ghost small" onClick={() => doAct({ action: "allocate", attr: a.key, n: 5 })}>+{fmtNum(5)}</Button>}
          </div>
        </div>
      ))}

      <div className="sec-head"><b>{t("Equipment")}</b><span className="grow" />{onTab && <Button className="btn ghost small" onClick={() => onTab("gear")}>{t("Open stash →")}</Button>}</div>
      <div className="slots">
        {(["weapon", "armor", "gadget"] as const).map((slot) => {
          const g = equipped.find((x) => x.slot === slot);
          return (
            <Button key={slot} className={`slot ${g ? g.rarity : "empty"}`} style={g ? { borderColor: RARITY_COLOR[g.rarity] } : undefined} onClick={() => onTab?.("gear")}>
              <span className="slot-ic">{g ? GEAR_BASE_BY_KEY[g.base]?.emoji ?? SLOT[slot] : SLOT[slot]}</span>
              <span className="slot-name" style={g ? { color: RARITY_COLOR[g.rarity] } : undefined}>{g ? gearName(g) : t(NO_SLOT[slot])}</span>
              {g && <span className="tag">{t("Lv {n}", { n: g.level })}</span>}
            </Button>
          );
        })}
      </div>

      <StatGroup title={t("🔫 Combat")} rows={[
        [t("Health (street & FPS)"), t("{n} HP", { n: st.maxHp }), (st.maxHp - 100) / 150],
        [t("Weapon damage"), pct(b.fpsDmg - 1), b.fpsDmg - 1],
        [t("Headshot bonus"), `+${fmtNum(Number(b.headBonus.toFixed(2)))}×`, b.headBonus / 1.5],
        [t("Move speed"), pct(b.fpsSpeed - 1), (b.fpsSpeed - 1) * 3],
        [t("Street shot"), t("{n} dmg", { n: Math.round(S.shootDmg * b.fpsDmg) }), (b.fpsDmg - 1) * 2],
      ]} />
      <StatGroup title={t("🎖️ Army")} rows={[
        [t("Army attack"), pct(b.armyAtk - 1), b.armyAtk - 1],
        [t("Army health"), pct(b.armyHp - 1), b.armyHp - 1],
        [t("Infantry attack"), pct(b.atkBy.infantry - 1), b.atkBy.infantry - 1],
        [t("Vehicle attack"), pct(b.atkBy.vehicle - 1), b.atkBy.vehicle - 1],
        [t("Air attack"), pct(b.atkBy.air - 1), b.atkBy.air - 1],
        [t("Rocket attack"), pct(b.rocketAtk - 1), b.rocketAtk - 1],
        [t("Vehicle armor"), pct(b.vehicleHp - 1), b.vehicleHp - 1],
        [t("Turret power"), pct(b.turret - 1), b.turret - 1],
        [t("Fewer casualties"), pct(1 - b.losses), (1 - b.losses) * 2],
      ]} />
      <StatGroup title={t("💰 Economy")} rows={[
        [t("Income & tribute"), pct(b.income - 1), b.income - 1],
        [t("Raid loot"), pct(b.loot - 1), b.loot - 1],
        [t("XP gain"), pct(b.xp - 1), (b.xp - 1) * 2],
        [t("Build speed"), speed(b.buildTime), 1 - b.buildTime],
        [t("Training speed"), speed(b.trainTime), 1 - b.trainTime],
        [t("Research speed"), speed(b.researchTime), 1 - b.researchTime],
      ]} />

      <div className="sec-head"><b>{t("📜 Service record")}</b></div>
      <div className="record">
        <div><b>{t("{n} km", { n: Math.round(st.walkedM / 100) / 10 })}</b><span>{t("Walked")}</span></div>
        <div><b>{fmtNum(st.battlesWon)}/{fmtNum(st.battles)}</b><span>{t("Battles won · {pct}%", { pct: winRate })}</span></div>
        <div><b>{fmtNum(st.kills)}</b><span>{t("FPS kills")}</span></div>
        <div><b>{fmtNum(st.bossDmg)}</b><span>{t("Boss damage")}</span></div>
        <div><b>{fmtNum(st.raiders)}</b><span>{t("Raiders stopped")}</span></div>
        <div><b>{fmtNum(st.claims)}</b><span>{t("Items collected")}</span></div>
        <div><b>{fmtNum(st.units)}</b><span>{t("Troops")}</span></div>
        <div><b>{fmtNum(st.outposts)}</b><span>{t("Outposts held")}</span></div>
        <div><b>{fmtNum(st.flags)}</b><span>{t("Flags held")}</span></div>
        <div><b>{fmtNum(st.towers)}</b><span>{t("Towers")}</span></div>
        <div><b>{fmtNum(st.story)}</b><span>{t("Story chapters")}</span></div>
        <div><b>{fmtNum(st.gpsGames)}</b><span>{t("GPS games won")}</span></div>
        <div><b>{fmtNum(st.achievements)}</b><span>{t("Achievements")}</span></div>
        <div><b>🔥 {fmtNum(st.streak)}</b><span>{t("Day streak")}</span></div>
        <div><b>{fmtNum(h.research.length)}</b><span>{t("Research done")}</span></div>
        <div><b>{fmtNum(st.memberDays)}</b><span>{t("Days served")}</span></div>
      </div>
      {modList.length > 0 && (
        <details className="small" style={{ marginTop: 10 }}>
          <summary className="muted">{t("All bonus sources (class + attributes + gear + research)")}</summary>
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

const NO_SLOT = { weapon: msg("No weapon"), armor: msg("No armor"), gadget: msg("No gadget") } as const;
const SLOT_TAB = { all: msg("All"), weapon: msg("🔫 Weapon"), armor: msg("🦺 Armor"), gadget: msg("📻 Gadget") } as const;

// ---------------------------------------------------------------- Gear
export function GearTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  const [slot, setSlot] = useState<"all" | "weapon" | "armor" | "gadget">("all");
  if (!h) return <div className="empty">{t("Loading…")}</div>;
  const items = h.gear.filter((g) => slot === "all" || g.slot === slot);
  return (
    <>
      <div className="row wrap small" style={{ marginBottom: 8, gap: 12 }}>
        <span>{t("🔩 {n} scrap", { n: h.scrap })}</span>
        <span>🪙 {fmtNum(h.coins)}</span>
        <span className="muted">{t("{n}/{max} in stash", { n: h.gear.length, max: 40 })}</span>
      </div>
      <div className="tabs">
        {(["all", "weapon", "armor", "gadget"] as const).map((s) => (
          <Button key={s} className={slot === s ? "on" : ""} onClick={() => setSlot(s)}>{t(SLOT_TAB[s])}</Button>
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
                <b style={{ color: RARITY_COLOR[g.rarity] }}>{gearName(g)}</b> <span className="tag">{t("Lv {n}", { n: g.level })}</span> {g.equipped && <span className="tag" style={{ color: "var(--green)" }}>{t("Equipped")}</span>}
                <div className="small muted">
                  {t("{slot} · {rarity}", { slot: t(SLOT_LABEL[g.slot as keyof typeof SLOT_LABEL]), rarity: t(RARITY_LABEL[g.rarity]) })}
                  {base?.weapon && ` · ${t("{dmg} dmg, {mag} rounds", { dmg: WEAPONS[base.weapon].dmg, mag: WEAPONS[base.weapon].mag })}`}
                </div>
                <div className="mods small">
                  {(Object.entries(base?.implicit ?? {}) as [ModKey, number][]).map(([k, v]) => <span key={`i${k}`} className="muted">{fmtMod(k, v)}</span>)}
                  {g.affixes.map((a) => <span key={a.key}>{fmtMod(a.key, affixValue(a, g.level))}</span>)}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              {g.equipped ? (
                <Button className="btn ghost small" onClick={() => doAct({ action: "unequip", gearId: g.id })}>{t("Unequip")}</Button>
              ) : (
                <Button className="btn green small" onClick={() => doAct({ action: "equip", gearId: g.id })}>{t("Equip")}</Button>
              )}
              <Button className="btn ghost small" disabled={h.scrap < cost.scrap || h.coins < cost.coins} onClick={() => doAct({ action: "forge", gearId: g.id })}>{t("🔨 Forge {scrap}🔩 {coins}🪙", { scrap: cost.scrap, coins: cost.coins })}</Button>
              {!g.equipped && (
                <Button className="btn ghost small" onClick={() => askConfirm(t("Salvage {item} for scrap?", { item: gearName(g) }), { ok: t("Salvage"), danger: true }).then((ok) => ok && doAct({ action: "salvage", gearId: g.id }))}>♻️ +{fmtNum(SALVAGE_SCRAP[g.rarity] + Math.floor(g.level / 2))}🔩</Button>
              )}
            </div>
          </div>
        );
      })}
      {!items.length && <div className="empty">{t("No gear yet. Loot drops from chests, derricks, outposts, raids, boss kills and quests.")}</div>}
    </>
  );
}

// ---------------------------------------------------------------- Quests
export function QuestsTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return <div className="empty">{t("Loading…")}</div>;
  const camp = h.quests.find((q) => q.campaign);
  const daily = h.quests.filter((q) => !q.campaign);
  // A render helper, not a component: a component declared in here would be a new type
  // on every render, remounting the card (and eating taps on Claim mid-update).
  const quest = (q: HeroView["quests"][number]) => (
    <div key={q.key} className={`card ${q.done && !q.claimed ? "hl" : ""}`} style={{ opacity: q.claimed ? 0.5 : 1 }}>
      <div className="row">
        <div className="grow">
          <b>{t(q.title)}</b>
          <div className="small muted">{t(q.desc)}</div>
        </div>
        {q.claimed ? (
          <span className="small muted">✓</span>
        ) : q.done ? (
          <Button className="btn yellow small" onClick={() => doAct({ action: "claimQuest", key: q.key })}>{t("Claim")}</Button>
        ) : (
          <span className="small mono">{fmtNum(q.progress)}/{fmtNum(q.target)}</span>
        )}
      </div>
      <div className="need-bar"><i style={{ width: `${(q.progress / q.target) * 100}%`, background: "var(--yellow)" }} /></div>
      <div className="small muted">
        {t("Reward: {xp} XP · {coins} 🪙 · {gems} 💎", { xp: q.reward.xp, coins: q.reward.coins, gems: q.campaign ? S.questGemsCampaign : S.questGemsDaily })}{q.reward.scrap ? ` · ${fmtNum(q.reward.scrap)} 🔩` : ""}
        {q.reward.gear && <span style={{ color: RARITY_COLOR[q.reward.gear] }}> · {t("{rarity} gear", { rarity: t(RARITY_LABEL[q.reward.gear]) })}</span>}
      </div>
    </div>
  );
  return (
    <>
      <label>{t("📜 Campaign · chapter {n}", { n: h.campaignStep + 1 })}</label>
      {camp ? (
        <>
          {camp.lore && <p className="small" style={{ fontStyle: "italic", color: "#c8c8dc" }}>«{t(camp.lore)}»</p>}
          {quest(camp)}
        </>
      ) : (
        <div className="empty">{t("Campaign complete — you're a legend. Daily orders keep coming.")}</div>
      )}
      <label>{t("🗓️ Daily orders (reset at your midnight)")}</label>
      {daily.map(quest)}
    </>
  );
}

// ---------------------------------------------------------------- Powers
export function PowersTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  if (!h) return <div className="empty">{t("Loading…")}</div>;
  return (
    <>
      <p className="small muted">
        {t("Each hero level earns a ⭐ Command Point. Spend them to unlock and rank up General's Powers.")} {t("You have")} <b style={{ color: "var(--yellow)" }}>{fmtNum(h.commandPoints)}</b>. {t("Targeted powers are used from a base, outpost or boss card on the map.")}
      </p>
      {[1, 2, 3].map((tier) => (
        <div key={tier}>
          <label>{t("Tier {n}", { n: tier })}</label>
          {POWERS.filter((p) => p.tier === tier).map((p) => {
            const st = h.powers.find((x) => x.key === p.key)!;
            const left = st.lastUsedAt ? new Date(st.lastUsedAt).getTime() + cooldownMs(p, st.rank) - now : 0;
            const locked = h.level < p.level;
            return (
              <div key={p.key} className="card list-item" style={{ opacity: locked ? 0.5 : 1 }}>
                <div className="icon-tile">{p.emoji}</div>
                <div className="grow">
                  <b>{t(p.name)}</b> {st.rank > 0 && <span className="tag">{t("Rank {n}", { n: st.rank })}</span>}
                  <div className="small muted">{p.desc(Math.max(1, st.rank))}</div>
                  {locked && <div className="small muted">{t("Hero level {n}", { n: p.level })}</div>}
                </div>
                <div className="row" style={{ flexDirection: "column", gap: 4 }}>
                  {!locked && st.rank < MAX_POWER_RANK && (
                    <Button className="btn ghost small" disabled={h.commandPoints < 1} onClick={() => doAct({ action: "unlock", key: p.key }, "/api/powers")}>{st.rank ? t("Rank up") : t("Unlock")} ⭐</Button>
                  )}
                  {st.rank > 0 && p.target === "none" && (
                    <Button className="btn small" disabled={left > 0} onClick={() => doAct({ action: "use", key: p.key }, "/api/powers")}>{left > 0 ? t("{n}m", { n: Math.ceil(left / 60000) }) : t("Use")}</Button>
                  )}
                  {st.rank > 0 && p.target !== "none" && <span className="small muted">{left > 0 ? t("{n}m", { n: Math.ceil(left / 60000) }) : t("Ready · on map")}</span>}
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
          <Button key={p.key} className="btn ghost small" disabled={left > 0} onClick={() => doAct({ action: "use", key: p.key, targetId }, "/api/powers")}>
            {p.emoji} {t(p.name)}{left > 0 ? ` · ${t("{n}m", { n: Math.ceil(left / 60000) })}` : ""}
          </Button>
        );
      })}
    </div>
  );
}
