// What you can drive (or fly) in the 3D city. Pure — client and server.
//
// Top speed is a multiple of the admin's "3D car top speed" (S.driveSpeedKmh), so one
// setting scales the whole garage, and the server's play-from-home speed cap allows
// the fastest vehicle (MAX_VEHICLE_MULT). Flying vehicles clear rooftops but have to
// come down low to pick things up. Everything is free to drive from level 1 unless the
// admin turns S.garageFree off (then each unlocks at its level).
import { msg } from "./i18n";
import type { FleetKey } from "./fleet";
import { S } from "./settings";

// New keys go at the end: Street Arena sends a vehicle as its index in VEHICLE_KEYS.
export type VehicleKey = "car" | "moto" | "pickup" | "sports" | "drone" | "heli" | "pride" | "peykan" | "p206" | "p207" | "pars" | "samand" | "taxi" | "vanet" | "bus" | "courier" | "tiba" | "shahin" | "l90" | "xantia" | "suv" | "khavar" | "minibus" | "streetbike";

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
  /** Two wheels: leans into turns, handlebars, one collision circle. */
  bike?: boolean;
  /** Collision circles along its length (m ahead of its middle; default nose and tail of a car). */
  probes?: number[];
  /** Chase camera distance × (a bus needs more room, a bike less). */
  cam?: number;
  /** Built from one of the street models (components/drive/fleet3d.ts). */
  model?: FleetKey;
  /** Only ever taken off the street (on foot, F at a car): never in the garage, never saved as your pick. */
  street?: boolean;
  blurb: string;
};

