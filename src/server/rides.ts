// Ride hailing helpers shared by the rides API, the map and the daily cron.
import { prisma } from "../lib/db";
import { RIDE_REQUEST_TTL_MS } from "../lib/rides";
import { notify } from "./hub";
import { t } from "../lib/i18n";

/**
 * Requests nobody picked up in time are cancelled and the fare refunded. Runs lazily
 * (whenever riders look at their rides) and from the daily cron for everyone else.
 */
export async function expireRides(where: { riderId?: string } = {}) {
  const stale = await prisma.ride.findMany({
    where: { ...where, status: "REQUESTED", createdAt: { lt: new Date(Date.now() - RIDE_REQUEST_TTL_MS) } },
    take: 200,
  });
  let n = 0;
  for (const r of stale) {
    // Conditional move: a driver accepting at the same moment wins, and nothing is refunded twice.
    if (!(await prisma.ride.updateMany({ where: { id: r.id, status: "REQUESTED" }, data: { status: "CANCELLED", endedAt: new Date() } })).count) continue;
    await prisma.user.update({ where: { id: r.riderId }, data: { coins: { increment: r.fare } } });
    await notify(r.riderId, () => ({ kind: "delivery", title: t("🚕 No driver found"), body: t("Your ride to {place} expired — {n} coins refunded", { place: r.dropoffLabel, n: r.fare }) }));
    n++;
  }
  return n;
}
