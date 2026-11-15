import { test } from "node:test";
import assert from "node:assert/strict";
import { Lru, singleFlight } from "../src/lib/lru";

test("the least recently used goes first; a read makes an entry the newest", () => {
  const c = new Lru<number>(2);
  c.set("a", 1).set("b", 2);
  assert.equal(c.get("a"), 1); // a is now newer than b
  c.set("c", 3);
  assert.equal(c.get("b"), undefined);
  assert.deepEqual([c.get("a"), c.get("c"), c.size], [1, 3, 2]);
});

test("entries older than the age limit are gone", () => {
  let now = 0;
  const c = new Lru<string>(10, 1000, () => now);
  c.set("k", "v");
  now = 999;
  assert.equal(c.get("k"), "v");
  now = 2000;
  assert.equal(c.get("k"), undefined);
  assert.equal(c.size, 0);
  // Stored "as of" an older time: judged by that time.
  c.set("old", "x", 500);
  assert.equal(c.entry("old"), undefined);
});

test("identical questions in flight share one run", async () => {
  const one = singleFlight<number>();
  let runs = 0;
  const load = () => new Promise<number>((r) => setTimeout(() => r(++runs), 5));
  const [a, b] = await Promise.all([one("q", load), one("q", load)]);
  assert.deepEqual([a, b, runs], [1, 1, 1]);
  // Done: the next question runs again.
  assert.equal(await one("q", load), 2);
});
