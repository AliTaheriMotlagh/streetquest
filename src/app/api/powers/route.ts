// General's Powers: spend Command Points (1 per hero level) to unlock/rank up, then use on cooldown.
import { z } from "zod";
import { resolveBoss } from "@/lib/bosses";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { outpostLabel, resolveOutpost } from "@/lib/outposts";
import { commandPoints, cooldownMs, MAX_POWER_RANK, POWER_BY_KEY, type PowerKey } from "@/lib/powers";
import { levelForXp } from "@/lib/progression";
import { armyStats, baseDefense, factionOf, levelOf, SIEGE_RANGE_M, type Army, type UnitKey } from "@/lib/rts";
import { addUnits, armyOf, fmtLosses, loadBase } from "@/server/army";
import { requireUser } from "@/server/auth";
import { damageBoss } from "@/server/boss";
import { body, HttpError, actionRoute } from "@/server/http";
import { notify } from "@/server/hub";
import { bumpNeeds } from "@/server/needs";
import { questEvent } from "@/server/quests";
import { grant } from "@/server/rewards";
import { t as tr } from "@/lib/i18n"; // `t` is the target in this file

const Schema = z.object({
  action: z.enum(["unlock", "use"]),
  key: z.enum(["supply_drop", "spy_drone", "adrenaline", "paradrop", "repair", "barrage", "battle_cry"]),
  targetId: z.string().max(80).optional(),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const p = POWER_BY_KEY[d.key as PowerKey];
  const level = levelForXp(u.xp);
  const all = await prisma.powerState.findMany({ where: { userId: u.id } });
  const st = all.find((x) => x.key === p.key);

  if (d.action === "unlock") {
    if (level < p.level) throw new HttpError(400, tr("Requires hero level {n}", { n: p.level }));
    if ((st?.rank ?? 0) >= MAX_POWER_RANK) throw new HttpError(400, tr("Already max rank"));
    if (commandPoints(level, all.reduce((s, x) => s + x.rank, 0)) < 1) throw new HttpError(400, tr("No Command Points left — level up your hero"));
    if (st) await prisma.powerState.update({ where: { id: st.id }, data: { rank: { increment: 1 } } });
    else await prisma.powerState.create({ data: { userId: u.id, key: p.key } });
    return { message: `${p.emoji} ${p.name} ${st ? `rank ${st.rank + 1}` : "unlocked"}` };
  }

  if (!st) throw new HttpError(400, tr("Unlock this power first"));
  const ready = !st.lastUsedAt || Date.now() - st.lastUsedAt.getTime() >= cooldownMs(p, st.rank);
  if (!ready) throw new HttpError(429, tr("{name} is recharging ({n} min)", { name: tr(p.name), n: Math.ceil((st.lastUsedAt!.getTime() + cooldownMs(p, st.rank) - Date.now()) / 60000) }));
  const r = st.rank;
  const myBase = await loadBase({ ownerId: u.id });
  let message = "";
  let intel: unknown = undefined;

  // Validate targeted powers before spending the cooldown.
  const target = async () => {
    if (!d.targetId) throw new HttpError(400, tr("Pick a target on the map"));
    if (!myBase) throw new HttpError(400, tr("Plant a base first — powers are called in from it"));
    const boss = d.targetId.startsWith("boss.") ? resolveBoss(d.targetId) : null;
    const op = d.targetId.startsWith("op.") ? resolveOutpost(d.targetId) : null;
    const base = !boss && !op ? await loadBase({ id: d.targetId }) : null;
    const where = boss ?? op ?? base;
    if (!where) throw new HttpError(404, tr("Target not found"));
    if (base?.ownerId === u.id) throw new HttpError(400, tr("That's your own base"));
    if (distanceM(myBase, where) > SIEGE_RANGE_M) throw new HttpError(400, tr("Target is out of range of your base ({km} km)", { km: SIEGE_RANGE_M / 1000 }));
    return { boss, op, base };
  };

  // Claim the cooldown first (atomic) so a double-tap can't fire twice; undo it if the effect fails.
  const claimed = await prisma.powerState.updateMany({ where: { id: st.id, lastUsedAt: st.lastUsedAt }, data: { lastUsedAt: new Date() } });
  if (!claimed.count) throw new HttpError(409, tr("Already used"));
  try {
    switch (p.key) {
      case "supply_drop": {
        await grant(u.id, { coins: 150 * r });
        message = tr("📦 Supply drop: +{n} 🪙", { n: 150 * r });
        break;
      }
      case "adrenaline": {
        await bumpNeeds(u.id, { energy: 25 * r, hunger: 15 * r });
        message = tr("💉 Adrenaline! Energy +{e}, Hunger +{h}", { e: 25 * r, h: 15 * r });
        break;
      }
      case "paradrop": {
        if (!myBase || levelOf(myBase.buildings, "barracks") < 1) throw new HttpError(400, tr("Needs a Barracks to receive troops"));
        await addUnits(u.id, "ranger", 3 * r, 150);
        message = tr("🪂 {n} veteran Rangers dropped in", { n: 3 * r });
        break;
      }
      case "repair": {
        if (!myBase) throw new HttpError(400, tr("Plant a base first"));
        await prisma.base.update({ where: { id: myBase.id }, data: { hp: Math.min(1000, myBase.hp + 250 * r) } });
        message = tr("🔧 Base repaired +{n}", { n: 250 * r });
        break;
      }
      case "battle_cry": {
        await prisma.user.update({ where: { id: u.id }, data: { buffUntil: new Date(Date.now() + 3600_000), buffMult: 1 + 0.1 * r } });
        message = tr("📯 Battle Cry! Army attack +{n}% for 1 hour", { n: 10 * r });
        break;
      }
      case "spy_drone": {
        const t = await target();
        if (t.boss) throw new HttpError(400, tr("Bosses have nothing to hide — target a base or outpost"));
        if (t.op) {
          const row = await prisma.outpost.findUnique({ where: { id: t.op.id } });
          intel = { name: outpostLabel(t.op.name), garrison: (row?.garrison as Army) ?? {}, owner: row?.ownerId ? "held" : "neutral", guard: row?.ownerId ? null : t.op.guard };
          message = `🛰️ ${outpostLabel(t.op.name)}: ${row?.ownerId ? tr("garrison {losses}", { losses: fmtLosses(row.garrison as Army) }) : tr("neutral militia ({n})", { n: t.op.guard })}`;
        } else {
          const b = t.base!;
          const army = await armyOf(b.ownerId);
          const f = factionOf(b.owner.faction);
          intel = { name: b.name, army, defense: baseDefense(b.buildings, f), power: armyStats(army, f).atk };
          message = `🛰️ ${b.name}: ${tr("army {losses} · turrets {n} atk", { losses: fmtLosses(army), n: baseDefense(b.buildings, f).atk })}`;
        }
        break;
      }
      case "barrage": {
        const t = await target();
        if (t.boss) {
          const res = await damageBoss(t.boss, u.id, 400 * r);
          await questEvent(u.id, "boss_dmg", 400 * r);
          message = res.defeated ? tr("💥 Barrage hit {name} for {n} — DOWN!", { name: tr(t.boss.def.name), n: 400 * r }) : tr("💥 Barrage hit {name} for {n}", { name: tr(t.boss.def.name), n: 400 * r });
        } else if (t.op) {
          const site = t.op;
          const row = await prisma.outpost.findUnique({ where: { id: site.id } });
          if (!row?.ownerId || row.ownerId === u.id) throw new HttpError(400, tr("Only enemy-held outposts can be shelled"));
          const g = row.garrison as Army;
          const left: Army = {};
          for (const [k, q] of Object.entries(g)) if (q) left[k as UnitKey] = Math.floor(q * (1 - 0.2 * r));
          await prisma.outpost.update({ where: { id: row.id }, data: { garrison: left } });
          await notify(row.ownerId, () => ({ kind: "event", tag: "hurt", title: tr("💥 {name} was shelled", { name: outpostLabel(site.name) }), body: tr("{name} hit your garrison with artillery", { name: u.username }) }));
          message = tr("💥 Barrage shredded {pct}% of the {name} garrison", { pct: 20 * r, name: outpostLabel(site.name) });
        } else {
          const b = t.base!;
          await prisma.base.update({ where: { id: b.id }, data: { hp: Math.max(0, b.hp - 150 * r) } });
          await notify(b.ownerId, () => ({ kind: "event", tag: "hurt", title: tr("💥 {base} is under bombardment", { base: b.name }), body: tr("{name}'s artillery: −{n} integrity", { name: u.username, n: 150 * r }) }));
          message = tr("💥 Barrage hit {base}: −{n} integrity", { base: b.name, n: 150 * r });
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
