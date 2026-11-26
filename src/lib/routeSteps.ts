// Turn-by-turn wording for a route, from OSRM's maneuvers (server/footRoute.ts): the server keeps
// the maneuver (`turn`) and the road's name, the phone says it in the player's language. Pure.
import { msg, t, dot } from "./i18n";

/** What to do at a step: a key into TURN_TEXT. */
export type Turn =
  | "depart" | "arrive" | "left" | "right" | "slight-left" | "slight-right" | "sharp-left" | "sharp-right"
  | "straight" | "uturn" | "roundabout" | "ramp" | "exit" | "merge" | "fork-left" | "fork-right";

export const TURN_TEXT: Record<Turn, string> = {
  depart: msg("Head off"),
  arrive: msg("You've arrived"),
  left: msg("Turn left"),
  right: msg("Turn right"),
  "slight-left": msg("Bear left"),
  "slight-right": msg("Bear right"),
  "sharp-left": msg("Turn sharp left"),
  "sharp-right": msg("Turn sharp right"),
  straight: msg("Go straight on"),
  uturn: msg("Make a U-turn"),
  roundabout: msg("At the roundabout, take exit {n}"),
  ramp: msg("Take the ramp"),
  exit: msg("Take the exit"),
  merge: msg("Merge"),
  "fork-left": msg("Keep left at the fork"),
  "fork-right": msg("Keep right at the fork"),
};

/** Arrows for the route chip (in reading order they don't mirror: a left turn is always ←). */
export const TURN_ICON: Record<Turn, string> = {
  depart: "⬆", arrive: "🏁", left: "←", right: "→", "slight-left": "↖", "slight-right": "↗", "sharp-left": "↙", "sharp-right": "↘",
  straight: "⬆", uturn: "↩", roundabout: "⟳", ramp: "↗", exit: "↘", merge: "⤨", "fork-left": "↖", "fork-right": "↗",
};

const side = (mod: string | undefined): Turn | null => {
  switch (mod) {
    case "left": return "left";
    case "right": return "right";
    case "slight left": return "slight-left";
    case "slight right": return "slight-right";
    case "sharp left": return "sharp-left";
    case "sharp right": return "sharp-right";
    case "uturn": return "uturn";
    case "straight": return "straight";
    default: return null;
  }
};

/** OSRM's maneuver → what to do, or null for a step not worth saying (the road just changes name going straight). */
export function turnOf(type: string, modifier?: string): Turn | null {
  switch (type) {
    case "depart": return "depart";
    case "arrive": return "arrive";
    case "roundabout": case "rotary": case "roundabout turn": case "exit roundabout": case "exit rotary": return "roundabout";
    case "on ramp": return "ramp";
    case "off ramp": return "exit";
    case "merge": return "merge";
    case "fork": return modifier?.includes("left") ? "fork-left" : "fork-right";
    case "new name": case "continue": case "notification": {
      const s = side(modifier);
      return s && s !== "straight" ? s : null;
    }
    default: return side(modifier) ?? "straight";
  }
}

export type RouteStep = { turn?: Turn; exit?: number; text: string; name: string; distanceM: number; at: [number, number] };

/** A step as the player reads it: "Turn left · Valiasr St." (text: an older route's own words). */
export function stepText(s: RouteStep): string {
  if (!s.turn) return s.text;
  const what = t(TURN_TEXT[s.turn], { n: s.exit ?? 1 });
  return s.name && s.turn !== "arrive" ? `${what}${dot()}${s.name}` : what;
}
