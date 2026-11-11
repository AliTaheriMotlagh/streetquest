// Street jobs: the open city's little crime-game stories that start by themselves around
// you (pure; tests/streetJobs.test.ts). Each one starts from something already happening,
// asks one thing of you against the clock, and pays a small reward the server hands out
// (POST /api/drive/street, at most one of a kind every few minutes, a few a day):
//  - thief: a bag is snatched near you (the "snatch" street scene) — catch the thief
//    before they get away: on foot within arm's reach, or block them with the car;
//  - getaway: the police were after you with two stars or more and you lost them — the
//    bigger the chase, the bigger the take.

export type StreetJobKind = "thief" | "getaway";
export const STREET_JOB_KINDS = ["thief", "getaway"] as const satisfies readonly StreetJobKind[];

/** A thief gives up only when caught: this long to do it (s), and this far ahead they're gone (m). */
export const THIEF_SECS = 45, THIEF_GONE_M = 140;
/** A bag snatched this near you (m) is yours to chase. */
export const THIEF_NOTICE_M = 45;
/** Caught: this close on foot, and this close at the wheel (the car cuts them off). */
export const CATCH_FOOT_M = 2.2, CATCH_CAR_M = 4.2;
/** The thief keeps running from you: they look back and pick a new way this often (s). */
export const THIEF_REFLEE_S = 5;

/** A job going on now. `t`: seconds since it started. */
export type StreetJob = { kind: "thief"; t: number; target: number; dist: number };
export type JobOutcome = "caught" | "escaped" | null;

export function startThief(target: number, dist: number): StreetJob {
  return { kind: "thief", t: 0, target, dist };
}

/**
 * One tick of the chase: `dist` is how far the thief is from you now (null: they're gone —
 * off the loaded streets, or knocked down by someone else), `inCar` whether you're driving.
 */
export function tickThief(job: StreetJob, dt: number, dist: number | null, inCar: boolean): JobOutcome {
  job.t += dt;
  if (dist == null) return "escaped";
  job.dist = dist;
  if (dist <= (inCar ? CATCH_CAR_M : CATCH_FOOT_M)) return "caught";
  if (job.t >= THIEF_SECS || dist >= THIEF_GONE_M) return "escaped";
  return null;
}

/** Seconds left on the clock (for the HUD). */
export const secsLeft = (job: StreetJob) => Math.max(0, Math.ceil(THIEF_SECS - job.t));

/** Only a real chase counts as a getaway. */
export const GETAWAY_MIN_STARS = 2;

/** What a job pays (before the admin's XP / coin multipliers; less playing from home). */
export function jobReward(kind: StreetJobKind, stars = 0): { xp: number; coins: number } {
  if (kind === "thief") return { xp: 40, coins: 60 };
  const s = Math.max(GETAWAY_MIN_STARS, Math.min(5, Math.round(stars)));
  return { xp: 25 * s, coins: 30 * s };
}

/** Server limits: one of a kind per this window (ms), and this many street jobs a day in all. */
export const JOB_WINDOW_MS = 3 * 60_000;
export const JOBS_PER_DAY = 12;
/** The claim's key: the same kind twice in one window is one claim (the database keeps it unique). */
export const jobClaimKey = (kind: StreetJobKind, now: number) => `street:${kind}:${Math.floor(now / JOB_WINDOW_MS)}`;
