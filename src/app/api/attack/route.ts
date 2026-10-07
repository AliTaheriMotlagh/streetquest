// Street combat: a commander shoots a rival commander, an enemy tower or an enemy
// squad that's physically close. Same HP / downed rules as tower fire.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { UNIT_BY_KEY, type Army, type UnitKey } from "@/lib/rts";
import { currentHp, SHOOT_ASSET_MULT, SHOOT_COOLDOWN_MS, SHOOT_CRIT, SHOOT_DMG, SHOOT_RANGE_M, squadPos, TOWER_BY_KEY, towerStats, type TowerKey } from "@/lib/td";
import { requireUser } from "@/server/auth";
import { heroOf } from "@/server/hero";
import { body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, unlock } from "@/server/rewards";
import { areFriends } from "@/server/rooms";
import { assertNotDowned, knockDown, maxHpOf, shotProtection } from "@/server/td";
import { squadForce } from "@/server/warfare";

const Schema = z.object({ kind: z.enum(["player", "tower", "squad"]), id: z.string().max(40) });
const ONLINE_MS = 2 * 60_000;

/** Gunfire chews through the weakest units first. */
function casualties(units: Army, dmg: number): Army {
  const out: Army = {};
  let left = dmg;
  for (const [k, q] of Object.entries(units).sort((a, b) => (UNIT_BY_KEY[a[0] as UnitKey]?.hp ?? 99) - (UNIT_BY_KEY[b[0] as UnitKey]?.hp ?? 99))) {
    const hp = UNIT_BY_KEY[k as UnitKey]?.hp ?? 20;
    const n = Math.min(q ?? 0, Math.floor(left / hp));
    if (n > 0) {
      out[k as UnitKey] = n;
      left -= n * hp;
    }
    if (left < hp) break;
  }
  return out;
}

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  await assertNotDowned(u);
  if (shotProtection({ xp: u.xp, downedUntil: null })) throw new HttpError(400, "Rookies can't start fights — reach level 3 first");
  const here = await lastKnownLocation(u.id);

  // Cooldown, claimed atomically so double-taps can't fire twice.
  const now = Date.now();
  const ready = await prisma.user.updateMany({ where: { id: u.id, OR: [{ shotAt: null }, { shotAt: { lt: new Date(now - SHOOT_COOLDOWN_MS) } }] }, data: { shotAt: new Date(now) } });
  if (!ready.count) throw new HttpError(429, "Reloading…");
  const refund = () => prisma.user.update({ where: { id: u.id }, data: { shotAt: null } });

  const { bonus } = await heroOf(u);
  const crit = Math.random() < SHOOT_CRIT;
  const dmg = Math.round(SHOOT_DMG * bonus.fpsDmg * (0.85 + Math.random() * 0.3) * (crit ? 2 : 1));
  const tag = crit ? "💥 HEADSHOT " : "";

  if (d.kind === "player") {
    const t = await prisma.user.findUnique({ where: { id: d.id } });
    if (!t || t.id === u.id) return refund().then(() => Promise.reject(new HttpError(404, "Target not found")));
    if (await areFriends(u.id, t.id)) return refund().then(() => Promise.reject(new HttpError(400, "That's your crew")));
    if (!t.lastSeenAt || now - t.lastSeenAt.getTime() > ONLINE_MS || t.lastLat == null || t.lastLng == null) return refund().then(() => Promise.reject(new HttpError(400, `${t.username} isn't on the street right now`)));
    const dist = distanceM(here, { lat: t.lastLat, lng: t.lastLng });
    if (dist > SHOOT_RANGE_M) return refund().then(() => Promise.reject(new HttpError(400, `Out of range — get within ${SHOOT_RANGE_M} m of ${t.username}`)));
    const why = shotProtection(t, now);
    if (why) return refund().then(() => Promise.reject(new HttpError(400, `${t.username} ${why}`)));
    const maxHp = await maxHpOf(t.id);
    const left = currentHp(t.hp, t.hpAt, maxHp, now) - dmg;
    if (left > 0) {
      await prisma.user.update({ where: { id: t.id }, data: { hp: left, hpAt: new Date(now) } });
      await notify(t.id, { kind: "event", title: `🔫 ${u.username} shot you! −${dmg} HP`, body: `${left}/${maxHp} HP — fight back or run` });
      await grant(u.id, { xp: 5 });
      return { message: `${tag}🔫 Hit ${t.username} for ${dmg} (${left}/${maxHp} HP left)`, hp: left, maxHp };
    }
    const coins = await knockDown(t, maxHp, u.id);
    await prisma.user.update({ where: { id: u.id }, data: { trophies: { increment: 5 } } });
    await prisma.user.updateMany({ where: { id: t.id, trophies: { gte: 5 } }, data: { trophies: { decrement: 5 } } });
    await questEvent(u.id, "kills");
    await unlock(u.id, "first_blood");
    await notify(t.id, { kind: "event", title: `☠️ ${u.username} took you down`, body: `Lost ${coins} 🪙 and 5 🏆 · back in 3 min — revenge is a tap away` });
    return { message: `${tag}☠️ ${t.username} is DOWN! +${coins} 🪙 · +5 🏆`, downed: true };
  }

  const assetDmg = Math.round(dmg * SHOOT_ASSET_MULT);

  if (d.kind === "tower") {
    const t = await prisma.tower.findUnique({ where: { id: d.id } });
    if (!t) return refund().then(() => Promise.reject(new HttpError(404, "That tower is gone")));
    if (t.ownerId === u.id || (await areFriends(u.id, t.ownerId))) return refund().then(() => Promise.reject(new HttpError(400, "That tower is on your side")));
    const st = towerStats(t);
    if (distanceM(here, t) > Math.max(SHOOT_RANGE_M, st.range) + 10) return refund().then(() => Promise.reject(new HttpError(400, `Out of range — get within ${Math.max(SHOOT_RANGE_M, st.range) + 10} m`)));
    await prisma.tower.updateMany({ where: { id: t.id }, data: { hp: { decrement: assetDmg } } });
    const after = await prisma.tower.findUnique({ where: { id: t.id } });
    if (after && after.hp <= 0 && (await prisma.tower.deleteMany({ where: { id: t.id } })).count) {
      const coins = Math.round(TOWER_BY_KEY[t.type as TowerKey].cost * 0.3);
      await grant(u.id, { coins, xp: 120, scrap: 2 + t.level });
      await questEvent(u.id, "tower_down");
      await notify(t.ownerId, { kind: "event", title: `💥 ${u.username} shot down your ${st.def.name}`, body: "Rebuild it from Base → Defense" });
      return { message: `${tag}💥 ${st.def.name} destroyed! +${coins} 🪙`, destroyed: true };
    }
    if (t.hp > st.maxHp * 0.5 && (after?.hp ?? 0) <= st.maxHp * 0.5) await notify(t.ownerId, { kind: "event", title: `🔫 ${u.username} is shooting up your ${st.def.name}`, body: `${after?.hp ?? 0}/${st.maxHp} HP` });
    return { message: `${tag}🔫 Hit the ${st.def.name} for ${assetDmg} (${Math.max(0, after?.hp ?? 0)}/${st.maxHp})` };
  }

  // squad
  const s = await prisma.squad.findUnique({ where: { id: d.id } });
  if (!s) return refund().then(() => Promise.reject(new HttpError(404, "That squad is gone")));
  if (s.ownerId === u.id || (await areFriends(u.id, s.ownerId))) return refund().then(() => Promise.reject(new HttpError(400, "That squad is on your side")));
  const at = s.status === "HOLD" ? { lat: s.toLat, lng: s.toLng } : squadPos(s, now);
  if (distanceM(here, at) > SHOOT_RANGE_M) return refund().then(() => Promise.reject(new HttpError(400, `Out of range — get within ${SHOOT_RANGE_M} m`)));
  const losses = casualties(s.units as Army, assetDmg);
  const killed = Object.values(losses).reduce((a, n) => a + (n ?? 0), 0);
  if (!killed) return { message: `${tag}🔫 Hit the squad for ${assetDmg} — armor held. Keep shooting or bring heavier gear` };
  await squadForce(s).onLosses(losses, false);
  await grant(u.id, { xp: 15 * killed });
  await notify(s.ownerId, { kind: "event", title: `🔫 ${u.username} is picking off your squad`, body: `Lost ${killed} unit${killed > 1 ? "s" : ""}` });
  return { message: `${tag}🔫 Took out ${killed} unit${killed > 1 ? "s" : ""}!` };
});
