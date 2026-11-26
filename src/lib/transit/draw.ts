// The metro drawn on the 2D map (pure; tests/transit.test.ts): each line as a polyline through
// its stations in order, in its colour. With a focus (the lines through the station you tapped)
// those lines are drawn bold and on top, the rest thin and faded, so the way on stands out.
import type { Network, Station } from "./network";

export type MetroPath = { id: string; colour: string; points: [number, number][]; weight: number; opacity: number; focus: boolean };

const WEIGHT = 4, BOLD = 7, THIN = 3;
const OPACITY = 0.75, FADED = 0.18;

/** The lines through a station (the map's focus when it's tapped). */
export const focusOf = (station: Pick<Station, "lines"> | null | undefined): ReadonlySet<string> | null => (station?.lines.length ? new Set(station.lines) : null);

/** Polylines for a city's lines; faded ones first so the focused ones draw on top. */
export function metroPaths(net: Network, focus?: ReadonlySet<string> | null): MetroPath[] {
  const st = new Map(net.stations.map((s) => [s.id, s]));
  const paths = net.lines.map((l): MetroPath => {
    const on = !focus || focus.has(l.id);
    return {
      id: l.id,
      colour: l.colour,
      points: l.stations.map((id) => st.get(id)).filter((s): s is Station => !!s).map((s) => [s.lat, s.lng]),
      weight: !focus ? WEIGHT : on ? BOLD : THIN,
      opacity: on ? OPACITY + (focus ? 0.2 : 0) : FADED,
      focus: !!focus && on,
    };
  });
  return paths.filter((p) => p.points.length >= 2).sort((a, b) => Number(a.focus) - Number(b.focus));
}

/** Whether a station is on a focused line (its pin stays bright); every station is when nothing's focused. */
export const onFocus = (s: Pick<Station, "lines">, focus?: ReadonlySet<string> | null) => !focus || s.lines.some((l) => focus.has(l));
