// When to offer "Update" again (components/Pwa.tsx). Pure: tests/updatePrompt.test.ts.
//  - "Later": not again for a few hours — it used to come back on every reload and every
//    return to the app while the new version waited;
//  - an update that wouldn't take over (the old version kept the page — a map game always has
//    requests in flight): it used to offer the bar again straight away, round and round. Now
//    it waits, longer each time; the new version takes over anyway next time the app is opened.
export type UpdateSnooze = { until: number; stuck: number };

export const LATER_MS = 6 * 3600_000;
export const STUCK_MS = 30 * 60_000;
const STUCK_MAX_MS = 12 * 3600_000;

export const NO_SNOOZE: UpdateSnooze = { until: 0, stuck: 0 };

export const mayOffer = (s: UpdateSnooze, now: number) => now >= s.until;
export const snoozeLater = (s: UpdateSnooze, now: number): UpdateSnooze => ({ ...s, until: Math.max(s.until, now + LATER_MS) });
export const snoozeStuck = (s: UpdateSnooze, now: number): UpdateSnooze => ({ stuck: s.stuck + 1, until: now + Math.min(STUCK_MAX_MS, STUCK_MS * 2 ** s.stuck) });

/** Read back what was stored (anything broken: no snooze). */
export function parseSnooze(raw: string | null): UpdateSnooze {
  try {
    const v = JSON.parse(raw ?? "") as Partial<UpdateSnooze>;
    return { until: Number(v.until) || 0, stuck: Math.max(0, Math.floor(Number(v.stuck) || 0)) };
  } catch {
    return NO_SNOOZE;
  }
}
