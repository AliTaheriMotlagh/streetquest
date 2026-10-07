// Bases, buildings and armies are settled lazily: finished training orders become
// units the next time anyone reads them. No background jobs needed.
import { prisma } from "../lib/db";
import { baseDefense, factionOf, levelOf, powerOf, UNIT_BY_KEY, type Army, type UnitKey, type Vets } from "../lib/rts";

export async function settleTraining(userId: string) {
  const now = Date.now();
  const orders = await prisma.trainOrder.findMany({ where: { userId } });
  for (const o of orders) {
    if (o.readyAt.getTime() <= now) {
      // delete first so two concurrent settles can't double-grant
      const del = await prisma.trainOrder.deleteMany({ where: { id: o.id } });
      if (del.count) await addUnits(userId, o.unitType, o.qty);
      continue;
    }
    // Clash-style: units in a batch join the army one by one as each finishes.
    if (o.unitMs <= 0 || o.qty <= 1) continue;
    const left = Math.min(o.qty, Math.ceil((o.readyAt.getTime() - now) / o.unitMs));
    const ready = o.qty - left;
    if (ready <= 0) continue;
    // Only the request that shrinks the order (from the qty it read) delivers the units.
    const took = await prisma.trainOrder.updateMany({ where: { id: o.id, qty: o.qty }, data: { qty: left } });
    if (took.count) await addUnits(userId, o.unitType, ready);
  }
}

/** Add units to a stack. Fresh recruits dilute the stack's veterancy (weighted average). */
export async function addUnits(userId: string, unitType: string, qty: number, vet = 0) {
  const cur = await prisma.unitStack.findUnique({ where: { userId_unitType: { userId, unitType } } });
  if (!cur) {
    try {
      return await prisma.unitStack.create({ data: { userId, unitType, qty, vet } });
    } catch {
      // a concurrent request created the stack first — fall through to increment it
      return prisma.unitStack.update({ where: { userId_unitType: { userId, unitType } }, data: { qty: { increment: qty } } });
    }
  }
  const total = cur.qty + qty;
  return prisma.unitStack.update({ where: { id: cur.id }, data: { qty: { increment: qty }, vet: total ? (cur.vet * cur.qty + vet * qty) / total : 0 } });
}

/** Survivors of a battle gain veterancy. */
export async function gainVet(userId: string, army: Army, amount: number) {
  const types = Object.entries(army).filter(([, q]) => q).map(([k]) => k);
  if (types.length) await prisma.unitStack.updateMany({ where: { userId, unitType: { in: types }, qty: { gt: 0 } }, data: { vet: { increment: amount } } });
}

export async function forcesOf(userId: string): Promise<{ army: Army; vets: Vets }> {
  await settleTraining(userId);
  const rows = await prisma.unitStack.findMany({ where: { userId, qty: { gt: 0 } } });
  const army: Army = {};
  const vets: Vets = {};
  for (const r of rows) {
    if (!UNIT_BY_KEY[r.unitType as UnitKey]) continue;
    army[r.unitType as UnitKey] = r.qty;
    vets[r.unitType as UnitKey] = r.vet;
  }
  return { army, vets };
}

export async function armyOf(userId: string): Promise<Army> {
  return (await forcesOf(userId)).army;
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

export const fmtLosses = (a: Army) => Object.entries(a).filter(([, q]) => q).map(([k, q]) => `${q} ${k}`).join(", ") || "none";
export const survivors = (army: Army, losses: Army) => Object.fromEntries(Object.entries(army).map(([k, q]) => [k, (q ?? 0) - (losses[k as UnitKey] ?? 0)])) as Army;
