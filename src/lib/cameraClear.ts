// Where a following camera can stand (pure; tests/cameraClear.test.ts). The camera wants a spot behind and
// above the car; a building in the way (on the line from the car's roof to the camera, not only at the
// camera's own spot) would fill the screen with a wall. So: keep the spot if the line is clear; else lift the
// camera so it looks down over the roofs; only if that doesn't clear it, walk in from the car and stop at the
// last clear point — never closer than `minDist`.
export type P3 = { x: number; y: number; z: number };
/** Is the point inside something solid (a building at that height)? */
export type Solid = (x: number, z: number, y: number) => boolean;

/** Points checked along the line. */
const STEPS = 12;
/** How much higher the camera may go to see over a building (m). */
export const LIFTS = [6, 12, 20];

/** True when every point from `from` to `to` (the end included, the start not) is clear. */
export function lineClear(from: P3, to: P3, solid: Solid, steps = STEPS): boolean {
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    if (solid(from.x + (to.x - from.x) * f, from.z + (to.z - from.z) * f, from.y + (to.y - from.y) * f)) return false;
  }
  return true;
}

/** Where the camera goes: the wanted spot, a lifted one, or pulled in toward the car (see the header). */
export function clearCamera(car: P3, want: P3, solid: Solid, minDist = 3): P3 & { how: "clear" | "lift" | "pull" } {
  if (lineClear(car, want, solid)) return { ...want, how: "clear" };
  for (const up of LIFTS) {
    const lifted = { x: want.x, y: want.y + up, z: want.z };
    if (lineClear(car, lifted, solid)) return { ...lifted, how: "lift" };
  }
  const dx = want.x - car.x, dz = want.z - car.z, d = Math.hypot(dx, dz) || 1;
  let k = Math.min(1, minDist / d);
  for (let s = 1; s <= STEPS; s++) {
    const f = s / STEPS;
    if (f * d < minDist) continue;
    if (solid(car.x + dx * f, car.z + dz * f, car.y + (want.y - car.y) * f)) break;
    k = f;
  }
  return { x: car.x + dx * k, y: car.y + (want.y - car.y) * k, z: car.z + dz * k, how: "pull" };
}
