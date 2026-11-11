// Siktir (سیکتیر): "this place, never again" — a player marks a spot they didn't like and says why.
// Pure — client and server. The server keeps one row per (player, place); everything players see is
// an aggregate (how many, which reasons) and never who.
import { msg, t } from "./i18n";
import type { LatLng } from "./geo";

export const SIKTIR_REASONS = ["dirty", "rude", "expensive", "unsafe", "scam", "noisy", "quality", "other"] as const;
export type SiktirReason = (typeof SIKTIR_REASONS)[number];
export const REASON_INFO: Record<SiktirReason, { label: string }> = {
  dirty: { label: msg("Dirty") },
  rude: { label: msg("Rude staff") },
  expensive: { label: msg("Overpriced") },
  unsafe: { label: msg("Unsafe") },
  scam: { label: msg("Scam") },
  noisy: { label: msg("Too noisy") },
  quality: { label: msg("Bad quality") },
  other: { label: msg("Something else") },
};
export const isSiktirReason = (v: unknown): v is SiktirReason => typeof v === "string" && (SIKTIR_REASONS as readonly string[]).includes(v);

export const SIKTIR_LIMITS = { note: 280, name: 120, perHour: 8, perDay: 25, bboxMaxDeg: 0.5, bboxMax: 400 };

/** Spots with no store id are told apart by their coordinates rounded to ~11 m. */
export const roundCoord = (v: number) => Math.round(v * 1e4) / 1e4;
/** The unique key of a place for one player: the store/landmark id, or the rounded spot. */
export function dislikeKey(placeKey: string | null | undefined, p: LatLng): string {
  const k = (placeKey ?? "").trim();
  return k ? `p:${k.slice(0, 60)}` : `ll:${roundCoord(p.lat).toFixed(4)},${roundCoord(p.lng).toFixed(4)}`;
}

export type SiktirInput = { lat: number; lng: number; placeKey?: string | null; placeName?: string; reason: string; note?: string };
export type SiktirClean = { lat: number; lng: number; placeKey: string | null; placeName: string; reason: SiktirReason; note: string; key: string };

/** Checks and tidies what a player sent. Returns an error message (t()-able) or the clean row. */
export function cleanSiktir(i: SiktirInput): { error: string } | { ok: SiktirClean } {
  if (!Number.isFinite(i.lat) || !Number.isFinite(i.lng) || Math.abs(i.lat) > 90 || Math.abs(i.lng) > 180) return { error: msg("That spot isn't valid") };
  if (!isSiktirReason(i.reason)) return { error: msg("Pick a reason") };
  const note = (i.note ?? "").replace(/\s+/g, " ").trim();
  if (note.length > SIKTIR_LIMITS.note) return { error: msg("Keep the note under 280 characters") };
  const placeKey = (i.placeKey ?? "").trim().slice(0, 60) || null;
  const placeName = (i.placeName ?? "").replace(/\s+/g, " ").trim().slice(0, SIKTIR_LIMITS.name);
  const lat = roundCoord(i.lat), lng = roundCoord(i.lng);
  return { ok: { lat, lng, placeKey, placeName, reason: i.reason, note, key: dislikeKey(placeKey, { lat, lng }) } };
}

/** New marks only count against the limit (editing one you made is free). `times`: when this player's recent marks were made. */
export function siktirAllowed(times: number[], now = Date.now()): { ok: true } | { ok: false; error: string } {
  if (times.filter((x) => now - x < 3_600_000).length >= SIKTIR_LIMITS.perHour) return { ok: false, error: msg("Slow down — try again in a little while") };
  if (times.filter((x) => now - x < 86_400_000).length >= SIKTIR_LIMITS.perDay) return { ok: false, error: msg("That's enough for today — try again tomorrow") };
  return { ok: true };
}

export type SiktirRow = { key: string; lat: number; lng: number; placeKey: string | null; placeName: string; reason: string };
export type SiktirSpot = { key: string; lat: number; lng: number; placeKey: string | null; name: string; count: number; reasons: Partial<Record<SiktirReason, number>>; top: SiktirReason[] };

/** One spot per place (its mean position), with the reasons counted, most-said first. */
export function aggregateSiktir(rows: SiktirRow[]): SiktirSpot[] {
  const by = new Map<string, SiktirSpot & { sx: number; sy: number; names: Map<string, number> }>();
  for (const r of rows) {
    if (!isSiktirReason(r.reason)) continue;
    let s = by.get(r.key);
    if (!s) by.set(r.key, (s = { key: r.key, lat: 0, lng: 0, sx: 0, sy: 0, placeKey: r.placeKey, name: "", count: 0, reasons: {}, top: [], names: new Map() }));
    s.count++;
    s.sx += r.lat; s.sy += r.lng;
    s.reasons[r.reason] = (s.reasons[r.reason] ?? 0) + 1;
    if (r.placeName) s.names.set(r.placeName, (s.names.get(r.placeName) ?? 0) + 1);
  }
  return [...by.values()]
    .map(({ sx, sy, names, ...s }) => ({
      ...s,
      lat: sx / s.count,
      lng: sy / s.count,
      name: [...names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      top: topReasons(s.reasons),
    }))
    .sort((a, b) => b.count - a.count);
}

export function topReasons(reasons: Partial<Record<SiktirReason, number>>, n = 3): SiktirReason[] {
  return (Object.entries(reasons) as [SiktirReason, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || SIKTIR_REASONS.indexOf(a[0]) - SIKTIR_REASONS.indexOf(b[0]))
    .slice(0, n)
    .map(([k]) => k);
}

/** "3 people said Siktir". */
export const siktirCountLabel = (n: number) => t("{n, plural, one {# person said Siktir} other {# people said Siktir}}", { n });
/** "Dirty · Overpriced". */
export const siktirReasonsLabel = (top: SiktirReason[]) => top.map((k) => t(REASON_INFO[k].label)).join(" · ");

/** A map cell for grouping spots far out: rounded to `deg`. */
export const siktirCell = (p: LatLng, deg: number) => `${Math.floor(p.lat / deg)}_${Math.floor(p.lng / deg)}`;