export const VEHICLES: Record<VehicleKey, VehicleDef> = {
  car: { key: "car", name: msg("Hatchback"), emoji: "🚗", level: 1, speed: 1, accel: 8.5, grip: 9, wheelbase: 2.7, radius: 1.25, flies: false, blurb: msg("Easy to drive, fits down every street.") },
  moto: { key: "moto", name: msg("Motorbike"), emoji: "🏍️", level: 1, speed: 1.12, accel: 11, grip: 11, wheelbase: 1.5, radius: 0.7, flies: false, bike: true, cam: 0.75, blurb: msg("Quick off the line and squeezes through gaps.") },
  pickup: { key: "pickup", name: msg("Pickup truck"), emoji: "🛻", level: 3, speed: 0.92, accel: 7.5, grip: 8, wheelbase: 3.3, radius: 1.45, flies: false, probes: [1.5, -1.5], blurb: msg("Heavy, tough and planted on the road.") },
  drone: { key: "drone", name: msg("Drone"), emoji: "🛸", level: 4, speed: 0.85, accel: 9, grip: 6, wheelbase: 1, radius: 0.6, flies: true, ceiling: 120, cam: 0.75, blurb: msg("Hover over rooftops and scout the block.") },
  sports: { key: "sports", name: msg("Sports car"), emoji: "🏎️", level: 6, speed: 1.3, accel: 12, grip: 10, wheelbase: 2.6, radius: 1.25, flies: false, blurb: msg("The fastest thing on four wheels.") },
  heli: { key: "heli", name: msg("Helicopter"), emoji: "🚁", level: 10, speed: 1.6, accel: 7, grip: 3, wheelbase: 4, radius: 2.4, flies: true, ceiling: 300, cam: 1.4, blurb: msg("Fly straight over the city — land to pick things up.") },
  pride: { key: "pride", name: msg("Pride"), emoji: "🚗", level: 1, speed: 0.95, accel: 7.5, grip: 8.5, wheelbase: 2.38, radius: 1.2, flies: false, probes: [1.05, -1.05], model: "pride", blurb: msg("Iran's everyday car: small, light and everywhere.") },
  peykan: { key: "peykan", name: msg("Peykan"), emoji: "🚘", level: 1, speed: 0.88, accel: 6.5, grip: 7.5, wheelbase: 2.5, radius: 1.25, flies: false, probes: [1.2, -1.2], model: "peykan", blurb: msg("The classic: long bonnet, chrome bumpers, a legend.") },
  p206: { key: "p206", name: msg("Peugeot 206"), emoji: "🚙", level: 2, speed: 1.05, accel: 9, grip: 9.5, wheelbase: 2.44, radius: 1.22, flies: false, probes: [1.0, -1.0], model: "p206", blurb: msg("A nimble hatchback, quick through the city.") },
  p207: { key: "p207", name: msg("Peugeot 207"), emoji: "🚙", level: 3, speed: 1.08, accel: 9.3, grip: 9.6, wheelbase: 2.54, radius: 1.25, flies: false, probes: [1.08, -1.08], model: "p207", blurb: msg("Rounder and roomier, with a little more go.") },
  pars: { key: "pars", name: msg("Peugeot Pars"), emoji: "🚘", level: 3, speed: 1.05, accel: 8.5, grip: 9, wheelbase: 2.67, radius: 1.28, flies: false, probes: [1.3, -1.3], model: "pars", blurb: msg("A comfortable family saloon for long avenues.") },
  samand: { key: "samand", name: msg("Samand"), emoji: "🚘", level: 3, speed: 1.05, accel: 8.5, grip: 9, wheelbase: 2.67, radius: 1.3, flies: false, probes: [1.3, -1.3], model: "samand", blurb: msg("Iran's own saloon, solid and roomy.") },
  taxi: { key: "taxi", name: msg("Taxi"), emoji: "🚕", level: 2, speed: 1.02, accel: 8.5, grip: 9, wheelbase: 2.67, radius: 1.3, flies: false, probes: [1.3, -1.3], model: "taxi", blurb: msg("The yellow city taxi — every street knows it.") },
  vanet: { key: "vanet", name: msg("Zamyad pickup"), emoji: "🛻", level: 3, speed: 0.86, accel: 6.5, grip: 7.5, wheelbase: 2.96, radius: 1.3, flies: false, probes: [1.6, 0, -1.6], cam: 1.15, model: "vanet", blurb: msg("The blue workhorse, loaded or empty.") },
  bus: { key: "bus", name: msg("City bus"), emoji: "🚌", level: 5, speed: 0.7, accel: 4, grip: 6, wheelbase: 6.1, radius: 1.32, flies: false, probes: [4.7, 2.35, 0, -2.35, -4.7], cam: 1.8, model: "bus", blurb: msg("Long, slow and unstoppable on the main roads.") },
  courier: { key: "courier", name: msg("Delivery bike"), emoji: "🛵", level: 1, speed: 1.05, accel: 10, grip: 11, wheelbase: 1.3, radius: 0.72, flies: false, bike: true, cam: 0.8, blurb: msg("A motorbike with a box — weave through traffic with your orders.") },
  // Taken off the street: the rest of Iran's street cars.
  tiba: { key: "tiba", name: msg("Tiba"), emoji: "🚗", level: 1, speed: 0.98, accel: 7.8, grip: 8.6, wheelbase: 2.5, radius: 1.24, flies: false, probes: [1.15, -1.15], model: "tiba", street: true, blurb: msg("Saipa's little saloon, on every street.") },
  shahin: { key: "shahin", name: msg("Shahin"), emoji: "🚘", level: 1, speed: 1.06, accel: 8.8, grip: 9.2, wheelbase: 2.65, radius: 1.3, flies: false, probes: [1.3, -1.3], model: "shahin", street: true, blurb: msg("A newer saloon with a bit of punch.") },
  l90: { key: "l90", name: msg("Tondar 90"), emoji: "🚘", level: 1, speed: 1.0, accel: 8.2, grip: 9, wheelbase: 2.63, radius: 1.3, flies: false, probes: [1.25, -1.25], model: "l90", street: true, blurb: msg("Plain, tough and easy to drive.") },
  xantia: { key: "xantia", name: msg("Xantia"), emoji: "🚘", level: 1, speed: 1.08, accel: 8.6, grip: 9.4, wheelbase: 2.74, radius: 1.3, flies: false, probes: [1.3, -1.3], model: "xantia", street: true, blurb: msg("A smooth old saloon that floats over the bumps.") },
  suv: { key: "suv", name: msg("SUV"), emoji: "🚙", level: 1, speed: 1.04, accel: 8.4, grip: 8.6, wheelbase: 2.7, radius: 1.38, flies: false, probes: [1.3, -1.3], model: "suv", street: true, blurb: msg("Big and high: shrugs off the kerbs.") },
  khavar: { key: "khavar", name: msg("Khavar truck"), emoji: "🚚", level: 1, speed: 0.78, accel: 5, grip: 7, wheelbase: 3.4, radius: 1.35, flies: false, probes: [2.0, 0, -2.0], cam: 1.4, model: "khavar", street: true, blurb: msg("A small lorry: slow, heavy, hard to stop.") },
  minibus: { key: "minibus", name: msg("Minibus"), emoji: "🚐", level: 1, speed: 0.76, accel: 4.6, grip: 6.5, wheelbase: 4, radius: 1.3, flies: false, probes: [2.7, 0, -2.7], cam: 1.5, model: "minibus", street: true, blurb: msg("The old city minibus, rattling along.") },
  streetbike: { key: "streetbike", name: msg("Motorbike"), emoji: "🏍️", level: 1, speed: 1.08, accel: 10.5, grip: 11, wheelbase: 1.35, radius: 0.7, flies: false, bike: true, cam: 0.78, model: "bike", street: true, blurb: msg("Quick off the line and squeezes through gaps.") },
};

