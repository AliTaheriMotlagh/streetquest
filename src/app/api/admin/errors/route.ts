// Admin → Browser errors: ?days=1|7|30 → errors from players' browsers, grouped (lib/clientLog groupErrors),
// with how often, from which countries and browsers, and when last.
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { groupErrors } from "@/lib/clientLog";

export const GET = route(async (req) => {
  await requireAdmin();
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = [1, 7, 30].includes(asked) ? asked : 7;
  const rows = await prisma.metric.findMany({ where: { name: "client_error", createdAt: { gt: new Date(Date.now() - days * 86_400_000) } }, select: { path: true, source: true, campaign: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5000 });
  return { days, total: rows.length, groups: groupErrors(rows).slice(0, 200) };
});
