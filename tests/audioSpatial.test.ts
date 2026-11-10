// 3D sound rules (lib/audio/spatial.ts): how loud, dull, late and echoing a sound is at a
// distance, where it sits around the head, and which sounds get a voice.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { admit, airCutoffHz, AUDIBLE, delayS, dopplerRate, gainAt, hear, panningFor, REACH, readOutput, SOUND_KINDS, stereo, surround, wetAt, type Ears } from "@/lib/audio/spatial";

/** Standing at the origin, looking north (−z), head up. */
const ears: Ears = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };

describe("distance", () => {
  it("is full volume up close, never louder, and silent from the sound's range on", () => {
    for (const k of SOUND_KINDS) {
      const r = REACH[k];
      assert.equal(gainAt(0, k), 1, k);
      assert.equal(gainAt(r.ref, k), 1, k);
      assert.equal(gainAt(r.max, k), 0, k);
      assert.equal(gainAt(r.max * 3, k), 0, k);
      assert.equal(gainAt(NaN, k), 0, k);
    }
  });
  it("only ever gets quieter with distance, with no jump anywhere (nothing pops in or out)", () => {
    for (const k of SOUND_KINDS) {
      let last = 1;
      for (let d = 0; d <= REACH[k].max + 5; d += 0.5) {
        const g = gainAt(d, k);
        assert.ok(g <= last + 1e-9, `${k} louder at ${d} m`);
        assert.ok(last - g < 0.12, `${k} jumps at ${d} m`);
        last = g;
      }
      assert.equal(last, 0);
    }
  });
  it("halves (−6 dB) when the distance doubles, in open air", () => {
    assert.ok(Math.abs(gainAt(18, "gun") - 0.5) < 1e-9);
    assert.ok(Math.abs(gainAt(36, "gun") - 0.25) < 1e-9);
  });
  it("gives each kind its own reach: a shot carries streets away, a voice doesn't", () => {
    assert.ok(gainAt(150, "gun") > AUDIBLE * 10);
    assert.ok(gainAt(300, "blast") > AUDIBLE * 10);
    assert.equal(gainAt(60, "voice"), 0);
    assert.ok(gainAt(200, "siren") > gainAt(200, "horn"));
  });
});

describe("the air in between", () => {
  it("leaves a near sound open and dulls a far one, never below a thud", () => {
    assert.equal(airCutoffHz(0), 20000);
    assert.equal(airCutoffHz(8), 20000);
    assert.ok(airCutoffHz(100) < 9000 && airCutoffHz(100) > 4000);
    assert.ok(airCutoffHz(300) < 1500);
    assert.equal(airCutoffHz(5000), 650);
    for (let d = 0, last = Infinity; d < 800; d += 10) (assert.ok(airCutoffHz(d) <= last), (last = airCutoffHz(d)));
  });
  it("makes sound arrive late: about a second per 343 m, capped", () => {
    assert.equal(delayS(0), 0);
    assert.ok(Math.abs(delayS(343) - 1) < 1e-9);
    assert.equal(delayS(5000), 1.5);
  });
  it("sends more of a far sound to the echo, none of the ambience", () => {
    assert.ok(wetAt(100, "gun") > wetAt(5, "gun"));
    assert.ok(wetAt(5000, "gun") <= 0.55);
    assert.equal(wetAt(50, "ambient"), 0);
  });
  it("bends pitch up when closing, down when leaving, and never squeals", () => {
    assert.equal(dopplerRate(0), 1);
    assert.ok(dopplerRate(20) > 1.04 && dopplerRate(20) < 1.08);
    assert.ok(dopplerRate(-20) < 0.96);
    assert.ok(dopplerRate(1e6) <= 1.25 && dopplerRate(-1e6) >= 0.8);
  });
});

