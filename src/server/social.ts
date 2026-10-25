// The social network: posts, follows, likes and comments, and the feed tabs.
// Moments the game posts for a player (a delivery done, a store visited) are stored as
// a translatable template + values in `body`, so every reader sees them in their own
// language; what players write is shown as written.
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { levelForXp } from "../lib/progression";
import { activePlan } from "../lib/business";
import { notify } from "./hub";
import { t } from "../lib/i18n";

export const FEED_PAGE = 20;
export const POST_MAX = 500;
export const COMMENT_MAX = 300;
export const BIO_MAX = 160;
/** Reports that hide a post until an admin looks at it. */
export const HIDE_AT_REPORTS = 3;
const NEARBY_M = 6000;
const AUTO_POST_GAP_MS = 20 * 60_000;

export type AutoBody = { t: string; v?: Record<string, string | number> };

const authorSelect = { id: true, username: true, avatar: true, xp: true } as const;
type Row = {
  id: string;
  authorId: string;
  kind: string;
  body: string;
  placeName: string | null;
  placeCat: string | null;
  lat: number | null;
  lng: number | null;
  photoType: string | null;
  likes: number;
  comments: number;
  createdAt: Date;
  author: { id: string; username: string; avatar: string; xp: number };
};
const rowSelect = { id: true, authorId: true, kind: true, body: true, placeName: true, placeCat: true, lat: true, lng: true, photoType: true, likes: true, comments: true, createdAt: true, author: { select: authorSelect } } as const;

export type PostView = {
  id: string;
  kind: string;
  body: string;
  auto: AutoBody | null;
  place: { name: string; cat: string | null } | null;
  hasPhoto: boolean;
  likes: number;
  comments: number;
  liked: boolean;
  mine: boolean;
  createdAt: string;
  distanceM: number | null;
  author: { id: string; username: string; avatar: string; level: number };
};

function parseAuto(kind: string, body: string): AutoBody | null {
  if (kind === "post" || kind === "checkin") return null;
  try {
    const v = JSON.parse(body) as AutoBody;
    return typeof v?.t === "string" ? v : null;
  } catch {
    return null;
  }
}

async function views(rows: Row[], viewerId: string, here?: LatLng | null): Promise<PostView[]> {
  const liked = new Set((await prisma.postLike.findMany({ where: { userId: viewerId, postId: { in: rows.map((r) => r.id) } }, select: { postId: true } })).map((l) => l.postId));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.kind === "post" || r.kind === "checkin" ? r.body : "",
    auto: parseAuto(r.kind, r.body),
    place: r.placeName ? { name: r.placeName, cat: r.placeCat } : null,
    hasPhoto: !!r.photoType,
    likes: r.likes,
    comments: r.comments,
    liked: liked.has(r.id),
    mine: r.authorId === viewerId,
    createdAt: r.createdAt.toISOString(),
    distanceM: here && r.lat != null && r.lng != null ? Math.round(distanceM(here, { lat: r.lat, lng: r.lng })) : null,
    author: { id: r.author.id, username: r.author.username, avatar: r.author.avatar, level: levelForXp(r.author.xp) },
  }));
}

export type FeedTab = "following" | "nearby" | "trending" | "user";

export async function feed(viewerId: string, opts: { tab: FeedTab; before?: Date; userId?: string; here?: LatLng | null }) {
  const base = { hidden: false, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) };
  let where: object = base;
  let orderBy: object[] = [{ createdAt: "desc" }];
  if (opts.tab === "following") {
    const ids = (await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } })).map((f) => f.followeeId);
    where = { ...base, authorId: { in: [viewerId, ...ids] } };
  } else if (opts.tab === "nearby") {
    if (!opts.here) return { posts: [], next: null };
    const b = bbox(opts.here, NEARBY_M);
    where = { ...base, lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } };
  } else if (opts.tab === "trending") {
    where = { ...base, createdAt: { gt: new Date(Date.now() - 3 * 86_400_000), ...(opts.before ? { lt: opts.before } : {}) } };
    orderBy = [{ likes: "desc" }, { comments: "desc" }, { createdAt: "desc" }];
  } else {
    where = { ...base, authorId: opts.userId ?? viewerId };
  }
  const rows = await prisma.post.findMany({ where, orderBy, take: FEED_PAGE, select: rowSelect });
  // Trending is ranked, not chronological: it's one page.
  const next = opts.tab !== "trending" && rows.length === FEED_PAGE ? rows[rows.length - 1].createdAt.toISOString() : null;
  return { posts: await views(rows, viewerId, opts.here), next };
}

/** Featured businesses' running campaigns near the player: the promoted cards on top of the nearby feed. */
export async function promotedNear(here: LatLng) {
  const b = bbox(here, NEARBY_M);
  const now = new Date();
  const rows = await prisma.business.findMany({
    where: { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng }, plan: { in: ["pro", "chain"] }, planUntil: { gt: now } },
    include: { campaigns: { where: { paused: false, activeFrom: { lte: now }, activeTo: { gt: now } }, orderBy: { createdAt: "desc" }, take: 1 } },
    take: 10,
  });
  return rows
    .filter((r) => activePlan(r).feed && r.campaigns.length)
    .map((r) => ({ businessId: r.id, name: r.name, emoji: r.emoji, category: r.category, lat: r.lat, lng: r.lng, distanceM: Math.round(distanceM(here, r)), campaign: { id: r.campaigns[0].id, title: r.campaigns[0].title, offer: r.campaigns[0].offer, rewardCoins: r.campaigns[0].rewardCoins } }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2);
}

