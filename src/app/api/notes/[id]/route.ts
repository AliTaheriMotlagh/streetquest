// A post's photo (only for players standing within its radius, or the author) and
// reactions: like (pays the author XP) or report (3 reports hide it for moderation).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { grant, unlock } from "@/server/rewards";

const REPORTS_TO_HIDE = 3;

const trusted = (u: { lastLat: number | null; lastLng: number | null; lastSeenAt: Date | null }) =>
  u.lastLat != null && u.lastLng != null && u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 120_000 ? { lat: u.lastLat, lng: u.lastLng } : null;

export const GET = route(async (_req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const n = await prisma.geoNote.findUnique({ where: { id }, select: { authorId: true, lat: true, lng: true, radiusM: true, hidden: true, photo: true, photoType: true, expiresAt: true } });
  if (!n?.photo || n.hidden || n.expiresAt < new Date()) throw new HttpError(404, "No photo");
  const here = trusted(u);
  if (n.authorId !== u.id && (!here || distanceM(here, n) > n.radiusM)) throw new HttpError(403, "Walk there to see it");
  return new Response(new Uint8Array(n.photo), { headers: { "content-type": n.photoType ?? "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
});

const Schema = z.object({ kind: z.enum(["like", "report"]) });

export const POST = route(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const d = await body(req, Schema);
  const n = await prisma.geoNote.findUnique({ where: { id } });
  if (!n || n.hidden) throw new HttpError(404, "Post not found");
  if (n.authorId === u.id) throw new HttpError(400, "That's your own post");
  const added = await prisma.noteReaction.create({ data: { noteId: id, userId: u.id, kind: d.kind } }).catch(() => null);
  if (!added) throw new HttpError(409, d.kind === "like" ? "Already liked" : "Already reported");
  if (d.kind === "report") {
    const r = await prisma.geoNote.update({ where: { id }, data: { reports: { increment: 1 } } });
    if (r.reports >= REPORTS_TO_HIDE) await prisma.geoNote.update({ where: { id }, data: { hidden: true } });
    return { message: "🚩 Reported — thanks. Moderators will take a look" };
  }
  const r = await prisma.geoNote.update({ where: { id }, data: { likes: { increment: 1 } } });
  await grant(n.authorId, { xp: 10 });
  if (r.likes === 10) await unlock(n.authorId, "liked_10");
  if (r.likes === 1 || r.likes % 5 === 0) await notify(n.authorId, { kind: "social", title: `❤️ ${u.username} liked your post`, body: `${r.likes} like${r.likes > 1 ? "s" : ""} · +10 XP` });
  return { message: "❤️ Liked", likes: r.likes };
});
