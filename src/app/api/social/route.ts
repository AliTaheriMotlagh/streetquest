// The social network: the feed (following / nearby / trending / one player), profiles,
// people to follow, comments — and posting, liking, commenting, following, reporting.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { S } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { grant } from "@/server/rewards";
import { nearestPlace } from "@/server/places";
import { BIO_MAX, COMMENT_MAX, feed, HIDE_AT_REPORTS, like, POST_MAX, profile, promotedNear, round, suggestions, type FeedTab } from "@/server/social";

const num = (v: string | null) => (v == null || v === "" ? NaN : Number(v));

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const lat = num(sp.get("lat")), lng = num(sp.get("lng"));
  const here = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : u.lastLat != null && u.lastLng != null ? { lat: u.lastLat, lng: u.lastLng } : null;
  const view = sp.get("view") ?? "feed";

  if (view === "profile") {
    const id = sp.get("id") ?? u.id;
    const p = await profile(u.id, id);
    if (!p) throw new HttpError(404, t("Player not found"));
    return { profile: p, ...(await feed(u.id, { tab: "user", userId: id, here })) };
  }
  if (view === "comments") {
    const postId = sp.get("postId") ?? "";
    const rows = await prisma.postComment.findMany({ where: { postId }, orderBy: { createdAt: "asc" }, take: 100, include: { author: { select: { id: true, username: true, avatar: true, xp: true } } } });
    return { comments: rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), mine: c.authorId === u.id, author: { id: c.author.id, username: c.author.username, avatar: c.author.avatar, level: levelForXp(c.author.xp) } })) };
  }
  if (view === "people") return { people: await suggestions(u.id, here) };
  if (view === "follows") {
    const id = sp.get("id") ?? u.id;
    const followers = sp.get("side") !== "following";
    const rows = await prisma.follow.findMany({
      where: followers ? { followeeId: id } : { followerId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { follower: { select: { id: true, username: true, avatar: true, xp: true } }, followee: { select: { id: true, username: true, avatar: true, xp: true } } },
    });
    return { people: rows.map((r) => (followers ? r.follower : r.followee)).map((p) => ({ id: p.id, username: p.username, avatar: p.avatar, level: levelForXp(p.xp) })) };
  }

  const tab = (["following", "nearby", "trending"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "following") as FeedTab;
  const before = sp.get("before") ? new Date(sp.get("before")!) : undefined;
  const res = await feed(u.id, { tab, before: before && !Number.isNaN(before.getTime()) ? before : undefined, here });
  const promoted = tab === "nearby" && !before && here ? await promotedNear(here) : [];
  return { ...res, promoted };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("post"), body: z.string().trim().max(POST_MAX).default(""), photo: z.string().max(MAX_PHOTO_DATA_URL).optional(), checkin: z.boolean().default(false), nearby: z.boolean().default(true) }),
  z.object({ action: z.literal("delete"), postId: z.string() }),
  z.object({ action: z.literal("like"), postId: z.string(), on: z.boolean() }),
  z.object({ action: z.literal("comment"), postId: z.string(), body: z.string().trim().min(1).max(COMMENT_MAX) }),
  z.object({ action: z.literal("uncomment"), commentId: z.string() }),
  z.object({ action: z.literal("report"), postId: z.string() }),
  z.object({ action: z.literal("follow"), userId: z.string(), on: z.boolean() }),
  z.object({ action: z.literal("bio"), bio: z.string().trim().max(BIO_MAX) }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (!S.socialEnabled && d.action !== "delete") throw new HttpError(400, t("The social feed is switched off right now"));

  if (d.action === "post") {
    if (!d.body && !d.photo && !d.checkin) throw new HttpError(400, t("Write something or add a photo"));
    const recent = await prisma.post.count({ where: { authorId: u.id, kind: { in: ["post", "checkin"] }, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= S.socialPostsPerHour) throw new HttpError(429, t("You can post {n} times an hour — take a breather", { n: S.socialPostsPerHour }));
    const photo = d.photo ? decodePhoto(d.photo) : null;
    // Location only from the server-trusted fix, and only to ~100 m (or the place you checked in at).
    const fresh = u.lastLat != null && u.lastLng != null && u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 5 * 60_000 ? { lat: u.lastLat, lng: u.lastLng } : null;
    const place = d.checkin ? (fresh ? await nearestPlace(fresh, 80) : null) : null;
    if (d.checkin && !place) throw new HttpError(400, t("No place to check in at here — walk up to a shop, café or park"));
    const at = place ?? (d.nearby ? fresh : null);
    const p = await prisma.post.create({
      data: { authorId: u.id, kind: place ? "checkin" : "post", body: d.body, placeName: place?.name ?? null, placeCat: place?.cat ?? null, lat: at ? round(at.lat) : null, lng: at ? round(at.lng) : null, photo: photo?.bytes, photoType: photo?.type },
    });
    // A little XP for the first posts of the day, not for spamming.
    const today = await prisma.post.count({ where: { authorId: u.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
    if (today <= 3) await grant(u.id, { xp: photo ? 20 : 8 });
    return { message: place ? t("📍 Checked in at {place}", { place: place.name }) : t("✅ Posted"), id: p.id };
  }
  if (d.action === "delete") {
    const p = await prisma.post.findUnique({ where: { id: d.postId }, select: { authorId: true } });
    if (!p) throw new HttpError(404, t("Post not found"));
    if (p.authorId !== u.id && u.role !== "ADMIN") throw new HttpError(403, t("That's not your post"));
    await prisma.post.delete({ where: { id: d.postId } });
    return { message: t("Post deleted") };
  }
  if (d.action === "like") {
    const r = await like(u.id, u.username, d.postId, d.on);
    if (!r) throw new HttpError(404, t("Post not found"));
    return { likes: r.likes };
  }
  if (d.action === "comment") {
    const p = await prisma.post.findUnique({ where: { id: d.postId }, select: { authorId: true, hidden: true } });
    if (!p || p.hidden) throw new HttpError(404, t("Post not found"));
    const recent = await prisma.postComment.count({ where: { authorId: u.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 5) throw new HttpError(429, t("Slow down a little"));
    await prisma.postComment.create({ data: { postId: d.postId, authorId: u.id, body: d.body } });
    const r = await prisma.post.update({ where: { id: d.postId }, data: { comments: { increment: 1 } }, select: { comments: true } });
    if (p.authorId !== u.id) await notify(p.authorId, () => ({ kind: "social", title: t("💬 {name} commented on your post", { name: u.username }), body: d.body.slice(0, 120) }));
    return { comments: r.comments };
  }
  if (d.action === "uncomment") {
    const c = await prisma.postComment.findUnique({ where: { id: d.commentId } });
    if (!c) throw new HttpError(404, t("Comment not found"));
    const post = await prisma.post.findUnique({ where: { id: c.postId }, select: { authorId: true } });
    // Your own comment, or any comment under your post.
    if (c.authorId !== u.id && post?.authorId !== u.id && u.role !== "ADMIN") throw new HttpError(403, t("That's not your comment"));
    await prisma.postComment.delete({ where: { id: c.id } });
    await prisma.post.update({ where: { id: c.postId }, data: { comments: { decrement: 1 } } });
    return { message: t("Comment deleted") };
  }
  if (d.action === "report") {
    const made = await prisma.postReport.create({ data: { postId: d.postId, userId: u.id } }).then(() => true).catch(() => false);
    if (made) {
      const p = await prisma.post.update({ where: { id: d.postId }, data: { reports: { increment: 1 } }, select: { reports: true } });
      if (p.reports >= HIDE_AT_REPORTS) await prisma.post.update({ where: { id: d.postId }, data: { hidden: true } });
    }
    return { message: t("Thanks — we'll take a look") };
  }
  if (d.action === "follow") {
    if (d.userId === u.id) throw new HttpError(400, t("You can't follow yourself"));
    if (d.on) {
      const target = await prisma.user.findUnique({ where: { id: d.userId }, select: { id: true, banned: true } });
      if (!target || target.banned) throw new HttpError(404, t("Player not found"));
      const made = await prisma.follow.create({ data: { followerId: u.id, followeeId: d.userId } }).then(() => true).catch(() => false);
      if (made) await notify(d.userId, () => ({ kind: "social", title: t("👋 {name} started following you", { name: u.username }) }));
      return { message: t("Following") };
    }
    await prisma.follow.deleteMany({ where: { followerId: u.id, followeeId: d.userId } });
    return { message: t("Unfollowed") };
  }
  // bio
  await prisma.user.update({ where: { id: u.id }, data: { bio: d.bio } });
  return { message: t("Saved") };
});
