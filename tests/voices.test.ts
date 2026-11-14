// The women's voice for the recorded lines (app/dev/voices/haaniye.ts): IPA symbols become
// Mimic 3 haaniye's ids exactly as Mimic 3 makes them, and its sound a valid WAV.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HAANIYE, haaniyeIds, wav } from "@/app/dev/voices/haaniye";

const id = (p: string) => HAANIYE.indexOf(p);

it("phonemes2ids: ^, a blank, each phoneme then a blank, # between words, $", () => {
  // "sɑlɑm !" — two words, the second only punctuation (! → .).
  const ids = haaniyeIds(["s", "ɑ", "l", "ɑ", "m", " ", "!"]);
  const _ = id("_");
  assert.deepEqual(ids, [id("^"), _, id("s"), _, id("ɑ"), _, id("l"), _, id("ɑ"), _, id("m"), _, id("#"), _, id("."), _, id("#"), _, id("$")]);
});

it("stress marks are their own phonemes; unknown symbols are dropped; empty words leave nothing", () => {
  const ids = haaniyeIds(["ˈ", "b", "ʊ", " ", " ", "ʔ", "ː"]);
  const _ = id("_");
  assert.deepEqual(ids, [id("^"), _, id("ˈ"), _, id("b"), _, id("#"), _, id("ʔ"), _, id("ː"), _, id("#"), _, id("$")]);
  assert.equal(HAANIYE.length, 37);
});

it("its sound becomes a 16-bit mono WAV, scaled down if it clips", async () => {
  const b = wav(Float32Array.from([0, 0.5, -2, 1]), 22050);
  const v = new DataView(await b.arrayBuffer());
  assert.equal(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), "RIFF");
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(48, true), -0x7fff, "the loudest sample at full scale");
  assert.ok(Math.abs(v.getInt16(46, true) - 0x7fff / 4) <= 1);
});

describe("any Piper voice on /dev/voices (piperRun.ts)", () => {
  it("phonemes → ids as Piper makes them: ^, _, each phoneme then _, $; unknown symbols dropped", async () => {
    const { piperIds } = await import("@/app/dev/voices/piperRun");
    const map = { _: [0], "^": [1], $: [2], " ": [3], m: [25], e: [18], ɾ: [92] };
    assert.deepEqual(piperIds(["m", "e", "ɾ", " ", "☃", "m"], map), [1, 0, 25, 0, 18, 0, 92, 0, 3, 0, 25, 0, 2]);
  });
});
