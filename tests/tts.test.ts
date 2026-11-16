import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, neuralPlan, parseNeuralPref, parseNeuralWomen, type DeviceInfo } from "../src/lib/tts/neural";
import { bytesToGet, mirrors, SHERPA_VOICES, voiceBytes, voiceFor } from "../src/lib/tts/sherpa";
import { haaniyeIds, HAANIYE, piperIds } from "../src/lib/tts/ids";

const desktop: DeviceInfo = { memoryGb: 8, cores: 8, saveData: false, net: "4g", wasm: true, worker: true, mobile: false, lite: false };
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

test("each kind of speaker has a Persian voice; women are never a man's voice", () => {
  assert.equal(voiceFor("m", { mobile: false, women: false })!.id, "piper-fa-ganji-medium");
  assert.equal(voiceFor("m", { mobile: true, women: false })!.light, true, "phones get the int8 build");
  assert.equal(voiceFor("cop", { mobile: false, women: false })!.id, voiceFor("m", { mobile: false, women: false })!.id, "the police: the same voice, through the megaphone");
  assert.equal(voiceFor("f", { mobile: false, women: false }), null);
  assert.equal(voiceFor("f", { mobile: true, women: true })!.gender, "f");
});

test("sherpa voices: complete, pinned, in the worker's file order, the runtime shared", () => {
  const ORDER = ["sherpa-onnx-wasm-main-tts.js", "sherpa-onnx-tts.js", "sherpa-onnx-wasm-main-tts.wasm", "sherpa-onnx-wasm-main-tts.data"];
  for (const v of SHERPA_VOICES) {
    assert.deepEqual(v.files.map((f) => f.name), ORDER, v.id);
    for (const f of v.files) assert.match(f.sha256, /^[0-9a-f]{64}$/, `${v.id}/${f.name}`);
    const m = (v.config as { offlineTtsModelConfig: { numThreads: number } }).offlineTtsModelConfig;
    assert.equal(m.numThreads, 1, "one thread: no SharedArrayBuffer needed");
    assert.ok(mirrors(v.id).every((u) => u.includes(`/wasm-${v.id}/`)));
  }
  assert.equal(new Set(SHERPA_VOICES.map((v) => v.files[2].sha256)).size, 1, "one runtime for all");
  // A second voice downloads only its own loader and data.
  const [ganji, , haaniye] = SHERPA_VOICES;
  assert.equal(bytesToGet([ganji, haaniye]), voiceBytes(ganji) + voiceBytes(haaniye) - haaniye.files[1].size - haaniye.files[2].size);
  assert.equal(bytesToGet([haaniye], new Set(ganji.files.map((f) => f.sha256))), haaniye.files[0].size + haaniye.files[3].size);
  // Our own copy first when there is one; Hugging Face, then its mirror (blocked networks).
  assert.deepEqual(mirrors("x", "https://cdn.example/v").map((u) => new URL(u).host), ["cdn.example", "huggingface.co", "hf-mirror.com"]);
  // The download a phone asks for: about 49 MB (runtime + int8 Ganji).
  assert.equal(Math.round(bytesToGet([voiceFor("m", { mobile: true, women: false })!]) / 2 ** 20), 46);
});

test("model ids: Piper pads every phoneme; haaniye ends words with #", () => {
  const map = { "^": [1], $: [2], _: [0], a: [5], b: [6] };
  assert.deepEqual(piperIds(["a", "?", "b"], map), [1, 0, 5, 0, 6, 0, 2]);
  const id = (p: string) => HAANIYE.indexOf(p);
  assert.deepEqual(haaniyeIds(["s", "a", " ", "m"]), [id("^"), id("_"), id("s"), id("_"), id("a"), id("_"), id("#"), id("_"), id("m"), id("_"), id("#"), id("_"), id("$")]);
});

test("women speak in their own voice unless the player turned it off (else every woman in the street is mute)", () => {
  assert.equal(parseNeuralWomen(null), true);
  assert.equal(parseNeuralWomen("1"), true);
  assert.equal(parseNeuralWomen("0"), false);
});
