"use client";
// Everything that moves with the player: the marker, its reach circle, the accuracy
// halo and the dashed guide lines to the current target. It subscribes to the location
// store directly and drives Leaflet imperatively from one animation loop, so:
//  - a GPS fix never re-renders the map's React tree (hundreds of markers)
//  - marker, circle, lines and camera glide together in the same frame
import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import type { LatLng } from "./client";
import { meIcon } from "./mapIcons";
import { getLocation, subscribeLocation, type LocationSnapshot } from "./useLocation";

export type Guide = { to: LatLng; color: string; dash: string; weight: number; opacity?: number };

const ZOOM_WALK = 17;
const ZOOM_DRIVE = 16;
const DRIVE_ON = 7; // m/s (~25 km/h): zoom out to see further ahead
const DRIVE_OFF = 2.5;
const REFOLLOW_SPEED = 4; // m/s: cycling/driving
const REFOLLOW_IDLE_MS = 12_000;
const TELEPORT_M = 2_000;

type Anim = { from: L.LatLng; to: L.LatLng; start: number; dur: number; raf: number };
const guideKey = (gs: Guide[]) => gs.map((g) => `${g.to.lat},${g.to.lng},${g.color}`).join("|");

export function PlayerLayer({ follow, guides, onUnfollow, onFollow }: { follow: boolean; guides: Guide[]; onUnfollow: () => void; onFollow: () => void }) {
  const map = useMap();
  const followRef = useRef(follow);
  followRef.current = follow;
  const onFollowRef = useRef(onFollow);
  onFollowRef.current = onFollow;
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  const lastTouch = useRef(0);
  const driving = useRef(false);
  const api = useRef<{ here: () => L.LatLng | null; syncGuides: () => void } | null>(null);

  useMapEvents({
    dragstart: () => {
      lastTouch.current = Date.now();
      onUnfollow();
    },
    dragend: () => (lastTouch.current = Date.now()),
  });

  useEffect(() => {
    // Own SVG renderer: moving these few shapes every frame only touches their own
    // elements instead of repainting the shared canvas with every other circle.
    const renderer = L.svg({ padding: 0.3 });
    let marker: L.Marker | null = null;
    let reach: L.Circle | null = null;
    let halo: L.Circle | null = null;
    let lines: { line: L.Polyline; to: L.LatLng }[] = [];
    let linesKey: string | null = null;
    let anim: Anim | null = null;
    let lastAt = 0;
    let prev: LocationSnapshot | null = null;

    const draw = (p: L.LatLng) => {
      marker!.setLatLng(p);
      reach!.setLatLng(p);
      halo!.setLatLng(p);
      for (const l of lines) l.line.setLatLngs([p, l.to]);
    };

    const syncGuides = () => {
      const key = guideKey(guidesRef.current);
      if (!marker || key === linesKey) return;
      linesKey = key;
      lines.forEach((l) => l.line.remove());
      const from = marker.getLatLng();
      lines = guidesRef.current.map((g) => {
        const to = L.latLng(g.to.lat, g.to.lng);
        return { to, line: L.polyline([from, to], { renderer, color: g.color, dashArray: g.dash, weight: g.weight, opacity: g.opacity ?? 1, interactive: false }).addTo(map) };
      });
    };
    api.current = { here: () => marker?.getLatLng() ?? null, syncGuides };

    const glide = (to: L.LatLng) => {
      if (!marker) {
        marker = L.marker(to, { icon: meIcon, zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(map);
        reach = L.circle(to, { renderer, radius: INTERACT_RADIUS_M, color: "#22e3ff", weight: 1, fillOpacity: 0.06, dashArray: "4 6", interactive: false }).addTo(map);
        halo = L.circle(to, { renderer, radius: 1, stroke: false, fillColor: "#22e3ff", fillOpacity: 0, interactive: false }).addTo(map);
        syncGuides();
        lastAt = performance.now();
        if (followRef.current) map.setView(to, Math.max(map.getZoom(), ZOOM_WALK), { animate: false });
        return;
      }
      if (anim) cancelAnimationFrame(anim.raf);
      anim = null;
      const from = marker.getLatLng();
      const now = performance.now();
      const gap = now - lastAt;
      lastAt = now;
      // Teleports (test mode) and coming back after a long time: jump, don't crawl.
      const dur = from.distanceTo(to) > TELEPORT_M || gap > 30_000 || document.hidden ? 0 : Math.min(1800, Math.max(250, gap * 0.9));
      if (!dur) {
        draw(to);
        if (followRef.current) map.setView(to, map.getZoom(), { animate: false });
        return;
      }
      const step = () => {
        const a = anim!;
        const t = Math.min(1, (performance.now() - a.start) / a.dur);
        draw(L.latLng(a.from.lat + (a.to.lat - a.from.lat) * t, a.from.lng + (a.to.lng - a.from.lng) * t));
        if (t < 1) a.raf = requestAnimationFrame(step);
        else anim = null;
      };
      anim = { from, to, start: now, dur, raf: requestAnimationFrame(step) };
      // A linear pan over the same duration keeps the camera locked onto the marker.
      if (followRef.current) map.panTo(to, { animate: true, duration: dur / 1000, easeLinearity: 1, noMoveStart: true });
    };

    let haloR = 0;
    const onSnap = () => {
      const s = getLocation();
      if (s === prev) return;
      const last = prev;
      prev = s;
      if (!s.pos) return;
      if (!last || last.pos !== s.pos) glide(L.latLng(s.pos.lat, s.pos.lng));
      if (!marker) return;

      if (reach!.getRadius() !== INTERACT_RADIUS_M) reach!.setRadius(INTERACT_RADIUS_M);
      // Accuracy halo like a maps app, only when it's wider than the reach circle.
      const acc = !s.simulated && s.accuracy && s.accuracy > INTERACT_RADIUS_M ? Math.round(Math.min(s.accuracy, 500)) : 0;
      if (acc !== haloR) {
        haloR = acc;
        halo!.setRadius(acc || 1);
        halo!.setStyle({ fillOpacity: acc ? 0.1 : 0 });
      }

      const el = marker.getElement();
      el?.classList.toggle("me-stale", s.stale);
      const cone = el?.querySelector<HTMLElement>(".me-heading");
      if (cone) {
        cone.style.opacity = s.heading == null ? "0" : "1";
        if (s.heading != null) cone.style.transform = `rotate(${s.heading}deg)`;
      }

      // Driving: zoom out a step above ~25 km/h, back in at walking pace.
      const drive = s.speed > DRIVE_ON ? true : s.speed < DRIVE_OFF ? false : driving.current;
      if (drive !== driving.current) {
        driving.current = drive;
        if (followRef.current) map.setZoom(drive ? ZOOM_DRIVE : ZOOM_WALK, { animate: true });
      }
      // Moving fast and the map's been left alone a while: follow again, like a nav app.
      if (!followRef.current && s.speed > REFOLLOW_SPEED && Date.now() - lastTouch.current > REFOLLOW_IDLE_MS) onFollowRef.current();
    };

    const unsub = subscribeLocation(onSnap);
    onSnap();
    return () => {
      unsub();
      if (anim) cancelAnimationFrame(anim.raf);
      marker?.remove();
      reach?.remove();
      halo?.remove();
      lines.forEach((l) => l.line.remove());
      api.current = null;
    };
  }, [map]);

  // Targets changed (new run, next waypoint…): rebuild the guide lines.
  const key = guideKey(guides);
  useEffect(() => api.current?.syncGuides(), [key]);

  // Re-centre when follow is switched back on; while following, pinch-zoom keeps you centred.
  useEffect(() => {
    const opts = map.options as L.MapOptions & { touchZoom: boolean | "center"; scrollWheelZoom: boolean | "center" };
    opts.touchZoom = follow ? "center" : true;
    opts.scrollWheelZoom = follow ? "center" : true;
    const p = api.current?.here();
    if (follow && p) map.setView(p, Math.max(map.getZoom(), driving.current ? ZOOM_DRIVE : ZOOM_WALK), { animate: true });
  }, [follow, map]);

  return null;
}
