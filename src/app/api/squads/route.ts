// Field armies — real-time strategy on the real map. Deploy units from your base;
// they march at unit speed (visible to everyone), guard a spot, or attack an enemy
// tower, squad, base or outpost. Orders can be changed mid-march.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM, type LatLng } from "@/lib/geo";
import { resolveOutpost } from "@/lib/outposts";
import { factionOf, SIEGE_COOLDOWN_MS, SIEGE_RANGE_M, type Army, type UnitKey } from "@/lib/rts";
import { MAX_SQUADS, squadPos, unitCount } from "@/lib/td";
import { forcesOf, loadBase, removeUnits } from "@/server/army";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { notify } from "@/server/hub";
import { questEvent } from "@/server/quests";
import { areFriends } from "@/server/rooms";
import { marchArrival, settleSquads } from "@/server/td";

const Units = z.record(z.enum(["ranger", "rocket", "tank", "artillery", "jet"]), z.number().int().min(0).max(500));
const Target = z.object({ kind: z.enum(["tower", "squad", "base", "outpost"]), id: z.string().max(60) });
const Schema = z.discriminatedUnion("action", [
  // Leave `units` out to send the whole home army.
  z.object({ action: z.literal("deploy"), units: Units.optional(), to: z.object({ lat: z.number(), lng: z.number() }).optional(), target: Target.optional() }),
  z.object({ action: z.literal("move"), squadId: z.string().max(40), to: z.object({ lat: z.number(), lng: z.number() }) }),
  z.object({ action: z.literal("attack"), squadId: z.string().max(40), target: Target }),
  z.object({ action: z.literal("recall"), squadId: z.string().max(40) }),
]);

export const GET = route(async () => {
  const u = await requireUser();
  await settleSquads({ ownerId: u.id });
  const [squads, { army }] = await Promise.all([prisma.squad.findMany({ where: { ownerId: u.id }, orderBy: { departAt: "asc" } }), forcesOf(u.id)]);
  return { squads, home: army, max: MAX_SQUADS };
});

/** Where a target is and who owns it. Validates that it can be attacked by `userId`. */
async function locate(userId: string, t: z.infer<typeof Target>): Promise<{ pos: LatLng; ownerId: string | null; name: string }> {
  if (t.kind === "tower") {
    const x = await prisma.tower.findUnique({ where: { id: t.id }, include: { owner: { select: { username: true } } } });
    if (!x) throw new HttpError(404, "That tower is gone");
    return { pos: x, ownerId: x.ownerId, name: `${x.owner.username}'s tower` };
  }
  if (t.kind === "squad") {
    const x = await prisma.squad.findUnique({ where: { id: t.id }, include: { owner: { select: { username: true } } } });
    if (!x) throw new HttpError(404, "That squad is gone");
    if (x.status !== "HOLD") throw new HttpError(400, "That squad is on the move — wait until it stops");
    return { pos: { lat: x.toLat, lng: x.toLng }, ownerId: x.ownerId, name: `${x.owner.username}'s squad` };
  }
  if (t.kind === "base") {
    const b = await loadBase({ id: t.id });
    if (!b) throw new HttpError(404, "Base not found");
    if (b.shieldUntil && b.shieldUntil > new Date()) throw new HttpError(400, "This base is under a cease-fire shield");
    const recent = await prisma.battle.findFirst({ where: { attackerId: userId, targetId: b.id, createdAt: { gt: new Date(Date.now() - SIEGE_COOLDOWN_MS) } } });
    if (recent) throw new HttpError(429, "Your army needs to regroup before hitting this base again");
    return { pos: b, ownerId: b.ownerId, name: b.name };
  }
  const site = resolveOutpost(t.id);
  if (!site) throw new HttpError(404, "Outpost not found");
  const row = await prisma.outpost.findUnique({ where: { id: site.id } });
  if (row?.shieldUntil && row.shieldUntil > new Date()) throw new HttpError(400, "Freshly captured — it's dug in for a few minutes");
  return { pos: site, ownerId: row?.ownerId ?? null, name: site.name };
}

