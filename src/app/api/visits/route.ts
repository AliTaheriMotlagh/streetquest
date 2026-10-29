// Home-page visits (server/visits.ts): no sign-in needed.
//   GET   the total and today's count
//   POST  count this visit (the page sends it once per browser session), then the counts
import { route } from "@/server/http";
import { countVisit, visitTotals } from "@/server/visits";

export const GET = route(async () => visitTotals());

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return countVisit(ip);
});