export const VEHICLE_KEYS = Object.keys(VEHICLES) as VehicleKey[];
/** The garage's order: the cars of Iran's streets first, then the rest, flyers last. */
export const GARAGE_KEYS: VehicleKey[] = ["pride", "peykan", "p206", "p207", "pars", "samand", "taxi", "vanet", "bus", "courier", "car", "sports", "pickup", "moto", "drone", "heli"];
export const isVehicle = (k: unknown): k is VehicleKey => typeof k === "string" && k in VEHICLES;
/** The fastest multiplier in the garage: what the server's speed cap must allow. */
export const MAX_VEHICLE_MULT = Math.max(...VEHICLE_KEYS.map((k) => VEHICLES[k].speed));
/** Flying this low or lower counts as "on the street" for pick-ups and check-ins. */
export const LAND_ALT_M = 12;
/** Climbing back out takes this much more (m), so hovering at the line over uneven roofs doesn't flip it every frame. */
export const LAND_HYSTERESIS_M = 3;
/** Whether a vehicle is low enough for pick-ups now, given whether it was a moment ago. */
export const lowEnough = (flies: boolean, alt: number, wasLow: boolean) => !flies || alt <= LAND_ALT_M + (wasLow ? LAND_HYSTERESIS_M : 0);

/** By level — or all of them, while the admin keeps the whole garage free (the default). */
export const unlocked = (k: VehicleKey, level: number) => S.garageFree || level >= VEHICLES[k].level;
/** What a player may actually drive: their pick if unlocked, else the hatchback. */
export const allowedVehicle = (k: unknown, level: number): VehicleKey => (isVehicle(k) && !VEHICLES[k].street && unlocked(k, level) ? k : "car");

/**
 * What a player may report driving: any car taken off the street (everyone can take one,
 * whatever their level), else their garage pick if unlocked, else the hatchback.
 */
export const drivenVehicle = (k: unknown, level: number): VehicleKey => (isVehicle(k) && VEHICLES[k].model && !VEHICLES[k].flies ? k : allowedVehicle(k, level));

/** What you drive when you take a street car (traffic or parked) of this model: the vehicle built from it. */
export function drivableOf(k: FleetKey): VehicleKey {
  const own = VEHICLE_KEYS.find((v) => VEHICLES[v].model === k);
  if (own) return own;
  const alias: Partial<Record<FleetKey, VehicleKey>> = { vanetLoad: "vanet", bikeBox: "courier" };
  return alias[k] ?? "car";
}

export const PAINTS = ["#d7263d", "#f4b400", "#1b998b", "#6c4ab6", "#2e86de", "#f5f6fa", "#22252b", "#ff7f11", "#8fbc5a"];
export const isPaint = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/** On foot, you can get into a street car this close to its body (m)… */
export const TAKE_REACH_M = 1.8;
/** …while it's parked or crawling (m/s): stopped at a light, stuck in a jam. */
export const TAKE_MAX_MPS = 5;

/** Metres from a point to the body of a car (a box `len` long and `wid` wide, its nose at −sin/−cos `yaw`); 0 inside. */
export function toBody(c: { x: number; z: number; yaw: number; len: number; wid: number }, x: number, z: number) {
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), dx = x - c.x, dz = z - c.z;
  const along = Math.abs(dx * fx + dz * fz) - c.len / 2, side = Math.abs(dx * -fz + dz * fx) - c.wid / 2;
  return Math.hypot(Math.max(0, along), Math.max(0, side));
}

/** The street car you'd get into from here, and how far its body is: the nearest within reach, not moving off. */
export function carToTake<T extends { x: number; z: number; yaw: number; len: number; wid: number; v?: number }>(cars: Iterable<T>, x: number, z: number, reach = TAKE_REACH_M) {
  let best: { car: T; d: number } | null = null;
  for (const car of cars) {
    if ((car.v ?? 0) > TAKE_MAX_MPS) continue;
    const d = toBody(car, x, z);
    if (d <= reach && (!best || d < best.d)) best = { car, d };
  }
  return best;
}
