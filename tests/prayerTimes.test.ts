// A mosque's prayer times (lib/prayerTimes.ts): computed on the spot, Iran's convention in Iran.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localDay, methodFor, nextPrayer, prayerTimes, sunAltitude, sunAt } from "@/lib/prayerTimes";

const TEHRAN = { lat: 35.6892, lng: 51.389 };
/** Minutes after local midnight in Tehran (UTC+3:30, no daylight saving since 2022). */
const tehranMin = (d: Date) => (((d.getTime() / 60000 + 210) % 1440) + 1440) % 1440;
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(1)} vs ${b} (±${tol})`);

describe("prayerTimes", () => {
  it("puts noon where the equation of time says (early November: the sun is ~16 min fast)", () => {
    // Solar noon at 51.389°E = 12:00 − 3:25.5 (longitude) − 0:16.4 (eqt on 3 Nov) = 8:18 UTC = 11:48 Tehran.
    const t = prayerTimes({ y: 2026, m: 11, d: 3 }, TEHRAN.lat, TEHRAN.lng);
    near(tehranMin(t.find((p) => p.name === "dhuhr")!.at), 11 * 60 + 48, 1.5, "dhuhr");
    near(sunAt(2461347.5).eqt * 60, 16.4, 0.6, "eqt 3 Nov");
  });

  it("matches Tehran's longest day: sunrise ~4:48, sunset ~19:24 (standard time)", () => {
    const t = prayerTimes({ y: 2026, m: 6, d: 21 }, TEHRAN.lat, TEHRAN.lng);
    near(tehranMin(t.find((p) => p.name === "sunrise")!.at), 4 * 60 + 48, 3, "sunrise");
    near(tehranMin(t.find((p) => p.name === "sunset")!.at), 19 * 60 + 24, 3, "sunset");
  });

  it("agrees with a published Tehran timetable to within 2 minutes (time.ir, 5 Azar 1405 = 26 Nov 2026)", () => {
    // Printed: dawn 05:21, sunrise 06:51, noon 11:52, sunset 16:52, maghrib 17:11, midnight 23:07.
    const t = prayerTimes({ y: 2026, m: 11, d: 26 }, TEHRAN.lat, TEHRAN.lng, "tehran");
    const want: Record<string, number> = { fajr: 5 * 60 + 21, sunrise: 6 * 60 + 51, dhuhr: 11 * 60 + 52, sunset: 16 * 60 + 52, maghrib: 17 * 60 + 11, midnight: 23 * 60 + 7 };
    for (const p of t) near(tehranMin(p.at), want[p.name], 2, p.name);
  });

  it("lists Iran's times in order, each at its sun angle", () => {
    const t = prayerTimes({ y: 2026, m: 11, d: 26 }, TEHRAN.lat, TEHRAN.lng, "tehran");
    assert.deepEqual(t.map((p) => p.name), ["fajr", "sunrise", "dhuhr", "sunset", "maghrib", "midnight"]);
    for (let i = 1; i < t.length; i++) assert.ok(t[i].at > t[i - 1].at, `${t[i].name} after ${t[i - 1].name}`);
    const alt = (n: string) => sunAltitude(t.find((p) => p.name === n)!.at, TEHRAN.lat, TEHRAN.lng);
    near(alt("fajr"), -17.7, 0.15, "fajr angle");
    near(alt("maghrib"), -4.5, 0.15, "maghrib angle");
    near(alt("sunrise"), -0.833, 0.15, "sunrise angle");
    // Maghrib comes some 15–25 minutes after sunset in Tehran.
    const gap = (t[4].at.getTime() - t[3].at.getTime()) / 60000;
    assert.ok(gap > 12 && gap < 25, `maghrib − sunset = ${gap}`);
    // Midnight: halfway from sunset to the next dawn — late evening, before 1 a.m.
    const mid = tehranMin(t[5].at);
    assert.ok(mid > 22 * 60 + 30 || mid < 60, `midnight at ${mid}`);
  });

  it("uses the Muslim World League's times elsewhere (Istanbul), with asr and isha", () => {
    const t = prayerTimes({ y: 2026, m: 11, d: 26 }, 41.01, 28.98, methodFor("TR"));
    assert.deepEqual(t.map((p) => p.name), ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    const alt = (n: string) => sunAltitude(t.find((p) => p.name === n)!.at, 41.01, 28.98);
    near(alt("fajr"), -18, 0.15, "fajr");
    near(alt("isha"), -17, 0.15, "isha");
    assert.ok(alt("asr") > 10 && alt("asr") < 25, `asr altitude ${alt("asr")}`);
    assert.equal(methodFor("IR"), "tehran");
  });

  it("leaves out what the sun never reaches (no dark dawn in a Nordic summer)", () => {
    const t = prayerTimes({ y: 2026, m: 6, d: 21 }, 64.1, -21.9, "mwl");
    assert.ok(!t.some((p) => p.name === "fajr"));
    assert.ok(t.some((p) => p.name === "dhuhr"));
  });

  it("finds the next one and the local day", () => {
    const t = prayerTimes({ y: 2026, m: 11, d: 26 }, TEHRAN.lat, TEHRAN.lng);
    assert.equal(nextPrayer(t, new Date(t[0].at.getTime() - 1))?.name, "fajr");
    assert.equal(nextPrayer(t, new Date(t[2].at.getTime() + 1))?.name, "sunset");
    assert.equal(nextPrayer(t, new Date(t[5].at.getTime() + 1)), null);
    assert.deepEqual(localDay(new Date("2026-11-25T21:00:00Z"), "Asia/Tehran"), { y: 2026, m: 11, d: 26 });
  });
});
