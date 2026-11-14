"use client";
// Istanbul's live buses asked by the player's own phone (lib/transit/iett.ts), for when the server
// can't reach IETT (its servers answer connections from Turkey only, and there's no relay there
// yet): a player in Istanbul is in Turkey. Two ways, the first that answers:
//  - ASMX's HTTP GET form (…/SeferGerceklesme.asmx/<method>?…): a plain GET, no CORS preflight;
//  - the SOAP POST the server uses (a preflight first).
// Either only works if IBB lets browsers read the answer (CORS); when neither does, it stops
// asking for a while and the cards say "about every N min" as before. One fleet answer is
// shared for 20 s; each line's for 20 s.
import { asmxJson, busOf, IETT_PATH, soapBody, STALE_MS, type IettMethod, type LiveBus } from "@/lib/transit/iett";

const ROOT = "https://api.ibb.gov.tr";
const KEEP_MS = 20_000;
/** After both ways failed: leave IETT alone this long. */
const BACKOFF_MS = 10 * 60_000;
let offUntil = 0;
const memo = new Map<string, { at: number; p: Promise<LiveBus[] | null> }>();

async function ask(method: IettMethod, params: Record<string, string>): Promise<unknown[] | null> {
  if (Date.now() < offUntil) return null;
  const url = `${ROOT}${IETT_PATH}`;
  const tries: (() => Promise<Response>)[] = [
    () => fetch(`${url}/${method}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(8000) }),
    () => fetch(url, { method: "POST", headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${method}"` }, body: soapBody(method, params), signal: AbortSignal.timeout(8000) }),
  ];
  for (const t of tries) {
    try {
      const r = await t();
      if (!r.ok) continue;
      return asmxJson(await r.text(), method);
    } catch {
      // Blocked (CORS), offline or too slow: the next way.
    }
  }
  offUntil = Date.now() + BACKOFF_MS;
  return null;
}

function cachedAsk(key: string, method: IettMethod, params: Record<string, string>, line?: string) {
  const had = memo.get(key);
  if (had && Date.now() - had.at < KEEP_MS) return had.p;
  const p = ask(method, params).then((rows) => {
    if (!rows) return null;
    const now = Date.now();
    return rows.map((r) => busOf(r, now)).filter((b): b is LiveBus => !!b && (!b.at || now - b.at < STALE_MS)).map((b) => (line && !b.line ? { ...b, line } : b));
  });
  memo.set(key, { at: Date.now(), p });
  return p;
}

/** Every bus on the road now, from this phone (null: IETT didn't answer here). */
export const clientFleet = () => cachedAsk("fleet", "GetFiloAracKonum_json", {});
/** One line's buses now, from this phone. */
export const clientLine = (line: string) => cachedAsk(`line:${line}`, "GetHatOtoKonum_json", { HatKodu: line }, line);
/** Is IETT answering this phone (as far as we know)? */
export const clientIettUp = () => Date.now() >= offUntil;
