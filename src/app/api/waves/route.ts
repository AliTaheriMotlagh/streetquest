// Raider waves (tower defense): watch one live, call in airstrikes, or provoke a
// wave against your own base for bigger bounties.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { PROVOKE_COOLDOWN_MS, PROVOKE_DELAY_MS, STRIKE_COOLDOWN_MS, STRIKE_RANGE_M, STRIKES_PER_WAVE, type Strike } from "@/lib/td";
import { loadBase } from "@/server/army";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { notify, onlineSince } from "@/server/hub";
import { lastKnownLocation } from "@/server/rewards";
import { areFriends, friendIds } from "@/server/rooms";
import { assertNotDowned, createWave, resolveWaves } from "@/server/td";

export const GET = route(async (req) => {
  await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  const w = id ? await prisma.wave.findUnique({ where: { id } }) : null;
  if (!w) throw new HttpError(404, "Wave not found");
  if (!w.resolvedAt && w.endAt <= new Date()) {
    await resolveWaves([w.baseId]);
    return { wave: await prisma.wave.findUnique({ where: { id: w.id } }), now: Date.now() };
  }
  return { wave: w, now: Date.now() };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("provoke") }),
  z.object({ action: z.literal("strike"), waveId: z.string().max(40), lat: z.number(), lng: z.number() }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "provoke") {
    const base = await loadBase({ ownerId: u.id });
    if (!base) throw new HttpError(400, "Plant a base first");
    const recent = await prisma.wave.findFirst({ where: { baseId: base.id, boost: { gt: 1 }, createdAt: { gt: new Date(Date.now() - PROVOKE_COOLDOWN_MS) } } });
    if (recent) throw new HttpError(429, "The raiders are still licking their wounds — try again in a few minutes");
    const open = await prisma.wave.findFirst({ where: { baseId: base.id, resolvedAt: null } });
    if (open && open.startAt <= new Date()) throw new HttpError(400, "A wave is already underway!");
    if (open) await prisma.wave.delete({ where: { id: open.id } });
    const w = await createWave(base, Date.now() + PROVOKE_DELAY_MS, 1.5);
    // Rally the crew: friends online get the call.
    const friends = await prisma.user.findMany({ where: { id: { in: await friendIds(u.id) }, lastSeenAt: { gt: onlineSince() } }, select: { id: true } });
    for (const f of friends) await notify(f.id, { kind: "event", title: `🏴‍☠️ Raiders are coming for ${base.name}!`, body: `${u.username} needs defenders in 1 min — towers and airstrikes near the base count` });
    return { waveId: w.id, message: "📯 You provoked the raiders — they attack in 60 s. Bounties ×1.5!" };
  }

  // airstrike
  const w = await prisma.wave.findUnique({ where: { id: d.waveId } });
  if (!w) throw new HttpError(404, "Wave not found");
  const now = Date.now();
  if (w.resolvedAt || now < w.startAt.getTime() || now > w.endAt.getTime()) throw new HttpError(400, "No raiders in the field right now");
  const base = await prisma.base.findUnique({ where: { id: w.baseId } });
  if (!base) throw new HttpError(404, "Base not found");
  if (base.ownerId !== u.id && !(await areFriends(u.id, base.ownerId))) throw new HttpError(403, "Only the owner and their crew can call strikes here");
  await assertNotDowned(u);
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, base) > STRIKE_RANGE_M) throw new HttpError(400, `Get within ${STRIKE_RANGE_M} m of the base to call in airstrikes`);
  if (distanceM(base, d) > 800) throw new HttpError(400, "That's too far from the fight");
  const mine = ((w.strikes as Strike[]) ?? []).filter((s) => s.by === u.id);
  if (mine.length >= STRIKES_PER_WAVE) throw new HttpError(400, "Out of airstrikes for this wave");
  if (mine.some((s) => now - s.t < STRIKE_COOLDOWN_MS)) throw new HttpError(429, "Bombers are rearming…");
  const entry = JSON.stringify([{ by: u.id, name: u.username, t: now, lat: d.lat, lng: d.lng }]);
  await prisma.$executeRaw`UPDATE "Wave" SET strikes = strikes || ${entry}::jsonb WHERE id = ${w.id}`;
  return { message: `✈️ Airstrike inbound! (${STRIKES_PER_WAVE - mine.length - 1} left)` };
});
