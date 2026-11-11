// The "Update" bar (lib/updatePrompt.ts): it used to come back over and over.
import assert from "node:assert/strict";
import { it } from "node:test";
import { LATER_MS, mayOffer, NO_SNOOZE, parseSnooze, snoozeLater, snoozeStuck, STUCK_MS } from "@/lib/updatePrompt";

const NOW = 1_700_000_000_000;

it("offered when nothing is snoozed", () => assert.ok(mayOffer(NO_SNOOZE, NOW)));

it('"Later" keeps it away for hours, across reloads', () => {
  const s = snoozeLater(NO_SNOOZE, NOW);
  assert.ok(!mayOffer(parseSnooze(JSON.stringify(s)), NOW + 60_000));
  assert.ok(mayOffer(s, NOW + LATER_MS));
});

it("an update that wouldn't take over isn't offered again straight away, and waits longer each time", () => {
  const a = snoozeStuck(NO_SNOOZE, NOW), b = snoozeStuck(a, NOW);
  assert.equal(a.until - NOW, STUCK_MS);
  assert.equal(b.until - NOW, STUCK_MS * 2);
  assert.ok(!mayOffer(b, NOW + STUCK_MS));
  let s = NO_SNOOZE;
  for (let i = 0; i < 20; i++) s = snoozeStuck(s, NOW);
  assert.ok(s.until - NOW <= 12 * 3600_000, "never longer than half a day");
});

it("whatever was stored, a broken value means no snooze", () => {
  for (const raw of [null, "", "{", "[]", '{"until":"x"}']) assert.deepEqual(parseSnooze(raw), { until: 0, stuck: 0 });
});
