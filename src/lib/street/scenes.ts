// Little things happening on the street (pure; tests/barks.test.ts holds them): every so
// often, near you, people play out a short scene — two strangers arguing over who was there
// first, two friends bumping into each other, someone on the phone, a vendor calling out,
// a shared taxi calling its route, a bag snatched and its owner shouting after the thief.
// A scene is its cast (one or two people off the pavement, or a taxi in the traffic) and its
// lines in order, each a line of lib/street/barks.ts said by one of the cast `after` s after
// the one before; drive/street.ts finds the cast, stops them facing each other, and plays it.
import { barkById, type Situation } from "./barks";

export type SceneLine = { who: 0 | 1; bark: string; after: number };
export type Scene = {
  id: Situation;
  /** Who's in it: one or two pedestrians, or a taxi (its driver). */
  cast: "one" | "two" | "taxi";
  lines: SceneLine[];
  /** How often it's picked, against the others. */
  weight: number;
  /** The second person runs off when it starts (the thief). */
  runs?: boolean;
  /** Says just one of its lines (picked at random), not all of them in turn (a vendor's call). */
  oneOf?: boolean;
};

export const SCENES: Scene[] = [
  { id: "argue", cast: "two", weight: 2, lines: [{ who: 0, bark: "argue-1", after: 0 }, { who: 1, bark: "argue-2", after: 2.4 }, { who: 0, bark: "argue-3", after: 2.2 }, { who: 1, bark: "argue-4", after: 2 }] },
  { id: "friends", cast: "two", weight: 3, lines: [{ who: 0, bark: "friends-1", after: 0 }, { who: 1, bark: "friends-2", after: 2.6 }, { who: 0, bark: "friends-3", after: 2.6 }, { who: 1, bark: "friends-4", after: 2.4 }] },
  { id: "phone", cast: "one", weight: 3, lines: [{ who: 0, bark: "phone-1", after: 0 }, { who: 0, bark: "phone-2", after: 3.2 }, { who: 0, bark: "phone-3", after: 3.6 }] },
  { id: "vendor", cast: "one", weight: 2, oneOf: true, lines: [{ who: 0, bark: "vendor-1", after: 0 }, { who: 0, bark: "vendor-2", after: 0 }, { who: 0, bark: "vendor-3", after: 0 }] },
  { id: "taxi", cast: "taxi", weight: 2, oneOf: true, lines: [{ who: 0, bark: "taxi-1", after: 0 }, { who: 0, bark: "taxi-2", after: 0 }, { who: 0, bark: "taxi-3", after: 0 }] },
  { id: "snatch", cast: "two", weight: 1, runs: true, lines: [{ who: 0, bark: "snatch-1", after: 0.6 }] },
];

/** Seconds between scenes near you (a random wait in this range). */
export const SCENE_GAP_S: [number, number] = [22, 45];

/** A scene to play (by weight), or null when none of `allowed` casts can be found. */
export function pickScene(rand: () => number, allowed: Scene["cast"][] = ["one", "two", "taxi"]): Scene | null {
  const opts = SCENES.filter((s) => allowed.includes(s.cast));
  const total = opts.reduce((n, s) => n + s.weight, 0);
  let r = rand() * total;
  for (const s of opts) if ((r -= s.weight) < 0) return s;
  return opts[opts.length - 1] ?? null;
}

/** The lines a run of the scene says, with when (s from the start): all in turn, or one of them. */
export function sceneScript(s: Scene, rand: () => number): { who: 0 | 1; bark: string; at: number }[] {
  if (s.oneOf) {
    const l = s.lines[Math.floor(rand() * s.lines.length) % s.lines.length];
    return [{ who: l.who, bark: l.bark, at: l.after }];
  }
  let t = 0;
  return s.lines.map((l) => ({ who: l.who, bark: l.bark, at: (t += l.after) }));
}

/** How long the cast stands there (s): through the last line, and a moment after. */
export function sceneLength(script: { at: number; bark: string }[]) {
  const last = script[script.length - 1];
  const b = last && barkById(last.bark);
  return (last?.at ?? 0) + (b ? Math.max(1.8, b.fa.length * 0.075) : 2) + 1.5;
}
