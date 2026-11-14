// One marker design for the whole map (GameMap.tsx draws it, map-pins.css styles it). Pure.
//
// Every place, store, cinema, deal, ad area, game marker and player is the same pin: a disc of one
// size per zoom level (--pin, set on the map by its level of detail), its colour saying what kind
// of place it is, a line glyph (places: white on a solid disc), an emoji (game loot) or a logo inside, at most one small badge (what's off, ⭐, a job, a count)
// and a name under it where there's room. Shape says the family: round = a place, square = an area
// (Divar / Sheypoor neighbourhoods), ring = game (money, jobs, businesses).
//
// The HTML depends only on what the marker *is* — never on the zoom or on whether its name fits —
// so a marker keeps one icon for its whole life: the map toggles `nolabel` / `is-dot` on it as a
// class (no icon swap, no re-insert, no replayed entrance animation, no flicker).

/** The div-icon box every pin sits in: one anchor (its centre) for all of them. */
export const PIN_BOX = 48;
/** The disc's diameter by level of detail (map-pins.css has the same numbers as --pin). */
export const PIN_PX = { near: 34, mid: 28, far: 24 } as const;
export type PinLod = keyof typeof PIN_PX;
/** A crowded place's dot (drawn on the map's canvas). */
export const PIN_DOT_R = 5;

export type PinFamily = "place" | "area" | "game" | "player" | "cluster";
export type BadgeKind = "deal" | "back" | "star" | "job" | "coin" | "count" | "ok";
export type PinSpec = {
  family: PinFamily;
  /** Emoji (drawn as the game's art) or plain text; escaped here. */
  face: string;
  /** A line icon drawn white on a solid disc instead of the face (places, ad areas, their bubbles). */
  glyph?: IconName;
  /** What kind of place: the disc's colour. */
  color: string;
  /** A logo / photo shown inside at street level instead of the face (https only). */
  logo?: string;
  label?: string;
  badge?: { text: string; kind: BadgeKind };
  /** Extra state classes: "closed", "gold", "mine", "friend"… */
  state?: string[];
};

import { ICON_PATHS, type IconName } from "./iconPaths";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#6b7280");
const safeUrl = (u: string | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");

/** The pin's inner HTML (the map wraps it in `.mk.pin.pin-<family>`). */
export function pinHtml(p: PinSpec): string {
  const logo = safeUrl(p.logo);
  return (
    `<span class="pin-b${p.glyph ? " pin-solid" : ""}" style="--c:${safeColor(p.color)}">` +
    (p.glyph
      ? `<span class="pin-f"><svg class="pin-g" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[p.glyph]}"/></svg></span>`
      : `<span class="pin-f">${esc(p.face)}</span>`) +
    (logo ? `<img class="pin-logo" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "") +
    `</span>` +
    (p.badge ? `<span class="pin-badge ${p.badge.kind}">${esc(p.badge.text)}</span>` : "") +
    (p.label ? `<span class="nm">${esc(p.label)}</span>` : "")
  );
}
/** The classes on the pin's wrapper. */
export const pinClass = (p: PinSpec) => ["pin", `pin-${p.family}`, ...(p.state ?? [])].join(" ");

/** The emoji a group of pins shows: its most common face (ties: the first seen). */
export function clusterFace(faces: string[]): string {
  const n = new Map<string, number>();
  let best = faces[0] ?? "📍", top = 0;
  for (const f of faces) {
    const k = (n.get(f) ?? 0) + 1;
    n.set(f, k);
    if (k > top) (top = k), (best = f);
  }
  return best;
}
/** "99+" past 99. */
export const countText = (n: number, fmt: (n: number) => string = String) => (n > 99 ? `${fmt(99)}+` : fmt(n));
