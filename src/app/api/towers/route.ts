// Towers on the real map: build where you stand (inside your territory), upgrade,
// repair, demolish — or plant C4 on someone else's.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { factionOf, levelOf } from "@/lib/rts";
import { maxTowers, SABOTAGE_COOLDOWN_MS, SABOTAGE_DMG, TOWER_BY_KEY, TOWER_MAX_LEVEL, TOWER_SPACING_M, TOWER_TERRITORY_M, towerCost, towerStats, type TowerKey } from "@/lib/td";
import { requireUser } from "@/server/auth";
import { loadBase } from "@/server/army";
import { heroOf } from "@/server/hero";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { notify } from "@/server/hub";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, spendCoins, unlock } from "@/server/rewards";
import { areFriends } from "@/server/rooms";
import { assertNotDowned, SPEED } from "@/server/td";
import { t as tr } from "@/lib/i18n"; // `t` is the target in this file

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("build"), type: z.enum(["mg", "cannon", "sam", "sniper", "tesla"]) }),
  z.object({ action: z.literal("upgrade"), towerId: z.string().max(40) }),
  z.object({ action: z.literal("repair"), towerId: z.string().max(40) }),
  z.object({ action: z.literal("demolish"), towerId: z.string().max(40) }),
  z.object({ action: z.literal("sabotage"), towerId: z.string().max(40), score: z.number().int().min(0).max(3) }),
]);

async function spendScrap(userId: string, scrap: number, refundCoins: number) {
  if (!scrap) return;
  const took = await prisma.user.updateMany({ where: { id: userId, scrap: { gte: scrap } }, data: { scrap: { decrement: scrap } } });
  if (!took.count) {
    await prisma.user.update({ where: { id: userId }, data: { coins: { increment: refundCoins } } });
    throw new HttpError(400, tr("Needs {n} 🔩 scrap — salvage gear or destroy enemy towers", { n: scrap }));
  }
}

