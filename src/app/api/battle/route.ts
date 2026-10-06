// Auto-resolved strategy battles (Generals-style): siege a player's base,
// capture an oil derrick, or bombard a world boss — all with your trained army.
import { z } from "zod";
import { resolveBoss, BOSS_BOMBARD_COOLDOWN_MS } from "@/lib/bosses";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { armyStats, baseDefense, factionOf, resolveBattle, SHIELD_MS, SIEGE_COOLDOWN_MS, SIEGE_RANGE_M, type Army } from "@/lib/rts";
import { INTERACT_RADIUS_M, resolveSpawn } from "@/lib/spawns";
import { requireUser } from "@/server/auth";
import { armyOf, loadBase, removeUnits } from "@/server/army";
import { damageBoss } from "@/server/boss";
import { body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { moodOfUser } from "@/server/needs";
import { grant, lastKnownLocation, track } from "@/server/rewards";

const Schema = z.object({ kind: z.enum(["siege", "derrick", "bombard"]), targetId: z.string().max(80) });

const fmtLosses = (a: Army) => Object.entries(a).filter(([, q]) => q).map(([k, q]) => `${q} ${k}`).join(", ") || "none";

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const f = factionOf(u.faction);
  if (!f) throw new HttpError(400, "Pick a faction first");
  const army = await armyOf(u.id);
  const stats = armyStats(army, f);
  if (!stats.count) throw new HttpError(400, "You have no army — train units at your Barracks");
  const mood = moodOfUser(u);

  if (d.kind === "derrick") {
    const s = resolveSpawn(d.targetId);
    if (!s || s.kind !== "derrick") throw new HttpError(410, "This derrick is gone");
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, s) > INTERACT_RADIUS_M + 10) throw new HttpError(400, `Lead your army in person — get within ${INTERACT_RADIUS_M} m`);
    if (await prisma.claim.findUnique({ where: { userId_spawnId: { userId: u.id, spawnId: s.id } } })) throw new HttpError(409, "You already hold this derrick");
    const r = resolveBattle({ army, faction: f, moodMult: mood.xpMult }, { army: {}, faction: null, structures: { atk: s.guard! * 0.5, hp: s.guard! * 3 } }, `${s.id}|${u.id}|${Date.now()}`);
    await removeUnits(u.id, r.attackerLosses);
    await prisma.battle.create({ data: { attackerId: u.id, kind: "derrick", targetId: s.id, targetName: "Oil Derrick", won: r.won, loot: r.won ? s.rewardCoins : 0, log: r } });
    if (!r.won) return { won: false, result: r, message: `Militia held the derrick. Lost: ${fmtLosses(r.attackerLosses)}` };
    await prisma.claim.create({ data: { userId: u.id, spawnId: s.id, kind: "derrick", cell: s.cell } }).catch(() => {
      throw new HttpError(409, "Already captured");
    });
    await grant(u.id, { xp: s.rewardXp, coins: s.rewardCoins });
    await track("claim", { userId: u.id, campaign: "derrick" });
    return { won: true, result: r, message: `🛢️ Derrick captured! +${s.rewardCoins} 🪙 · lost ${fmtLosses(r.attackerLosses)}` };
  }

  const myBase = await loadBase({ ownerId: u.id });
  if (!myBase) throw new HttpError(400, "Plant a base first — armies march from it");

  if (d.kind === "bombard") {
    const boss = resolveBoss(d.targetId);
    if (!boss) throw new HttpError(410, "The boss has moved on");
    if (distanceM(myBase, boss) > SIEGE_RANGE_M) throw new HttpError(400, "Boss is out of range of your base");
    const recent = await prisma.battle.findFirst({ where: { attackerId: u.id, targetId: boss.id, createdAt: { gt: new Date(Date.now() - BOSS_BOMBARD_COOLDOWN_MS) } } });
    if (recent) throw new HttpError(429, "Your artillery is reloading — try again in a few minutes");
    const dmg = Math.round(stats.atk * 3 * mood.xpMult * (0.8 + Math.random() * 0.4));
    const lossFrac = Math.min(0.5, (boss.def.dmg * 25) / Math.max(1, stats.hp));
    const losses: Army = {};
    for (const [k, q] of Object.entries(army)) if (q) losses[k as keyof Army] = Math.floor(q * lossFrac + Math.random());
    await removeUnits(u.id, losses);
    const r = await damageBoss(boss, u.id, dmg);
    await prisma.battle.create({ data: { attackerId: u.id, kind: "boss", targetId: boss.id, targetName: boss.def.name, won: r.killedNow, loot: 0, log: { dmg, losses } } });
    await grant(u.id, { xp: 30 + Math.round(dmg / 20) });
    return { won: r.killedNow, message: `${boss.def.emoji} Bombardment hit for ${dmg}! ${r.defeated ? "Boss DOWN!" : `${r.hp} HP left`} · lost ${fmtLosses(losses)}` };
  }

  // siege
  const target = await loadBase({ id: d.targetId });
  if (!target) throw new HttpError(404, "Base not found");
  if (target.ownerId === u.id) throw new HttpError(400, "That's your own base");
  if (distanceM(myBase, target) > SIEGE_RANGE_M) throw new HttpError(400, `Out of range — armies march at most ${SIEGE_RANGE_M / 1000} km from your base`);
  if (target.shieldUntil && target.shieldUntil > new Date()) throw new HttpError(400, "This base is under a cease-fire shield");
  const recent = await prisma.battle.findFirst({ where: { attackerId: u.id, targetId: target.id, createdAt: { gt: new Date(Date.now() - SIEGE_COOLDOWN_MS) } } });
  if (recent) throw new HttpError(429, "Your army needs to regroup before hitting this base again");

  const tf = factionOf(target.owner.faction);
  const defArmy = await armyOf(target.ownerId);
  const def = baseDefense(target.buildings, tf);
  const integrity = Math.max(0.4, target.hp / 1000);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: target.ownerId } });
  const r = resolveBattle(
    { army, faction: f, moodMult: mood.xpMult },
    { army: defArmy, faction: tf, structures: { atk: def.atk * integrity, hp: def.hp * integrity }, moodMult: moodOfUser(owner).xpMult },
    `${target.id}|${u.id}|${Date.now()}`,
  );
  await removeUnits(u.id, r.attackerLosses);
  await removeUnits(target.ownerId, r.defenderLosses);
  let loot = 0;
  if (r.won) {
    loot = Math.min(800, Math.floor(owner.coins * 0.12 * f.loot));
    const took = await prisma.user.updateMany({ where: { id: owner.id, coins: { gte: loot } }, data: { coins: { decrement: loot } } });
    if (!took.count) loot = 0;
    await prisma.base.update({ where: { id: target.id }, data: { hp: Math.max(0, target.hp - Math.min(400, Math.round(r.structureDamage / 2))), shieldUntil: new Date(Date.now() + SHIELD_MS) } });
  }
  await grant(u.id, { coins: loot, xp: 60 + (r.won ? 150 : 0) });
  await prisma.battle.create({ data: { attackerId: u.id, kind: "siege", targetId: target.id, targetName: target.name, won: r.won, loot, log: r } });
  await notify(target.ownerId, {
    kind: "event",
    title: r.won ? `💥 ${u.username} sieged ${target.name}` : `🛡️ ${target.name} repelled ${u.username}`,
    body: r.won ? `Lost ${loot} 🪙 and ${fmtLosses(r.defenderLosses)}` : `Your defenders lost ${fmtLosses(r.defenderLosses)}`,
  });
  return {
    won: r.won,
    result: r,
    message: r.won ? `🏆 Siege won! +${loot} 🪙 · lost ${fmtLosses(r.attackerLosses)}` : `☠️ Siege failed. Lost ${fmtLosses(r.attackerLosses)}`,
  };
});
