// Money on the map (pure — client and server). The game drops toman around every ~450 m
// cell each 20-minute window, the same for every player and with nothing stored: the
// server rebuilds a pickup from its id to check a claim, so ids can't be forged
// ("$<bucket>.<cell>.<i>"). Admins add their own drops on top (MoneyDrop, "$d:<id>").
//
// Money levels: the free pickups (tier 0, S.moneyGps) plus bigger ones (S.moneyTiers,
// tier 1…) that a player only sees and can pick up once they've bought that level.
import { CELL_DEG, cellKey, cellOf, hashStr, rng, type LatLng } from "./geo";
import { S } from "./settings";

export const MONEY_BUCKET_MS = 20 * 60 * 1000;
export const moneyBucket = (now = Date.now()) => Math.floor(now / MONEY_BUCKET_MS);

export type MoneyPickup = {
  id: string;
  lat: number;
  lng: number;
  /** Toman for this player (already scaled for play from home). */
  amount: number;
  /** Money level: 0 = free, n = S.moneyTiers[n - 1]. Admin drops are 0. */
  tier: number;
  expiresAt: number;
  /** Admin drops: who it's for, and the campaign label. */
  drop: { label: string; sponsor: string | null } | null;
  claimed: boolean;
};

/** What a pickup worth `gps` toman on GPS pays this player. */
export const tomanFor = (gps: number, home: boolean) => Math.round(home ? (gps * S.moneyHome) / Math.max(1, S.moneyGps) : gps);

/** What one pickup of this level pays on GPS (0 for a level that no longer exists). */
export const tierAmount = (tier: number) => (tier === 0 ? S.moneyGps : (S.moneyTiers[tier - 1]?.amount ?? 0));
/** Money levels a player has: the free one plus those bought (and still offered). */
export const tiersOwned = (bought: number) => Math.min(Math.max(0, bought), S.moneyTiers.length);

export function moneyForCell(cx: number, cy: number, bucket: number): { id: string; lat: number; lng: number; cell: string; expiresAt: number; tier: number }[] {
  const cell = cellKey(cx, cy);
  const rand = rng(hashStr(`money|${bucket}|${cell}`));
  const tiers = [Math.max(0, Math.round(S.moneyPerCell)), ...S.moneyTiers.map((x) => Math.max(0, x.perCell))];
  const expiresAt = (bucket + 1) * MONEY_BUCKET_MS;
  const out: ReturnType<typeof moneyForCell> = [];
  tiers.forEach((per, tier) => {
    // 2.5 per area = 2, and a third half the time.
    const n = Math.floor(per) + (rand() < per % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) out.push({ id: `$${bucket}.${cell}.${out.length}`, lat: (cy + rand()) * CELL_DEG, lng: (cx + rand()) * CELL_DEG, cell, expiresAt, tier });
  });
  return out;
}

/** The game's own pickups in the 3×3 cells around a point. */
export function moneyAround(p: LatLng, now = Date.now()) {
  const { cx, cy } = cellOf(p);
  const bucket = moneyBucket(now);
  const out: ReturnType<typeof moneyForCell> = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...moneyForCell(cx + dx, cy + dy, bucket));
  return out;
}

/** Rebuild a game pickup from its id: the current window or the one before (grace). */
export function resolveMoney(id: string, now = Date.now()) {
  const m = /^\$(\d+)\.(-?\d+)_(-?\d+)\.(\d+)$/.exec(id);
  if (!m) return null;
  const bucket = Number(m[1]);
  const cur = moneyBucket(now);
  if (bucket !== cur && bucket !== cur - 1) return null;
  return moneyForCell(Number(m[2]), Number(m[3]), bucket).find((x) => x.id === id) ?? null;
}

export const DROP_PREFIX = "$d:";
export const isDropId = (id: string) => id.startsWith(DROP_PREFIX);
