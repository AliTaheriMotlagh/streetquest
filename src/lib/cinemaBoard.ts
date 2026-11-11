// What a cinema's billboard in the 3D city shows (pure; tests/cinemaBoard.test.ts): the films
// that still have a session to come, each with its next few sessions, and which poster is up
// (with the cross-fade to the next) at a given moment.
import type { Film, Showing } from "./cinema";

/** A showing counts until 5 minutes after it starts (the trailers run first). */
export const GRACE_MS = 5 * 60_000;
export type Slide = { film: Film; shows: Showing[] };

/** The sessions still to come, soonest first, at most `n`. */
export function upcoming(showings: Showing[], now: Date, n = 5): Showing[] {
  return showings.filter((s) => Date.parse(s.at) > now.getTime() - GRACE_MS).slice(0, n);
}

/** Films with a session to come (their next `shows`), those starting soonest first, at most `max` (posters on the board). */
export function slidesOf(films: Film[], now: Date, max = 6, shows = 5): Slide[] {
  return films
    .map((film) => ({ film, shows: upcoming(film.showings, now, shows) }))
    .filter((s) => s.shows.length)
    .sort((a, b) => Date.parse(a.shows[0].at) - Date.parse(b.shows[0].at))
    .slice(0, max);
}

/**
 * Which poster is up at time `t` (seconds) of `n`, each held `hold` s and then cross-faded over
 * `fade` s into the next: `i` the one on, `j` the one coming, `k` 0..1 how far over (0 when it's holding).
 */
export function fadeAt(t: number, n: number, hold = 5, fade = 0.9): { i: number; j: number; k: number } {
  if (n <= 1) return { i: 0, j: 0, k: 0 };
  const cycle = hold + fade, at = ((t % (cycle * n)) + cycle * n) % (cycle * n);
  const i = Math.floor(at / cycle), within = at - i * cycle;
  const k = within <= hold ? 0 : (within - hold) / fade;
  // Smoothstep: slow in, slow out.
  return { i, j: (i + 1) % n, k: k * k * (3 - 2 * k) };
}
