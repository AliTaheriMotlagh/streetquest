// The toman wallet: my balance and cash-out requests, and asking to be paid.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { earnedToday, myCashouts, requestCashout } from "@/server/money";
import { S } from "@/lib/settings";

export const GET = route(async () => {
  const u = await requireUser();
  return { toman: u.toman, min: S.cashoutMin, enabled: S.cashoutEnabled, today: await earnedToday(u.id), dailyCap: S.moneyDailyCap, requests: await myCashouts(u.id) };
});

const Schema = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  fullName: z.string().trim().min(3).max(80),
  phone: z.string().trim().regex(/^[+\d۰-۹\s-]{8,20}$/),
  account: z.string().trim().min(16).max(40),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  return requestCashout(u, await body(req, Schema));
});
