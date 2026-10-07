import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";

// Sell one item type, or several at once from the bag's multi-select.
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sell"), itemKey: z.string(), qty: z.number().int().min(1).max(9999) }),
  z.object({ action: z.literal("sellMany"), items: z.array(z.object({ itemKey: z.string(), qty: z.number().int().min(1).max(9999) })).min(1).max(50) }),
]);

const price = (key: string) => Math.round(ITEM_BY_KEY[key].value * S.sellMult);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const list = d.action === "sell" ? [{ itemKey: d.itemKey, qty: d.qty }] : d.items;
  // merge duplicates so one item can't be counted twice
  const want = new Map<string, number>();
  for (const it of list) {
    if (!ITEM_BY_KEY[it.itemKey]) throw new HttpError(404, "Unknown item");
    want.set(it.itemKey, (want.get(it.itemKey) ?? 0) + it.qty);
  }
  let coins = 0;
  let sold = 0;
  const failed: string[] = [];
  for (const [itemKey, qty] of want) {
    const res = await prisma.inventoryItem.updateMany({ where: { userId: u.id, itemKey, qty: { gte: qty } }, data: { qty: { decrement: qty } } });
    if (!res.count) {
      failed.push(ITEM_BY_KEY[itemKey].name);
      continue;
    }
    coins += price(itemKey) * qty;
    sold += qty;
  }
  if (!sold) throw new HttpError(400, "You don't have that many");
  await prisma.inventoryItem.deleteMany({ where: { userId: u.id, qty: { lte: 0 } } });
  await grant(u.id, { coins }, { raw: true });
  const what = want.size === 1 && !failed.length ? `${sold}× ${ITEM_BY_KEY[[...want.keys()][0]].name}` : `${sold} items`;
  return { message: `💰 Sold ${what} for ${coins.toLocaleString()} coins${failed.length ? ` (skipped: ${failed.join(", ")})` : ""}`, coins };
});
