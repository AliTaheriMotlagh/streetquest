// What people in the open city say (lib/street/barks.ts): every situation has lines for the
// voices that speak in it, the recordings have safe unique names, and nobody repeats the
// line they just said.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BARKS, barkFile, pickBark, QUIET_S, sayFor, type Situation } from "@/lib/street/barks";

it("every line is Persian with an English subtitle, and a unique recording", () => {
  const files = new Set<string>();
  for (const b of BARKS) {
    assert.match(b.fa, /[؀-ۿ]/, b.id);
    assert.ok(b.en.length > 2, b.id);
    for (const v of b.voices) {
      const f = barkFile(b, v);
      assert.match(f, /^[\w-]+\.mp3$/);
      assert.ok(!files.has(f), f);
      files.add(f);
    }
    assert.ok(sayFor(b) >= 1.8 && sayFor(b) <= 4.5);
  }
});

it("each situation has someone to say it: men and women on the street, officers for the police", () => {
  for (const s of Object.keys(QUIET_S) as Situation[]) {
    const cop = s.startsWith("cop");
    for (const v of cop ? (["cop"] as const) : (["m", "f"] as const)) assert.ok(pickBark(s, v, Math.random), `${s} / ${v}`);
  }
  assert.equal(pickBark("copStop", "m", Math.random), null, "a passer-by doesn't shout police orders");
});

it("nobody says the same thing twice in a row (while there's another line)", () => {
  const first = pickBark("flee", "m", () => 0)!;
  for (let i = 0; i < 20; i++) assert.notEqual(pickBark("flee", "m", Math.random, [first.id])!.id, first.id);
  // Only one line: it's said again rather than nothing.
  const only = pickBark("copBusted", "cop", () => 0)!;
  assert.equal(pickBark("copBusted", "cop", Math.random, [only.id])!.id, only.id);
});
