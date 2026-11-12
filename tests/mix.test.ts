// The sound mixer: a saved mix is always whole and valid; each sound answers to the right slider.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { busOfKind, busOfSlot, DEFAULT_MIX, parseMix, sliderGain } from "@/lib/audio/mix";
import { SOUND_KINDS } from "@/lib/audio/spatial";
import { SOUND_SLOTS } from "@/lib/soundSlots";

describe("sound mixer", () => {
  it("reads what was saved, clamps it, and fills what's missing or broken", () => {
    assert.deepEqual(parseMix(null), DEFAULT_MIX);
    assert.deepEqual(parseMix("not json"), DEFAULT_MIX);
    const m = parseMix(JSON.stringify({ master: 0.5, weapons: 2, voices: -1, ambience: "loud", extra: 1 }));
    assert.equal(m.master, 0.5);
    assert.equal(m.weapons, 1);
    assert.equal(m.voices, 0);
    assert.equal(m.ambience, 1);
    assert.ok(!("extra" in m));
  });
  it("sliders feel even: half way is a quarter of the power, zero is silence", () => {
    assert.equal(sliderGain(0), 0);
    assert.equal(sliderGain(0.5), 0.25);
    assert.equal(sliderGain(1), 1);
  });
  it("guns and blasts, cars and sirens, voices and the city each have their slider — every kind and slot has one", () => {
    assert.equal(busOfKind("gun"), "weapons");
    assert.equal(busOfKind("siren"), "vehicles");
    assert.equal(busOfKind("voice"), "voices");
    assert.equal(busOfKind("ambient"), "ambience");
    assert.equal(busOfKind("small"), "effects");
    assert.equal(busOfSlot("explosion"), "weapons");
    assert.equal(busOfSlot("engineStart"), "vehicles");
    assert.equal(busOfSlot("crashHeavy"), "vehicles");
    assert.equal(busOfSlot("city"), "ambience");
    assert.equal(busOfSlot("doorOpen"), "effects");
    for (const k of SOUND_KINDS) assert.ok(busOfKind(k));
    for (const k of Object.keys(SOUND_SLOTS)) assert.ok(busOfSlot(k));
  });
});
