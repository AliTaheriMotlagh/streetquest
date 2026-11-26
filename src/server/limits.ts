// Per-player limits on actions that reach other players (rules: lib/limits.ts). Each allowed action leaves a
// Metric row ("rl:<key>", the player's id); the window's rows decide the next one. Admins aren't limited.
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { LIMITS, waitMinutes, type LimitKey } from "@/lib/limits";
import { HttpError } from "./http";

/** Counts this action against the player's limit, or refuses it (429, with how long to wait). */
export async function enforce(key: LimitKey, user: { id: string; role?: string }, now = Date.now()) {
  if (user.role === "ADMIN") return;
  const l = LIMITS[key];
  const name = `rl:${key}`;
  const rows = await prisma.metric.findMany({ where: { name, userId: user.id, createdAt: { gt: new Date(now - l.windowMs) } }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: l.max });
  const wait = waitMinutes(rows.map((r) => r.createdAt.getTime()), l.max, l.windowMs, now);
  if (wait) throw new HttpError(429, t(l.text, { n: wait }));
  await prisma.metric.create({ data: { name, userId: user.id } });
}
