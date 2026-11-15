import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { canSkipSync, PULSE_MARGIN_MS } from "../src/lib/pulse";

const since = 1_800_000_000_000;

test("sync skips the reads only for a quiet poll with nothing stamped since", () => {
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: null, alertsMade: 0 }), true);
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: new Date(since - PULSE_MARGIN_MS - 1), alertsMade: 0 }), true);
});

test("sync reads everything when something may have changed", () => {
  // A stamp after (or just before, clocks drift) the last full answer.
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: new Date(since + 10), alertsMade: 0 }), false);
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: new Date(since - 1000), alertsMade: 0 }), false);
  // Timers just turned into notifications in this very poll.
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: null, alertsMade: 2 }), false);
  // Old clients (no q=1), the first poll, and "ring now" checks always get the full answer.
  assert.equal(canSkipSync({ quiet: false, since, pulseAt: null, alertsMade: 0 }), false);
  assert.equal(canSkipSync({ quiet: true, since: 0, pulseAt: null, alertsMade: 0 }), false);
  assert.equal(canSkipSync({ quiet: true, since: NaN, pulseAt: null, alertsMade: 0 }), false);
  // A stale Prisma client that doesn't know the column.
  assert.equal(canSkipSync({ quiet: true, since, pulseAt: undefined, alertsMade: 0 }), false);
});

// Every write the sync poll reads must stamp its players, or their polls answer "same" and miss it.
test("every notification, chat message and call write is followed by pulse()", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !p.includes("components")) files.push(p);
    }
  };
  walk("src");
  const writes = /prisma\.(notification\.create(Many)?|message\.create|call\.create|call\.updateMany)\(/;
  const missing: string[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!writes.test(line)) return;
      if (/call\.updateMany/.test(line) && !/ENDED/.test(line)) return;
      if (!lines.slice(i, i + 12).some((l) => /\bpulse\(/.test(l))) missing.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(missing, []);
});
