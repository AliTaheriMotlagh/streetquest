// Admin-only visit analytics: ?days=30|90|365 → per-day visits, unique visitors, players, new users (Iran days).
import { route } from "@/server/http";
import { requireAdmin } from "@/server/auth";
import { visitSeries } from "@/server/visits";
import { pickRange, windowStats } from "@/lib/visits";

export const GET = route(async (req) => {
  await requireAdmin();
  const days = pickRange(new URL(req.url).searchParams.get("days"));
  const series = await visitSeries(days);
  return { days, series, today: series[series.length - 1], week: windowStats(series, 7), month: windowStats(series, 30) };
});
