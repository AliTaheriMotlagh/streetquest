// Shop signs sharing one wall (pure; tests/signPack.test.ts). Real shop rows put their boards
// side by side along the façade, each over its own door. So signs that would overlap first
// slide apart along the wall, then shrink together (never under `minW`), and only what still
// doesn't fit goes up a row — a second band of boards, like a two-storey bazaar front.

export type PackIn = {
  /** Where the shop is along the wall, m from its start. */
  at: number;
  /** The width its name wants, m. */
  w: number;
};
export type PackOut = { at: number; w: number; row: number };

/**
 * Lay out signs on a wall `len` m long. `gap` m between boards, `margin` m kept free at each
 * end, at most `rows` bands. Returns one entry per input, in input order; row -1 = no room
 * (the shop keeps its pin and its place in lists, just no board).
 */
export function packAlong(items: PackIn[], len: number, opts: { gap?: number; margin?: number; minW?: number; rows?: number } = {}): PackOut[] {
  const gap = opts.gap ?? 0.3, margin = opts.margin ?? 0.2, minW = opts.minW ?? 1.8, rows = opts.rows ?? 2;
  const out: PackOut[] = items.map(() => ({ at: 0, w: 0, row: -1 }));
  const room = Math.max(0, len - margin * 2);
  let left = items.map((it, i) => ({ i, at: Math.max(0, Math.min(len, it.at)), w: Math.max(minW, it.w) })).sort((a, b) => a.at - b.at || a.i - b.i);
  for (let row = 0; row < rows && left.length; row++) {
    // How many fit on this band at their narrowest? Keep the ones nearest the middle of the
    // crowd (each one's door), drop every other one to the next band — not just the last few,
    // so both bands cover the whole wall.
    let take = left;
    const fits = (n: number) => n * minW + Math.max(0, n - 1) * gap <= room + 1e-9;
    if (!fits(take.length)) {
      const n = Math.max(0, Math.floor((room + gap) / (minW + gap)));
      if (!n) break;
      const step = left.length / n;
      const pick = new Set<number>();
      for (let k = 0; k < n; k++) pick.add(Math.min(left.length - 1, Math.floor(k * step + step / 2)));
      take = left.filter((_, k) => pick.has(k));
      left = left.filter((_, k) => !pick.has(k));
    } else left = [];
    // Shrink together until they fit side by side.
    const want = take.reduce((s, x) => s + x.w, 0) + Math.max(0, take.length - 1) * gap;
    if (want > room) {
      const over = want - room;
      const give = take.reduce((s, x) => s + (x.w - minW), 0);
      const k = give > 0 ? Math.min(1, over / give) : 0;
      for (const x of take) x.w -= (x.w - minW) * k;
    }
    // Slide: each as close to its door as it can be, no overlaps, inside the wall.
    const lo = margin, hi = len - margin;
    const c = take.map((x) => Math.max(lo + x.w / 2, Math.min(hi - x.w / 2, x.at)));
    for (let k = 1; k < take.length; k++) c[k] = Math.max(c[k], c[k - 1] + (take[k - 1].w + take[k].w) / 2 + gap);
    // Pushed off the far end: push back from there.
    if (take.length) c[take.length - 1] = Math.min(c[take.length - 1], hi - take[take.length - 1].w / 2);
    for (let k = take.length - 2; k >= 0; k--) c[k] = Math.min(c[k], c[k + 1] - (take[k].w + take[k + 1].w) / 2 - gap);
    // Centre a cluster that now leans: average shift towards the doors, kept within bounds.
    if (take.length > 1) {
      const shift = take.reduce((s, x, k) => s + (x.at - c[k]), 0) / take.length;
      const room0 = c[0] - take[0].w / 2 - lo, room1 = hi - (c[take.length - 1] + take[take.length - 1].w / 2);
      const d = Math.max(-room0, Math.min(room1, shift));
      for (let k = 0; k < c.length; k++) c[k] += d;
    }
    take.forEach((x, k) => (out[x.i] = { at: c[k], w: x.w, row }));
  }
  return out;
}
