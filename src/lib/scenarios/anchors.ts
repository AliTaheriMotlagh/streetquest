// Turning a scenario's anchors into real spots around the player (pure). The 3D city hands in a
// `Probe` (what streets, junctions, shops and landmarks are near); here is only the choosing, so it
// is the same on the client and in tests.
import { DEFAULTS, type Anchor, type Pt, type Scenario } from "./types";

export type Probe = {
  /** A fixed lat/lng in the city's metres. */
  toXZ: (lat: number, lng: number) => Pt;
  /** A road junction between `min` and `max` m from `from` (null: none known). */
  junction: (from: Pt, min: number, max: number, rand: () => number) => Pt | null;
  /** A shop of this kind (a place class, or "any") in the ring. */
  store: (kind: string, from: Pt, min: number, max: number, rand: () => number) => Pt | null;
  /** A named building or landmark in the ring. */
  landmark: (from: Pt, min: number, max: number, rand: () => number) => Pt | null;
  /** The nearest street spot within `maxD` m of a point (null: no street there). */
  snap: (p: Pt, maxD: number) => Pt | null;
};

const RING = { junction: [150, 450], store: [150, 500], landmark: [150, 650] } as const;

/** A point `d` m away from `from` in a random direction, nudged onto a street when there is one. */
export function polar(from: Pt, d: number, rand: () => number, probe?: Probe): Pt {
  const best = { p: null as Pt | null, off: Infinity };
  // A few tries: the first direction might be a river or a park with no street.
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const raw = { x: from.x + Math.cos(a) * d, z: from.z + Math.sin(a) * d };
    const s = probe?.snap(raw, 80);
    if (!s) continue;
    const off = Math.abs(Math.hypot(s.x - from.x, s.z - from.z) - d);
    if (off < best.off) (best.p = s), (best.off = off);
    if (off < d * 0.15) break;
  }
  if (best.p) return best.p;
  const a = rand() * Math.PI * 2;
  return { x: from.x + Math.cos(a) * d, z: from.z + Math.sin(a) * d };
}

/** One anchor → a spot. `start`: where the player was; `prev`: the last place resolved. */
export function resolveAnchor(a: Anchor, start: Pt, prev: Pt, probe: Probe, rand: () => number): Pt {
  if (a.at === "fixed") return probe.toXZ(a.lat, a.lng);
  if (a.at === "start") return { ...start };
  const from = a.from === "start" ? start : prev;
  if (a.at === "along") return polar(from, a.dist * 0.85, rand, probe);
  const [dmin, dmax] = RING[a.at];
  const min = a.min ?? dmin, max = Math.max(min + 10, a.max ?? dmax);
  const hit = a.at === "junction" ? probe.junction(from, min, max, rand) : a.at === "store" ? probe.store(a.kind, from, min, max, rand) : probe.landmark(from, min, max, rand);
  // Nothing of that kind near: any street spot at the middle of the ring still makes a mission.
  return hit ?? polar(from, (min + max) / 2, rand, probe);
}

export type Resolved = { giver: Pt; /** One per step: a spot for the steps that have a place, else null. */ places: (Pt | null)[] };

/** Every place of a scenario, in order (each relative anchor follows the one before). */
export function resolveScenario(s: Scenario, start: Pt, probe: Probe, rand: () => number = Math.random): Resolved {
  const giver = resolveAnchor(s.giver.at, start, start, probe, rand);
  let prev = start;
  const places = s.steps.map((st) => {
    if (st.type !== "goto" && st.type !== "pickup" && st.type !== "deliver" && st.type !== "photo") return null;
    const p = resolveAnchor(st.at, start, prev, probe, rand);
    prev = p;
    return p;
  });
  return { giver, places };
}

/** How far a step's place is from the one before it (m): the length of the leg the server expects to be driven. */
export function legLengths(start: Pt, places: (Pt | null)[]): number[] {
  let prev = start;
  return places.map((p) => {
    if (!p) return 0;
    const d = Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
    return d;
  });
}

/** The radius a placed step is done within. */
export const radiusOf = (s: { type: string; radius?: number }) => s.radius ?? (s.type === "photo" ? DEFAULTS.photoRadius : DEFAULTS.radius);
