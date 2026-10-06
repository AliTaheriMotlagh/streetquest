// Bases, buildings and armies are settled lazily: finished training orders become
// units the next time anyone reads them. No background jobs needed.
import { prisma } from "../lib/db";
import { baseDefense, factionOf, levelOf, powerOf, UNIT_BY_KEY, type Army, type UnitKey } from "../lib/rts";

export async function settleTraining(userId: string) {
  const done = await prisma.trainOrder.findMany({ where: { userId, readyAt: { lte: new Date() } } });
  for (const o of done) {
    // delete first so two concurrent settles can't double-grant
    const del = await prisma.trainOrder.deleteMany({ where: { id: o.id } });
    if (!del.count) continue;
    await prisma.unitStack.upsert({
      where: { userId_unitType: { userId, unitType: o.unitType } },
      create: { userId, unitType: o.unitType, qty: o.qty },
      update: { qty: { increment: o.qty } },
    });
  }
}

export async function armyOf(userId: string): Promise<Army> {
  await settleTraining(userId);
  const rows = await prisma.unitStack.findMany({ where: { userId, qty: { gt: 0 } } });
  const army: Army = {};
  for (const r of rows) if (UNIT_BY_KEY[r.unitType as UnitKey]) army[r.unitType as UnitKey] = r.qty;
  return army;
}

export async function removeUnits(userId: string, losses: Army) {
  for (const [unitType, qty] of Object.entries(losses)) {
    if (!qty) continue;
    await prisma.unitStack.updateMany({ where: { userId, unitType }, data: { qty: { decrement: qty } } });
  }
  await prisma.unitStack.updateMany({ where: { userId, qty: { lt: 0 } }, data: { qty: 0 } });
}

export const loadBase = (where: { id: string } | { ownerId: string }) =>
  prisma.base.findUnique({ where: where as { id: string }, include: { buildings: true, owner: { select: { id: true, username: true, avatar: true, faction: true, lastSeenAt: true, coins: true } } } });

export type LoadedBase = NonNullable<Awaited<ReturnType<typeof loadBase>>>;

export function baseSummary(b: LoadedBase) {
  const f = factionOf(b.owner.faction);
  return {
    hq: levelOf(b.buildings, "hq"),
    turrets: levelOf(b.buildings, "turret"),
    defense: baseDefense(b.buildings, f),
    power: powerOf(b.buildings, f),
    faction: f,
  };
}
