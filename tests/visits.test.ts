// Visit analytics: Iran-time days, daily-salted hash input, zero-filled series and window stats.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillSeries, pickRange, shiftDay, tehranDay, visitHashInput, visitKind, windowStats } from "@/lib/visits";

describe("tehran days", () => {
  it("rolls over at Iran midnight (UTC+3:30), not UTC", () => {
    assert.equal(tehranDay(new Date("2026-03-10T20:00:00Z")), "2026-03-10"); // 23:30 in Tehran
    assert.equal(tehranDay(new Date("2026-03-10T20:30:00Z")), "2026-03-11"); // 00:00 in Tehran
    assert.equal(tehranDay(new Date("2026-07-01T20:00:00Z")), "2026-07-01"); // no DST in Iran any more
  });
  it("shifts across month and year ends", () => {
    assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftDay("2025-12-31", 1), "2026-01-01");
  });
});

describe("hash input", () => {
  it("is per day and prefers the signed-in id", () => {
    assert.notEqual(visitHashInput("2026-01-01", { anonId: "x" }), visitHashInput("2026-01-02", { anonId: "x" }));
    assert.equal(visitHashInput("d", { userId: "u1", anonId: "x" }), visitHashInput("d", { userId: "u1" }));
    assert.notEqual(visitHashInput("d", { userId: "x" }), visitHashInput("d", { anonId: "x" }));
  });
  it("tags paths", () => {
    assert.equal(visitKind("play"), "play");
    assert.equal(visitKind("/play?drive=1"), "play");
    assert.equal(visitKind(undefined), "home");
  });
});

describe("series", () => {
  const rows = [{ day: "2026-01-03", home: 4, play: 2, visitors: 5, players: 1, newUsers: 1 }, { day: "2026-01-05", home: 1 }];
  it("fills missing days with zeros, oldest first", () => {
    const s = fillSeries(rows, 5, "2026-01-05");
    assert.deepEqual(s.map((r) => r.day), ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]);
    assert.equal(s[0].visits, 0);
    assert.equal(s[2].visits, 6);
    assert.equal(s[4].visits, 1);
  });
  it("sums and averages the last n days", () => {
    const w = windowStats(fillSeries(rows, 5, "2026-01-05"), 4);
    assert.equal(w.days, 4);
    assert.equal(w.total.visits, 7);
    assert.equal(w.avg.visits, 1.8);
    assert.equal(windowStats([], 7).avg.visits, 0);
  });
  it("snaps ranges", () => {
    assert.equal(pickRange("90"), 90);
    assert.equal(pickRange("7"), 30);
    assert.equal(pickRange(undefined), 30);
  });
});
