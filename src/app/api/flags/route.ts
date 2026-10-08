// King of the hill: plant flags on real spots, hold them for tribute, capture rivals'
// flags by standing on them for a minute while no defender is around.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { CAPTURE_BONUS, CAPTURE_SECONDS, FLAG_COST, FLAG_RADIUS_M, FLAG_SHIELD_MS, FLAG_SPACING_M, flagTribute, MAX_FLAGS } from "@/lib/flags";
import { requireUser } from "@/server/auth";
import { heroOf } from "@/server/hero";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { notify, onlineSince } from "@/server/hub";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, spendCoins, unlock } from "@/server/rewards";
import { areFriends, friendIds } from "@/server/rooms";
import { assertNotDowned } from "@/server/td";

export const GET = route(async () => {
  const u = await requireUser();
  const { bonus } = await heroOf(u);
  const flags = await prisma.flag.findMany({ where: { ownerId: u.id }, orderBy: { plantedAt: "asc" } });
  return { flags: flags.map((f) => ({ ...f, pending: flagTribute(f.collectedAt, Date.now(), bonus.income) })), max: MAX_FLAGS };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plant"), name: z.string().trim().min(2).max(24) }),
  z.object({ action: z.literal("capture"), flagId: z.string().max(40) }),
  z.object({ action: z.literal("defend"), flagId: z.string().max(40) }),
  z.object({ action: z.literal("collect") }),
  z.object({ action: z.literal("abandon"), flagId: z.string().max(40) }),
]);

