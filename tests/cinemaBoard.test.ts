// The cinema billboard's slides and cross-fade (lib/cinemaBoard.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Film } from "@/lib/cinema";
import { fadeAt, slidesOf, upcoming } from "@/lib/cinemaBoard";

const now = new Date("2026-11-11T12:00:00+03:30");
const at = (hh: string) => `2026-11-11T${hh}:00+03:30`;
const show = (hh: string) => ({ at: at(hh), hall: "1", toman: 100000, vip: false });
const film = (id: number, ...times: string[]): Film => ({ id, name: `f${id}`, poster: "", showings: times.map(show) });

describe("upcoming", () => {
  it("drops sessions long gone, keeps one just started", () => {
    assert.deepEqual(upcoming([show("10:00"), show("11:58"), show("14:00")], now).map((s) => s.at.slice(11, 16)), ["11:58", "14:00"]);
  });
  it("caps the count", () => {
    assert.equal(upcoming([show("13:00"), show("14:00"), show("15:00")], now, 2).length, 2);
  });
});

describe("slidesOf", () => {
  it("only films with a session to come, soonest first", () => {
    const s = slidesOf([film(1, "20:00"), film(2, "09:00"), film(3, "13:00")], now);
    assert.deepEqual(s.map((x) => x.film.id), [3, 1]);
  });
  it("caps the posters", () => {
    const films = Array.from({ length: 9 }, (_, i) => film(i + 1, "15:00"));
    assert.equal(slidesOf(films, now, 4).length, 4);
  });
});

describe("fadeAt", () => {
  it("holds a poster, then cross-fades to the next, wrapping around", () => {
    assert.deepEqual(fadeAt(2, 3, 5, 1), { i: 0, j: 1, k: 0 });
    const mid = fadeAt(5.5, 3, 5, 1);
    assert.equal(mid.i, 0);
    assert.equal(mid.j, 1);
    assert.ok(mid.k > 0.4 && mid.k < 0.6);
    assert.equal(fadeAt(12.5, 3, 5, 1).i, 2);
    assert.equal(fadeAt(12.5, 3, 5, 1).j, 0);
    assert.equal(fadeAt(18 + 2, 3, 5, 1).i, 0, "after a full cycle");
  });
  it("one poster never fades", () => {
    assert.deepEqual(fadeAt(100, 1), { i: 0, j: 0, k: 0 });
  });
});
