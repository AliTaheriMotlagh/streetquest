// Rough location from the client's IP, using the geo headers Vercel adds to every request
// (no extra service, no cost). City-level at best, and absent locally — never used for
// anything location-checked, only to centre the map when the device can't locate itself.
import type { LatLng } from "../lib/geo";

export function ipLocation(req: Request): (LatLng & { city: string | null }) | null {
  const lat = Number(req.headers.get("x-vercel-ip-latitude"));
  const lng = Number(req.headers.get("x-vercel-ip-longitude"));
  if (!req.headers.get("x-vercel-ip-latitude") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const city = req.headers.get("x-vercel-ip-city");
  let name: string | null = null;
  try {
    name = city ? decodeURIComponent(city) : null;
  } catch {}
  return { lat, lng, city: name };
}
