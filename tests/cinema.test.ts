// Cinemas from cinematicket.org (lib/cinema.ts): both of the API's position forms, a cinema
// with no usable position left out, and a cinema's sessions turned into its films —
// soonest first, past and online ones left out, prices in toman, Tehran's own clock and day.
import assert from "node:assert/strict";
import { it } from "node:test";
import { cinemaUrl, filmsFrom, parseCinema, parsePoint, sessionWindow, showTime, tehranDay } from "@/lib/cinema";

it("a position from either form; nothing outside Iran (placeholders, typos)", () => {
  assert.deepEqual(parsePoint("SRID=4326;POINT (51.31354141235352 35.73863983154297)"), { lat: 35.73863983154297, lng: 51.31354141235352 });
  assert.deepEqual(parsePoint({ lat: 31.88, long: 54.31 }), { lat: 31.88, lng: 54.31 });
  assert.equal(parsePoint("SRID=4326;POINT (0 0)"), null);
  assert.equal(parsePoint(null), null);
  assert.equal(parsePoint({ lat: 51.3, long: 35.7 }), null, "lat and lng swapped: not in Iran");
});

it("a cinema from the list: its rating rounded, its picture; none without a name or a place", () => {
  const c = parseCinema({ id: 260, name_fa: " پردیس کورش ", address: "اتوبان حکیم", rate: 3.61592, rate_count: 6534, thumbnail: { desktop_url: "https://x/a.jpg" }, location: "SRID=4326;POINT (51.3135 35.7386)" });
  assert.deepEqual(c, { id: 260, name: "پردیس کورش", lat: 35.7386, lng: 51.3135, address: "اتوبان حکیم", rate: 3.6, rates: 6534, photo: "https://x/a.jpg" });
  assert.equal(parseCinema({ id: 1, name_fa: "", location: "SRID=4326;POINT (51 35)" }), null);
  assert.equal(parseCinema({ id: 2, name_fa: "x", location: null }), null);
  assert.equal(cinemaUrl(260), "https://cinematicket.org/cinema/detail/260");
});

it("sessions → films: soonest first, in toman, VIP marked, past and online left out", () => {
  const now = new Date("2026-11-10T16:00:00Z");
  const s = (id: number, at: string, extra: object = {}) => ({ movie: { id, name: `film ${id}`, poster: { desktop_url: `https://x/${id}.jpg` } }, start_at: at, cinema_hall: { name: "سالن ۱" }, min_price: 900000, session_type: "phy", ...extra });
  const films = filmsFrom(
    [
      s(1, "2026-11-10T21:00:00+03:30"),
      s(2, "2026-11-10T20:00:00+03:30", { cinema_hall: { name: "رودکی VIP" }, min_price: 3600000 }),
      s(1, "2026-11-10T20:30:00+03:30"),
      s(3, "2026-11-10T12:00:00+03:30"),
      s(4, "2026-11-10T20:00:00+03:30", { session_type: "online" }),
      { movie: { id: 5 }, start_at: "nonsense" },
    ],
    now,
  );
  assert.deepEqual(films.map((f) => f.id), [2, 1]);
  assert.deepEqual(films[0].showings[0], { at: "2026-11-10T20:00:00+03:30", hall: "رودکی VIP", toman: 360000, vip: true });
  assert.deepEqual(films[1].showings.map((x) => showTime(x.at)), ["20:30", "21:00"]);
});

it("Tehran's day and the window asked for: from its midnight to the end of tomorrow", () => {
  // 22:00 UTC is already 01:30 the next day in Tehran.
  assert.equal(tehranDay(new Date("2026-11-10T22:00:00Z")), "2026-11-11");
  const w = sessionWindow(new Date("2026-11-10T22:00:00Z"));
  assert.equal(w.from, "2026-11-10T20:30:00.000Z");
  assert.equal(new Date(w.to).getTime() - new Date(w.from).getTime(), 2 * 86_400_000 - 1000);
  assert.equal(showTime("2026-11-10T09:05:00+03:30"), "09:05");
});
