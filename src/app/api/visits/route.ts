// Site visits (server/visits.ts): no sign-in needed.
//   GET   the total, today's count and today's unique visitors
//   POST  { path?: "home" | "play" } count this visit (the page sends it once per browser session), then the counts
// Per-day analytics for admins: /api/admin/visits.
import { route } from "@/server/http";
import { countVisit, visitorOf, visitTotals } from "@/server/visits";
import { visitKind } from "@/lib/visits";

export const GET = route(async () => visitTotals());

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const path = await req.json().then((b: { path?: unknown }) => b?.path).catch(() => undefined);
  const { setCookie, ...who } = await visitorOf(req);
  const res = Response.json(await countVisit(ip, visitKind(path), who));
  if (setCookie) res.headers.append("Set-Cookie", setCookie);
  return res;
});
