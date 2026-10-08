// Per-player mutex for game actions, stored in Postgres so it works across serverless
// instances. Spend-then-write handlers (build, train, rush, deploy…) read state, take
// coins, then write — two copies of the same request running side by side would both
// pass the checks and charge twice. With the lock the second one waits its turn and
// then sees the first one's result ("Already max level", "Not enough coins"…).
import { prisma } from "../lib/db";
import { HttpError } from "./http";

const TTL_MS = 30_000; // a crashed request can't hold the lock longer than this
const WAIT_MS = 6_000;
const POLL_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(key: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  try {
    await prisma.actionLock.create({ data: { key, expiresAt } });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
  // Held — but maybe by a request that died: take it over once it has expired.
  const stolen = await prisma.actionLock.updateMany({ where: { key, expiresAt: { lt: new Date() } }, data: { expiresAt } });
  return stolen.count > 0;
}

/** Run `fn` while holding the player's action lock. */
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const key = `user:${userId}`;
  const deadline = Date.now() + WAIT_MS;
  while (!(await acquire(key))) {
    if (Date.now() > deadline) throw new HttpError(429, "Still finishing your last order — try again in a moment");
    await sleep(POLL_MS);
  }
  try {
    return await fn();
  } finally {
    await prisma.actionLock.deleteMany({ where: { key } }).catch(() => {});
  }
}