/** Owner or crew standing at the flag right now. */
async function defendersAt(flag: { lat: number; lng: number; ownerId: string }) {
  const side = [flag.ownerId, ...(await friendIds(flag.ownerId))];
  const near = await prisma.user.findMany({
    where: { id: { in: side }, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: flag.lat - 0.0005, lte: flag.lat + 0.0005 }, lastLng: { gte: flag.lng - 0.0008, lte: flag.lng + 0.0008 } },
    select: { lastLat: true, lastLng: true, downedUntil: true },
  });
  return near.filter((p) => p.lastLat != null && distanceM(flag, { lat: p.lastLat, lng: p.lastLng! }) <= FLAG_RADIUS_M && !(p.downedUntil && p.downedUntil > new Date())).length;
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "collect") {
    const { bonus } = await heroOf(u);
    let total = 0;
    for (const f of await prisma.flag.findMany({ where: { ownerId: u.id } })) {
      const amt = flagTribute(f.collectedAt, Date.now(), bonus.income);
      if (amt > 0 && (await prisma.flag.updateMany({ where: { id: f.id, ownerId: u.id, collectedAt: f.collectedAt }, data: { collectedAt: new Date() } })).count) total += amt;
    }
    if (!total) throw new HttpError(400, "Nothing to collect yet — flags pay every hour you hold them");
    await grant(u.id, { coins: total, xp: Math.round(total / 5) });
    return { message: `🚩 Flag tribute: +${total} 🪙` };
  }

  await assertNotDowned(u);
  const here = await lastKnownLocation(u.id);

  if (d.action === "plant") {
    if ((await prisma.flag.count({ where: { ownerId: u.id } })) >= MAX_FLAGS) throw new HttpError(400, `You can hold at most ${MAX_FLAGS} flags`);
    const close = await prisma.flag.findMany({ where: { lat: { gte: here.lat - 0.0015, lte: here.lat + 0.0015 }, lng: { gte: here.lng - 0.0025, lte: here.lng + 0.0025 } } });
    if (close.some((f) => distanceM(here, f) < FLAG_SPACING_M)) throw new HttpError(400, `There's already a flag within ${FLAG_SPACING_M} m — capture that one instead`);
    await spendCoins(u.id, FLAG_COST);
    await prisma.flag.create({ data: { ownerId: u.id, name: d.name, lat: here.lat, lng: here.lng } });
    await unlock(u.id, "flag_plant");
    return { message: `🚩 "${d.name}" planted here (−${FLAG_COST} 🪙). Hold it to earn tribute!` };
  }

  const f = await prisma.flag.findUnique({ where: { id: d.flagId } });
  if (!f) throw new HttpError(404, "That flag is gone");

  if (d.action === "abandon") {
    if (f.ownerId !== u.id) throw new HttpError(403, "Not your flag");
    await prisma.flag.delete({ where: { id: f.id } });
    return { message: "🏳️ Flag abandoned" };
  }

  if (distanceM(here, f) > FLAG_RADIUS_M) throw new HttpError(400, `Stand within ${FLAG_RADIUS_M} m of the flag`);
  const mine = f.ownerId === u.id || (await areFriends(u.id, f.ownerId));

  if (d.action === "defend") {
    if (!mine) throw new HttpError(403, "That's not your side's flag");
    if (!f.captureStartedAt) return { message: "🛡️ The flag is safe" };
    await prisma.flag.update({ where: { id: f.id }, data: { captureById: null, captureName: null, captureStartedAt: null } });
    if (f.captureById) await notify(f.captureById, { kind: "event", title: `🛡️ ${u.username} broke your capture of "${f.name}"` });
    return { message: `🛡️ Capture stopped! "${f.name}" is safe` };
  }

  // capture
  if (mine) throw new HttpError(400, "That flag is already on your side");
  if (f.shieldUntil && f.shieldUntil > new Date()) throw new HttpError(400, "Freshly captured — it can't be flipped for a few minutes");
  const now = Date.now();
  const started = f.captureById === u.id && f.captureStartedAt ? f.captureStartedAt.getTime() : null;
  if ((await defendersAt(f)) > 0) {
    if (f.captureStartedAt) await prisma.flag.update({ where: { id: f.id }, data: { captureById: null, captureName: null, captureStartedAt: null } });
    throw new HttpError(400, "Contested! A defender is at the flag — take them down first");
  }
  if (!started) {
    await prisma.flag.update({ where: { id: f.id }, data: { captureById: u.id, captureName: u.username, captureStartedAt: new Date(now) } });
    await notify(f.ownerId, { kind: "event", title: `🚩 ${u.username} is capturing "${f.name}"!`, body: `${CAPTURE_SECONDS}s until it falls — get there to defend it` });
    return { message: `🚩 Capturing… hold your ground for ${CAPTURE_SECONDS}s`, captureEndsAt: now + CAPTURE_SECONDS * 1000 };
  }
  const left = started + CAPTURE_SECONDS * 1000 - now;
  if (left > 0) return { message: `🚩 Capturing… ${Math.ceil(left / 1000)}s left`, captureEndsAt: started + CAPTURE_SECONDS * 1000 };

  // Flip it — atomically, in case two people finish at once.
  const flip = await prisma.flag.updateMany({
    where: { id: f.id, ownerId: f.ownerId, captureById: u.id },
    data: { ownerId: u.id, heldSince: new Date(), collectedAt: new Date(), captures: { increment: 1 }, captureById: null, captureName: null, captureStartedAt: null, shieldUntil: new Date(now + FLAG_SHIELD_MS) },
  });
  if (!flip.count) throw new HttpError(409, "Someone beat you to it");
  // The new holder also takes whatever tribute the old one hadn't collected.
  const stolen = flagTribute(f.collectedAt, now);
  await grant(u.id, { coins: CAPTURE_BONUS + stolen, xp: 120 });
  await questEvent(u.id, "outpost");
  await unlock(u.id, "flag_capture");
  await notify(f.ownerId, { kind: "event", title: `🏳️ ${u.username} captured your flag "${f.name}"`, body: stolen ? `They took ${stolen} 🪙 of uncollected tribute — take it back!` : "Take it back!" });
  return { message: `🚩 "${f.name}" is yours! +${CAPTURE_BONUS + stolen} 🪙`, captured: true };
});