async function checkHostile(userId: string, ownerId: string | null) {
  if (ownerId === userId) throw new HttpError(400, "That's yours");
  if (ownerId && (await areFriends(userId, ownerId))) throw new HttpError(400, "That belongs to your crew");
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (!factionOf(u.faction)) throw new HttpError(400, "Pick a faction first");
  const base = await prisma.base.findUnique({ where: { ownerId: u.id }, select: { id: true, lat: true, lng: true } });
  if (!base) throw new HttpError(400, "Plant a base first — squads deploy from it");
  await settleSquads({ ownerId: u.id });
  const inRange = (p: LatLng) => {
    if (distanceM(base, p) > SIEGE_RANGE_M) throw new HttpError(400, `Out of range — squads operate within ${SIEGE_RANGE_M / 1000} km of your base`);
  };

  if (d.action === "deploy") {
    if ((await prisma.squad.count({ where: { ownerId: u.id } })) >= MAX_SQUADS) throw new HttpError(400, `You can field at most ${MAX_SQUADS} squads — recall one first`);
    const { army, vets } = await forcesOf(u.id);
    const units: Army = {};
    for (const [k, q] of Object.entries(d.units ?? army)) {
      if (!q) continue;
      if ((army[k as UnitKey] ?? 0) < q) throw new HttpError(400, `Not enough ${k} at home`);
      units[k as UnitKey] = q;
    }
    if (!unitCount(units)) throw new HttpError(400, "Pick some units — train them at your Barracks");
    let to: LatLng;
    let order = "guard";
    let target: { kind: string; id: string } | null = null;
    let label = "";
    if (d.target) {
      const t = await locate(u.id, d.target);
      await checkHostile(u.id, t.ownerId);
      to = t.pos;
      order = "attack";
      target = d.target;
      label = t.name;
      if (t.ownerId) await notify(t.ownerId, { kind: "event", title: `🎖️ ${u.username}'s squad is marching on ${t.name}!`, body: "Send guards or build towers along the way" });
    } else if (d.to) to = d.to;
    else throw new HttpError(400, "Pick a destination or a target");
    inRange(to);
    await removeUnits(u.id, units);
    const vetsOut = Object.fromEntries(Object.keys(units).map((k) => [k, vets[k as UnitKey] ?? 0]));
    const s = await prisma.squad.create({
      data: { ownerId: u.id, units, vets: vetsOut, fromLat: base.lat, fromLng: base.lng, toLat: to.lat, toLng: to.lng, arriveAt: marchArrival(units, base, to), order, targetKind: target?.kind, targetId: target?.id },
    });
    await questEvent(u.id, "squad");
    const eta = Math.max(1, Math.round((s.arriveAt.getTime() - Date.now()) / 1000));
    return { squadId: s.id, message: `🎖️ Squad of ${unitCount(units)} deployed${label ? ` → ${label}` : ""} · ETA ${eta >= 60 ? `${Math.round(eta / 60)} min` : `${eta}s`}` };
  }

  const s = await prisma.squad.findUnique({ where: { id: d.squadId } });
  if (!s || s.ownerId !== u.id) throw new HttpError(404, "Squad not found");
  const here = s.status === "HOLD" ? { lat: s.toLat, lng: s.toLng } : squadPos(s);
  const reroute = (to: LatLng, extra: { order: string; targetKind?: string | null; targetId?: string | null }) =>
    prisma.squad.update({ where: { id: s.id }, data: { fromLat: here.lat, fromLng: here.lng, toLat: to.lat, toLng: to.lng, departAt: new Date(), arriveAt: marchArrival(s.units as Army, here, to), status: "MARCH", targetKind: null, targetId: null, ...extra } });

  if (d.action === "recall") {
    await reroute(base, { order: "return" });
    return { message: "↩️ Squad heading home" };
  }
  if (d.action === "move") {
    inRange(d.to);
    await reroute(d.to, { order: "guard" });
    return { message: "🎖️ Squad moving out" };
  }
  const t = await locate(u.id, d.target);
  await checkHostile(u.id, t.ownerId);
  inRange(t.pos);
  await reroute(t.pos, { order: "attack", targetKind: d.target.kind, targetId: d.target.id });
  if (t.ownerId) await notify(t.ownerId, { kind: "event", title: `🎖️ ${u.username}'s squad is marching on ${t.name}!`, body: "Send guards or build towers along the way" });
  return { message: `⚔️ Squad ordered to attack ${t.name}` };
});
