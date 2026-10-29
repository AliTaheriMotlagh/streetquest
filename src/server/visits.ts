// Visits to the home page: the page shows how many there have been, and how many today.
// A browser counts once per session (the page asks only then), and one network once per
// half hour, so reloading doesn't run the number up. Days are UTC days.
import { prisma } from "../lib/db";

/** One network counts at most once in this long (per server instance). */
const SAME_IP_MS = 30 * 60_000;
const seen = new Map<string, number>();

const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** Visits so far, and today's. */
export async function visitTotals(): Promise<{ total: number; today: number }> {
  const [sum, row] = await Promise.all([prisma.siteVisit.aggregate({ _sum: { count: true } }), prisma.siteVisit.findUnique({ where: { day: today() } })]);
  return { total: sum._sum.count ?? 0, today: row?.count ?? 0 };
}

/** Count a visit from this network (unless it was just counted), then the totals. */
export async function countVisit(ip: string): Promise<{ total: number; today: number; counted: boolean }> {
  const now = Date.now(), last = seen.get(ip);
  const counted = !last || now - last > SAME_IP_MS;
  if (counted) {
    seen.set(ip, now);
    if (seen.size > 50_000) for (const [k, at] of seen) if (now - at > SAME_IP_MS) seen.delete(k);
    const day = today();
    await prisma.siteVisit.upsert({ where: { day }, create: { day, count: 1 }, update: { count: { increment: 1 } } });
  }
  return { ...(await visitTotals()), counted };
}
