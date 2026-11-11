// What the server can check about a scenario run it can't see (pure; tests/scenarioPlausibility.test.ts).
// The chase, the police and the shooting happen in the player's own browser, so the server only asks
// whether the run *could* have happened: the places it was told are where the scenario says they
// could be, the time taken is no less than the legs take at the fastest speed any vehicle has, and the
// player's last known position (the game keeps reporting it) is at the end of the road.
import { distanceM, type LatLng } from "../geo";
import { LIMITS, PLACED, type Scenario } from "./types";

/** A started run's spots as the client resolved them. */
export type Claim = { giver: LatLng; places: (LatLng | null)[] };

export type Verdict = { ok: true } | { ok: false; why: string };
const no = (why: string): Verdict => ({ ok: false, why });

/** Sum of the straight legs between the player's start and each placed step in order (m). */
export function legsM(start: LatLng, places: (LatLng | null)[]) {
  let prev = start, sum = 0;
  for (const p of places) {
    if (!p) continue;
    sum += distanceM(prev, p);
    prev = p;
  }
  return sum;
}

/** The fewest seconds a run can take: the legs at top speed plus the time the other steps need. */
export function minSeconds(scn: Scenario, start: LatLng, places: (LatLng | null)[], maxMs: number) {
  let s = legsM(start, places) / maxMs;
  for (const st of scn.steps) {
    if (st.type === "survive") s += st.seconds;
    else if (st.type === "drift") s += st.meters / maxMs;
    else if (st.type === "hostiles") s += st.count * 2;
    else if (st.type === "chase") s += 8;
    else if (st.type === "photo") s += 1.2;
    else if (st.type === "evade") s += 5;
  }
  return s;
}

/** The start: the places told are the scenario's own, near enough to the player. */
export function checkStart(scn: Scenario, claim: Claim, here: LatLng): Verdict {
  if (claim.places.length !== scn.steps.length) return no("places");
  type A = Scenario["giver"]["at"];
  const spots: { a: A; p: LatLng }[] = [{ a: scn.giver.at, p: claim.giver }];
  for (let i = 0; i < scn.steps.length; i++) {
    const st = scn.steps[i], p = claim.places[i];
    const placed = (PLACED as readonly string[]).includes(st.type);
    if (placed !== !!p) return no("places");
    if (p) spots.push({ a: (st as { at: A }).at, p });
  }
  let prev = here;
  for (const { a, p } of spots) {
    if (a.at === "fixed" && distanceM(a, p) > 40) return no("pinned");
    // Relative anchors are within the ring of whatever they are measured from (+ slack for snapping to a street).
    if (a.at !== "fixed" && a.at !== "start" && distanceM(prev, p) > LIMITS.rangeM + 200) return no("far");
    if (a.at === "start" && distanceM(here, p) > 60) return no("start");
    prev = p;
  }
  return { ok: true };
}

/** The end: time, distance and where the player is. `last`: the final placed step's spot and radius, if it ends at one. */
export function checkFinish(
  scn: Scenario,
  claim: Claim,
  start: LatLng,
  run: { elapsedS: number; travelledM: number },
  here: LatLng | null,
  last: { at: LatLng; radius: number } | null,
  maxMs: number,
): Verdict {
  const min = minSeconds(scn, start, claim.places, maxMs);
  if (!(run.elapsedS >= min * 0.9)) return no("fast");
  const limit = scn.fail?.timeLimitS;
  if (limit && run.elapsedS > limit + 15) return no("late");
  if (run.elapsedS > 2 * 3600) return no("stale");
  const legs = legsM(start, claim.places);
  // Roads are never shorter than the straight line (a little slack for the street snapping).
  if (run.travelledM < legs * 0.7 - 50) return no("short");
  if (run.travelledM > run.elapsedS * maxMs * 1.1 + 100) return no("faster");
  if (last && here && distanceM(here, last.at) > last.radius + 250) return no("away");
  return { ok: true };
}

/** The place a run must end at: the last step when it is a placed one. */
export function endSpot(scn: Scenario, claim: Claim, radiusOf: (s: Scenario["steps"][number]) => number) {
  const i = scn.steps.length - 1;
  const p = claim.places[i];
  return p ? { at: p, radius: radiusOf(scn.steps[i]) } : null;
}

/** One reward per scenario per window (ms) — replays inside it are fine, they just don't pay again. */
export const REWARD_WINDOW_MS = 6 * 3600_000;
/** And at most this many paid scenario completions a day in all. */
export const REWARDS_PER_DAY = 12;
/** A started run nobody finished is called off after this long (ms). */
export const RUN_TTL_MS = 3 * 3600_000;
/** The reward window a time falls in (the key the database keeps unique per player and scenario). */
export const windowKey = (now: number) => `w${Math.floor(now / REWARD_WINDOW_MS)}`;
