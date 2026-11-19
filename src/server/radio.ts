// The car radio's stations (lib/radio.ts) with where to play them from today: one request to
// radio-browser.info's directory for all of them, kept six hours. Directory servers come and go,
// so it tries a few mirrors. Nothing about the player is sent — only our stations' ids.
import { liveStations, REMIXT_DEFAULT, remixtStation, STATIONS, type LiveStation } from "@/lib/radio";

const MIRRORS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"];
const KEEP_MS = 6 * 3600_000, RETRY_MS = 5 * 60_000;
let cache: { at: number; list: LiveStation[] } | null = null;

/** Remixt Radio first (no lookup: its embed address is fixed; NEXT_PUBLIC_REMIXT_RADIO="" turns it off), then the directory's. */
export async function radioStations(fetcher: typeof fetch = fetch, now = Date.now()): Promise<LiveStation[]> {
  const remixt = remixtStation(process.env.NEXT_PUBLIC_REMIXT_RADIO ?? REMIXT_DEFAULT);
  return [...(remixt ? [remixt] : []), ...(await directoryStations(fetcher, now))];
}

async function directoryStations(fetcher: typeof fetch, now: number): Promise<LiveStation[]> {
  if (cache && now - cache.at < (cache.list.length ? KEEP_MS : RETRY_MS)) return cache.list;
  const ids = STATIONS.map((s) => s.id).join(",");
  let list: LiveStation[] = [];
  for (const m of MIRRORS) {
    try {
      const res = await fetcher(`${m}/json/stations/byuuid?uuids=${ids}`, { headers: { "user-agent": "StreetQuest/1.0" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      list = liveStations(await res.json());
      if (list.length) break;
    } catch {}
  }
  cache = { at: now, list };
  return list;
}

/** Tests: forget what was looked up. */
export const resetRadio = () => void (cache = null);
