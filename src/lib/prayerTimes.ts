// Prayer times for a mosque's card, worked out on the spot (no service, works offline). Pure.
//
// The sun's position is the standard low-precision formula (the US Naval Observatory's, as in
// praytimes.org — good to about a minute between 1950 and 2050). Two conventions:
//  - Iran: the Institute of Geophysics, University of Tehran — dawn at 17.7° below the horizon, maghrib
//    when the sun is 4.5° under, the night's midpoint from sunset to dawn (Ja'fari). Iran's timetables list
//    dawn, sunrise, noon, sunset, maghrib and midnight;
//  - elsewhere: the Muslim World League — dawn 18°, isha 17°, asr when a shadow is its own length plus noon's.
// Each time is computed twice: the second pass reads the sun at the first pass's moment.
import { msg } from "./i18n";

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "sunset" | "maghrib" | "isha" | "midnight";
export type PrayerMethod = "tehran" | "mwl";
export type PrayerTime = { name: PrayerName; at: Date };

/** What each time is called (Iran's timetable names in Persian). */
export const PRAYER_LABEL: Record<PrayerName, string> = {
  fajr: msg("Fajr (dawn)"),
  sunrise: msg("Sunrise"),
  dhuhr: msg("Dhuhr (noon)"),
  asr: msg("Asr"),
  sunset: msg("Sunset"),
  maghrib: msg("Maghrib"),
  isha: msg("Isha"),
  midnight: msg("Islamic midnight"),
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => ((a % b) + b) % b;

/** The sun at a Julian day: declination (°) and the equation of time (hours). */
export function sunAt(jd: number): { decl: number; eqt: number } {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  let eqt = q / 15 - ra;
  if (eqt > 12) eqt -= 24;
  if (eqt < -12) eqt += 24;
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt };
}

/** The sun's altitude (°) at an instant, at a place — for checks. */
export function sunAltitude(at: Date, lat: number, lng: number): number {
  const jd = at.getTime() / 864e5 + 2440587.5;
  const { decl, eqt } = sunAt(jd);
  const utcH = (at.getTime() / 36e5) % 24;
  const hourAngle = rad((utcH + lng / 15 + eqt - 12) * 15);
  return deg(Math.asin(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(hourAngle)));
}

const METHODS: Record<PrayerMethod, { fajr: number; maghrib: number | null; isha: number | null; list: PrayerName[] }> = {
  tehran: { fajr: 17.7, maghrib: 4.5, isha: 14, list: ["fajr", "sunrise", "dhuhr", "sunset", "maghrib", "midnight"] },
  mwl: { fajr: 18, maghrib: null, isha: 17, list: ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] },
};

/** Iran's convention inside Iran, the Muslim World League's anywhere else. */
export const methodFor = (country: string): PrayerMethod => (country === "IR" ? "tehran" : "mwl");

/**
 * The day's times at a place. `day` is the local calendar date (year, month 1–12, day); the answers are
 * instants (Date), to be shown in the place's own time zone. A time the sun never reaches (far north in
 * summer) is left out.
 */
export function prayerTimes(day: { y: number; m: number; d: number }, lat: number, lng: number, method: PrayerMethod = "tehran"): PrayerTime[] {
  const m = METHODS[method];
  const base = Date.UTC(day.y, day.m - 1, day.d);
  const jd0 = base / 864e5 + 2440587.5;
  /** UTC hours of noon, and of the sun at `angle` below (positive) / above the horizon before (ccw) or after noon. */
  const noon = (h: number) => 12 - lng / 15 - sunAt(jd0 + h / 24).eqt;
  const atAngle = (angle: number, h: number, ccw: boolean) => {
    const { decl } = sunAt(jd0 + h / 24);
    const c = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    if (c < -1 || c > 1) return NaN;
    const t = deg(Math.acos(c)) / 15;
    return noon(h) + (ccw ? -t : t);
  };
  const asrAt = (h: number) => {
    const { decl } = sunAt(jd0 + h / 24);
    const angle = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - decl))))));
    return atAngle(angle, h, false);
  };
  const tz = lng / 15; // a first guess of local time, for the first pass
  const guess: Record<Exclude<PrayerName, "midnight">, number> = { fajr: 5 - tz, sunrise: 6 - tz, dhuhr: 12 - tz, asr: 13 - tz, sunset: 18 - tz, maghrib: 18 - tz, isha: 18 - tz };
  const pass = (g: typeof guess) => ({
    fajr: atAngle(m.fajr, g.fajr, true),
    sunrise: atAngle(0.833, g.sunrise, true),
    dhuhr: noon(g.dhuhr),
    asr: asrAt(g.asr),
    sunset: atAngle(0.833, g.sunset, false),
    maghrib: m.maghrib == null ? atAngle(0.833, g.maghrib, false) : atAngle(m.maghrib, g.maghrib, false),
    isha: m.isha == null ? NaN : atAngle(m.isha, g.isha, false),
  });
  const h = pass(pass(guess));
  const midnight = h.sunset + (h.fajr + 24 - h.sunset) / 2;
  const all: Record<PrayerName, number> = { ...h, midnight };
  return m.list.filter((n) => Number.isFinite(all[n])).map((name) => ({ name, at: new Date(base + all[name] * 36e5) }));
}

/** The next time still to come (or null after the day's last). */
export const nextPrayer = (times: PrayerTime[], now: Date): PrayerTime | null => times.find((p) => p.at.getTime() > now.getTime()) ?? null;

/** The local calendar date in a time zone (the device's when none). */
export function localDay(now: Date, timeZone?: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const v = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return { y: v("year"), m: v("month"), d: v("day") };
}
