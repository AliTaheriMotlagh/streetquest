// Istanbul's buses live, from IETT's public web service (IBB open data, SOAP with JSON inside;
// pure; tests/transit.test.ts) — the feed apps like Otobüsüm Nerede read: every bus's position
// (GetFiloAracKonum_json) and one line's buses with the stop each is nearest
// (GetHatOtoKonum_json). Field names vary in case between methods, so they're read loosely.
// Fetched and cached by server/transit.ts.

export const IETT_PATH = "/iett/FiloDurum/SeferGerceklesme.asmx";
export type IettMethod = "GetFiloAracKonum_json" | "GetHatOtoKonum_json";

/** The SOAP request for a method (HatKodu: the line, e.g. "500T"). */
export function soapBody(method: IettMethod, params: Record<string, string> = {}): string {
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const inner = Object.entries(params).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://tempuri.org/">${inner}</${method}></soap:Body></soap:Envelope>`;
}

/** The JSON array a method's answer carries in `<…Result>` (XML-escaped); [] when there's none. */
export function soapJson(xml: string, method: IettMethod): unknown[] {
  const m = new RegExp(`<${method}Result>([\\s\\S]*?)</${method}Result>`).exec(xml);
  if (!m) return [];
  const text = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export type LiveBus = { id: string; lat: number; lng: number; /** km/h, when known. */ kmh?: number; line?: string; /** Where it's headed (the route's direction name). */ towards?: string; /** The stop it's nearest (IETT's stop code). */ near?: string; /** When the position was taken (ms), when known. */ at?: number };

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return o[k];
  return undefined;
};
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN);
/** "2026-11-14 13:05:22" / "13:05:22" (Istanbul time) → ms; undefined if unreadable. */
export function iettTime(v: unknown, now = Date.now()): number | undefined {
  if (typeof v !== "string") return undefined;
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v);
  // Istanbul is UTC+3 all year.
  if (full) return Date.UTC(+full[1], +full[2] - 1, +full[3], +full[4] - 3, +full[5], +full[6]);
  const hms = /^(\d{2}):(\d{2}):(\d{2})$/.exec(v);
  if (!hms) return undefined;
  const d = new Date(now + 3 * 3600_000);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hms[1] - 3, +hms[2], +hms[3]);
  return t > now + 3600_000 ? t - 86_400_000 : t;
}

/** One bus from either method's row; null when it has no usable position. */
export function busOf(raw: unknown, now = Date.now()): LiveBus | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = num(pick(o, "enlem", "latitude")), lng = num(pick(o, "boylam", "longitude"));
  const id = String(pick(o, "kapino", "kapi_no", "plaka") ?? "").trim();
  // Istanbul's box: a zero or swapped position is dropped.
  if (!id || !(lat > 40.5 && lat < 41.7 && lng > 27.9 && lng < 30)) return null;
  const kmh = num(pick(o, "hiz", "speed"));
  const line = String(pick(o, "hatkodu", "hat_kodu") ?? "").trim();
  const towards = String(pick(o, "yon", "yonadi", "guzergah") ?? "").trim();
  const near = String(pick(o, "yakindurakkodu", "yakin_durak_kodu") ?? "").trim();
  const at = iettTime(pick(o, "son_konum_zamani", "saat"), now);
  return { id, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, ...(kmh >= 0 ? { kmh } : {}), ...(line ? { line } : {}), ...(towards ? { towards } : {}), ...(near ? { near } : {}), ...(at ? { at } : {}) };
}

/** A position older than this is a bus parked in its garage, not on the road. */
export const STALE_MS = 5 * 60_000;
/** City buses average about this through the traffic, stops included. */
const BUS_KMH = 17;

/**
 * Minutes until a live bus reaches a stop, as the crow flies × 1.4 for the streets at the city's
 * bus speed (its own speed when it's moving faster) — an estimate, as every arrival board's is.
 */
export function etaMin(bus: LiveBus, stop: { lat: number; lng: number }): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (stop.lat - bus.lat) * toR, dLng = (stop.lng - bus.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(bus.lat * toR) * Math.cos(stop.lat * toR) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h)) * 1.4;
  const kmh = Math.max(BUS_KMH, Math.min(40, bus.kmh ?? 0));
  return Math.max(0, Math.round(m / ((kmh * 1000) / 60)));
}

/** The JSON array in an ASMX HTTP-GET answer (`<string xmlns="http://tempuri.org/">[…]</string>`), or a SOAP one; [] if neither. */
export function asmxJson(xml: string, method: IettMethod): unknown[] {
  const soap = soapJson(xml, method);
  if (soap.length) return soap;
  const m = /<string[^>]*>([\s\S]*?)<\/string>/.exec(xml);
  if (!m) return [];
  const text = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export type Arrival = { line: string; minutes: number | null; live: boolean; headway: number; towards?: string };
/** A live bus further than this from the stop isn't "the next one" (it's at a far end of the route). */
export const NEXT_BUS_M = 8000;
/**
 * When each line's next bus comes to a stop: from its live buses when there are some (`live[i]`:
 * that line's buses, null = no live answer for it), the nearest one's distance as minutes; else
 * every `headway`. Soonest first.
 */
export function arrivalsAt(stop: { lat: number; lng: number }, lines: string[], live: (LiveBus[] | null)[], headways: Record<string, number>): Arrival[] {
  const R = 6371000, toR = Math.PI / 180;
  const metres = (b: { lat: number; lng: number }) => {
    const dLat = (b.lat - stop.lat) * toR, dLng = (b.lng - stop.lng) * toR;
    return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(stop.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2));
  };
  const out = lines.map<Arrival>((line, i) => {
    const headway = headways[line] ?? 15, buses = live[i];
    if (!buses) return { line, minutes: null, live: false, headway };
    const near = buses.map((b) => ({ b, m: metres(b) })).filter((x) => x.m <= NEXT_BUS_M).sort((a, b) => a.m - b.m)[0];
    return near ? { line, minutes: etaMin(near.b, stop), live: true, headway, ...(near.b.towards ? { towards: near.b.towards } : {}) } : { line, minutes: null, live: true, headway };
  });
  return out.sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || a.line.localeCompare(b.line, "en", { numeric: true }));
}

/** Live buses round a point from a list (the phone's own IETT answer), nearest first. */
export function busesNear(all: LiveBus[], at: { lat: number; lng: number }, radiusM = 2500, max = 80): LiveBus[] {
  const R = 6371000, toR = Math.PI / 180;
  const m = (b: LiveBus) => {
    const dLat = (b.lat - at.lat) * toR, dLng = (b.lng - at.lng) * toR;
    return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(at.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2));
  };
  return all.map((b) => ({ b, d: m(b) })).filter((x) => x.d <= radiusM).sort((a, b) => a.d - b.d).slice(0, max).map((x) => x.b);
}