describe("direction", () => {
  it("hears right as right, left as left, ahead and behind as centred", () => {
    assert.ok(hear(ears, { x: 10, z: 0 }).pan > 0.99);
    assert.ok(hear(ears, { x: -10, z: 0 }).pan < -0.99);
    const ahead = hear(ears, { x: 0, z: -10 }), behind = hear(ears, { x: 0, z: 10 });
    assert.ok(Math.abs(ahead.pan) < 1e-9 && ahead.front > 0.99);
    assert.ok(Math.abs(behind.pan) < 1e-9 && behind.front < -0.99);
    assert.equal(hear(ears, { x: 3, z: -4 }).dist, 5);
  });
  it("follows the head: turn to face east and what was on the right is ahead", () => {
    const east: Ears = { ...ears, fx: 1, fz: 0 };
    const h = hear(east, { x: 10, z: 0 });
    assert.ok(Math.abs(h.pan) < 1e-9 && h.front > 0.99);
    assert.ok(hear(east, { x: 0, z: 10 }).pan > 0.99); // south is now on the right
  });
  it("works looking straight down (the top-down camera: up is where the car points)", () => {
    const top: Ears = { ...ears, y: 60, fx: 0, fy: -1, fz: 0, ux: 0, uy: 0, uz: -1 };
    assert.ok(hear(top, { x: 30, y: 60, z: 0 }).pan > 0.99);
    assert.ok(hear(top, { x: -30, y: 60, z: 0 }).pan < -0.99);
  });
  it("puts a sound at the ears in the middle, and counts height in the distance", () => {
    assert.deepEqual(hear(ears, { x: 0, y: 1.6, z: 0 }), { dist: 0, pan: 0, front: 1 });
    assert.equal(hear(ears, { x: 0, y: 11.6, z: 0 }).dist, 10);
    assert.equal(hear(ears, { x: 6, z: 8 }).dist, 10); // no height given: at ear level
  });
  it("on stereo speakers never pans hard, and marks behind as a little quieter and duller", () => {
    const right = stereo(hear(ears, { x: 10, z: 0 })), behind = stereo(hear(ears, { x: 0, z: 10 })), ahead = stereo(hear(ears, { x: 0, z: -10 }));
    assert.ok(right.pan > 0.8 && right.pan < 0.9);
    assert.deepEqual(ahead, { pan: 0, gain: 1, cutoffK: 1 });
    assert.ok(behind.gain < 1 && behind.gain > 0.75 && behind.cutoffK < 0.6);
  });
  it("on 5.1 moves a sound from the front pair to the rear pair at constant power", () => {
    for (const at of [{ x: 0, z: -10 }, { x: 10, z: 0 }, { x: 0, z: 10 }, { x: -7, z: 7 }, { x: 3, z: -9 }]) {
      const s = surround(hear(ears, at));
      assert.ok(Math.abs(s.front ** 2 + s.rear ** 2 - 1) < 1e-9);
    }
    assert.equal(surround(hear(ears, { x: 0, z: -10 })).rear, 0);
    assert.equal(surround(hear(ears, { x: 0, z: 10 })).front, 0);
  });
});

describe("voices", () => {
  it("lets anything audible in while there's room, nothing once full, and nothing inaudible ever", () => {
    assert.ok(admit(0, 20, 0.01));
    assert.ok(admit(11, 20, 0.01));
    assert.ok(!admit(20, 20, 1));
    assert.ok(!admit(0, 20, AUDIBLE / 2));
  });
  it("keeps the last voices for near, loud sounds", () => {
    assert.ok(!admit(18, 20, 0.05)); // a far horn
    assert.ok(admit(18, 20, 0.9)); // the shot beside you
    assert.ok(admit(19, 20, 1));
  });
});

describe("output", () => {
  it("auto is 3D for headphones, unless the phone is weak", () => {
    assert.equal(panningFor("auto", { weak: false, channels: 2 }), "hrtf");
    assert.equal(panningFor("auto", { weak: true, channels: 2 }), "stereo");
    assert.equal(panningFor("auto", { weak: false, channels: 8 }), "hrtf"); // never 5.1 unasked
  });
  it("does what the player picked — 5.1 only on a device with six channels", () => {
    assert.equal(panningFor("headphones", { weak: true, channels: 2 }), "hrtf");
    assert.equal(panningFor("speakers", { weak: false, channels: 6 }), "stereo");
    assert.equal(panningFor("surround", { weak: false, channels: 6 }), "surround");
    assert.equal(panningFor("surround", { weak: false, channels: 2 }), "stereo");
  });
  it("reads a stored choice, falling back to auto", () => {
    assert.equal(readOutput("surround"), "surround");
    assert.equal(readOutput("dolby"), "auto");
    assert.equal(readOutput(null), "auto");
  });
});