/**
 * The game posts a moment for the player (at most one every 20 minutes, so a busy
 * session doesn't flood their followers).
 */
export async function autoPost(userId: string, kind: "mission" | "business", body: AutoBody, place?: { name: string; cat?: string | null; lat: number; lng: number }) {
  const recent = await prisma.post.findFirst({ where: { authorId: userId, kind: { in: ["mission", "business"] }, createdAt: { gt: new Date(Date.now() - AUTO_POST_GAP_MS) } }, select: { id: true } });
  if (recent) return;
  await prisma.post
    .create({ data: { authorId: userId, kind, body: JSON.stringify(body), placeName: place?.name ?? null, placeCat: place?.cat ?? null, lat: place ? round(place.lat) : null, lng: place ? round(place.lng) : null } })
    .catch(() => {});
}

/** ~100 m: enough for "nearby", not enough to find someone's door. */
export const round = (v: number) => Math.round(v * 1000) / 1000;

export async function profile(viewerId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatar: true, bio: true, xp: true, walkedM: true, stepsTotal: true, createdAt: true, faction: true, banned: true } });
  if (!u || u.banned) return null;
  const [followers, following, posts, isFollowing, followsYou, visits, deliveries] = await Promise.all([
    prisma.follow.count({ where: { followeeId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.post.count({ where: { authorId: userId, hidden: false } }),
    viewerId === userId ? false : prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: userId } } }).then(Boolean),
    viewerId === userId ? false : prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: viewerId } } }).then(Boolean),
    prisma.bizVisit.count({ where: { userId } }),
    prisma.missionRun.count({ where: { userId, status: "DONE" } }),
  ]);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    level: levelForXp(u.xp),
    faction: u.faction,
    memberSince: u.createdAt.toISOString(),
    followers,
    following,
    posts,
    isFollowing,
    followsYou,
    me: viewerId === userId,
    stats: { walkedM: Math.round(u.walkedM), steps: u.stepsTotal, visits, deliveries },
  };
}

/** People to follow: active players around you, then the most followed. */
export async function suggestions(viewerId: string, here: LatLng | null) {
  const already = new Set((await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } })).map((f) => f.followeeId));
  already.add(viewerId);
  const out: { id: string; username: string; avatar: string; level: number; followers: number; distanceM: number | null; reason: string }[] = [];
  if (here) {
    const b = bbox(here, 10_000);
    const near = await prisma.user.findMany({
      where: { banned: false, id: { notIn: [...already] }, lastSeenAt: { gt: new Date(Date.now() - 7 * 86_400_000) }, lastLat: { gte: b.minLat, lte: b.maxLat }, lastLng: { gte: b.minLng, lte: b.maxLng } },
      select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true, _count: { select: { followers: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: 12,
    });
    // Distance in whole kilometres only: suggestions must never pinpoint anyone.
    for (const u of near) out.push({ id: u.id, username: u.username, avatar: u.avatar, level: levelForXp(u.xp), followers: u._count.followers, distanceM: Math.max(1000, Math.round(distanceM(here, { lat: u.lastLat!, lng: u.lastLng! }) / 1000) * 1000), reason: "near" });
  }
  const top = await prisma.user.findMany({
    where: { banned: false, id: { notIn: [...already, ...out.map((o) => o.id)] }, followers: { some: {} } },
    select: { id: true, username: true, avatar: true, xp: true, _count: { select: { followers: true } } },
    orderBy: { followers: { _count: "desc" } },
    take: 8,
  });
  for (const u of top) out.push({ id: u.id, username: u.username, avatar: u.avatar, level: levelForXp(u.xp), followers: u._count.followers, distanceM: null, reason: "popular" });
  return out;
}

const LIKE_MILESTONES = new Set([1, 5, 10, 25, 50, 100, 250, 500, 1000]);

export async function like(userId: string, username: string, postId: string, on: boolean) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, hidden: true } });
  if (!post || post.hidden) return null;
  if (on) {
    const made = await prisma.postLike.create({ data: { postId, userId } }).then(() => true).catch(() => false);
    if (!made) return prisma.post.findUnique({ where: { id: postId }, select: { likes: true } });
    const p = await prisma.post.update({ where: { id: postId }, data: { likes: { increment: 1 } }, select: { likes: true } });
    if (post.authorId !== userId && LIKE_MILESTONES.has(p.likes)) {
      await notify(post.authorId, () => ({ kind: "social", title: p.likes === 1 ? t("❤️ {name} liked your post", { name: username }) : t("❤️ Your post has {n} likes", { n: p.likes }) }));
    }
    return p;
  }
  const gone = await prisma.postLike.deleteMany({ where: { postId, userId } });
  if (!gone.count) return prisma.post.findUnique({ where: { id: postId }, select: { likes: true } });
  return prisma.post.update({ where: { id: postId }, data: { likes: { decrement: 1 } }, select: { likes: true } });
}
