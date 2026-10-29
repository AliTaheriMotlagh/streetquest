// Keeping a busy map readable (and light) when every layer is on: which markers keep
// their name, and which places shrink to a dot. Pure, no Leaflet — the map hands it
// screen positions (GameMap.tsx).
/**
 * A marker as the declutter pass sees it: where it is (absolute screen pixels at this
 * zoom), its radius, how wide its name label is (0: none), and whether it may shrink to
 * a dot when the map is crowded (plain places, vendors, walk-in stores — never money,
 * jobs, players or bubbles).
 */
export type Mark = { id: string; x: number; y: number; r: number; label: number; dot?: boolean };
type Box = [number, number, number, number];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Keep a busy map readable (and light) with every layer on. Walking the markers in
 * priority order: one that may shrink and would sit on a marker already drawn — or comes
 * after `budget` full markers — becomes a dot; then a name shows only where its label is
 * clear of every icon and of the names before it. Pure.
 */
export function declutter(marks: Mark[], budget = Infinity): { named: Set<string>; dots: Set<string> } {
  const placed: Mark[] = [], dots = new Set<string>(), named = new Set<string>();
  for (const m of marks) {
    const crowded = placed.length >= budget || placed.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < (o.r + m.r) * 0.8);
    if (m.dot && crowded) dots.add(m.id);
    else placed.push(m);
  }
  const boxes: Box[] = [];
  const onIcon = (b: Box, self: Mark) => placed.some((o) => o !== self && Math.hypot(o.x - clamp(o.x, b[0], b[2]), o.y - clamp(o.y, b[1], b[3])) < o.r * 0.85);
  for (const m of placed) {
    if (!m.label) continue;
    const b: Box = [m.x - m.label / 2, m.y + m.r - 2, m.x + m.label / 2, m.y + m.r + 15];
    if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) || onIcon(b, m)) continue;
    boxes.push(b);
    named.add(m.id);
  }
  return { named, dots };
}

/** How wide a marker's name label is on screen (10 px bold, at most 140 px). */
export const labelPx = (name: string) => Math.min(140, 14 + name.length * 6.2);
