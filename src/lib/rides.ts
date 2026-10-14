// Ride hailing (Uber-style job): a rider requests a car, a nearby player drives them.
// The fare is held in escrow and paid to the driver when the ride ends. Pure — client and server.
import { distanceM, type LatLng } from "./geo";
import { msg } from "./i18n";

export const RIDE_MIN_FARE = 10;
export const RIDE_MAX_FARE = 50_000;
/** Shortest trip worth a ride. */
export const RIDE_MIN_TRIP_M = 50;
/** Unanswered requests disappear from the map after this long (rider can still cancel for a refund). */
export const RIDE_REQUEST_TTL_MS = 45 * 60_000;
/** Driver must be this close to the pickup / drop-off to start / finish. */
export const RIDE_CHECKIN_M = 100;
/** Rider's own position must also be this close to the drop-off when the driver ends the ride. */
export const RIDE_RIDER_DROPOFF_M = 200;

export type RideStatus = "REQUESTED" | "ACCEPTED" | "ONBOARD" | "DONE" | "CANCELLED";

/** Status labels — English keys, shown with t(RIDE_STATUS[status]). */
export const RIDE_STATUS: Record<RideStatus, string> = {
  REQUESTED: msg("🟡 Looking for a driver"),
  ACCEPTED: msg("🔵 Driver on the way"),
  ONBOARD: msg("🟣 On the road"),
  DONE: msg("✅ Arrived"),
  CANCELLED: msg("⚫ Cancelled"),
};

/** Suggested fare: base + per km, so riders have a sensible starting point. */
export function suggestFare(from: LatLng, to: LatLng) {
  const km = distanceM(from, to) / 1000;
  return Math.max(RIDE_MIN_FARE, Math.round((20 + km * 15) / 5) * 5);
}

/** XP for the driver: a flat part plus a little per km actually covered. */
export const driverXp = (km: number) => 100 + Math.round(Math.min(km, 50) * 40);
