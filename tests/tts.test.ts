import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, FA_MODELS, neuralPlan, parseNeuralPref, type DeviceInfo } from "../src/lib/tts/neural";
import { haaniyeIds, HAANIYE, piperIds } from "../src/lib/tts/ids";

const desktop: DeviceInfo = { memoryGb: 8, cores: 8, saveData: false, net: "4g", wasm: true, worker: true, mobile: false, hosted: true, lite: false };
const phone: DeviceInfo = { ...desktop, memoryGb: 4, mobile: true };

test("neural voices: on by themselves only on a capable desktop; a phone has to ask", () => {
  assert.deepEqual(neuralPlan(desktop, "auto"), { use: true, why: "auto" });
  assert.equal(neuralPlan(phone, "auto").why, "phone-ask");
  assert.equal(neuralPlan(phone, "on").use, true);
  assert.equal(neuralPlan(desktop, "off").why, "off");
  assert.equal(neuralPlan({ ...desktop, saveData: true }, "auto").why, "data-saver");
  assert.equal(neuralPlan({ ...desktop, net: "3g" }, "auto").why, "slow-net");
  assert.equal(neuralPlan({ ...desktop, lite: true }, "auto").why, "weak");
  assert.equal(neuralPlan({ ...desktop, memoryGb: 1 }, "on").why, "weak", "even asked for, 1 GB is too little");
  assert.equal(neuralPlan({ ...desktop, hosted: false }, "on").why, "not-hosted");
  assert.equal(neuralPlan({ ...desktop, wasm: false }, "on").why, "unsupported");
  assert.equal(parseNeuralPref("on"), "on");
  assert.equal(parseNeuralPref("bogus"), "auto");
});

test("lines are cut into sentences the model says well", () => {
  assert.deepEqual(chunks("سلام! خوش اومدی. چی میل داری؟"), ["سلام!", "خوش اومدی.", "چی میل داری؟"]);
  const long = "این یک جمله‌ی خیلی طولانی است، که باید در جای مناسبی بریده شود تا مدل بتواند آن را خوب بگوید، و نه خیلی کند";
  const parts = chunks(long, 60);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 60));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long);
  assert.deepEqual(chunks("   "), []);
});

test("each kind of speaker has a Persian model", () => {
  assert.equal(FA_MODELS.m.kind, "piper");
  assert.equal(FA_MODELS.f.kind, "haaniye", "women aren't a pitched-up man");
  assert.ok(FA_MODELS.cop.file.includes("gyro"));
});

test("model ids: Piper pads every phoneme; haaniye ends words with #", () => {
  const map = { "^": [1], $: [2], _: [0], a: [5], b: [6] };
  assert.deepEqual(piperIds(["a", "?", "b"], map), [1, 0, 5, 0, 6, 0, 2]);
  const id = (p: string) => HAANIYE.indexOf(p);
  assert.deepEqual(haaniyeIds(["s", "a", " ", "m"]), [id("^"), id("_"), id("s"), id("_"), id("a"), id("_"), id("#"), id("_"), id("m"), id("_"), id("#"), id("_"), id("$")]);
});
