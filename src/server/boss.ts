import { prisma } from "../lib/db";
import { bossReward, type Boss } from "../lib/bosses";
import { notify } from "./hub";
import { grant } from "./rewards";
import { giveGear } from "./hero";

export async function bossHp(b: Boss) {
  const s = await prisma.bossState.findUnique({ where: { bossId: b.id } });
  return { hp: Math.max(0, b.maxHp - (s?.damage ?? 0)), defeated: !!s?.defeatedAt };
}

/** Deal damage to a world boss. The hit that brings it to 0 pays out every contributor once. */
export async function damageBoss(b: Boss, userId: string, dmg: number) {
  dmg = Math.max(0, Math.round(dmg));
  const s = await prisma.bossState.upsert({ where: { bossId: b.id }, create: { bossId: b.id, damage: dmg }, update: { damage: { increment: dmg } } });
  if (s.defeatedAt) return { hp: 0, defeated: true, killedNow: false };
  await prisma.bossHit.upsert({ where: { bossId_userId: { bossId: b.id, userId } }, create: { bossId: b.id, userId, damage: dmg }, update: { damage: { increment: dmg } } });
  const hp = Math.max(0, b.maxHp - s.damage);
  if (hp > 0) return { hp, defeated: false, killedNow: false };

  const won = await prisma.bossState.updateMany({ where: { bossId: b.id, defeatedAt: null }, data: { defeatedAt: new Date() } });
  if (!won.count) return { hp: 0, defeated: true, killedNow: false };
  const hits = await prisma.bossHit.findMany({ where: { bossId: b.id }, orderBy: { damage: "desc" } });
  for (const [i, h] of hits.entries()) {
    const r = bossReward(h.damage, i === 0);
    await grant(h.userId, { ...r, gems: i === 0 ? 10 : 3, scrap: 5 });
    if (i === 0 || Math.random() < 0.5) await giveGear(h.userId, { floor: i === 0 ? "epic" : "rare", source: b.def.name });
    await notify(h.userId, { kind: "reward", title: `${b.def.emoji} ${b.def.name} defeated!`, body: `Your share: +${r.coins} 🪙${i === 0 ? " · 👑 top damage" : ""}` });
  }
  return { hp: 0, defeated: true, killedNow: true };
}
