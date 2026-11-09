// Street furniture rules shared by the 3D city and its tests. Pure.

/**
 * Which kind of tree stands at (x, z) when real models are in (world3d treeGroups): the
 * same one every time the tile is built — 0 the main broadleaf, then the variants (a round
 * tree if there is one, the pine last). Mostly broadleaf, like Iran's plane-tree streets.
 */
export function treeVariant(x: number, z: number, variants: number) {
  if (!variants) return 0;
  const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  // The last variant is the pine (15 %); a round tree, when there is one, takes 30 %.
  if (h >= 0.85) return variants;
  return h < 0.55 || variants < 2 ? 0 : 1;
}
