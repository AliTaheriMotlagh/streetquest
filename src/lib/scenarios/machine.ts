// The scenario state machine (pure; tests/scenarioMachine.test.ts). The 3D city feeds it what is
// happening every frame (`Signals`) and does what it asks (`Effect`s: spawn the chase car, raise the
// wanted level, play a line, move the waypoint). It owns the steps, the clocks, the checkpoints and
// the win / fail decision, and nothing about three.js — so every rule can be tested and replayed.
import { carKeys } from "./validate";
import { radiusOf } from "./anchors";
import { DEFAULTS, type CarSpec, type Line, type Pt, type Scenario, type Step } from "./types";

/** What the game tells it each frame. */
export type Signals = {
  x: number;
  z: number;
  /** Which way I face (a unit vector). */
  fx: number;
  fz: number;
  vx: number;
  vz: number;
  onFoot: boolean;
  inCar: boolean;
  /** The street model of my car (lib/fleet.ts key), if it is one. */
  carKey: string | null;
  /** The frame I got into a street car (its model), else null. */
  tookCar: string | null;
  /** My car is wrecked (burning or blown up). */
  carWrecked: boolean;
  /** Knocked out or arrested. */
  down: boolean;
  /** Wanted stars now. */
  stars: number;
  /** Armed men taken out since the run began (a running total). */
  kills: number;
  /** The chase car, if one is out. */
  target: { x: number; z: number; wrecked: boolean; gone: boolean } | null;
};

export type FailReason = "time" | "stepTime" | "carDestroyed" | "targetEscaped" | "playerDown" | "abandoned";

/** What the game must do. */
export type Effect =
  | { kind: "step"; index: number; step: Step }
  | { kind: "say"; lines: Line[] }
  | { kind: "waypoint"; at: Pt | null }
  | { kind: "stars"; n: number }
  | { kind: "spawnTarget"; car: CarSpec | undefined; ahead: number }
  | { kind: "spawnHostiles"; count: number }
  | { kind: "photo" }
  | { kind: "checkpoint"; index: number }
  | { kind: "end"; result: "won" | "failed"; reason: FailReason | null };

export type Run = {
  scn: Scenario;
  /** The resolved places, one per step (null: the step has none). */
  places: (Pt | null)[];
  /** The step I'm on. */
  i: number;
  /** Seconds since the run began and since this step began. */
  t: number;
  st: number;
  result: "won" | "failed" | null;
  reason: FailReason | null;
  /** Carrying a person or a package (until it's delivered). */
  carrying: "person" | "package" | null;
  /** Metres driven or walked (the server checks it against the legs). */
  travelled: number;
  /** Per-step progress. */
  hold: number;
  meters: number;
  kills0: number;
  armed: boolean;
  nag: number;
  /** The last checkpoint: the step to go back to and the clock then. */
  cp: { i: number; t: number; d: number } | null;
};

export const PHOTO_HOLD_S = 1.2;
/** Facing a landmark closely enough (cosine). */
export const PHOTO_FACING = 0.82;
/** A pickup or a drop needs you almost stopped (m/s). */
export const STOP_MS = 6;
/** A slide counts at this speed (m/s) and this much sideways (fraction of the speed). */
export const DRIFT_MIN_MS = 7, DRIFT_SIDE = 0.3;
/** How long a chase car may take to appear (s) before the step is called off. */
const SPAWN_GRACE_S = 6;

export function newRun(scn: Scenario, places: (Pt | null)[]): Run {
  return { scn, places, i: 0, t: 0, st: 0, result: null, reason: null, carrying: null, travelled: 0, hold: 0, meters: 0, kills0: 0, armed: false, nag: 0, cp: null };
}

/** True when this car model satisfies the spec. */
export const carMatches = (spec: CarSpec | undefined, key: string | null) => {
  const ks = carKeys(spec);
  return !!key && (!ks.length || ks.includes(key));
};

/** How sideways the car is sliding (m/s) against how fast it goes. */
export function slide(s: Pick<Signals, "vx" | "vz" | "fx" | "fz">) {
  const sp = Math.hypot(s.vx, s.vz);
  const side = Math.abs(s.vx * s.fz - s.vz * s.fx);
  return { speed: sp, side, drifting: sp >= DRIFT_MIN_MS && side >= sp * DRIFT_SIDE };
}

