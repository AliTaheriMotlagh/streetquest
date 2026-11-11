// Visit analytics rules (pure): which day a visit belongs to (Iran time), what gets hashed for
// "unique visitors", and how a stored series becomes chart/summary numbers.

export type DayRow = { day: string; visits: number; home: number; play: number; visitors: number; players: number; newUsers: number };
export type VisitKind = "home" | "play";

export const VISIT_RANGES = [30, 90, 365] as const;
export const KEEP_DAYS = 400;
const DAY_MS = 86_400_000;

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });

/** The Asia/Tehran calendar day of an instant, "YYYY-MM-DD". */
export const tehranDay = (at: Date | number = new Date()) => fmt.format(at);

/** A day key as a UTC-midnight Date (what a Postgres DATE column round-trips as). */
export const dayDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** The day key n days after `key` (negative: before). Calendar maths on UTC, so no DST surprises. */
export const shiftDay = (key: string, n: number) => new Date(dayDate(key).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** What gets hashed (with a secret) for the day's unique-visitor row: a different string each day, so hashes can't be linked across days. */
export const visitHashInput = (day: string, who: { userId?: string | null; anonId?: string | null }) =>
  who.userId ? `${day}|u|${who.userId}` : `${day}|a|${who.anonId ?? ""}`;

/** The page kind a path belongs to. */
export const visitKind = (path: unknown): VisitKind => (path === "play" || (typeof path === "string" && path.startsWith("/play")) ? "play" : "home");

/** Exactly `days` rows ending at `endDay` (oldest first), zero-filled where the day has no data. */
export function fillSeries(rows: Partial<DayRow>[], days: number, endDay: string): DayRow[] {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: DayRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(endDay, -i), r = by.get(day);
    const home = r?.home ?? 0, play = r?.play ?? 0;
    out.push({ day, home, play, visits: home + play, visitors: r?.visitors ?? 0, players: r?.players ?? 0, newUsers: r?.newUsers ?? 0 });
  }
  return out;
}

/** Totals and per-day averages over the last `n` days of a filled series. */
export function windowStats(series: DayRow[], n: number) {
  const w = series.slice(-n);
  const sum = (k: "visits" | "visitors" | "players" | "newUsers") => w.reduce((a, r) => a + r[k], 0);
  const len = Math.max(1, w.length), avg = (v: number) => Math.round((v / len) * 10) / 10;
  const t = { visits: sum("visits"), visitors: sum("visitors"), players: sum("players"), newUsers: sum("newUsers") };
  return { days: w.length, total: t, avg: { visits: avg(t.visits), visitors: avg(t.visitors), players: avg(t.players), newUsers: avg(t.newUsers) } };
}

/** The range an admin asked for, snapped to one we offer. */
export const pickRange = (n: unknown): number => ((VISIT_RANGES as readonly number[]).includes(Number(n)) ? Number(n) : 30);
