// Money on the map (pure — client and server). The game drops toman around every ~450 m
// cell each 20-minute window, the same for every player and with nothing stored: the
// server rebuilds a pickup from its id to check a claim, so ids can't be forged
// ("$<bucket>.<cell>.<i>"). Admins add their own drops on top (MoneyDrop, "$d:<id>").
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
  expiresAt: number;
  /** Admin drops: who it's for, and the campaign label. */
  drop: { label: string; sponsor: string | null } | null;
  claimed: boolean;
};

/** What a pickup worth `gps` toman on GPS pays this player. */
export const tomanFor = (gps: number, home: boolean) => Math.round(home ? (gps * S.moneyHome) / Math.max(1, S.moneyGps) : gps);

export function moneyForCell(cx: number, cy: number, bucket: number): { id: string; lat: number; lng: number; cell: string; expiresAt: number }[] {
  const cell = cellKey(cx, cy);
  const rand = rng(hashStr(`money|${bucket}|${cell}`));
  const n = Math.max(0, Math.round(S.moneyPerCell));
  const expiresAt = (bucket + 1) * MONEY_BUCKET_MS;
  return Array.from({ length: n }, (_, i) => ({ id: `$${bucket}.${cell}.${i}`, lat: (cy + rand()) * CELL_DEG, lng: (cx + rand()) * CELL_DEG, cell, expiresAt }));
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
