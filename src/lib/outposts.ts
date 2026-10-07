// Territory: permanent outposts at fixed real-world spots (deterministic per ~900 m
// cell). Capture them with your army, garrison troops, collect tribute, and win the
// faction war. Only ownership + garrison is stored. Pure.
import { cellKey, hashStr, rng, type LatLng } from "./geo";

export const OUTPOST_DEG = 0.008;
export const OUTPOST_INCOME_HOUR = 40;
export const OUTPOST_CAP_HOURS = 12;
export const OUTPOST_SHIELD_MS = 30 * 60_000;
export const OUTPOST_FORT = { atk: 25, hp: 200 }; // fortification of a held outpost
const NATO = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Kilo", "Lima", "Mike", "Oscar", "Romeo", "Sierra", "Tango", "Victor", "Zulu"];

export type OutpostSite = { id: string; name: string; lat: number; lng: number; guard: number };

function siteFor(cx: number, cy: number): OutpostSite | null {
  const rand = rng(hashStr(`outpost|${cx}_${cy}`));
  if (rand() > 0.7) return null;
  return {
    id: `op.${cellKey(cx, cy)}`,
    name: `Outpost ${NATO[Math.floor(rand() * NATO.length)]}-${1 + Math.floor(rand() * 9)}`,
    lat: (cy + 0.2 + rand() * 0.6) * OUTPOST_DEG,
    lng: (cx + 0.2 + rand() * 0.6) * OUTPOST_DEG,
    guard: 60 + Math.floor(rand() * 200), // neutral militia strength while unowned
  };
}

export function outpostsAround(p: LatLng, radius = 2): OutpostSite[] {
  const cx = Math.floor(p.lng / OUTPOST_DEG);
  const cy = Math.floor(p.lat / OUTPOST_DEG);
  const out: OutpostSite[] = [];
  for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
    const s = siteFor(cx + dx, cy + dy);
    if (s) out.push(s);
  }
  return out;
}

export function resolveOutpost(id: string): OutpostSite | null {
  const m = /^op\.(-?\d+)_(-?\d+)$/.exec(id);
  return m ? siteFor(Number(m[1]), Number(m[2])) : null;
}

export function pendingTribute(collectedAt: Date | string | null, capturedAt: Date | string | null, incomeMult = 1, now = Date.now()) {
  const from = new Date(collectedAt ?? capturedAt ?? now).getTime();
  const hours = Math.min(OUTPOST_CAP_HOURS, Math.max(0, (now - from) / 3_600_000));
  return Math.floor(hours * OUTPOST_INCOME_HOUR * incomeMult);
}
