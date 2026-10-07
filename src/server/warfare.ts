// Player-vs-player army fights on the real map. Shared by instant orders (Base →
// siege / assault) and by squads that physically march to their target. The attacking
// force is passed in, and `onLosses` decides where casualties come from (home army
// or a squad), so both paths resolve battles exactly the same way.
import type { Squad, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM } from "../lib/geo";
import { OUTPOST_FORT, OUTPOST_SHIELD_MS, type OutpostSite } from "../lib/outposts";
import { baseDefense, factionOf, leagueOf, resolveBattle, SHIELD_MS, siegeStars, trophySwing, vaultProtection, VET_GAIN, type Army, type BattleResult, type UnitKey, type Vets } from "../lib/rts";
import { unitCount } from "../lib/td";
import { forcesOf, fmtLosses, gainVet, loadBase, removeUnits, survivors, type LoadedBase } from "./army";
import { heroOf, maybeGear } from "./hero";
import { notify } from "./hub";
import { moodOfUser } from "./needs";
import { questEvent } from "./quests";
import { grant } from "./rewards";

export const REINFORCE_M = 150; // guard squads this close to a target join its defense

export type Force = { army: Army; vets: Vets; onLosses: (losses: Army, won: boolean) => Promise<void> };
type Outcome = { won: boolean; result: BattleResult; message: string; stars?: number; destruction?: number; trophies?: number };

/** Home army as a Force: losses come out of the unit stacks. */
export async function homeForce(userId: string): Promise<Force> {
  const { army, vets } = await forcesOf(userId);
  return {
    army,
    vets,
    onLosses: async (losses, won) => {
      await removeUnits(userId, losses);
      await gainVet(userId, survivors(army, losses), won ? VET_GAIN.won : VET_GAIN.fought);
    },
  };
}

/** A deployed squad as a Force: losses shrink the squad (and delete it if wiped out). */
export function squadForce(s: Squad): Force {
  const army = s.units as Army;
  return {
    army,
    vets: (s.vets as Vets) ?? {},
    onLosses: async (losses, won) => {
      const left = survivors(army, losses);
      const vets = { ...((s.vets as Vets) ?? {}) };
      for (const k of Object.keys(left)) vets[k as UnitKey] = (vets[k as UnitKey] ?? 0) + (won ? VET_GAIN.won : VET_GAIN.fought);
      if (unitCount(left) <= 0) await prisma.squad.deleteMany({ where: { id: s.id } });
      else await prisma.squad.updateMany({ where: { id: s.id }, data: { units: clean(left), vets } });
    },
  };
}

export const clean = (a: Army) => Object.fromEntries(Object.entries(a).filter(([, q]) => (q ?? 0) > 0)) as Army;

function addArmy(a: Army, b: Army): Army {
  const out = { ...a };
  for (const [k, q] of Object.entries(b)) out[k as UnitKey] = (out[k as UnitKey] ?? 0) + (q ?? 0);
  return out;
}

/** The owner's guard squads standing near a point. */
export async function guardsNear(ownerId: string, p: { lat: number; lng: number }, radius = REINFORCE_M) {
  const rows = await prisma.squad.findMany({ where: { ownerId, status: "HOLD", order: "guard" } });
  return rows.filter((s) => distanceM(p, { lat: s.toLat, lng: s.toLng }) <= radius);
}

/** Defender = home army + nearby guard squads. Losses hit the home army first, then squads. */
async function defenderForce(ownerId: string, home: Force, near: Squad[]): Promise<Force> {
  let army = { ...home.army };
  for (const s of near) army = addArmy(army, s.units as Army);
  return {
    army,
    vets: home.vets,
    onLosses: async (losses, won) => {
      const fromHome: Army = {};
      const rest: Army = {};
      for (const [k, q] of Object.entries(losses)) {
        const h = Math.min(q ?? 0, home.army[k as UnitKey] ?? 0);
        fromHome[k as UnitKey] = h;
        rest[k as UnitKey] = (q ?? 0) - h;
      }
      await home.onLosses(fromHome, won);
      for (const s of near) {
        const take: Army = {};
        for (const [k, q] of Object.entries(rest)) {
          const t = Math.min(q ?? 0, (s.units as Army)[k as UnitKey] ?? 0);
          take[k as UnitKey] = t;
          rest[k as UnitKey] = (q ?? 0) - t;
        }
        await squadForce(s).onLosses(take, won);
      }
    },
  };
}

