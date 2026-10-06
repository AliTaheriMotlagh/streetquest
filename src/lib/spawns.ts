// Deterministic world spawns (Pokémon-GO style): every player on Earth sees the
// same items/chests/missions for a given ~450m cell and 20-minute window, with
// zero database storage. The server regenerates a spawn from its id to verify
// claims, so ids can't be forged.
import { ITEMS, RARITY_WEIGHT, type ItemDef } from "./catalog";
import {
  CELL_DEG,
  cellKey,
  cellOf,
  dayPhase,
  hashStr,
  offset,
  pickWeighted,
  rng,
  solarHour,
  type DayPhase,
  type LatLng,
} from "./geo";

export const BUCKET_MS = 20 * 60 * 1000;
export const INTERACT_RADIUS_M = 40;

export type SpawnKind = "item" | "chest" | "run" | "arcade";

export type Spawn = {
  id: string;
  kind: SpawnKind;
  lat: number;
  lng: number;
  cell: string;
  expiresAt: number;
  phase: DayPhase;
  goldenHour: boolean; // dawn/dusk => double XP
  item?: ItemDef;
  run?: { title: string; brief: string; target: LatLng; distanceM: number; timeLimitS: number };
  rewardXp: number;
  rewardCoins: number;
};

const KINDS: { kind: SpawnKind; weight: number }[] = [
  { kind: "item", weight: 55 },
  { kind: "chest", weight: 20 },
  { kind: "run", weight: 15 },
  { kind: "arcade", weight: 10 },
];

const RUN_TEMPLATES = [
  ["Hot Package", "A courier dropped a hot package. Get it to the safehouse before the heat arrives."],
  ["Getaway", "The job went loud. Reach the extraction point before time runs out."],
  ["Tail the Target", "Your mark is moving. Beat them to their destination."],
  ["Street Race", "Unofficial race, official bragging rights. Reach the finish line."],
  ["Dead Drop", "Intel is waiting at a dead drop. Get there fast, it won't stay long."],
  ["Rooftop Dash", "A buyer is waiting across town. Don't keep them waiting."],
];

export const currentBucket = (now = Date.now()) => Math.floor(now / BUCKET_MS);

function itemsFor(phase: DayPhase) {
  return ITEMS.filter((i) => !i.phases || i.phases.includes(phase)).map((i) => ({
    ...i,
    weight: RARITY_WEIGHT[i.rarity],
  }));
}

export function spawnsForCell(cx: number, cy: number, bucket: number): Spawn[] {
  const cell = cellKey(cx, cy);
  const rand = rng(hashStr(`${bucket}|${cell}`));
  const count = 3 + Math.floor(rand() * 4); // 3-6 per cell
  const expiresAt = (bucket + 1) * BUCKET_MS;
  const out: Spawn[] = [];

  for (let i = 0; i < count; i++) {
    const lat = (cy + rand()) * CELL_DEG;
    const lng = (cx + rand()) * CELL_DEG;
    const pos = { lat, lng };
    const at = new Date(bucket * BUCKET_MS);
    const phase = dayPhase(pos, at);
    const h = solarHour(pos, at);
    const goldenHour = (h >= 6 && h < 8) || (h >= 18 && h < 20);
    const mult = goldenHour ? 2 : 1;
    const kind = pickWeighted(KINDS, rand()).kind;
    const item = pickWeighted(itemsFor(phase), rand());
    const id = `${bucket}.${cell}.${i}`;
    const base = { id, kind, lat, lng, cell, expiresAt, phase, goldenHour };

    if (kind === "item") {
      out.push({ ...base, item, rewardXp: 20 * mult, rewardCoins: 0 });
    } else if (kind === "chest") {
      out.push({ ...base, item, rewardXp: 50 * mult, rewardCoins: 20 + Math.floor(rand() * 40) });
    } else if (kind === "arcade") {
      out.push({ ...base, rewardXp: 40 * mult, rewardCoins: 30 });
    } else {
      const [title, brief] = RUN_TEMPLATES[Math.floor(rand() * RUN_TEMPLATES.length)];
      const distanceM = 250 + Math.floor(rand() * 450);
      const target = offset(pos, distanceM, rand() * 360);
      // walking pace ~1.4 m/s with generous slack
      const timeLimitS = Math.round((distanceM / 1.4) * 1.5 + 90);
      out.push({
        ...base,
        item,
        run: { title, brief, target, distanceM, timeLimitS },
        rewardXp: Math.round(distanceM * 0.4) * mult,
        rewardCoins: Math.round(distanceM / 8),
      });
    }
  }
  return out;
}

/** All spawns in the 3x3 cells around a point (~1.3km square). */
export function spawnsAround(p: LatLng, now = Date.now()): Spawn[] {
  const { cx, cy } = cellOf(p);
  const bucket = currentBucket(now);
  const all: Spawn[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) all.push(...spawnsForCell(cx + dx, cy + dy, bucket));
  return all;
}

/** Rebuild a spawn from its id. Accepts the current or previous window (grace period). */
export function resolveSpawn(id: string, now = Date.now()): Spawn | null {
  const m = /^(\d+)\.(-?\d+)_(-?\d+)\.(\d+)$/.exec(id);
  if (!m) return null;
  const bucket = Number(m[1]);
  const cur = currentBucket(now);
  if (bucket !== cur && bucket !== cur - 1) return null;
  return spawnsForCell(Number(m[2]), Number(m[3]), bucket).find((s) => s.id === id) ?? null;
}
