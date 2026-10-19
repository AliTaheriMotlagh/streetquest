// Step counting rules, shared by the phone (pedometer) and the server (limits).
/** Fastest believable cadence: a sprint is ~3.3 steps/s. */
export const MAX_CADENCE = 3.6;
/** One report can't cover more than this many seconds of walking. */
export const MAX_REPORT_S = 600;
/** A day's ceiling — a marathon is ~50k steps. */
export const DAILY_STEP_CAP = 70_000;
/** Average stride, for estimating steps from GPS distance on foot. */
export const STRIDE_M = 0.75;
/** While the sensor reported this recently, GPS estimates pause (no double counting). */
export const SENSOR_FRESH_MS = 90_000;