// ---------------------------------------------------------------- siege a base
export async function siegeBase(u: User, myBaseId: string | null, attack: Force, target: LoadedBase, via: "army" | "squad"): Promise<Outcome> {
  const f = factionOf(u.faction);
  const hero = await heroOf(u);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: target.ownerId } });
  const tf = factionOf(owner.faction);
  const near = await guardsNear(owner.id, target);
  const def = await defenderForce(owner.id, await homeForce(owner.id), near);
  const defHero = await heroOf(owner);
  const fort = baseDefense(target.buildings, tf, Date.now(), defHero.bonus);
  const integrity = Math.max(0.4, target.hp / 1000);
  const r = resolveBattle(
    { army: attack.army, vets: attack.vets, faction: f, bonus: hero.bonus, moodMult: moodOfUser(u).xpMult },
    { army: def.army, vets: def.vets, faction: tf, bonus: defHero.bonus, structures: { atk: fort.atk * integrity, hp: fort.hp * integrity }, moodMult: moodOfUser(owner).xpMult },
    `${target.id}|${u.id}|${Date.now()}`,
  );
  await attack.onLosses(r.attackerLosses, r.won);
  await def.onLosses(r.defenderLosses, !r.won);
  // Clash-style scoring: destruction % → stars → loot share and trophies.
  const { destruction, stars } = siegeStars(r.won, r.structureDamage, fort.hp * integrity);
  const swing = trophySwing(u.trophies, owner.trophies, stars);
  const raidable = Math.floor(owner.coins * (1 - vaultProtection(target.buildings)));
  const league = leagueOf(u.trophies);
  let loot = Math.min(1500, Math.floor(raidable * 0.3 * (destruction / 100) * (f?.loot ?? 1) * hero.bonus.loot));
  if (loot > 0) {
    const took = await prisma.user.updateMany({ where: { id: owner.id, coins: { gte: loot } }, data: { coins: { decrement: loot } } });
    if (!took.count) loot = 0;
  }
  const leagueBonus = stars > 0 ? Math.round(loot * league.bonus) : 0;
  await prisma.user.update({ where: { id: u.id }, data: { trophies: { increment: Math.max(-u.trophies, swing) } } });
  await prisma.user.update({ where: { id: owner.id }, data: { trophies: { increment: Math.max(-owner.trophies, -swing) } } });
  // Attacking breaks your own cease-fire; a defender who lost a star gets one.
  if (myBaseId) await prisma.base.updateMany({ where: { id: myBaseId, shieldUntil: { gt: new Date() } }, data: { shieldUntil: null } });
  await prisma.base.update({
    where: { id: target.id },
    data: { hp: Math.max(0, target.hp - Math.min(400, Math.round(r.structureDamage / 2))), ...(stars > 0 ? { shieldUntil: new Date(Date.now() + SHIELD_MS * stars) } : {}) },
  });
  if (stars > 0) {
    await questEvent(u.id, "siege_win");
    await maybeGear(u.id, 0.2 * stars, { source: `sacking ${target.name}` });
  }
  await grant(u.id, { coins: loot + leagueBonus, xp: 60 + 60 * stars, scrap: 1 + stars });
  await prisma.battle.create({ data: { attackerId: u.id, defenderId: owner.id, kind: "siege", targetId: target.id, targetName: target.name, won: stars > 0, loot, stars, destruction, trophies: swing, log: r } });
  const starStr = "★".repeat(stars) + "☆".repeat(3 - stars);
  const helped = near.length ? ` (${near.length} guard squad${near.length > 1 ? "s" : ""} joined the defense)` : "";
  await notify(target.ownerId, {
    kind: "event",
    title: stars ? `💥 ${u.username} raided ${target.name} ${starStr}` : `🛡️ ${target.name} repelled ${u.username}`,
    body: stars ? `${destruction}% destroyed · lost ${loot} 🪙, ${-swing} 🏆 · revenge from Base → Reports` : `+${-swing} 🏆 · defenders lost ${fmtLosses(r.defenderLosses)}${helped}`,
  });
  const lead = via === "squad" ? "🎖️ Squad assault on " + target.name + ": " : "";
  return {
    won: stars > 0,
    result: r,
    stars,
    destruction,
    trophies: swing,
    message: stars
      ? `${lead}${starStr} ${destruction}% destroyed! +${loot + leagueBonus} 🪙${leagueBonus ? ` (${league.emoji} +${leagueBonus})` : ""} · +${swing} 🏆`
      : `${lead}☆☆☆ Raid failed (${r.atkPower} vs ${r.defPower}) · ${swing} 🏆 · lost ${fmtLosses(r.attackerLosses)}${helped}`,
  };
}

