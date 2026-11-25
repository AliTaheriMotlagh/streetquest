// One voice for conversations (lib/street/talkVoice.ts): neural → a recording only of the very same words →
// the phone's voice; a new line stops the old one, and a late voice for an older line is never heard.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchBark, normLine, TalkChannel, talkOrder } from "@/lib/street/talkVoice";
import { BARKS, type Bark } from "@/lib/street/barks";

const B = (o: Partial<Bark>): Bark => ({ id: "x", s: "greet", voices: ["m", "f"], fa: "سلام، خسته نباشی.", en: "Hi there.", ...o });

describe("normLine", () => {
  it("ignores case, punctuation, letter forms, ZWNJ and spacing", () => {
    assert.equal(normLine("  Hi,  THERE!! "), "hi there");
    assert.equal(normLine("مي‌کشتي؟"), normLine("میکشتی"));
    assert.equal(normLine("«كجا»"), "کجا");
  });
});

describe("matchBark", () => {
  const barks = [B({ id: "a" }), B({ id: "b", voices: ["m"], fa: "برو دیگه!", en: "Go already!" }), B({ id: "c", voices: ["cop"], en: "Stop the car!", fa: "ماشینو نگه دار!" }), B({ id: "d", en: "Take care.", enF: "Take care of yourself, dear.", fa: "مراقب خودت باش.", faF: "مواظب خودت باش عزیزم." })];
  it("finds a recording of exactly these words, in this voice", () => {
    assert.equal(matchBark("hi there", "en", "f", barks)?.bark.id, "a");
    assert.equal(matchBark("سلام خسته نباشی", "fa", "m", barks)?.bark.id, "a");
    assert.equal(matchBark("Take care of yourself, dear", "en", "f", barks)?.bark.id, "d", "a woman's own words");
    assert.equal(matchBark("Take care.", "en", "f", barks), null, "she says it her own way");
  });
  it("never a recording of other words, or another voice", () => {
    assert.equal(matchBark("Hi there, how are you?", "en", "m", barks), null);
    assert.equal(matchBark("Go already!", "en", "f", barks), null, "only men say it");
    assert.equal(matchBark("", "en", "m", barks), null);
  });
  it("lets a cop use a man's line when there's no police one", () => {
    assert.deepEqual(matchBark("Go already", "en", "cop", barks)?.voice, "m");
    assert.deepEqual(matchBark("Stop the car", "en", "cop", barks)?.voice, "cop");
  });
  it("works on the real lines", () => {
    const b = BARKS.find((x) => x.voices.includes("m"))!;
    assert.equal(matchBark(b.fa, "fa", "m", BARKS)?.bark.fa, b.fa);
  });
});

describe("talkOrder", () => {
  it("neural, then a matching recording, then the phone", () => {
    assert.deepEqual(talkOrder({ neural: true, recorded: true, device: true }), ["neural", "recorded", "device"]);
    assert.deepEqual(talkOrder({ neural: false, recorded: false, device: true }), ["device"]);
    assert.deepEqual(talkOrder({ neural: false, recorded: false, device: false }), []);
  });
});

describe("TalkChannel", () => {
  it("a new line stops the one being said", () => {
    const ch = new TalkChannel();
    const stopped: string[] = [];
    const t1 = ch.begin();
    assert.equal(ch.playing(t1, () => stopped.push("one")), true);
    assert.equal(ch.busy, true);
    const t2 = ch.begin();
    assert.deepEqual(stopped, ["one"]);
    assert.equal(ch.live(t1), false);
    assert.equal(ch.live(t2), true);
  });
  it("a voice for an older line is stopped at once, never two at a time", () => {
    const ch = new TalkChannel();
    const stopped: string[] = [];
    const t1 = ch.begin();
    const t2 = ch.begin();
    assert.equal(ch.playing(t2, () => stopped.push("two")), true);
    assert.equal(ch.playing(t1, () => stopped.push("late one")), false);
    assert.deepEqual(stopped, ["late one"], "the current one keeps going");
    assert.equal(ch.busy, true);
  });
  it("frees itself when the line ends, and cut() silences", () => {
    const ch = new TalkChannel();
    const t = ch.begin();
    const stop = () => {};
    ch.playing(t, stop);
    ch.ended(() => {});
    assert.equal(ch.busy, true, "someone else's end");
    ch.ended(stop);
    assert.equal(ch.busy, false);
    let n = 0;
    ch.playing(t, () => n++);
    ch.cut();
    assert.equal(n, 1);
    assert.equal(ch.busy, false);
  });
});
