// Territory control: assault outposts with your army, garrison them, collect tribute.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { outpostLabel, pendingTribute, resolveOutpost } from "@/lib/outposts";
import { factionOf, FACTIONS, SIEGE_RANGE_M, UNIT_BY_KEY, type Army, type UnitKey } from "@/lib/rts";
import { addUnits, forcesOf, loadBase, removeUnits } from "@/server/army";
import { requireUser } from "@/server/auth";
import { heroOf } from "@/server/hero";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { assaultOutpost, homeForce } from "@/server/warfare";
import { grant } from "@/server/rewards";
import { t } from "@/lib/i18n";

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

export const POST = actionRoute(async (req) => {
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
    if (!total) throw new HttpError(400, t("No tribute yet — hold outposts to earn it"));
    await grant(u.id, { coins: total, xp: Math.round(total / 10) });
    return { message: t("🚩 Tribute collected: +{n} 🪙", { n: total }) };
  }

  const site = d.outpostId ? resolveOutpost(d.outpostId) : null;
  if (!site) throw new HttpError(404, t("Outpost not found"));
  const row = await prisma.outpost.findUnique({ where: { id: site.id } });

  if (d.action === "station" || d.action === "withdraw") {
    if (row?.ownerId !== u.id) throw new HttpError(403, t("You don't hold this outpost"));
    const g = { ...(row.garrison as Army) };
    if (d.action === "withdraw") {
      for (const [k, q] of Object.entries(g)) if (q) await addUnits(u.id, k, q);
      await prisma.outpost.update({ where: { id: site.id }, data: { garrison: {} } });
      return { message: t("↩️ Garrison of {name} returned to your army", { name: outpostLabel(site.name) }) };
    }
    if (!d.unit || !d.qty) throw new HttpError(400, t("Pick a unit and amount"));
    const { army } = await forcesOf(u.id);
    if ((army[d.unit] ?? 0) < d.qty) throw new HttpError(400, t("Not enough units in your army"));
    if (count(g) + d.qty > MAX_GARRISON) throw new HttpError(400, t("Garrisons hold at most {n} units", { n: MAX_GARRISON }));
    await removeUnits(u.id, { [d.unit]: d.qty });
    g[d.unit] = (g[d.unit] ?? 0) + d.qty;
    await prisma.outpost.update({ where: { id: site.id }, data: { garrison: g } });
    return { message: t("🚩 Stationed {n} {unit} at {name}", { n: d.qty, unit: t(UNIT_BY_KEY[d.unit as UnitKey]?.name ?? d.unit), name: outpostLabel(site.name) }) };
  }

  // assault
  const f = factionOf(u.faction);
  if (!f) throw new HttpError(400, t("Pick a faction first"));
  const myBase = await loadBase({ ownerId: u.id });
  if (!myBase) throw new HttpError(400, t("Plant a base first — armies march from it"));
  if (distanceM(myBase, site) > SIEGE_RANGE_M) throw new HttpError(400, t("Out of range — {km} km from your base max", { km: SIEGE_RANGE_M / 1000 }));
  if (row?.ownerId === u.id) throw new HttpError(400, t("You already hold it"));
  if (row?.shieldUntil && row.shieldUntil > new Date()) throw new HttpError(400, t("Freshly captured — it's dug in for a few minutes"));
  const recent = await prisma.battle.findFirst({ where: { attackerId: u.id, targetId: site.id, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } } });
  if (recent) throw new HttpError(429, t("Your army is regrouping — try this outpost again later"));
  if (!count((await forcesOf(u.id)).army)) throw new HttpError(400, t("You have no army — train units first"));

  return assaultOutpost(u, await homeForce(u.id), site);
});
