"use client";
// Other players at street level, driven imperatively like PlayerLayer:
//  - players near us come from the live nearby store (exact, ~1 s fresh) and are
//    extrapolated along their velocity, so a friend in the same car rides along with
//    our own marker instead of trailing behind
//  - every marker glides to its new spot instead of jumping
//  - one stacked right on top of us (or on another player) is nudged aside so both
//    stay visible and tappable
// The animation loop only runs while something is actually moving.
import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { Selected, WorldPlayer } from "./client";
import { nearby, type NearPlayer } from "./location/nearby";
import { esc, icon } from "./mapIcons";
import { getLocation } from "./useLocation";
import { isLite } from "../perf";

const SNAP_M = 500; // further than this: teleport, don't glide
const STACK_PX = 22; // markers closer than this on screen are fanned out
const NUDGE_PX = 24;
const FAN_EVERY_MS = 400;

type Entry = { marker: L.Marker; html: string; data: WorldPlayer; near: NearPlayer | null; shown: L.LatLng; nudge: string };

const htmlOf = (p: WorldPlayer, live: boolean) =>
  [
    `${esc(p.avatar)}<span class="nm">${p.home ? "🛋️ " : ""}${esc(p.username)} · ${p.level}</span>${p.bounty ? `<span class="wanted">💀${p.bounty}</span>` : ""}`,
    `player ${p.friend ? "friend" : ""} ${p.bounty ? "is-wanted" : ""} ${live ? "live" : ""}`,
  ] as const;

export function OthersLayer({ players, onSelect }: { players: WorldPlayer[]; onSelect: (s: Selected) => void }) {
  const map = useMap();
  const playersRef = useRef(players);
  playersRef.current = players;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const entries = new Map<string, Entry>();
    const lite = isLite();
    let raf = 0;
    let lastFrame = 0;
    let lastFan = 0;

    const setNudge = (e: Entry, nudge: string) => {
      e.nudge = nudge;
      const inner = e.marker.getElement()?.firstElementChild as HTMLElement | null | undefined;
      if (inner) inner.style.translate = nudge;
    };

    /** Fan out markers that sit on top of us or of each other. */
    const fan = () => {
      const z = map.getZoom();
      const me = getLocation().pos;
      const placed: L.Point[] = me ? [map.project([me.lat, me.lng], z)] : [];
      const ids = [...entries.keys()].sort();
      for (const id of ids) {
        const e = entries.get(id)!;
        const p = map.project(e.shown, z);
        const clash = placed.reduce((n, q) => (q.distanceTo(p) < STACK_PX ? n + 1 : n), 0);
        placed.push(p);
        let nudge = "";
        if (clash) {
          const a = (clash * 2 * Math.PI) / 6 - Math.PI / 2;
          nudge = `${Math.round(Math.cos(a) * NUDGE_PX)}px ${Math.round(Math.sin(a) * NUDGE_PX)}px`;
        }
        if (nudge !== e.nudge) setNudge(e, nudge);
      }
    };

    const target = (e: Entry) => (e.near ? nearby.predict(e.near) : { lat: e.data.lat, lng: e.data.lng, moving: false });

    const frame = (t: number) => {
      raf = 0;
      // Budget phones: 20 fps is plenty for a walking dot.
      if (lite && t - lastFrame < 50) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.25, (t - lastFrame) / 1000);
      lastFrame = t;
      const k = 1 - Math.exp(-dt * 5);
      let busy = false;
      for (const e of entries.values()) {
        const to = target(e);
        const dLat = to.lat - e.shown.lat;
        const dLng = to.lng - e.shown.lng;
        if (Math.abs(dLat) < 2e-7 && Math.abs(dLng) < 2e-7) {
          if (to.moving) busy = true;
          continue;
        }
        e.shown = L.latLng(e.shown.lat + dLat * k, e.shown.lng + dLng * k);
        e.marker.setLatLng(e.shown);
        busy = true;
      }
      if (t - lastFan > FAN_EVERY_MS) {
        lastFan = t;
        fan();
      }
      if (busy) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (raf || document.hidden) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      const live = new Map(nearby.list().map((n) => [n.id, n]));
      const want = new Map<string, { data: WorldPlayer; near: NearPlayer | null }>();
      for (const p of playersRef.current) want.set(p.id, { data: p, near: live.get(p.id) ?? null });
      // Someone just walked up who isn't in the (slower) world list yet.
      for (const n of live.values()) {
        if (!want.has(n.id)) want.set(n.id, { data: { id: n.id, username: n.username, avatar: n.avatar, level: n.level, friend: false, bounty: 0, home: n.home, lat: n.last.lat, lng: n.last.lng }, near: n });
      }

      for (const [id, e] of entries) {
        if (want.has(id)) continue;
        e.marker.remove();
        entries.delete(id);
      }
      for (const [id, w] of want) {
        const [html, cls] = htmlOf(w.data, !!w.near);
        const to = w.near ? nearby.predict(w.near) : w.data;
        let e = entries.get(id);
        if (!e) {
          const at = L.latLng(to.lat, to.lng);
          const marker = L.marker(at, { icon: icon(html, cls, 34), zIndexOffset: 900, keyboard: false, bubblingMouseEvents: false }).addTo(map);
          e = { marker, html: html + cls, data: w.data, near: w.near, shown: at, nudge: "" };
          const entry = e;
          marker.on("click", () => onSelectRef.current({ type: "player", data: entry.data }));
          entries.set(id, e);
          continue;
        }
        e.data = w.data;
        e.near = w.near;
        if (e.html !== html + cls) {
          e.html = html + cls;
          e.marker.setIcon(icon(html, cls, 34));
          if (e.nudge) setNudge(e, e.nudge);
        }
        if (e.shown.distanceTo([to.lat, to.lng]) > SNAP_M) {
          e.shown = L.latLng(to.lat, to.lng);
          e.marker.setLatLng(e.shown);
        }
      }
      fan();
      kick();
    };
    syncRef.current = sync;

    const unsub = nearby.subscribe(sync);
    const onVisible = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVisible);
    map.on("zoomend", fan);
    sync();
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      map.off("zoomend", fan);
      if (raf) cancelAnimationFrame(raf);
      entries.forEach((e) => e.marker.remove());
      syncRef.current = null;
    };
  }, [map]);

  useEffect(() => syncRef.current?.(), [players]);
  return null;
}
