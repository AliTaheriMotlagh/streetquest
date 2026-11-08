// Time of day in the 3D city. "live" puts the sun where it really is over the player's
// streets right now (solar position from the date and GPS), the presets keep the old fixed
// looks. The 3D code blends its per-phase light tables with the weights returned here. Pure.

export type Phase = "night" | "dawn" | "day" | "dusk";
export type TimePick = "day" | "live" | "sunset" | "night";
export const TIME_PICKS: TimePick[] = ["day", "live", "sunset", "night"];

export type Weather = "clear" | "cloudy" | "rain";
export const WEATHERS: Weather[] = ["clear", "cloudy", "rain"];

const RAD = Math.PI / 180;

/**
 * Where the sun is (degrees): elevation above the horizon and azimuth clockwise from
 * north. Low-precision almanac formulas — good to ~0.1°, plenty for lighting.
 */
export function sunPosition(date: Date, lat: number, lng: number): { elevation: number; azimuth: number } {
  const d = date.getTime() / 86_400_000 - 10_957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = gmst * 15 * RAD + lng * RAD - ra;
  const phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { elevation: el / RAD, azimuth: ((az / RAD) % 360 + 360) % 360 };
}

/** Two light tables to blend (`t` of the way from `a` to `b`) and how dark it is (0 day … 1 night). */
export type Sky = { a: Phase; b: Phase; t: number; night: number; elevation: number; azimuth: number; live: boolean };

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The light for a real sun elevation: full day above 20°, golden hour down to the horizon,
 * blue hour to −6° (civil twilight), night below. Morning or evening by azimuth.
 */
export function skyAt(elevation: number, azimuth: number): Sky {
  const twilight: Phase = azimuth < 180 ? "dawn" : "dusk";
  const base = { elevation, azimuth, live: true };
  if (elevation >= 3) {
    const t = smooth(3, 20, elevation);
    return { ...base, a: twilight, b: "day", t, night: 0.45 * (1 - t) };
  }
  const t = smooth(-6, 3, elevation);
  return { ...base, a: "night", b: twilight, t, night: 1 - 0.55 * t };
}

/** The sky for the player's pick. Presets ignore the clock and the place. */
export function skyFor(pick: TimePick, date: Date, lat: number, lng: number): Sky {
  if (pick === "live") {
    const s = sunPosition(date, lat, lng);
    return skyAt(s.elevation, s.azimuth);
  }
  const phase: Phase = pick === "night" ? "night" : pick === "sunset" ? "dusk" : "day";
  const night = phase === "night" ? 1 : phase === "dusk" ? 0.45 : 0;
  return { a: phase, b: phase, t: 0, night, elevation: phase === "night" ? -20 : phase === "dusk" ? 3 : 48, azimuth: phase === "dusk" ? 250 : 200, live: false };
}

/** The phase a blended sky reads as (for UI tints and the minimap). */
export const phaseOf = (s: Sky): Phase => (s.t < 0.5 ? s.a : s.b);

/**
 * Sun direction in the drive's world frame (x east, y up, z south), from elevation and
 * azimuth (clockwise from north). Writes into `out` ([x, y, z]).
 */
export function sunVector(elevation: number, azimuth: number, out: number[] = [0, 0, 0]) {
  const el = elevation * RAD, az = azimuth * RAD;
  out[0] = Math.cos(el) * Math.sin(az);
  out[1] = Math.sin(el);
  out[2] = -Math.cos(el) * Math.cos(az);
  return out;
}

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Linear blend of two "#rrggbb" colours. */
export function mixHex(a: string, b: string, t: number) {
  const x = hex(a), y = hex(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Blend two records of numbers and "#rrggbb" colours field by field. */
export function mixRecord<T extends Record<string, string | number>>(a: T, b: T, t: number): T {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k];
    out[k] = typeof x === "number" && typeof y === "number" ? x + (y - x) * t : typeof x === "string" && typeof y === "string" && x[0] === "#" ? mixHex(x, y, t) : t < 0.5 ? x : y;
  }
  return out as T;
}

/** How each weather dims and greys the light (multipliers and blends toward overcast grey). */
export const WEATHER_LOOK: Record<Weather, { sun: number; overcast: number; fogNear: number; fogFar: number; wet: number; rain: number; clouds: number }> = {
  clear: { sun: 1, overcast: 0, fogNear: 1, fogFar: 1, wet: 0, rain: 0, clouds: 0.32 },
  cloudy: { sun: 0.45, overcast: 0.55, fogNear: 0.8, fogFar: 0.85, wet: 0, rain: 0, clouds: 0.72 },
  rain: { sun: 0.22, overcast: 0.85, fogNear: 0.45, fogFar: 0.6, wet: 1, rain: 1, clouds: 0.92 },
};
