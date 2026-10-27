// What you can drive (or fly) in the 3D city. Pure — client and server.
//
// Top speed is a multiple of the admin's "3D car top speed" (S.driveSpeedKmh), so one
// setting scales the whole garage, and the server's play-from-home speed cap allows
// the fastest vehicle (MAX_VEHICLE_MULT). Flying vehicles clear rooftops but have to
// come down low to pick things up.
import { msg } from "./i18n";

export type VehicleKey = "car" | "moto" | "pickup" | "sports" | "drone" | "heli";

export type VehicleDef = {
  key: VehicleKey;
  name: string;
  emoji: string;
  /** Player level that unlocks it. */
  level: number;
  /** × S.driveSpeedKmh. */
  speed: number;
  /** Forward acceleration (m/s²) at a standstill. */
  accel: number;
  /** How fast sideways slip bleeds off — higher is grippier. */
  grip: number;
  /** Wheelbase (m): shorter turns tighter. */
  wheelbase: number;
  /** Collision circle radius (m). */
  radius: number;
  flies: boolean;
  /** Highest it can fly (m above the street). */
  ceiling?: number;
  blurb: string;
};

export const VEHICLES: Record<VehicleKey, VehicleDef> = {
  car: { key: "car", name: msg("Hatchback"), emoji: "🚗", level: 1, speed: 1, accel: 8.5, grip: 9, wheelbase: 2.7, radius: 1.25, flies: false, blurb: msg("Easy to drive, fits down every street.") },
  moto: { key: "moto", name: msg("Motorbike"), emoji: "🏍️", level: 1, speed: 1.12, accel: 11, grip: 11, wheelbase: 1.5, radius: 0.7, flies: false, blurb: msg("Quick off the line and squeezes through gaps.") },
  pickup: { key: "pickup", name: msg("Pickup truck"), emoji: "🛻", level: 3, speed: 0.92, accel: 7.5, grip: 8, wheelbase: 3.3, radius: 1.45, flies: false, blurb: msg("Heavy, tough and planted on the road.") },
  drone: { key: "drone", name: msg("Drone"), emoji: "🛸", level: 4, speed: 0.85, accel: 9, grip: 6, wheelbase: 1, radius: 0.6, flies: true, ceiling: 120, blurb: msg("Hover over rooftops and scout the block.") },
  sports: { key: "sports", name: msg("Sports car"), emoji: "🏎️", level: 6, speed: 1.3, accel: 12, grip: 10, wheelbase: 2.6, radius: 1.25, flies: false, blurb: msg("The fastest thing on four wheels.") },
  heli: { key: "heli", name: msg("Helicopter"), emoji: "🚁", level: 10, speed: 1.6, accel: 7, grip: 3, wheelbase: 4, radius: 2.4, flies: true, ceiling: 300, blurb: msg("Fly straight over the city — land to pick things up.") },
};

export const VEHICLE_KEYS = Object.keys(VEHICLES) as VehicleKey[];
export const isVehicle = (k: unknown): k is VehicleKey => typeof k === "string" && k in VEHICLES;
/** The fastest multiplier in the garage: what the server's speed cap must allow. */
export const MAX_VEHICLE_MULT = Math.max(...VEHICLE_KEYS.map((k) => VEHICLES[k].speed));
/** Flying this low or lower counts as "on the street" for pick-ups and check-ins. */
export const LAND_ALT_M = 12;

export const unlocked = (k: VehicleKey, level: number) => level >= VEHICLES[k].level;
/** What a player may actually drive: their pick if unlocked, else the hatchback. */
export const allowedVehicle = (k: unknown, level: number): VehicleKey => (isVehicle(k) && unlocked(k, level) ? k : "car");

export const PAINTS = ["#d7263d", "#f4b400", "#1b998b", "#6c4ab6", "#2e86de", "#f5f6fa", "#22252b", "#ff7f11", "#8fbc5a"];
export const isPaint = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
