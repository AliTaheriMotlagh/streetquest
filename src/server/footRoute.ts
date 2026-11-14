// Routes along the streets anywhere in the world: FOSSGIS's public OSRM (routing.openstreetmap.de,
// OpenStreetMap data, no key) — on foot for play-from-home walks (the marker goes down streets and
// round blocks, not through buildings), by car where Neshan can't route (outside Iran, no key).
// Paced to its policy (lib/pace.ts: one request a second), the same trip remembered ten minutes.
// OSRM_FOOT_URL / OSRM_CAR_URL point at your own OSRM servers (…/route/v1/<profile>); "off" turns one off.
import type { LatLng } from "@/lib/geo";
import { pacerFor } from "@/lib/pace";
import { decodePolyline } from "@/lib/traffic";
import type { LiveRoute } from "./traffic";

const BASE = (mode: "foot" | "car") =>
  mode === "foot" ? (process.env.OSRM_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot/route/v1/foot") : (process.env.OSRM_CAR_URL ?? "https://routing.openstreetmap.de/routed-car/route/v1/driving");
const UA = () => `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;
const MEMO_MS = 10 * 60_000;
const memo = new Map<string, { at: number; route: LiveRoute | null }>();

/** A route on foot (the default) or by car: the line, how far, how long — or null when it can't be had. */
export async function footRoute(from: LatLng, to: LatLng, mode: "foot" | "car" = "foot"): Promise<LiveRoute | null> {
  const base = BASE(mode);
  if (base === "off") return null;
  const k = `${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.route;
  const url = `${base}/${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}?overview=full&geometries=polyline&steps=false`;
  const pace = pacerFor(url);
  const hold = pace ? pace.take(Date.now()) : 0;
  if (hold == null) return null;
  if (hold > 0) await new Promise((r) => setTimeout(r, hold));
  try {
    const res = await fetch(url, { headers: { "user-agent": UA() }, signal: AbortSignal.timeout(8000) });
    pace?.saw(res.status, Date.now());
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string; routes?: { geometry?: string; distance?: number; duration?: number }[] };
    const r = body.code === "Ok" ? body.routes?.[0] : undefined;
    if (!r?.geometry) return null;
    const line = decodePolyline(r.geometry).map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6] as [number, number]);
    const route: LiveRoute = { line, distanceM: Math.round(r.distance ?? 0), durationS: Math.round(r.duration ?? 0), steps: [] };
    if (memo.size > 500) memo.delete(memo.keys().next().value!);
    memo.set(k, { at: Date.now(), route });
    return route;
  } catch {
    return null;
  }
}
