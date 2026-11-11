// Siktir: players' "never again" marks on places. One row per player per place (PlaceDislike);
// players see counts and reasons only. Rules and aggregation: lib/siktir.ts.
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { aggregateSiktir, cleanSiktir, dislikeKey, siktirAllowed, SIKTIR_LIMITS, type SiktirInput, type SiktirReason, type SiktirRow } from "../lib/siktir";
import { HttpError } from "./http";

const asRow = (r: { key: string; lat: number; lng: number; placeKey: string | null; placeName: string; reason: string }): SiktirRow => r;

/** Make, or change, my mark on a place. Changing it is free; a new one counts against the rate limit. */
export async function saveSiktir(userId: string, input: SiktirInput) {
  const c = cleanSiktir(input);
  if ("error" in c) throw new HttpError(400, c.error);
  const d = c.ok;
  const where = { userId_key: { userId, key: d.key } };
  const old = await prisma.placeDislike.findUnique({ where });
  if (!old) {
    const recent = await prisma.placeDislike.findMany({ where: { userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } }, select: { createdAt: true } });
    const ok = siktirAllowed(recent.map((r) => r.createdAt.getTime()));
    if (!ok.ok) throw new HttpError(429, ok.error);
  }
  await prisma.placeDislike.upsert({
    where,
    create: { userId, key: d.key, lat: d.lat, lng: d.lng, placeKey: d.placeKey, placeName: d.placeName, reason: d.reason, note: d.note },
    // `hidden` stays as an admin set it: editing can't bring a hidden mark back.
    update: { reason: d.reason, note: d.note, placeName: d.placeName || undefined },
  });
  return placeSiktir(userId, d.placeKey, d);
}

export async function undoSiktir(userId: string, placeKey: string | null, p: { lat: number; lng: number }) {
  await prisma.placeDislike.deleteMany({ where: { userId, key: dislikeKey(placeKey, p) } });
  return placeSiktir(userId, placeKey, p);
}

/** Everyone's marks on one place (counts + reasons), and mine. */
export async function placeSiktir(userId: string | null, placeKey: string | null, p: { lat: number; lng: number }) {
  const key = dislikeKey(placeKey, p);
  const rows = await prisma.placeDislike.findMany({ where: { key, hidden: false }, select: { key: true, lat: true, lng: true, placeKey: true, placeName: true, reason: true } });
  const spot = aggregateSiktir(rows.map(asRow))[0];
  const mine = userId ? await prisma.placeDislike.findUnique({ where: { userId_key: { userId, key } }, select: { reason: true, note: true } }) : null;
  return { key, count: spot?.count ?? 0, reasons: spot?.reasons ?? {}, top: (spot?.top ?? []) as SiktirReason[], mine };
}

/** Marked spots inside a box (the map layer), most-said first. */
export async function siktirIn(b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  if (b.maxLat - b.minLat > SIKTIR_LIMITS.bboxMaxDeg || b.maxLng - b.minLng > SIKTIR_LIMITS.bboxMaxDeg) throw new HttpError(400, t("Zoom in to see more"));
  const rows = await prisma.placeDislike.findMany({
    where: { hidden: false, lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } },
    select: { key: true, lat: true, lng: true, placeKey: true, placeName: true, reason: true },
    take: 3000,
  });
  return aggregateSiktir(rows.map(asRow)).slice(0, SIKTIR_LIMITS.bboxMax);
}

// ---------------------------------------------------------------- admin
export async function adminSiktir(q: string) {
  const rows = await prisma.placeDislike.findMany({
    where: q ? { OR: [{ placeName: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, username: true } });
  const name = new Map(users.map((u) => [u.id, u.username]));
  const spots = new Map(aggregateSiktir(rows.filter((r) => !r.hidden).map(asRow)).map((s) => [s.key, s.count]));
  return rows.map((r) => ({ id: r.id, user: name.get(r.userId) ?? "?", lat: r.lat, lng: r.lng, placeKey: r.placeKey, placeName: r.placeName, reason: r.reason, note: r.note, hidden: r.hidden, createdAt: r.createdAt.toISOString(), spotCount: spots.get(r.key) ?? 0 }));
}

export async function adminSiktirAction(id: string, action: "hide" | "unhide" | "delete") {
  if (action === "delete") await prisma.placeDislike.delete({ where: { id } });
  else await prisma.placeDislike.update({ where: { id }, data: { hidden: action === "hide" } });
}
