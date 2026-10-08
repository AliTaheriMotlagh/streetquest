"use client";
// Leaflet div-icons, cached by content so markers that re-render don't thrash the DOM.
import L from "leaflet";

// LRU-bounded: countdowns and HP bars mint a new icon every second, and an unbounded
// cache slowly ate memory on low-RAM phones during long sessions.
const ICON_CACHE_MAX = 400;
const iconCache = new Map<string, L.DivIcon>();
export function icon(html: string, cls = "", size = 40) {
  const key = `${cls}|${html}|${size}`;
  let i = iconCache.get(key);
  if (i) {
    // Map keeps insertion order: re-inserting marks it most recently used.
    iconCache.delete(key);
  } else {
    i = L.divIcon({ html: `<div class="mk ${cls}">${html}</div>`, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    if (iconCache.size >= ICON_CACHE_MAX) iconCache.delete(iconCache.keys().next().value!);
  }
  iconCache.set(key, i);
  return i;
}
export const meIcon = L.divIcon({ html: '<div class="me-wrap"><div class="me-heading"></div><div class="me-marker"></div></div>', className: "", iconSize: [22, 22], iconAnchor: [11, 11] });

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
