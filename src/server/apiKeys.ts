// API keys for the public data API (lib/apiV1.ts, server/apiV1.ts). A player makes and revokes
// their own on /developers; an admin can list, revoke and raise the limit of anyone's.
// Only the SHA-256 of a key is stored — the key itself is shown once, when it is made.
import { prisma } from "../lib/db";
import { DEFAULT_PER_MINUTE, hashKey, keyHint, MAX_KEYS_PER_PLAYER, MAX_PER_MINUTE, newKey } from "../lib/apiV1";

export type KeyRow = { id: string; name: string; prefix: string; perMinute: number; uses: number; lastUsedAt: string | null; createdAt: string; revoked: boolean; owner?: string };
const row = (k: { id: string; name: string; prefix: string; perMinute: number; uses: number; lastUsedAt: Date | null; createdAt: Date; revokedAt: Date | null }, owner?: string): KeyRow => ({
  id: k.id, name: k.name, prefix: k.prefix, perMinute: k.perMinute, uses: k.uses, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString(), revoked: !!k.revokedAt, ...(owner ? { owner } : {}),
});

export async function listKeys(userId: string): Promise<KeyRow[]> {
  return (await prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map((k) => row(k));
}
export async function listAllKeys(): Promise<KeyRow[]> {
  return (await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { username: true } } } })).map((k) => row(k, k.user.username));
}

/** Make a key; null when the player already has the most active keys allowed. `key` is shown once. */
export async function createKey(userId: string, name: string): Promise<{ key: string; row: KeyRow } | null> {
  if ((await prisma.apiKey.count({ where: { userId, revokedAt: null } })) >= MAX_KEYS_PER_PLAYER) return null;
  const key = newKey();
  const k = await prisma.apiKey.create({ data: { userId, name: name.trim().slice(0, 60) || "key", prefix: keyHint(key), hash: hashKey(key), perMinute: DEFAULT_PER_MINUTE } });
  return { key, row: row(k) };
}

/** Revoke a key: the owner's own, or any when `admin`. False when there's no such active key. */
export async function revokeKey(id: string, userId: string, admin: boolean): Promise<boolean> {
  const r = await prisma.apiKey.updateMany({ where: { id, revokedAt: null, ...(admin ? {} : { userId }) }, data: { revokedAt: new Date() } });
  return r.count > 0;
}
export async function setLimit(id: string, perMinute: number): Promise<boolean> {
  const r = await prisma.apiKey.updateMany({ where: { id }, data: { perMinute: Math.max(1, Math.min(MAX_PER_MINUTE, Math.round(perMinute))) } });
  return r.count > 0;
}

/** The active key for what a request sent, or null (unknown, revoked, or its owner banned). */
export async function authenticate(key: string): Promise<{ id: string; perMinute: number } | null> {
  const k = await prisma.apiKey.findUnique({ where: { hash: hashKey(key) }, include: { user: { select: { banned: true } } } });
  if (!k || k.revokedAt || k.user.banned) return null;
  return { id: k.id, perMinute: k.perMinute };
}
/** Count a use (not awaited by the caller: it never holds an answer up). */
export const noteUse = (id: string) => prisma.apiKey.update({ where: { id }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => {});
