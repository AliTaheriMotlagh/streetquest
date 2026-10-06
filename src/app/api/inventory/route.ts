import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";

const Schema = z.object({ action: z.literal("sell"), itemKey: z.string(), qty: z.number().int().min(1).max(999) });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const def = ITEM_BY_KEY[d.itemKey];
  if (!def) throw new HttpError(404, "Unknown item");
  const res = await prisma.inventoryItem.updateMany({
    where: { userId: u.id, itemKey: d.itemKey, qty: { gte: d.qty } },
    data: { qty: { decrement: d.qty } },
  });
  if (!res.count) throw new HttpError(400, "You don't have that many");
  await grant(u.id, { coins: def.value * d.qty });
  return { message: `Sold ${d.qty}× ${def.name} for ${def.value * d.qty} coins` };
});
