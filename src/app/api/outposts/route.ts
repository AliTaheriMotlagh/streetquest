// Territory control: assault outposts with your army, garrison them, collect tribute.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { pendingTribute, resolveOutpost } from "@/lib/outposts";
import { factionOf, FACTIONS, SIEGE_RANGE_M, type Army } from "@/lib/rts";
import { addUnits, forcesOf, loadBase, removeUnits } from "@/server/army";
import { requireUser } from "@/server/auth";
import { heroOf } from "@/server/hero";
import { body, HttpError, route } from "@/server/http";
import { assaultOutpost, homeForce } from "@/server/warfare";
import { grant } from "@/server/rewards";

const COOLDOWN_MS = 20 * 60_000;
const MAX_GARRISON = 60;
const count = (a: Army) => Object.values(a).reduce((s, q) => s + (q ?? 0), 0);

export const GET = route(async () => {
  const u = await requireUser();
  const { bonus } = await heroOf(u);
  const [mine, held] = await Promise.all([
    prisma.outpost.findMany({ where: { ownerId: u.id } }),
    prisma.outpost.findMany({ where: { ownerId: { not: null } }, select: { owner: { select: { faction: true } } } }),
  ]);
  const war = FACTIONS.map((f) => ({ faction: f.key, outposts: held.filter((h) => h.owner?.faction === f.key).length })).sort((a, b) => b.outposts - a.outposts);
  return {
    outposts: mine.map((o) => {
      const site = resolveOutpost(o.id);
      return { id: o.id, name: site?.name ?? o.id, lat: site?.lat, lng: site?.lng, garrison: o.garrison as Army, pending: pendingTribute(o.collectedAt, o.capturedAt, bonus.income) };
    }),
    war,
  };
});

const Schema = z.object({
  action: z.enum(["assault", "station", "withdraw", "collect"]),
  outpostId: z.string().max(40).optional(),
  unit: z.enum(["ranger", "rocket", "tank", "artillery", "jet"]).optional(),
  qty: z.number().int().min(1).max(50).optional(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const hero = await heroOf(u);

  if (d.action === "collect") {
    const mine = await prisma.outpost.findMany({ where: { ownerId: u.id } });
    let total = 0;
    for (const o of mine) {
      const amt = pendingTribute(o.collectedAt, o.capturedAt, hero.bonus.income);
      if (amt <= 0) continue;
      const res = await prisma.outpost.updateMany({ where: { id: o.id, ownerId: u.id, collectedAt: o.collectedAt }, data: { collectedAt: new Date() } });
      if (res.count) total += amt;
    }
    if (!total) throw new HttpError(400, "No tribute yet — hold outposts to earn it");
    await grant(u.id, { coins: total, xp: Math.round(total / 10) });
    return { message: `🚩 Tribute collected: +${total} 🪙` };
  }

  const site = d.outpostId ? resolveOutpost(d.outpostId) : null;
  if (!site) throw new HttpError(404, "Outpost not found");
  const row = await prisma.outpost.findUnique({ where: { id: site.id } });

  if (d.action === "station" || d.action === "withdraw") {
    if (row?.ownerId !== u.id) throw new HttpError(403, "You don't hold this outpost");
    const g = { ...(row.garrison as Army) };
    if (d.action === "withdraw") {
      for (const [k, q] of Object.entries(g)) if (q) await addUnits(u.id, k, q);
      await prisma.outpost.update({ where: { id: site.id }, data: { garrison: {} } });
      return { message: `↩️ Garrison of ${site.name} returned to your army` };
    }
    if (!d.unit || !d.qty) throw new HttpError(400, "Pick a unit and amount");
    const { army } = await forcesOf(u.id);
    if ((army[d.unit] ?? 0) < d.qty) throw new HttpError(400, "Not enough units in your army");
    if (count(g) + d.qty > MAX_GARRISON) throw new HttpError(400, `Garrisons hold at most ${MAX_GARRISON} units`);
    await removeUnits(u.id, { [d.unit]: d.qty });
    g[d.unit] = (g[d.unit] ?? 0) + d.qty;
    await prisma.outpost.update({ where: { id: site.id }, data: { garrison: g } });
    return { message: `🚩 Stationed ${d.qty} ${d.unit} at ${site.name}` };
  }

  // assault
  const f = factionOf(u.faction);
  if (!f) throw new HttpError(400, "Pick a faction first");
  const myBase = await loadBase({ ownerId: u.id });
  if (!myBase) throw new HttpError(400, "Plant a base first — armies march from it");
  if (distanceM(myBase, site) > SIEGE_RANGE_M) throw new HttpError(400, `Out of range — ${SIEGE_RANGE_M / 1000} km from your base max`);
  if (row?.ownerId === u.id) throw new HttpError(400, "You already hold it");
  if (row?.shieldUntil && row.shieldUntil > new Date()) throw new HttpError(400, "Freshly captured — it's dug in for a few minutes");
  const recent = await prisma.battle.findFirst({ where: { attackerId: u.id, targetId: site.id, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } } });
  if (recent) throw new HttpError(429, "Your army is regrouping — try this outpost again later");
  if (!count((await forcesOf(u.id)).army)) throw new HttpError(400, "You have no army — train units first");

  return assaultOutpost(u, await homeForce(u.id), site);
});
