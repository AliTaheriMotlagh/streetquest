// What the HUD says for a step when the scenario doesn't word it itself (pure).
import { msg } from "../i18n";
import type { FailReason } from "./machine";
import type { Step, StepType } from "./types";

export const DEFAULT_OBJECTIVE: Record<StepType, string> = {
  goto: msg("Get to the marked spot"),
  car: msg("Get into a car"),
  pickup: msg("Pick it up"),
  deliver: msg("Deliver it"),
  chase: msg("Ram the car until it's wrecked"),
  evade: msg("Lose the police"),
  survive: msg("Survive"),
  hostiles: msg("Take out the gunmen"),
  photo: msg("Frame the landmark and hold still"),
  drift: msg("Hold a slide"),
};

/** Labels for the editor's step picker. */
export const STEP_LABEL: Record<StepType, string> = {
  goto: msg("Go to a place"),
  car: msg("Get a car"),
  pickup: msg("Pick up a person or package"),
  deliver: msg("Deliver"),
  chase: msg("Chase and ram a car"),
  evade: msg("Lose the police"),
  survive: msg("Survive for a time"),
  hostiles: msg("Take out gunmen on foot"),
  photo: msg("Photograph a landmark"),
  drift: msg("Drift for a distance"),
};

export const FAIL_TEXT: Record<FailReason, string> = {
  time: msg("Time ran out"),
  stepTime: msg("Too slow"),
  carDestroyed: msg("Your car was wrecked"),
  targetEscaped: msg("The target got away"),
  playerDown: msg("You were knocked out or arrested"),
  abandoned: msg("You gave up"),
};

export const objectiveKey = (s: Step) => DEFAULT_OBJECTIVE[s.type];
