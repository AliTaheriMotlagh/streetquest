// Auto-resolved strategy battles (Generals-style): siege a player's base,
// capture an oil derrick, or bombard a world boss — all with your trained army.
// Unit counters, veterancy and both commanders' hero bonuses decide the outcome.
import { z } from "zod";
import { resolveBoss, BOSS_BOMBARD_COOLDOWN_MS } from "@/lib/bosses";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { armyStats, factionOf, resolveBattle, SIEGE_COOLDOWN_MS, SIEGE_RANGE_M, VET_GAIN, type Army, type UnitKey } from "@/lib/rts";
import { INTERACT_RADIUS_M, resolveSpawn } from "@/lib/spawns";
import { requireUser } from "@/server/auth";
import { fmtLosses, forcesOf, gainVet, loadBase, removeUnits, survivors } from "@/server/army";
import { damageBoss } from "@/server/boss";
import { heroOf, maybeGear } from "@/server/hero";
import { body, HttpError, route } from "@/server/http";
import { moodOfUser } from "@/server/needs";
import { homeForce, siegeBase } from "@/server/warfare";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, track } from "@/server/rewards";

const Schema = z.object({ kind: z.enum(["siege", "derrick", "bombard"]), targetId: z.string().max(80) });


export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const f = factionOf(u.faction);
  if (!f) throw new HttpError(400, "Pick a faction first");
  const { army, vets } = await forcesOf(u.id);
  const hero = await heroOf(u);
  const stats = armyStats(army, f, hero.bonus, vets);
  if (!stats.count) throw new HttpError(400, "You have no army — train units at your Barracks");
  const mood = moodOfUser(u);
  const me = { army, vets, faction: f, bonus: hero.bonus, moodMult: mood.xpMult };

  if (d.kind === "derrick") {
    const s = resolveSpawn(d.targetId);
    if (!s || s.kind !== "derrick") throw new HttpError(410, "This derrick is gone");
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, s) > INTERACT_RADIUS_M + 10) throw new HttpError(400, `Lead your army in person — get within ${INTERACT_RADIUS_M} m`);
    if (await prisma.claim.findUnique({ where: { userId_spawnId: { userId: u.id, spawnId: s.id } } })) throw new HttpError(409, "You already hold this derrick");
    const r = resolveBattle(me, { army: {}, faction: null, structures: { atk: s.guard! * 0.5, hp: s.guard! * 3 } }, `${s.id}|${u.id}|${Date.now()}`);
    await removeUnits(u.id, r.attackerLosses);
    await gainVet(u.id, survivors(army, r.attackerLosses), r.won ? VET_GAIN.won : VET_GAIN.fought);
    const coins = Math.round(s.rewardCoins * hero.bonus.loot);
    await prisma.battle.create({ data: { attackerId: u.id, kind: "derrick", targetId: s.id, targetName: "Oil Derrick", won: r.won, loot: r.won ? coins : 0, log: r } });
    if (!r.won) return { won: false, result: r, message: `Militia held the derrick. Lost: ${fmtLosses(r.attackerLosses)}` };
    await prisma.claim.create({ data: { userId: u.id, spawnId: s.id, kind: "derrick", cell: s.cell } }).catch(() => {
      throw new HttpError(409, "Already captured");
    });
    await grant(u.id, { xp: s.rewardXp, coins, scrap: 2 });
    await questEvent(u.id, "derrick");
    await maybeGear(u.id, 0.35, { source: "the derrick" });
    await track("claim", { userId: u.id, campaign: "derrick" });
    return { won: true, result: r, message: `🛢️ Derrick captured! +${coins} 🪙 +2 scrap · lost ${fmtLosses(r.attackerLosses)}` };
  }

  const myBase = await loadBase({ ownerId: u.id });
  if (!myBase) throw new HttpError(400, "Plant a base first — armies march from it");

  if (d.kind === "bombard") {
    const boss = resolveBoss(d.targetId);
    if (!boss) throw new HttpError(410, "The boss has moved on");
    if (distanceM(myBase, boss) > SIEGE_RANGE_M) throw new HttpError(400, "Boss is out of range of your base");
    const recent = await prisma.battle.findFirst({ where: { attackerId: u.id, targetId: boss.id, createdAt: { gt: new Date(Date.now() - BOSS_BOMBARD_COOLDOWN_MS) } } });
    if (recent) throw new HttpError(429, "Your artillery is reloading — try again in a few minutes");
    // Bosses are armored: vehicle-killers (rockets, jets, artillery) do best.
    const vsBoss = armyStats(army, f, hero.bonus, vets);
    const dmg = Math.round(vsBoss.atk * 3 * mood.xpMult * (0.8 + Math.random() * 0.4));
    const lossFrac = Math.min(0.5, (boss.def.dmg * 25) / Math.max(1, vsBoss.hp)) * hero.bonus.losses;
    const losses: Army = {};
    for (const [k, q] of Object.entries(army)) if (q) losses[k as UnitKey] = Math.min(q, Math.floor(q * lossFrac + Math.random()));
    await removeUnits(u.id, losses);
    await gainVet(u.id, survivors(army, losses), VET_GAIN.fought);
    const r = await damageBoss(boss, u.id, dmg);
    await prisma.battle.create({ data: { attackerId: u.id, kind: "boss", targetId: boss.id, targetName: boss.def.name, won: r.killedNow, loot: 0, log: { dmg, losses } } });
    await grant(u.id, { xp: 30 + Math.round(dmg / 20) });
    await questEvent(u.id, "boss_dmg", dmg);
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
  return siegeBase(u, myBase.id, await homeForce(u.id), target, "army");
});
