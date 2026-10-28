// Live traffic: average speeds per ~50 m of road and direction (lib/traffic.ts), kept
// in TrafficCell. Two sources:
//  - players' real GPS: each accepted fix after the last one is a short trip at a known
//    speed (api/loc). Only cells that two or more players have driven in the last 15
//    minutes are ever shown, so nobody's own trip can be traced on the map;
//  - Neshan's live routing (NESHAN_API_KEY with the Direction service), asked only where
//    someone is looking at the city and at most every 5 minutes per ~2 km area: each
//    route step's live duration is that stretch's current speed.
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import { along, bearing, decodePolyline, dirOf, TRAFFIC_FRESH_MS, trafficKey, type TrafficCellOut } from "../lib/traffic";

type Sample = { p: LatLng; deg: number; kmh: number };

/** Fold readings into their cells (a running average; a stale cell starts over). */
async function record(samples: Sample[], src: "gps" | "neshan", who: string) {
  // One row per cell in a statement (Postgres can't update a row twice in one upsert).
  const byKey = new Map<string, { lat: number; lng: number; dir: number; kmh: number; n: number }>();
  for (const s of samples) {
    const dir = dirOf(s.deg), key = trafficKey(s.p, dir);
    const c = byKey.get(key);
    if (c) ((c.kmh += s.kmh), (c.lat += s.p.lat), (c.lng += s.p.lng), c.n++);
    else byKey.set(key, { lat: s.p.lat, lng: s.p.lng, dir, kmh: s.kmh, n: 1 });
  }
  if (!byKey.size) return;
  // A Neshan reading stands for many drivers; a player counts once.
  const users = src === "neshan" ? 2 : 1;
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

// ---------------------------------------------------------------- Neshan live routing
const NESHAN = process.env.NESHAN_BASE_URL ?? "https://api.neshan.org";
const AREA_DEG = 0.02;
const AREA_EVERY_MS = 5 * 60_000;
/** Until when Neshan is skipped (the key lacks the Direction service, or it's failing). */
let neshanOffUntil = 0;
let neshanWhy: "no-access" | "failing" | null = null;
const areaAsked = new Map<string, number>();

export type NeshanState = "on" | "off" | "no-access" | "failing";
export const neshanState = (): NeshanState => (!process.env.NESHAN_API_KEY ? "off" : Date.now() < neshanOffUntil ? (neshanWhy ?? "failing") : "on");

type NeshanStep = { distance?: { value?: number } | number; duration?: { value?: number } | number; polyline?: string | { points?: string } };
type NeshanRoute = { routes?: { legs?: { steps?: NeshanStep[] }[] }[]; code?: number; status?: string };
const num = (v: { value?: number } | number | undefined) => (typeof v === "number" ? v : v?.value ?? 0);

/** One live route → readings along each of its steps. */
export function samplesFromRoute(r: NeshanRoute): Sample[] {
  const out: Sample[] = [];
  for (const leg of r.routes?.[0]?.legs ?? [])
    for (const st of leg.steps ?? []) {
      const dist = num(st.distance), dur = num(st.duration);
      const poly = typeof st.polyline === "string" ? st.polyline : st.polyline?.points;
      if (dist < 60 || dur <= 0 || !poly) continue;
      const kmh = Math.max(2, Math.min(120, (dist / dur) * 3.6));
      for (const s of along(decodePolyline(poly), 45)) out.push({ ...s, kmh });
    }
  return out;
}

/**
 * Ask Neshan for live traffic across the ~2 km area around a point: four routes through
 * its middle (west↔east, south↔north). At most once per area every 5 minutes.
 */
export async function refreshNeshan(p: LatLng) {
  const key = process.env.NESHAN_API_KEY;
  if (!key || Date.now() < neshanOffUntil) return;
  const ay = Math.floor(p.lat / AREA_DEG), ax = Math.floor(p.lng / AREA_DEG), ak = `${ay}_${ax}`;
  if (Date.now() - (areaAsked.get(ak) ?? 0) < AREA_EVERY_MS) return;
  areaAsked.set(ak, Date.now());
  if (areaAsked.size > 5000) areaAsked.clear();
  const c = { lat: (ay + 0.5) * AREA_DEG, lng: (ax + 0.5) * AREA_DEG }, d = AREA_DEG * 0.45;
  const w = { lat: c.lat, lng: c.lng - d }, e = { lat: c.lat, lng: c.lng + d }, s = { lat: c.lat - d, lng: c.lng }, n = { lat: c.lat + d, lng: c.lng };
  const samples: Sample[] = [];
  for (const [a, b] of [[w, e], [e, w], [s, n], [n, s]]) {
    const url = `${NESHAN}/v4/direction?type=car&origin=${a.lat.toFixed(6)},${a.lng.toFixed(6)}&destination=${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
    const res = await fetch(url, { headers: { "Api-Key": key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as NeshanRoute | null;
    // 485: this key isn't enabled for Direction (Neshan panel → the key → services).
    if (res && (res.status === 485 || res.status === 401 || res.status === 403 || body?.code === 485)) {
      neshanWhy = "no-access";
      neshanOffUntil = Date.now() + 3600_000;
      return;
    }
    if (!res?.ok || !body) {
      neshanWhy = "failing";
      neshanOffUntil = Date.now() + 5 * 60_000;
      return;
    }
    samples.push(...samplesFromRoute(body));
  }
  await record(samples, "neshan", "neshan");
}
