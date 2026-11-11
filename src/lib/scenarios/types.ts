// Scenarios: GTA-style story missions in the 3D city, described as data (pure; tests/scenarios*.test.ts).
// A scenario is an ordered list of steps (go there, steal a car, chase and ram, lose the police...), with
// dialogue, optional checkpoints, fail conditions and a reward. Places are *anchors* resolved when the
// scenario starts, relative to the player, so one scenario works in any city — or pinned to a lat/lng
// by an admin. The state machine (machine.ts) plays it; the server (server/scenarios.ts) checks the result.
import type { FleetKey } from "../fleet";

/** Text in both languages (the player sees the one they play in). */
export type L10n = { fa: string; en: string };

/** A line of dialogue: who says it, the words, and (optionally) a recorded street line by its id (lib/street/barks.ts). */
export type Line = { speaker: L10n; text: L10n; bark?: string };

/**
 * Where a place is. `from` is what a relative anchor measures from: the start (where the player was
 * when the scenario began) or the previous place (default), so a delivery can be "900 m from the pickup".
 */
export type Anchor =
  | { at: "fixed"; lat: number; lng: number }
  | { at: "start" }
  | { at: "junction"; min?: number; max?: number; from?: "start" | "prev" }
  | { at: "store"; kind: string; min?: number; max?: number; from?: "start" | "prev" }
  | { at: "landmark"; min?: number; max?: number; from?: "start" | "prev" }
  | { at: "along"; dist: number; from?: "start" | "prev" };

export const ANCHOR_KINDS = ["fixed", "start", "junction", "store", "landmark", "along"] as const;
/** Store kinds an anchor can ask for (the place classes of the map's shops). */
export const STORE_KINDS = ["any", "food", "cafe", "bakery", "pharmacy", "supermarket", "fuel", "bank", "electronics", "clothes"] as const;

/** Which car: any, or one (or several) of the street's models (lib/fleet.ts). */
export type CarSpec = "any" | FleetKey | FleetKey[];

type Base = {
  /** The objective line (HUD). Empty: a default for the step type. */
  text?: L10n;
  /** A clock for this step alone (s): when it runs out the scenario fails. */
  timeLimitS?: number;
  /** Reaching the end of this step saves progress: a retry starts here, not at the beginning. */
  checkpoint?: boolean;
  /** Dialogue played when the step starts. */
  say?: Line[];
};

export type GotoStep = Base & { type: "goto"; at: Anchor; radius?: number };
export type CarStep = Base & { type: "car"; car: CarSpec };
export type PickupStep = Base & { type: "pickup"; at: Anchor; radius?: number; what: "person" | "package" };
export type DeliverStep = Base & { type: "deliver"; at: Anchor; radius?: number };
/** A car drives off ahead of you: ram it until it is wrecked; it gets away at `escapeM`. */
export type ChaseStep = Base & { type: "chase"; car?: CarSpec; startM?: number; escapeM?: number };
/** Lose the police: they come for `stars` stars; the step is done when they have given up. */
export type EvadeStep = Base & { type: "evade"; stars: number };
export type SurviveStep = Base & { type: "survive"; seconds: number };
/** Take out `count` armed men on foot. */
export type HostilesStep = Base & { type: "hostiles"; count: number };
/** Frame a landmark: close enough, looking at it, for a moment. */
export type PhotoStep = Base & { type: "photo"; at: Anchor; radius?: number };
/** Hold a slide for `meters` (the slide's distance counts, a straight run doesn't). */
export type DriftStep = Base & { type: "drift"; meters: number };

export type Step = GotoStep | CarStep | PickupStep | DeliverStep | ChaseStep | EvadeStep | SurviveStep | HostilesStep | PhotoStep | DriftStep;
export type StepType = Step["type"];
export const STEP_TYPES = ["goto", "car", "pickup", "deliver", "chase", "evade", "survive", "hostiles", "photo", "drift"] as const satisfies readonly StepType[];
/** Steps that have a place (their anchor is resolved at the start). */
export const PLACED: readonly StepType[] = ["goto", "pickup", "deliver", "photo"];

export type FailRules = {
  /** The whole scenario's clock (s). */
  timeLimitS?: number;
  /** Fail when my car is wrecked (default true). */
  carDestroyed?: boolean;
  /** Fail when I'm knocked out or arrested (default true). */
  playerDown?: boolean;
};

export type Scenario = {
  id: string;
  title: L10n;
  /** The briefing card: what's going on, what's asked. */
  brief: L10n;
  emoji: string;
  /** 1 easy · 2 medium · 3 hard. */
  difficulty: 1 | 2 | 3;
  /** Who gives the mission and where they stand. */
  giver: { name: L10n; at: Anchor };
  steps: Step[];
  fail?: FailRules;
  /** Said when it's done / failed. */
  outro?: { won?: Line[]; lost?: Line[] };
  reward: { coins: number; xp: number };
  enabled: boolean;
};

export const LIMITS = { steps: 24, lines: 8, text: 240, title: 60, coins: 5000, xp: 5000, timeS: 3600, radius: 200, rangeM: 6000, count: 20, seconds: 600, meters: 2000 } as const;
export const DEFAULTS = { radius: 25, photoRadius: 70, chaseStartM: 70, chaseEscapeM: 220, giverRadius: 14 } as const;

/** Where something is, in the city's local metres (the 3D frame). */
export type Pt = { x: number; z: number };
