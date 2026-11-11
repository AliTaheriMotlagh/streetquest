// Street voices in two languages: file layout, which voice says what, the device-voice choice.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BARKS } from "@/lib/street/barks";
import { jobsFor, lineFile, manifestPaths, MODELS, modelsFor, pickDeviceVoice, rawFile, voiceFor, voiceLangOf, VOICE_LANGS } from "@/lib/street/voiceLang";

it("Persian keeps its old file names; English lives in en/", () => {
  const b = BARKS[0];
  assert.equal(lineFile(b, "m", "fa"), "flee-1-m.mp3");
  assert.equal(lineFile(b, "m", "en"), "en/flee-1-m.mp3");
  assert.equal(rawFile(b, "f", "en"), "en/flee-1-f.wav");
});

it("the language follows the locale: Persian for fa, English for the rest", () => {
  assert.equal(voiceLangOf("fa"), "fa");
  assert.equal(voiceLangOf("fa-IR"), "fa");
  assert.equal(voiceLangOf("en"), "en");
  assert.equal(voiceLangOf("de"), "en");
});

it("every language has a voice for each kind, none of them non-commercial", () => {
  for (const lang of VOICE_LANGS) for (const v of ["m", "f", "cop"] as const) assert.ok(modelsFor(lang, v).length >= 1, `${lang} ${v}`);
  assert.ok(modelsFor("en", "m").length >= 2 && modelsFor("en", "f").length >= 2);
  for (const m of MODELS) assert.doesNotMatch(m.licence, /\bNC\b|non-?commercial|\bSA\b/i, m.id);
});

it("a line's voice is stable, from its own kind and language, and the pool is really used", () => {
  const jobs = jobsFor("en");
  assert.equal(jobs.length, BARKS.reduce((n, b) => n + b.voices.length, 0));
  for (const j of jobs) {
    assert.equal(j.model, voiceFor(j.b, j.v, "en"));
    assert.equal(j.model.kind, j.v);
    assert.equal(j.model.lang, "en");
    assert.equal(j.text, j.v === "f" && j.b.enF ? j.b.enF : j.b.en);
  }
  for (const v of ["m", "f"] as const) assert.equal(new Set(jobs.filter((j) => j.v === v).map((j) => j.model.id)).size, 2, v);
  assert.equal(new Set(jobs.map((j) => j.file)).size, jobs.length, "no two lines share a file");
});

it("the manifest knows both languages and ignores anything odd", () => {
  assert.deepEqual(manifestPaths({ files: ["a-1-m.mp3", "../x.mp3"], en: ["a-1-m.mp3", 3] }), ["a-1-m.mp3", "en/a-1-m.mp3"]);
  assert.deepEqual(manifestPaths({}), []);
});

it("the list to record from has the English file name and words of every line", async () => {
  const { readFileSync } = await import("node:fs");
  const rows = readFileSync("assets/voice-lines.tsv", "utf8").trim().split("\n").slice(1).map((r) => r.split("\t"));
  const want = jobsFor("en").map((j) => `${j.raw}\t${j.text}`);
  assert.deepEqual(rows.map((r) => `${r[5]}\t${r[4]}`), want, "out of date: npm run assets:voices -- --list");
});

it("the device voice: right language, then gender by name, then en-US", () => {
  const vs = [
    { name: "Daniel", lang: "en-GB" },
    { name: "Samantha", lang: "en-US" },
    { name: "Alex", lang: "en-US" },
    { name: "Karen", lang: "en-AU" },
    { name: "Maryam", lang: "fa-IR" },
  ];
  assert.equal(pickDeviceVoice(vs, "en", "f")?.name, "Samantha");
  assert.equal(pickDeviceVoice(vs, "en", "m")?.name, "Alex");
  assert.equal(pickDeviceVoice(vs, "en", "cop")?.name, "Alex");
  assert.equal(pickDeviceVoice(vs, "fa", "m")?.name, "Maryam");
  assert.equal(pickDeviceVoice([{ name: "Maryam", lang: "fa-IR" }], "en", "m"), null);
  assert.equal(pickDeviceVoice([{ name: "Google UK English Female", lang: "en-GB" }, { name: "Google UK English Male", lang: "en-GB" }], "en", "f")?.name, "Google UK English Female");
});
