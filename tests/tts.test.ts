import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, neuralPlan, parseExtras, parseNeuralPref, parseNeuralWomen, parsePicks, type DeviceInfo } from "../src/lib/tts/neural";
import { buildOf, bytesToGet, DEFAULT_PICK, FAMILIES, familyFor, isFamily, mirrors, SHERPA_VOICES, sherpaVoice, voiceBytes, voiceFor } from "../src/lib/tts/sherpa";
import { haaniyeIds, HAANIYE, piperIds } from "../src/lib/tts/ids";

const desktop: DeviceInfo = { memoryGb: 8, cores: 8, saveData: false, net: "4g", wasm: true, worker: true, mobile: false, lite: false };
const phone: DeviceInfo = { ...desktop, memoryGb: 4, mobile: true };

test("neural voices: on by themselves on a capable device (phones too: they come while the 3D city loads)", () => {
  assert.deepEqual(neuralPlan(desktop, "auto"), { use: true, why: "auto" });
  assert.deepEqual(neuralPlan(phone, "auto"), { use: true, why: "auto" });
  assert.equal(neuralPlan(phone, "on").use, true);
  assert.equal(neuralPlan(desktop, "off").why, "off");
  assert.equal(neuralPlan({ ...desktop, saveData: true }, "auto").why, "data-saver");
  assert.equal(neuralPlan({ ...desktop, net: "2g" }, "auto").why, "slow-net");
  assert.equal(neuralPlan({ ...desktop, net: "3g" }, "auto").use, true, "Iran's high-latency links read as 3g");
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

test("each role has a voice in each language; women are never a man's voice; Turkish women use the phone's", () => {
  const fa = { lang: "fa" as const, mobile: false };
  assert.equal(voiceFor("m", fa)!.id, "piper-fa-ganji-medium");
  assert.equal(voiceFor("m", { ...fa, mobile: true })!.light, true, "phones get the int8 build");
  assert.equal(voiceFor("cop", fa)!.id, voiceFor("m", fa)!.id, "the police: the men's download, through the megaphone");
  assert.equal(voiceFor("f", fa)!.family, "khadijah", "women: Khadije by default");
  assert.equal(voiceFor("f", { ...fa, pick: { f: null } }), null, "women turned off: the phone's voice");
  assert.equal(voiceFor("m", { ...fa, pick: { m: "amir" } })!.family, "amir");
  assert.equal(voiceFor("cop", { ...fa, pick: { cop: "gyro" } })!.family, "gyro");
  assert.equal(voiceFor("f", { ...fa, pick: { f: "amir" } }), null, "a man's voice is never a woman's");
  assert.equal(voiceFor("m", { lang: "en", mobile: false })!.lang, "en");
  assert.equal(voiceFor("f", { lang: "en", mobile: false })!.gender, "f");
  assert.equal(voiceFor("m", { lang: "tr", mobile: true })!.lang, "tr");
  assert.equal(voiceFor("f", { lang: "tr", mobile: false }), null);
  assert.equal(voiceFor("m", { lang: "en", mobile: false, pick: { m: "ganji" } }), null, "no Persian voice for English");
});

test("every language's voices: right language and gender, full builds where there are, English/Turkish small", () => {
  for (const lang of ["fa", "en", "tr"] as const) {
    for (const g of ["m", "f"] as const)
      for (const f of FAMILIES[lang][g]) {
        assert.equal(buildOf(f, false).gender, g, f);
        assert.equal(buildOf(f, false).lang, lang, f);
        assert.ok(isFamily(f, lang, g === "f" ? "f" : "cop"));
      }
    for (const r of ["m", "f", "cop"] as const) {
      const d = DEFAULT_PICK[lang][r];
      assert.ok(d == null || isFamily(d, lang, r), `${lang} ${r}`);
    }
  }
  assert.equal(buildOf("amir", true).id, "piper-fa-amir-medium-int8");
  assert.equal(buildOf("khadijah", true).id, "matcha-fa-en-khadijah", "Matcha has no int8 build");
  for (const v of SHERPA_VOICES.filter((v) => v.lang !== "fa")) assert.ok(v.files[3].size < 40 * 2 ** 20, `${v.id} is small`);
  assert.equal(new Set(SHERPA_VOICES.map((v) => v.id)).size, SHERPA_VOICES.length);
  assert.equal(familyFor([], 3), null);
  assert.equal(familyFor(["ganji", "amir", "reza"]), "ganji");
  assert.equal(new Set([1, 2, 3, 4, 5, 6].map((w) => familyFor(["ganji", "amir", "reza"], w))).size, 3);
});

test("saved picks: only real speakers of that language and role survive; an old 'women off' is kept", () => {
  assert.deepEqual(parsePicks(JSON.stringify({ fa: { m: "amir", f: "ganji", cop: null }, en: { f: "amy" }, xx: { m: "ryan" } })), { fa: { m: "amir", cop: null }, en: { f: "amy" } });
  assert.deepEqual(parsePicks("not json"), {});
  assert.deepEqual(parsePicks(null, "0"), { fa: { f: null } });
  assert.deepEqual(parsePicks(JSON.stringify({ fa: { f: "haaniye" } }), "0"), { fa: { f: "haaniye" } }, "a newer pick wins");
  assert.deepEqual(parseExtras(JSON.stringify({ fa: ["amir", "amir", "ryan"], tr: ["fettah"] })), { fa: ["amir"], tr: ["fettah"] });
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
  const ganji = sherpaVoice("piper-fa-ganji-medium")!, haaniye = sherpaVoice("mimic3-fa-haaniye-low")!;
  assert.equal(bytesToGet([ganji, haaniye]), voiceBytes(ganji) + voiceBytes(haaniye) - haaniye.files[1].size - haaniye.files[2].size);
  assert.equal(bytesToGet([haaniye], new Set(ganji.files.map((f) => f.sha256))), haaniye.files[0].size + haaniye.files[3].size);
  // Our own copy first when there is one; Hugging Face, then its mirror (blocked networks).
  assert.deepEqual(mirrors("x", "https://cdn.example/v").map((u) => new URL(u).host), ["cdn.example", "huggingface.co", "hf-mirror.com"]);
  // The download a phone asks for: about 46 MB (runtime + int8 Ganji); English or Turkish about the same.
  assert.equal(Math.round(bytesToGet([voiceFor("m", { lang: "fa", mobile: true })!]) / 2 ** 20), 46);
  assert.ok(Math.round(bytesToGet([voiceFor("m", { lang: "en", mobile: true })!]) / 2 ** 20) <= 47);
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
