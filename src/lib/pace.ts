// Being a polite client of the store sites, so none of them ever has a reason to block us
// (pure rules; tests/pace.test.ts). Every request the server makes to one of them goes through
// that site's Pacer:
//  - requests start at least `gapMs` apart (never a burst, however many players ask at once);
//  - at most `perMin` a minute; past that the request isn't made at all — the caller serves its
//    cached copy (server/localData.ts `cached` falls back to the last good one);
//  - when the site says "slow down" or "forbidden" (`coolOn`) `strikes` times running, we stop
//    asking it altogether for `coolMs` and live off the cache.
// Snappfood matters most (menus, catalogs, prices), so it gets the gentlest pace.
// The budget is per server process: on a serverless host every instance has its own, which
// the cache (shared, in the database) keeps small in practice.

export type PaceRule = {
  /** Requests start at least this far apart (ms). */
  gapMs: number;
  /** At most this many requests in any minute. */
  perMin: number;
  /** Statuses that mean "you're asking too much" / "go away". */
  coolOn: number[];
  /** That many of them in a row… */
  strikes: number;
  /** …and we don't ask again for this long (ms). */
  coolMs: number;
};

const MIN = 60_000;
export const PACE_DEFAULT: PaceRule = { gapMs: 200, perMin: 40, coolOn: [429], strikes: 2, coolMs: 10 * MIN };
/** Each site by a word of its host (a relayed URL still has the host in it). */
export const PACE_RULES: { site: string; host: RegExp; rule: PaceRule }[] = [
  { site: "snappfood", host: /snappfood\.ir/i, rule: { gapMs: 350, perMin: 30, coolOn: [403, 429], strikes: 3, coolMs: 15 * MIN } },
  // Torob has its own gap and half-hour back-off in server/localData.ts; this only caps the minute.
  // Yemeksepeti (Delivery Hero's fd-api: vendor list, vendor page, reviews) — a 403 is its bot wall: stop asking a while.
  { site: "yemeksepeti", host: /fd-api\.com/i, rule: { gapMs: 300, perMin: 30, coolOn: [403, 429], strikes: 2, coolMs: 15 * MIN } },
  { site: "torob", host: /torob\.com/i, rule: { gapMs: 0, perMin: 40, coolOn: [], strikes: 1, coolMs: 0 } },
  { site: "divar", host: /divar\.ir/i, rule: { gapMs: 300, perMin: 30, coolOn: [429], strikes: 2, coolMs: 15 * MIN } },
  { site: "takhfifan", host: /takhfifan\.com/i, rule: { gapMs: 250, perMin: 30, coolOn: [429], strikes: 2, coolMs: 15 * MIN } },
  { site: "balad", host: /raah\.ir|balad\.ir/i, rule: { gapMs: 250, perMin: 30, coolOn: [429], strikes: 2, coolMs: 15 * MIN } },
  { site: "basalam", host: /basalam\.com/i, rule: PACE_DEFAULT },
  { site: "okala", host: /okala\.com/i, rule: PACE_DEFAULT },
  { site: "bilbooard", host: /bilbooard\.ir/i, rule: PACE_DEFAULT },
  { site: "irangaah", host: /irangaah\.ir/i, rule: PACE_DEFAULT },
  { site: "netbarg", host: /netbarg\.com/i, rule: PACE_DEFAULT },
  { site: "sheypoor", host: /sheypoor\.com/i, rule: PACE_DEFAULT },
];
/** A request that would have to wait longer than this isn't queued: the cache answers instead. */
export const PACE_MAX_WAIT_MS = 6000;

/** Which site a URL asks ("" for one we don't pace: our own relay's health, a test stub…). */
export function siteOfUrl(url: string): string {
  return PACE_RULES.find((r) => r.host.test(url))?.site ?? "";
}

export class Pacer {
  private next = 0;
  private coolUntil = 0;
  private struck = 0;
  private stamps: number[] = [];
  constructor(readonly rule: PaceRule) {}

  /** Are we leaving the site alone right now? */
  cooling(now: number) {
    return now < this.coolUntil;
  }

  /**
   * A request wants to go out now: how long it has to wait first (ms, 0 = go), or null —
   * don't make it (cooling off, this minute's budget is spent, or the queue is too long).
   */
  take(now: number): number | null {
    if (this.cooling(now)) return null;
    while (this.stamps.length && this.stamps[0] <= now - MIN) this.stamps.shift();
    if (this.stamps.length >= this.rule.perMin) return null;
    const at = Math.max(now, this.next);
    if (at - now > PACE_MAX_WAIT_MS) return null;
    this.next = at + this.rule.gapMs;
    this.stamps.push(at);
    return at - now;
  }

  /** What the site answered (0: no answer at all). */
  saw(status: number, now: number) {
    if (this.rule.coolOn.includes(status)) {
      if (++this.struck >= this.rule.strikes) {
        this.coolUntil = now + this.rule.coolMs;
        this.struck = 0;
      }
    } else if (status >= 200 && status < 400) this.struck = 0;
  }

  /** For the health page: requests in the last minute, and how long we're still backing off (s). */
  state(now: number) {
    return { lastMin: this.stamps.filter((t) => t > now - MIN).length, perMin: this.rule.perMin, coolS: Math.max(0, Math.ceil((this.coolUntil - now) / 1000)) };
  }
}

const pacers = new Map<string, Pacer>();
/** The pacer of the site this URL asks, or null: not paced (unknown host, or SITE_PACE=off — the e2e stubs). */
export function pacerFor(url: string, env: Record<string, string | undefined> = process.env): Pacer | null {
  if (env.SITE_PACE === "off") return null;
  const r = PACE_RULES.find((x) => x.host.test(url));
  if (!r) return null;
  let p = pacers.get(r.site);
  if (!p) {
    // SNAPPFOOD_PER_MIN=20 (any <SITE>_PER_MIN) tightens or loosens one site's minute without a deploy of code.
    const own = Number(env[`${r.site.toUpperCase()}_PER_MIN`]);
    pacers.set(r.site, (p = new Pacer(Number.isFinite(own) && own > 0 ? { ...r.rule, perMin: Math.round(own) } : r.rule)));
  }
  return p;
}

/** Every paced site's state right now (GET /api/health?ext=1). */
export function paceReport(now = Date.now()) {
  return Object.fromEntries([...pacers].map(([site, p]) => [site, p.state(now)]));
}
