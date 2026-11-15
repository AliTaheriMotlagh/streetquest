// POST /api/log — an error in a player's browser (components/ClientLog.tsx; rules lib/clientLog.ts).
// Anyone may send (a visitor who can't even sign in is the one we most need to hear from), so it's
// small, validated and limited per address. Kept as a Metric "client_error" row — what went wrong,
// the country (Vercel's x-vercel-ip-country) and the browser, never who — and printed to the server
// log as "[client-error] …" (Vercel: `vercel logs --query client-error`). Admin → Browser errors.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/server/http";
import { CLIENT_KINDS, rowOf, uaSummary, type ClientKind } from "@/lib/clientLog";

const Schema = z.object({ kind: z.enum(CLIENT_KINDS as [ClientKind, ...ClientKind[]]), msg: z.string().min(1).max(300), host: z.string().max(80).optional(), page: z.string().max(40).optional() });
/** Reports per address per 10 minutes (per server instance). */
const PER_IP = 30;
const seen = new Map<string, { n: number; until: number }>();

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now(), s = seen.get(ip);
  if (s && s.until > now && s.n >= PER_IP) return { ok: false };
  seen.set(ip, s && s.until > now ? { n: s.n + 1, until: s.until } : { n: 1, until: now + 600_000 });
  if (seen.size > 5000) seen.clear();
  const d = await body(req, Schema);
  const country = (req.headers.get("x-vercel-ip-country") ?? "").slice(0, 2) || null;
  const browser = uaSummary(req.headers.get("user-agent") ?? "").slice(0, 40);
  const path = rowOf(d);
  console.warn(`[client-error] ${country ?? "??"} ${browser} ${path}`);
  await prisma.metric.create({ data: { name: "client_error", path, source: country, campaign: browser } }).catch(() => {});
  return { ok: true };
});
