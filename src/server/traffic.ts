// Live traffic: average speeds per ~50 m of road and direction (lib/traffic.ts), kept
// in TrafficCell, from players' real GPS: each accepted fix after the last one is a short trip
// at a known speed (api/loc). Only cells that two or more players have driven in the last 15
// minutes are ever shown, so nobody's own trip can be traced on the map. (Neshan's metered live
// routing used to feed it too; it's gone — 🧭 Route uses OSRM: server/footRoute.ts.)
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import { along, bearing, dirOf, TRAFFIC_FRESH_MS, trafficKey, type TrafficCellOut } from "../lib/traffic";
import type { RouteStep } from "../lib/routeSteps";
import { footRoute } from "./footRoute";

type Sample = { p: LatLng; deg: number; kmh: number };

/** Fold readings into their cells (a running average; a stale cell starts over). */
async function record(samples: Sample[], src: "gps", who: string) {
  // One row per cell in a statement (Postgres can't update a row twice in one upsert).
  const byKey = new Map<string, { lat: number; lng: number; dir: number; kmh: number; n: number }>();
  for (const s of samples) {
    const dir = dirOf(s.deg), key = trafficKey(s.p, dir);
    const c = byKey.get(key);
    if (c) ((c.kmh += s.kmh), (c.lat += s.p.lat), (c.lng += s.p.lng), c.n++);
    else byKey.set(key, { lat: s.p.lat, lng: s.p.lng, dir, kmh: s.kmh, n: 1 });
  }
  if (!byKey.size) return;
  const users = 1;
  const rows = [...byKey].map(([key, c]) => Prisma.sql`(${key}, ${c.lat / c.n}, ${c.lng / c.n}, ${c.dir}, ${c.kmh / c.n}, 1, ${users}, ${who}, ${src}, now())`);
  const stale = Prisma.sql`"TrafficCell"."updatedAt" < now() - make_interval(secs => ${TRAFFIC_FRESH_MS / 1000})`;
  await prisma.$executeRaw`
    INSERT INTO "TrafficCell" ("key", "lat", "lng", "dir", "kmh", "samples", "users", "lastUser", "src", "updatedAt")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("key") DO UPDATE SET
      "kmh" = CASE WHEN ${stale} THEN EXCLUDED."kmh" ELSE "TrafficCell"."kmh" * 0.7 + EXCLUDED."kmh" * 0.3 END,
      "lat" = CASE WHEN ${stale} THEN EXCLUDED."lat" ELSE "TrafficCell"."lat" * 0.8 + EXCLUDED."lat" * 0.2 END,
      "lng" = CASE WHEN ${stale} THEN EXCLUDED."lng" ELSE "TrafficCell"."lng" * 0.8 + EXCLUDED."lng" * 0.2 END,
      "samples" = CASE WHEN ${stale} THEN 1 ELSE "TrafficCell"."samples" + 1 END,
      "users" = CASE WHEN ${stale} THEN EXCLUDED."users"
                     WHEN "TrafficCell"."lastUser" IS DISTINCT FROM EXCLUDED."lastUser" THEN "TrafficCell"."users" + EXCLUDED."users"
                     ELSE "TrafficCell"."users" END,
      "lastUser" = EXCLUDED."lastUser",
      "src" = EXCLUDED."src",
      "updatedAt" = now()`;
}

/** Players are stored by a hash: the table never holds who drove where. */
const anon = (userId: string) => createHash("sha256").update(`traffic|${userId}`).digest("base64url").slice(0, 12);

/**
 * A player moved from one real GPS fix to the next: if it looks like driving (or riding),
 * that stretch of road is moving at that speed. Walking pace and GPS jumps are ignored.
 */
export function recordTrip(userId: string, from: LatLng, to: LatLng, seconds: number) {
  const m = distanceM(from, to), kmh = (m / seconds) * 3.6;
  if (seconds < 3 || seconds > 45 || m < 15 || kmh < 7 || kmh > 140) return null;
  const pts = along([from, to], 40);
  if (!pts.length) pts.push({ p: to, deg: bearing(from, to) });
  return record(pts.map((s) => ({ ...s, kmh })), "gps", anon(userId));
}

/** Live cells within `radiusM` of a point: [lat, lng, dir, km/h]. */
export async function trafficNear(p: LatLng, radiusM = 1500): Promise<TrafficCellOut[]> {
  const dLat = radiusM / 110_540, dLng = radiusM / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  const rows = await prisma.trafficCell.findMany({
    where: { lat: { gte: p.lat - dLat, lte: p.lat + dLat }, lng: { gte: p.lng - dLng, lte: p.lng + dLng }, updatedAt: { gte: new Date(Date.now() - TRAFFIC_FRESH_MS) }, users: { gte: 2 } },
    select: { lat: true, lng: true, dir: true, kmh: true },
    take: 5000,
  });
  return rows.map((r) => [Math.round(r.lat * 1e6) / 1e6, Math.round(r.lng * 1e6) / 1e6, r.dir, Math.round(r.kmh)]);
}

// ---------------------------------------------------------------- driving routes
/** A driving route: the line to draw, how far and how long, and the turns (lib/routeSteps.ts). */
export type LiveRoute = { line: [number, number][]; distanceM: number; durationS: number; steps: RouteStep[] };

/** A driving route along the streets (OSRM's car profile, worldwide, no key), or null when it can't route. */
export const liveRoute = (from: LatLng, to: LatLng): Promise<LiveRoute | null> => footRoute(from, to, "car");