/** Begin (or begin again from the checkpoint): the first step's effects. */
export function start(run: Run, sig: Signals): Effect[] {
  const at = run.cp?.i ?? 0;
  run.i = at - 1;
  run.t = run.cp?.t ?? 0;
  run.travelled = run.cp?.d ?? 0;
  run.result = run.reason = null;
  run.carrying = at > 0 ? run.carrying : null;
  return advance(run, sig);
}

/** Back to the last checkpoint (or the start) after a failure. */
export function retry(run: Run, sig: Signals): Effect[] {
  // What I carried before the checkpoint step is still carried: recompute from the steps before it.
  const at = run.cp?.i ?? 0;
  run.carrying = null;
  for (let k = 0; k < at; k++) {
    const st = run.scn.steps[k];
    if (st.type === "pickup") run.carrying = st.what;
    else if (st.type === "deliver") run.carrying = null;
  }
  return start(run, sig);
}

function enter(run: Run, sig: Signals): Effect[] {
  const step = run.scn.steps[run.i];
  run.st = 0;
  run.hold = run.meters = run.nag = 0;
  run.armed = false;
  run.kills0 = sig.kills;
  const out: Effect[] = [{ kind: "step", index: run.i, step }];
  if (step.say?.length) out.push({ kind: "say", lines: step.say });
  out.push({ kind: "waypoint", at: run.places[run.i] ?? null });
  if (step.type === "evade") out.push({ kind: "stars", n: step.stars });
  if (step.type === "chase") out.push({ kind: "spawnTarget", car: step.car, ahead: step.startM ?? DEFAULTS.chaseStartM });
  if (step.type === "hostiles") out.push({ kind: "spawnHostiles", count: step.count });
  return out;
}

/** Finish the current step and enter the next (or win). */
function advance(run: Run, sig: Signals): Effect[] {
  const out: Effect[] = [];
  const done = run.scn.steps[run.i];
  if (done) {
    if (done.type === "pickup") run.carrying = done.what;
    if (done.type === "deliver") run.carrying = null;
    if (done.checkpoint && run.i + 1 < run.scn.steps.length) {
      run.cp = { i: run.i + 1, t: run.t, d: run.travelled };
      out.push({ kind: "checkpoint", index: run.i + 1 });
    }
  }
  run.i++;
  if (run.i >= run.scn.steps.length) {
    run.result = "won";
    out.push({ kind: "waypoint", at: null }, { kind: "end", result: "won", reason: null });
    if (run.scn.outro?.won?.length) out.push({ kind: "say", lines: run.scn.outro.won });
    return out;
  }
  return [...out, ...enter(run, sig)];
}

function fail(run: Run, reason: FailReason): Effect[] {
  run.result = "failed";
  run.reason = reason;
  const out: Effect[] = [{ kind: "waypoint", at: null }, { kind: "end", result: "failed", reason }];
  if (run.scn.outro?.lost?.length) out.push({ kind: "say", lines: run.scn.outro.lost });
  return out;
}

/** The player gave up. */
export const abandon = (run: Run) => (run.result ? [] : fail(run, "abandoned"));

