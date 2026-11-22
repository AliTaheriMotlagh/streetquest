// The car radio (pure; tests/radio.test.ts): a short, hand-picked list of music stations —
// Persian and international — from radio-browser.info, the open community directory of internet
// radio. Music only, on purpose: no news, talk, politics or religion (a game is no place for
// them, and some are blocked in Iran). Stations are kept by the directory's stable id; their
// stream addresses change, so /api/radio looks them up and the car plays them straight from
// the station (https only — a phone page can't play plain http).
import { msg } from "./i18n";
import { sliderGain, type Mix } from "./audio/mix";

export type StationGroup = "remixt" | "persian" | "world";
export type Station = { id: string; name: string; genre: string; group: StationGroup };
/**
 * A station with somewhere to play it from (what /api/radio answers). `embed`: a Remixt station — not a stream but
 * Remixt's own player in a frame (it mixes each song's lanes in sync with every other listener), see remixtStation.
 */
export type LiveStation = Station & { url: string; embed?: true };

// ---------------------------------------------------------------- Remixt Radio
// remixt-free.vercel.app's station, played through its documented embed for games: /radio/<slug>/embed?autoplay=1,
// driven with postMessage({ type: "remixt-radio", action: "play" | "pause" | "volume", value }) and telling back
// { type: "remixt-radio:state", playing, now: { title, artist, cover } }. Its address is NEXT_PUBLIC_REMIXT_RADIO
// (the station's page, e.g. https://remixt.app/radio/remixt-radio); empty switches it off.
export const REMIXT_DEFAULT = "https://remixt.app/radio/remixt-radio";

/** The embed address for a Remixt station page (https only, a /radio/<slug> path), or null. */
export function remixtEmbed(page: string | undefined | null): { url: string; origin: string } | null {
  if (!page) return null;
  try {
    const u = new URL(page);
    const m = /^\/radio\/([a-z0-9-]{1,60})\/?$/.exec(u.pathname);
    if (u.protocol !== "https:" || !m || u.username || u.password) return null;
    return { url: `${u.origin}/radio/${m[1]}/embed?autoplay=1`, origin: u.origin };
  } catch {
    return null;
  }
}

/** Remixt Radio as a station (first in the list), when its address is set and valid. */
export function remixtStation(page: string | undefined | null = REMIXT_DEFAULT): LiveStation | null {
  const e = remixtEmbed(page);
  return e ? { id: "remixt", name: "Remixt Radio", genre: msg("Remixes — listeners vote"), group: "remixt", url: e.url, embed: true } : null;
}

export type RemixtState = { playing: boolean; title: string; artist: string; next?: string; listeners?: number };
/**
 * A message from the Remixt embed, checked: its kind and fields, text cut short; anything else → null. Since the
 * 2026-11 update it also tells the song after (`next: { title, artist }`) and how many are listening.
 */
export function remixtState(data: unknown): RemixtState | null {
  type Song = { title?: unknown; artist?: unknown } | null;
  const d = data as { type?: unknown; playing?: unknown; now?: Song; next?: Song; listeners?: unknown } | null;
  if (!d || typeof d !== "object" || d.type !== "remixt-radio:state" || typeof d.playing !== "boolean") return null;
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 120) : "");
  const s: RemixtState = { playing: d.playing, title: str(d.now?.title), artist: str(d.now?.artist) };
  const next = str(d.next?.title);
  if (next) s.next = next;
  if (typeof d.listeners === "number" && Number.isFinite(d.listeners) && d.listeners >= 0) s.listeners = Math.min(Math.floor(d.listeners), 1e6);
  return s;
}

export const STATIONS: Station[] = [
  { id: "aa408a3b-3d07-415d-8af1-a60b64e07043", name: "Radio Navahang", genre: msg("Persian pop"), group: "persian" },
  { id: "3c807031-f9f0-4d60-b696-1482249cb74c", name: "Radio Faaz", genre: msg("Persian pop"), group: "persian" },
  { id: "a1fbace9-f758-443d-8bca-2dd43c64898a", name: "Radio Simorgh", genre: msg("Iranian traditional"), group: "persian" },
  { id: "4ad5bdc7-01e5-47c9-a1f9-751671b4707e", name: "Capital UK", genre: msg("Hits"), group: "world" },
  { id: "ecfd9b84-8d6d-4d67-908b-6ec836cafb02", name: "NRJ Paris", genre: msg("Hits"), group: "world" },
  { id: "7afae7e3-8d06-42f5-b59e-a52d6e09e60e", name: "RdMix Classic Rock", genre: msg("Classic rock"), group: "world" },
];

/** The next press of the radio button: off → first station → … → last → off. Persian first. */
export function stationAfter(current: string | null, live: readonly { id: string }[]): string | null {
  if (!live.length) return null;
  if (current == null) return live[0].id;
  const i = live.findIndex((s) => s.id === current);
  return i < 0 ? live[0].id : i + 1 < live.length ? live[i + 1].id : null;
}

/** How loud the radio plays: the mixer's master × its own slider, a little under the game's sounds; nothing when muted. */
export const radioVolume = (mix: Pick<Mix, "master" | "radio">, muted: boolean) => (muted ? 0 : Math.min(1, 0.7 * sliderGain(mix.master) * sliderGain(mix.radio)));

/**
 * What the directory says about our stations (its JSON rows) → the ones we can play, in our order,
 * with our names: https streams only, unknown ids and anything else ignored.
 */
export function liveStations(rows: unknown): LiveStation[] {
  if (!Array.isArray(rows)) return [];
  const url = new Map<string, string>();
  for (const r of rows as { stationuuid?: unknown; url_resolved?: unknown; url?: unknown; lastcheckok?: unknown }[]) {
    if (!r || typeof r.stationuuid !== "string" || r.lastcheckok === 0) continue;
    const u = [r.url_resolved, r.url].find((x): x is string => typeof x === "string" && /^https:\/\/[^\s"'<>]+$/.test(x));
    if (u) url.set(r.stationuuid, u);
  }
  return STATIONS.filter((s) => url.has(s.id)).map((s) => ({ ...s, url: url.get(s.id)! }));
}