// ---------------------------------------------------------------- assault an outpost
export async function assaultOutpost(u: User, attack: Force, site: OutpostSite): Promise<Outcome> {
  const hero = await heroOf(u);
  const row = await prisma.outpost.findUnique({ where: { id: site.id } });
  const owner = row?.ownerId ? await prisma.user.findUnique({ where: { id: row.ownerId } }) : null;
  const garrison = (row?.garrison as Army) ?? {};
  const near = owner ? await guardsNear(owner.id, site) : [];
  let defArmy = { ...garrison };
  for (const s of near) defArmy = addArmy(defArmy, s.units as Army);
  const defBonus = owner ? (await heroOf(owner)).bonus : undefined;
  const r = resolveBattle(
    { army: attack.army, vets: attack.vets, faction: factionOf(u.faction), bonus: hero.bonus, moodMult: moodOfUser(u).xpMult },
    owner
      ? { army: defArmy, faction: factionOf(owner.faction), bonus: defBonus, structures: { atk: OUTPOST_FORT.atk * (defBonus?.turret ?? 1), hp: OUTPOST_FORT.hp } }
      : { army: {}, faction: null, structures: { atk: site.guard * 0.5, hp: site.guard * 3 } },
    `${site.id}|${u.id}|${Date.now()}`,
  );
  await attack.onLosses(r.attackerLosses, r.won);
  // Garrison takes losses first, then any guard squads that rushed in.
  const rest: Army = { ...r.defenderLosses };
  const g: Army = { ...garrison };
  for (const [k, q] of Object.entries(rest)) {
    const t = Math.min(q ?? 0, g[k as UnitKey] ?? 0);
    g[k as UnitKey] = (g[k as UnitKey] ?? 0) - t;
    rest[k as UnitKey] = (q ?? 0) - t;
  }
  for (const s of near) {
    const take: Army = {};
    for (const [k, q] of Object.entries(rest)) {
      const t = Math.min(q ?? 0, (s.units as Army)[k as UnitKey] ?? 0);
      take[k as UnitKey] = t;
      rest[k as UnitKey] = (q ?? 0) - t;
    }
    await squadForce(s).onLosses(take, !r.won);
  }
  if (owner && !r.won) await prisma.outpost.update({ where: { id: site.id }, data: { garrison: clean(g) } });
  await prisma.battle.create({ data: { attackerId: u.id, defenderId: owner?.id, kind: "outpost", targetId: site.id, targetName: site.name, won: r.won, loot: 0, log: r } });

  if (!r.won) {
    if (owner) await notify(owner.id, { kind: "event", title: `🛡️ ${site.name} held`, body: `Your defenders repelled ${u.username}` });
    return { won: false, result: r, message: `☠️ Assault on ${site.name} failed (${r.atkPower} vs ${r.defPower}). Lost ${fmtLosses(r.attackerLosses)}` };
  }
  const now = new Date();
  await prisma.outpost.upsert({
    where: { id: site.id },
    create: { id: site.id, ownerId: u.id, garrison: {}, capturedAt: now, collectedAt: now, shieldUntil: new Date(now.getTime() + OUTPOST_SHIELD_MS) },
    update: { ownerId: u.id, garrison: {}, capturedAt: now, collectedAt: now, shieldUntil: new Date(now.getTime() + OUTPOST_SHIELD_MS) },
  });
  if (owner) await notify(owner.id, { kind: "event", title: `🚩 ${site.name} fell`, body: `${u.username} captured it — your garrison (${fmtLosses(garrison)}) was wiped out` });
  await grant(u.id, { xp: 150, coins: 50, scrap: 3 });
  await questEvent(u.id, "outpost");
  await maybeGear(u.id, 0.4, { source: site.name });
  return { won: true, result: r, message: `🚩 ${site.name} captured! Station troops there to hold it. Lost ${fmtLosses(r.attackerLosses)}` };
}

export { loadBase };