/** One frame. Returns what the game must do now. */
export function tick(run: Run, dt: number, sig: Signals): Effect[] {
  if (run.result) return [];
  run.t += dt;
  run.st += dt;
  run.travelled += Math.hypot(sig.vx, sig.vz) * dt;
  const step = run.scn.steps[run.i];
  const rules = run.scn.fail ?? {};

  if (rules.timeLimitS && run.t >= rules.timeLimitS) return fail(run, "time");
  if (step.timeLimitS && run.st >= step.timeLimitS) return fail(run, "stepTime");
  if (rules.playerDown !== false && sig.down) return fail(run, "playerDown");
  if (rules.carDestroyed !== false && sig.carWrecked && sig.inCar) return fail(run, "carDestroyed");

  const place = run.places[run.i];
  const dist = place ? Math.hypot(place.x - sig.x, place.z - sig.z) : Infinity;
  const speed = Math.hypot(sig.vx, sig.vz);
  switch (step.type) {
    case "goto":
      if (dist <= radiusOf(step)) return advance(run, sig);
      break;
    case "pickup":
    case "deliver":
      if (dist <= radiusOf(step) && speed <= STOP_MS) return advance(run, sig);
      break;
    case "car":
      if ((sig.tookCar && carMatches(step.car, sig.tookCar)) || (step.car !== "any" && sig.inCar && carMatches(step.car, sig.carKey))) return advance(run, sig);
      break;
    case "chase": {
      const tg = sig.target;
      if (!tg) return run.st > SPAWN_GRACE_S ? fail(run, "targetEscaped") : [];
      if (tg.wrecked) return advance(run, sig);
      if (tg.gone || Math.hypot(tg.x - sig.x, tg.z - sig.z) > (step.escapeM ?? DEFAULTS.chaseEscapeM)) return fail(run, "targetEscaped");
      break;
    }
    case "evade": {
      const out: Effect[] = [];
      if (sig.stars > 0) run.armed = true;
      // The wanted level can be lowered by a lucky hide before it rose: ask again until it holds.
      else if (!run.armed && run.st - run.nag > 2) (run.nag = run.st), out.push({ kind: "stars", n: step.stars });
      if (run.armed && sig.stars === 0) return advance(run, sig);
      return out;
    }
    case "survive":
      if (run.st >= step.seconds) return advance(run, sig);
      break;
    case "hostiles":
      if (sig.kills - run.kills0 >= step.count) return advance(run, sig);
      break;
    case "photo": {
      const dx = (place?.x ?? 0) - sig.x, dz = (place?.z ?? 0) - sig.z, d = Math.hypot(dx, dz) || 1;
      const facing = (dx * sig.fx + dz * sig.fz) / d >= PHOTO_FACING;
      run.hold = place && dist <= radiusOf(step) && facing ? run.hold + dt : 0;
      if (run.hold >= PHOTO_HOLD_S) return [{ kind: "photo" }, ...advance(run, sig)];
      break;
    }
    case "drift": {
      const s = slide(sig);
      if (sig.inCar && s.drifting) run.meters += s.speed * dt;
      if (run.meters >= step.meters) return advance(run, sig);
      break;
    }
  }
  return [];
}

/** What the HUD shows. */
export type Hud = {
  index: number;
  total: number;
  step: Step;
  /** Seconds left on the tightest clock, if any. */
  left: number | null;
  /** Metres to the waypoint, if there is one. */
  dist: number | null;
  /** "3 / 5" style progress inside the step, if it counts something (0..1) and its label values. */
  progress: { have: number; need: number; unit: "m" | "s" | "n" } | null;
};

export function hud(run: Run, sig: Pick<Signals, "x" | "z" | "kills" | "target">): Hud | null {
  const step = run.scn.steps[run.i];
  if (!step || run.result) return null;
  const lefts: number[] = [];
  if (run.scn.fail?.timeLimitS) lefts.push(run.scn.fail.timeLimitS - run.t);
  if (step.timeLimitS) lefts.push(step.timeLimitS - run.st);
  const place = run.places[run.i];
  let progress: Hud["progress"] = null;
  if (step.type === "survive") progress = { have: Math.min(step.seconds, Math.floor(run.st)), need: step.seconds, unit: "s" };
  else if (step.type === "hostiles") progress = { have: Math.min(step.count, sig.kills - run.kills0), need: step.count, unit: "n" };
  else if (step.type === "drift") progress = { have: Math.min(step.meters, Math.floor(run.meters)), need: step.meters, unit: "m" };
  const dist = place ? Math.hypot(place.x - sig.x, place.z - sig.z) : step.type === "chase" && sig.target ? Math.hypot(sig.target.x - sig.x, sig.target.z - sig.z) : null;
  return { index: run.i, total: run.scn.steps.length, step, left: lefts.length ? Math.max(0, Math.ceil(Math.min(...lefts))) : null, dist, progress };
}
