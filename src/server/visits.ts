// Visit analytics: the home page shows how many visits there have been and how many today; the
// admin panel gets visits, unique visitors, signed-in players and new users per day.
// A browser counts once per session (the page asks only then), and one network once per half
// hour per page kind, so reloading doesn't run the number up. Days are Asia/Tehran days.
// "Unique" means a row in VisitorSeen: a hash of (day, user id or anonymous cookie id) under a
// server secret. No IPs or raw ids are stored, and the hash differs every day.
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { dayDate, fillSeries, KEEP_DAYS, shiftDay, tehranDay, visitHashInput, type DayRow, type VisitKind } from "../lib/visits";
import { serverKey, SESSION_COOKIE, verifySession } from "./session";

/** One network counts at most once in this long (per server instance), per page kind. */
const SAME_IP_MS = 30 * 60_000;
const seen = new Map<string, number>();

export const VISITOR_COOKIE = "sq_vid";
const readCookie = (req: Request, name: string) => {
  const hit = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
};

/** Visits so far (home + game opens), today's, and today's unique visitors. */
export async function visitTotals(): Promise<{ total: number; today: number; unique: number }> {
  const day = dayDate(tehranDay());
  const [sum, row] = await Promise.all([prisma.siteVisit.aggregate({ _sum: { count: true, playOpens: true } }), prisma.siteVisit.findUnique({ where: { day } })]);
  return { total: (sum._sum.count ?? 0) + (sum._sum.playOpens ?? 0), today: (row?.count ?? 0) + (row?.playOpens ?? 0), unique: row?.visitors ?? 0 };
}

let pruned = "";
/** Drop rows older than KEEP_DAYS, at most once a day per instance. */
async function prune(today: string) {
  if (pruned === today) return;
  pruned = today;
  const before = dayDate(shiftDay(today, -KEEP_DAYS));
  await Promise.all([prisma.siteVisit.deleteMany({ where: { day: { lt: before } } }), prisma.visitorSeen.deleteMany({ where: { day: { lt: before } } })]);
}

/** Count a visit from this network (unless it was just counted) and note the visitor, then the totals. */
export async function countVisit(ip: string, kind: VisitKind = "home", who: { userId?: string | null; anonId?: string | null } = {}) {
  const now = Date.now(), key = `${kind}|${ip}`, last = seen.get(key);
  const counted = !last || now - last > SAME_IP_MS;
  const today = tehranDay(now), day = dayDate(today);
  if (counted) {
    seen.set(key, now);
    if (seen.size > 50_000) for (const [k, at] of seen) if (now - at > SAME_IP_MS) seen.delete(k);
    const inc = kind === "play" ? { playOpens: 1 } : { count: 1 };
    await prisma.siteVisit.upsert({ where: { day }, create: { day, ...inc }, update: { ...Object.fromEntries(Object.keys(inc).map((k) => [k, { increment: 1 }])) } });
  }
  if (who.userId || who.anonId) {
    const hash = createHmac("sha256", serverKey("visitors")).update(visitHashInput(today, who)).digest("hex").slice(0, 32);
    const signedIn = !!who.userId;
    // The unique key makes this a no-op for a repeat visitor; only a new row bumps the day's counters.
    const { count } = await prisma.visitorSeen.createMany({ data: [{ day, hash, signedIn }], skipDuplicates: true });
    if (count) await prisma.siteVisit.upsert({ where: { day }, create: { day, visitors: 1, players: signedIn ? 1 : 0 }, update: { visitors: { increment: 1 }, ...(signedIn ? { players: { increment: 1 } } : {}) } });
  }
  prune(today).catch(() => {});
  return { ...(await visitTotals()), counted };
}

/** The POST handler's pieces: who is visiting (session user, else the anonymous cookie, minted if absent). */
export async function visitorOf(req: Request) {
  const userId = await verifySession(readCookie(req, SESSION_COOKIE));
  const existing = readCookie(req, VISITOR_COOKIE);
  const anonId = userId ? existing : existing || randomUUID();
  return { userId, anonId, setCookie: !userId && !existing ? `${VISITOR_COOKIE}=${anonId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly` : null };
}

/** The last `days` Tehran days, oldest first, zero-filled; new users come from the User table. */
export async function visitSeries(days: number): Promise<DayRow[]> {
  const end = tehranDay(), start = shiftDay(end, -(days - 1));
  const [rows, users] = await Promise.all([
    prisma.siteVisit.findMany({ where: { day: { gte: dayDate(start) } } }),
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS d, count(*)::int AS n
      FROM "User" WHERE "createdAt" >= ${new Date(dayDate(start).getTime() - 86_400_000)} GROUP BY 1`,
  ]);
  const by = new Map<string, Partial<DayRow>>();
  for (const r of rows) by.set(r.day.toISOString().slice(0, 10), { day: r.day.toISOString().slice(0, 10), home: r.count, play: r.playOpens, visitors: r.visitors, players: r.players });
  for (const u of users) by.set(u.d, { ...by.get(u.d), day: u.d, newUsers: u.n });
  return fillSeries([...by.values()], days, end);
}
