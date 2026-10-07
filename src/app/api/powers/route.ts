// General's Powers: spend Command Points (1 per hero level) to unlock/rank up, then use on cooldown.
import { z } from "zod";
import { resolveBoss } from "@/lib/bosses";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { resolveOutpost } from "@/lib/outposts";
import { commandPoints, cooldownMs, MAX_POWER_RANK, POWER_BY_KEY, type PowerKey } from "@/lib/powers";
import { levelForXp } from "@/lib/progression";
import { armyStats, baseDefense, factionOf, levelOf, SIEGE_RANGE_M, type Army, type UnitKey } from "@/lib/rts";
import { addUnits, armyOf, fmtLosses, loadBase } from "@/server/army";
import { requireUser } from "@/server/auth";
import { damageBoss } from "@/server/boss";
import { body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { bumpNeeds } from "@/server/needs";
import { questEvent } from "@/server/quests";
import { grant } from "@/server/rewards";

const Schema = z.object({
  action: z.enum(["unlock", "use"]),
  key: z.enum(["supply_drop", "spy_drone", "adrenaline", "paradrop", "repair", "barrage", "battle_cry"]),
  targetId: z.string().max(80).optional(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const p = POWER_BY_KEY[d.key as PowerKey];
  const level = levelForXp(u.xp);
  const all = await prisma.powerState.findMany({ where: { userId: u.id } });
  const st = all.find((x) => x.key === p.key);

  if (d.action === "unlock") {
    if (level < p.level) throw new HttpError(400, `Requires hero level ${p.level}`);
    if ((st?.rank ?? 0) >= MAX_POWER_RANK) throw new HttpError(400, "Already max rank");
    if (commandPoints(level, all.reduce((s, x) => s + x.rank, 0)) < 1) throw new HttpError(400, "No Command Points left — level up your hero");
    if (st) await prisma.powerState.update({ where: { id: st.id }, data: { rank: { increment: 1 } } });
    else await prisma.powerState.create({ data: { userId: u.id, key: p.key } });
    return { message: `${p.emoji} ${p.name} ${st ? `rank ${st.rank + 1}` : "unlocked"}` };
  }

  if (!st) throw new HttpError(400, "Unlock this power first");
  const ready = !st.lastUsedAt || Date.now() - st.lastUsedAt.getTime() >= cooldownMs(p, st.rank);
  if (!ready) throw new HttpError(429, `${p.name} is recharging (${Math.ceil((st.lastUsedAt!.getTime() + cooldownMs(p, st.rank) - Date.now()) / 60000)} min)`);
  const r = st.rank;
  const myBase = await loadBase({ ownerId: u.id });
  let message = "";
  let intel: unknown = undefined;

  // Validate targeted powers before spending the cooldown.
  const target = async () => {
    if (!d.targetId) throw new HttpError(400, "Pick a target on the map");
    if (!myBase) throw new HttpError(400, "Plant a base first — powers are called in from it");
    const boss = d.targetId.startsWith("boss.") ? resolveBoss(d.targetId) : null;
    const op = d.targetId.startsWith("op.") ? resolveOutpost(d.targetId) : null;
    const base = !boss && !op ? await loadBase({ id: d.targetId }) : null;
    const where = boss ?? op ?? base;
    if (!where) throw new HttpError(404, "Target not found");
    if (base?.ownerId === u.id) throw new HttpError(400, "That's your own base");
    if (distanceM(myBase, where) > SIEGE_RANGE_M) throw new HttpError(400, `Target is out of range of your base (${SIEGE_RANGE_M / 1000} km)`);
    return { boss, op, base };
  };

  // Claim the cooldown first (atomic) so a double-tap can't fire twice; undo it if the effect fails.
  const claimed = await prisma.powerState.updateMany({ where: { id: st.id, lastUsedAt: st.lastUsedAt }, data: { lastUsedAt: new Date() } });
  if (!claimed.count) throw new HttpError(409, "Already used");
  try {
    switch (p.key) {
      case "supply_drop": {
        await grant(u.id, { coins: 150 * r });
        message = `📦 Supply drop: +${150 * r} 🪙`;
        break;
      }
      case "adrenaline": {
        await bumpNeeds(u.id, { energy: 25 * r, hunger: 15 * r });
        message = `💉 Adrenaline! Energy +${25 * r}, Hunger +${15 * r}`;
        break;
      }
      case "paradrop": {
        if (!myBase || levelOf(myBase.buildings, "barracks") < 1) throw new HttpError(400, "Needs a Barracks to receive troops");
        await addUnits(u.id, "ranger", 3 * r, 150);
        message = `🪂 ${3 * r} veteran Rangers dropped in`;
        break;
      }
      case "repair": {
        if (!myBase) throw new HttpError(400, "Plant a base first");
        await prisma.base.update({ where: { id: myBase.id }, data: { hp: Math.min(1000, myBase.hp + 250 * r) } });
        message = `🔧 Base repaired +${250 * r}`;
        break;
      }
      case "battle_cry": {
        await prisma.user.update({ where: { id: u.id }, data: { buffUntil: new Date(Date.now() + 3600_000), buffMult: 1 + 0.1 * r } });
        message = `📯 Battle Cry! Army attack +${10 * r}% for 1 hour`;
        break;
      }
      case "spy_drone": {
        const t = await target();
        if (t.boss) throw new HttpError(400, "Bosses have nothing to hide — target a base or outpost");
        if (t.op) {
          const row = await prisma.outpost.findUnique({ where: { id: t.op.id } });
          intel = { name: t.op.name, garrison: (row?.garrison as Army) ?? {}, owner: row?.ownerId ? "held" : "neutral", guard: row?.ownerId ? null : t.op.guard };
          message = `🛰️ ${t.op.name}: ${row?.ownerId ? `garrison ${fmtLosses(row.garrison as Army)}` : `neutral militia (${t.op.guard})`}`;
        } else {
          const b = t.base!;
          const army = await armyOf(b.ownerId);
          const f = factionOf(b.owner.faction);
          intel = { name: b.name, army, defense: baseDefense(b.buildings, f), power: armyStats(army, f).atk };
          message = `🛰️ ${b.name}: army ${fmtLosses(army)} · turrets ${baseDefense(b.buildings, f).atk} atk`;
        }
        break;
      }
      case "barrage": {
        const t = await target();
        if (t.boss) {
          const res = await damageBoss(t.boss, u.id, 400 * r);
          await questEvent(u.id, "boss_dmg", 400 * r);
          message = `💥 Barrage hit ${t.boss.def.name} for ${400 * r}${res.defeated ? " — DOWN!" : ""}`;
        } else if (t.op) {
          const row = await prisma.outpost.findUnique({ where: { id: t.op.id } });
          if (!row?.ownerId || row.ownerId === u.id) throw new HttpError(400, "Only enemy-held outposts can be shelled");
          const g = row.garrison as Army;
          const left: Army = {};
          for (const [k, q] of Object.entries(g)) if (q) left[k as UnitKey] = Math.floor(q * (1 - 0.2 * r));
          await prisma.outpost.update({ where: { id: row.id }, data: { garrison: left } });
          await notify(row.ownerId, { kind: "event", title: `💥 ${t.op.name} was shelled`, body: `${u.username} hit your garrison with artillery` });
          message = `💥 Barrage shredded ${20 * r}% of the ${t.op.name} garrison`;
        } else {
          const b = t.base!;
          await prisma.base.update({ where: { id: b.id }, data: { hp: Math.max(0, b.hp - 150 * r) } });
          await notify(b.ownerId, { kind: "event", title: `💥 ${b.name} is under bombardment`, body: `${u.username}'s artillery: −${150 * r} integrity` });
          message = `💥 Barrage hit ${b.name}: −${150 * r} integrity`;
        }
        break;
      }
    }
  } catch (e) {
    await prisma.powerState.update({ where: { id: st.id }, data: { lastUsedAt: st.lastUsedAt } });
    throw e;
  }
  await questEvent(u.id, "power");
  return { message, intel };
});
