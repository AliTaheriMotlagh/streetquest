// Which real lights the 3D city spends at night. A forward renderer pays for every light in
// every pixel it can touch, so the city has a fixed pool of N lights (graphics/quality.ts
// `nightLights`) that is handed, every few frames, to the N most useful candidates: street
// lamps, traffic headlights, brake lamps. Pure — components/drive/nightLights.ts applies it.

export type LightKind = "lamp" | "head" | "brake";
export type Candidate = { id: string; kind: LightKind; x: number; z: number; /** Facing (traffic): radians, 0 = −z. */ yaw?: number };

/** How many pooled lights a tier spends (the player's own headlights are not part of it), and how many of each kind at most. */
export function lightBudget(total: number, night: number): { total: number; lamp: number; head: number; brake: number } {
  // Dusk: nothing is switched on yet; the pool fills as it gets dark.
  const n = night < 0.25 ? 0 : Math.round(total * Math.min(1, (night - 0.25) / 0.35));
  if (n <= 0) return { total: 0, lamp: 0, head: 0, brake: 0 };
  // Mostly lamps (they light the buildings), then headlights; brake glow takes what's left over.
  const lamp = Math.ceil(n * 0.5), head = Math.floor(n * 0.3);
  return { total: n, lamp, head, brake: n - lamp - head };
}

/**
 * Score of a candidate: lower is better. Distance from the eye, behind the camera costs
 * twice as much (you see where you're going), and a lamp that's already lit is "closer"
 * by 12% so two lamps at the same distance don't swap every frame as you drive.
 */
export function score(c: Candidate, eye: { x: number; z: number }, fwd: { x: number; z: number }, lit: boolean): number {
  const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
  const ahead = d > 1e-6 ? (dx * fwd.x + dz * fwd.z) / d : 1;
  return d * (ahead < -0.2 ? 2 : ahead < 0.3 ? 1.35 : 1) * (lit ? 0.88 : 1);
}

/**
 * The candidates that get a light: per kind its best few (`budget`), no further than
 * `maxDist`, never more than `budget.total` in all. `lit`: ids that had a light last time.
 */
export function pickLights(cands: Candidate[], eye: { x: number; z: number }, fwd: { x: number; z: number }, budget: ReturnType<typeof lightBudget>, lit: ReadonlySet<string>, maxDist = 90): Candidate[] {
  if (budget.total <= 0) return [];
  const out: Candidate[] = [];
  for (const kind of ["lamp", "head", "brake"] as const) {
    const room = budget[kind];
    if (room <= 0) continue;
    const near = cands
      .filter((c) => c.kind === kind && Math.hypot(c.x - eye.x, c.z - eye.z) <= maxDist)
      .map((c) => ({ c, s: score(c, eye, fwd, lit.has(c.id)) }))
      .sort((a, b) => a.s - b.s || (a.c.id < b.c.id ? -1 : 1));
    for (const { c } of near.slice(0, room)) out.push(c);
  }
  return out.slice(0, budget.total);
}
