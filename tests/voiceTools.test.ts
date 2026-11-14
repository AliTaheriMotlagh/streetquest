import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeWav, rawNameOf, toMono, trimSilence, ttsUrl, validTemplate } from "@/lib/voiceTools";

describe("/dev/voices tools", () => {
  it("fills an HTTP TTS template", () => {
    assert.equal(ttsUrl("http://localhost:5002/api/tts?text={text}&lang={lang}&speaker={voice}", "سلام دنیا!", "fa", "f"), "http://localhost:5002/api/tts?text=%D8%B3%D9%84%D8%A7%D9%85%20%D8%AF%D9%86%DB%8C%D8%A7!&lang=fa&speaker=f");
    assert.equal(validTemplate("http://x/tts?q={text}"), true);
    assert.equal(validTemplate("http://x/tts"), false);
    assert.equal(validTemplate("javascript:{text}"), false);
  });
  it("writes a 16-bit mono WAV the voice pipeline reads", () => {
    const w = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 22050));
    assert.equal(String.fromCharCode(...[0, 1, 2, 3].map((i) => w.getUint8(i))), "RIFF");
    assert.equal(w.getUint16(22, true), 1);
    assert.equal(w.getUint32(24, true), 22050);
    assert.equal(w.byteLength, 44 + 8);
    assert.deepEqual([w.getInt16(44, true), w.getInt16(46, true), w.getInt16(48, true), w.getInt16(50, true)], [0, 32767, -32767, 32767]);
  });
  it("mixes to mono and trims a take's silent ends", () => {
    assert.deepEqual([...toMono([new Float32Array([1, 0]), new Float32Array([0, 1])])], [0.5, 0.5]);
    const take = new Float32Array(1000);
    take.fill(0.5, 400, 600);
    const t = trimSilence(take, 1000, 0.02, 0.01);
    assert.equal(t.length, 200 + 20);
  });
  it("matches dropped files to lines by name, per language", () => {
    assert.equal(rawNameOf("greet-3-f.mp3", "fa"), "greet-3-f.wav");
    assert.equal(rawNameOf("C:\\takes\\nearMiss-2-m.WAV", "tr"), "tr/nearMiss-2-m.wav");
    assert.equal(rawNameOf("notes.txt", "en"), null);
  });
});
