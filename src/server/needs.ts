import { prisma } from "../lib/db";
import { addNeeds, currentNeeds, moodOf, type Needs } from "../lib/sims";

type NeedsRow = { hunger: number; energy: number; social: number; fun: number; needsAt: Date };

export const needsOf = (u: NeedsRow) => currentNeeds({ hunger: u.hunger, energy: u.energy, social: u.social, fun: u.fun }, u.needsAt);
export const moodOfUser = (u: NeedsRow) => moodOf(needsOf(u));

/** Apply a change to a player's needs (settling the real-time decay first). */
export async function bumpNeeds(userId: string, delta: Partial<Needs>, extra: { restedAt?: Date; socialAt?: Date } = {}) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { hunger: true, energy: true, social: true, fun: true, needsAt: true } });
  const n = addNeeds(needsOf(u), delta);
  await prisma.user.update({ where: { id: userId }, data: { ...n, needsAt: new Date(), ...extra } });
  return n;
}
