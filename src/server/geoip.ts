// Rough location from the client's IP, from what the host already knows (no extra service, no cost):
// Cloudflare's request.cf (production) or the geo headers Vercel adds. City-level at best, and absent
// locally — never used for anything location-checked, only to centre the map when the device can't
// locate itself. Through the Iran front door it's that server's city, not the player's: none then.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { LatLng } from "../lib/geo";
import { viaFront } from "../lib/clientIp";

type Cf = { latitude?: string | number; longitude?: string | number; city?: string };
type Where = LatLng & { city: string | null };

/** Pure: the place from Cloudflare's cf object, else Vercel's headers. */
export function geoFrom(h: { get(name: string): string | null }, cf?: Cf | null): Where | null {
  const fromCf = cf?.latitude != null && cf?.longitude != null;
  const rawLat = fromCf ? String(cf!.latitude) : h.get("x-vercel-ip-latitude");
  const rawLng = fromCf ? String(cf!.longitude) : h.get("x-vercel-ip-longitude");
  if (!rawLat || !rawLng) return null;
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  let city: string | null = fromCf ? cf!.city || null : h.get("x-vercel-ip-city");
  if (city && !fromCf) {
    try {
      city = decodeURIComponent(city);
    } catch {
      city = null;
    }
  }
  return { lat, lng, city };
}

export function ipLocation(req: Request): Where | null {
  if (viaFront(req.headers)) return null;
  let cf: Cf | null = null;
  try {
    cf = (getCloudflareContext().cf as Cf | undefined) ?? null;
  } catch {
    // Not on Cloudflare (dev server, Vercel): the headers are all there is.
  }
  return geoFrom(req.headers, cf);
}