export const GET = route(async () => {
  const u = await requireUser();
  const [towers, base] = await Promise.all([prisma.tower.findMany({ where: { ownerId: u.id }, orderBy: { createdAt: "asc" } }), loadBase({ ownerId: u.id })]);
  const hq = base ? levelOf(base.buildings, "hq") : 0;
  return { towers, max: maxTowers(hq), hq };
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "build") {
    if (!factionOf(u.faction)) throw new HttpError(400, tr("Pick a faction first"));
    const base = await loadBase({ ownerId: u.id });
    if (!base) throw new HttpError(400, tr("Plant your base first — towers guard your territory"));
    const def = TOWER_BY_KEY[d.type as TowerKey];
    const hq = levelOf(base.buildings, "hq");
    if (hq < def.hqLevel) throw new HttpError(400, tr("{name} needs Command Center level {n}", { name: tr(def.name), n: def.hqLevel }));
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, base) > TOWER_TERRITORY_M) throw new HttpError(400, tr("Towers go up within {km} km of your base — walk closer to home", { km: TOWER_TERRITORY_M / 1000 }));
    const mine = await prisma.tower.count({ where: { ownerId: u.id } });
    if (mine >= maxTowers(hq)) throw new HttpError(400, tr("Tower limit reached ({n}) — upgrade your Command Center for more", { n: maxTowers(hq) }));
    const close = await prisma.tower.findMany({ where: { lat: { gte: here.lat - 0.0005, lte: here.lat + 0.0005 }, lng: { gte: here.lng - 0.0008, lte: here.lng + 0.0008 } } });
    if (close.some((t) => distanceM(here, t) < TOWER_SPACING_M)) throw new HttpError(400, tr("Too close to another tower — keep {m} m apart", { m: TOWER_SPACING_M }));
    const c = towerCost(def.key, 1);
    await spendCoins(u.id, c.coins);
    await spendScrap(u.id, c.scrap, c.coins);
    await prisma.tower.create({ data: { ownerId: u.id, type: def.key, lat: here.lat, lng: here.lng, hp: towerStats({ type: def.key, level: 1 }).maxHp, readyAt: new Date(Date.now() + (c.seconds * 1000) / SPEED) } });
    await questEvent(u.id, "tower");
    await unlock(u.id, "tower_builder");
    return { message: `${def.emoji} ${tr("{name} going up here", { name: tr(def.name) })} (−${c.coins} 🪙${c.scrap ? `, −${c.scrap} 🔩` : ""})` };
  }

  const t = await prisma.tower.findUnique({ where: { id: d.towerId } });
  if (!t) throw new HttpError(404, tr("That tower is gone"));
  const st = towerStats(t);

  if (d.action === "sabotage") {
    if (t.ownerId === u.id) throw new HttpError(400, tr("That's your own tower"));
    if (await areFriends(u.id, t.ownerId)) throw new HttpError(400, tr("That tower belongs to your crew"));
    await assertNotDowned(u);
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, t) > st.range + 15) throw new HttpError(400, tr("Get within {m} m to plant a charge", { m: st.range + 15 }));
    if (u.sabotageAt && Date.now() - u.sabotageAt.getTime() < SABOTAGE_COOLDOWN_MS) throw new HttpError(429, tr("Still wiring the next charge — give it a few seconds"));
    await prisma.user.update({ where: { id: u.id }, data: { sabotageAt: new Date() } });
    if (d.score === 0) return { message: tr("💥 The charge fizzled. Try again!") };
    const dmg = Math.round(SABOTAGE_DMG[d.score] * (await heroOf(u)).bonus.fpsDmg);
    const res = await prisma.tower.updateMany({ where: { id: t.id }, data: { hp: { decrement: dmg } } });
    if (!res.count) throw new HttpError(404, tr("That tower is gone"));
    const after = await prisma.tower.findUnique({ where: { id: t.id } });
    if (after && after.hp <= 0) {
      const del = await prisma.tower.deleteMany({ where: { id: t.id } });
      if (del.count) {
        const coins = Math.round(st.def.cost * 0.3);
        await grant(u.id, { coins, xp: 120, scrap: 2 + t.level });
        await questEvent(u.id, "tower_down");
        await notify(t.ownerId, () => ({ kind: "event", tag: "hurt", title: tr("💥 {name} blew up your {tower}", { name: u.username, tower: tr(st.def.name) }), body: tr("Rebuild it from Base → Defense") }));
        return { message: `💥 ${st.def.emoji} ${tr("{tower} destroyed!", { tower: tr(st.def.name) })} +${coins} 🪙 +${2 + t.level} 🔩`, destroyed: true };
      }
    }
    await notify(t.ownerId, () => ({ kind: "event", title: tr("💣 {name} is sabotaging your {tower}!", { name: u.username, tower: tr(st.def.name) }), body: tr("{hp}/{max} HP left", { hp: Math.max(0, after?.hp ?? 0), max: st.maxHp }) }));
    return { message: tr("💣 Charge hit for {n}! {hp}/{max} HP left", { n: dmg, hp: Math.max(0, after?.hp ?? 0), max: st.maxHp }) };
  }

  if (t.ownerId !== u.id) throw new HttpError(403, tr("Not your tower"));

  if (d.action === "demolish") {
    await prisma.tower.delete({ where: { id: t.id } });
    const refund = Math.round(towerCost(t.type as TowerKey, t.level).coins * 0.3);
    await grant(u.id, { coins: refund }, { raw: true });
    return { message: tr("🏚️ {tower} demolished (+{n} 🪙)", { tower: tr(st.def.name), n: refund }) };
  }

  if (d.action === "repair") {
    const missing = st.maxHp - t.hp;
    if (missing <= 0) throw new HttpError(400, tr("Already at full health"));
    const cost = Math.ceil(missing * 0.4);
    await spendCoins(u.id, cost);
    await prisma.tower.update({ where: { id: t.id }, data: { hp: st.maxHp } });
    return { message: tr("🔧 {tower} repaired (−{n} 🪙)", { tower: tr(st.def.name), n: cost }) };
  }

  // upgrade
  if (t.readyAt.getTime() > Date.now()) throw new HttpError(400, tr("Still under construction"));
  if (t.level >= TOWER_MAX_LEVEL) throw new HttpError(400, tr("Already max level"));
  const c = towerCost(t.type as TowerKey, t.level + 1);
  await spendCoins(u.id, c.coins);
  await spendScrap(u.id, c.scrap, c.coins);
  const next = towerStats({ type: t.type, level: t.level + 1 });
  await prisma.tower.update({ where: { id: t.id }, data: { level: t.level + 1, hp: next.maxHp, readyAt: new Date(Date.now() + (c.seconds * 1000) / SPEED) } });
  await questEvent(u.id, "tower");
  return { message: `${st.def.emoji} ${tr("{tower} → level {n}", { tower: tr(st.def.name), n: t.level + 1 })} (−${c.coins} 🪙)` };
});
