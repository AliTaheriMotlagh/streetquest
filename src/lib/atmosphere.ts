// The air of the 3D city, as numbers (pure — tests drive it): how thick the haze is and how
// much the sun lights it, whether the road shimmers with heat, and how much smoke a car's
// tyres make for how it's being driven.

export type AirIn = {
  /** 0 day … 1 night. */
  night: number;
  /** 0 clear … 1 overcast. */
  overcast: number;
  /** 0 dry … 1 pouring. */
  rain: number;
  /** The sun's height: 0 on the horizon … 1 overhead (its direction's y). */
  sunHeight: number;
};
export type AirOut = {
  /** Haze density: metres⁻¹ at the ground (the fog's own distance fade is separate). */
  density: number;
  /** How strongly the haze glows towards the sun, 0 = not at all. */
  scatter: number;
  /** Heat shimmer over far tarmac, 0 = none. */
  heat: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function airFor(i: AirIn): AirOut {
  const night = clamp01(i.night), overcast = clamp01(i.overcast), rain = clamp01(i.rain), h = clamp01(i.sunHeight);
  const low = 1 - clamp01((h - 0.08) / 0.55); // 1 with the sun at the horizon
  const day = clamp01(1 - night * 1.8);
  return {
    // Thicker at the low sun (long light path through dusty air), in rain and overcast
    // (damp), a little at night (lit by the street, not the sun).
    density: 0.00055 * (1 + 1.4 * low * day + 0.9 * rain + 0.5 * overcast) + 0.0002 * night,
    scatter: day * (1 - overcast * 0.85) * (0.35 + 0.9 * low),
    // The shimmer needs a hot, clear, high sun: midday only, none in cloud, rain or the dark.
    heat: clamp01((h - 0.55) / 0.3) * day * (1 - overcast) * (1 - rain),
  };
}

/**
 * Tyre smoke (0…1) from how the car is moving: sliding sideways at speed, or braking hard
 * (`decel`, m/s², positive slowing down). Nothing below walking pace or in the air.
 */
export function tyreSmoke(speed: number, lateral: number, decel: number, grounded = true): number {
  if (!grounded || speed < 7) return 0;
  const slide = clamp01((Math.abs(lateral) - 3) / 7);
  const brake = clamp01((decel - 8) / 10) * clamp01((speed - 7) / 12);
  return clamp01(Math.max(slide, brake));
}
