// What a metro trip costs (pure; tests/transit.test.ts). Iran's metros charge once at the gate —
// changing lines inside the stations is free. Istanbul charges every boarding, a later one at
// the cheaper transfer fare (İstanbulkart, within two hours). The amounts are settings
// (Admin → Game settings → Metro fares): estimates the admin keeps current.
import { S } from "../settings";
import type { City } from "./network";
import type { Trip } from "./plan";

export type Currency = "toman" | "TRY";
export type FareRule = { currency: Currency; /** The first boarding. */ first: number; /** Each change of line. */ change: number };

/** The fare rule of a city's metro, from the live settings. */
export function fareRule(city: City, s: Pick<typeof S, "metroFareToman" | "metroFareOtherToman" | "metroFareTry" | "metroTransferTry"> = S): FareRule {
  if (city === "istanbul") return { currency: "TRY", first: s.metroFareTry, change: s.metroTransferTry };
  return { currency: "toman", first: city === "tehran" ? s.metroFareToman : s.metroFareOtherToman, change: 0 };
}

/** A trip's fare under a rule (0 when the rule's amounts are unset). */
export const tripFare = (trip: Pick<Trip, "changes">, rule: FareRule): number => Math.max(0, rule.first + trip.changes * rule.change);
