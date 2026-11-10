// How the 3D city fits a screen: the field of view for the screen's shape, and how much to
// sharpen a picture drawn below the screen's own resolution. Pure — tests drive it.

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The horizontal field of view (°) a vertical one gives on a screen of this shape (width / height). */
export const horizontalFov = (vertical: number, aspect: number) => deg(2 * Math.atan(Math.tan(rad(vertical) / 2) * aspect));

/** Narrower than this (2:3 — every phone held upright) and the view is widened. */
export const NARROW_ASPECT = 0.66;
/** …but never past this vertical angle: beyond it the top and bottom of the picture stretch. */
export const MAX_VERTICAL_FOV = 88;

/**
 * The vertical field of view (°) to use for a camera designed with `base`, on a screen of
 * this shape. Wide screens keep it — a wider screen simply shows more to the sides, as
 * console and PC games do. A phone held upright would be left a slit a third as wide as a
 * TV's, a tunnel you can't see the next lane from: there the view opens up until it shows
 * what a 2:3 screen would, as far as the picture stays undistorted.
 */
export function fovFor(base: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= NARROW_ASPECT || base >= MAX_VERTICAL_FOV) return base;
  return Math.min(MAX_VERTICAL_FOV, deg(2 * Math.atan((Math.tan(rad(base) / 2) * NARROW_ASPECT) / aspect)));
}

/**
 * How strongly (0…0.45) to sharpen the finished frame: a little always (anti-aliasing and
 * tone mapping soften it), more the further the 3D picture is drawn below the screen's own
 * resolution (dynamic resolution on a busy street) — it's stretched to the screen after.
 */
export function sharpenFor(renderDpr: number, screenDpr: number): number {
  if (!(renderDpr > 0) || !(screenDpr > 0)) return 0.15;
  return Math.min(0.45, 0.15 + 0.4 * Math.max(0, 1 - renderDpr / screenDpr));
}
