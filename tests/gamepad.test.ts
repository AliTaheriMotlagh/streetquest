// Controller mapping (lib/input/gamepad.ts) and the touch stick / look maths (lib/input/touch.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { padActive, padKind, padNames, pressed, radial, readPad, stick, trigger, type PadSnapshot } from "@/lib/input/gamepad";
import { arc, clampSens, FOOT_BELOW_MAX, FOOT_BTN, footActions, footLayout, lookGain, stickMove } from "@/lib/input/touch";

const btn = (pressedV = false, value = pressedV ? 1 : 0) => ({ pressed: pressedV, value });
const snap = (axes: number[], on: Record<number, number> = {}): PadSnapshot => ({
  id: "x",
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => (on[i] != null ? btn(on[i] > 0.5, on[i]) : btn())),
});

describe("gamepad", () => {
  it("knows the family from the id string", () => {
    assert.equal(padKind("054c-0ce6-DualSense Wireless Controller"), "playstation");
    assert.equal(padKind("Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)"), "xbox");
    assert.equal(padKind("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"), "switch");
    assert.equal(padKind("Some Pad"), "generic");
    assert.equal(padNames("playstation").south, "✕");
    assert.equal(padNames("xbox").east, "B");
    assert.equal(padNames("generic").r2, "RT");
  });
  it("radial deadzone swallows drift and rescales the rest", () => {
    assert.deepEqual(radial(0.1, 0.1), { x: 0, y: 0 });
    const r = radial(1, 0, 0.2, 1);
    assert.ok(Math.abs(r.x - 1) < 1e-9 && r.y === 0);
    const d = radial(0.6, 0.6);
    assert.ok(Math.abs(d.x - d.y) < 1e-9, "direction kept");
    assert.ok(Math.hypot(d.x, d.y) <= 1);
  });
  it("the curve gives fine control near the centre but full range at the edge", () => {
    assert.ok(stick(0.4, 0).x < radial(0.4, 0).x);
    assert.ok(Math.abs(stick(1, 0).x - 1) < 1e-9);
  });
  it("reads sticks (up is +1), analog triggers and held buttons", () => {
    const f = readPad(snap([0.9, -0.9, 0, 0], { 0: 1, 7: 0.6, 6: 0.2 }));
    assert.ok(f.move.x > 0.5 && f.move.y > 0.5);
    assert.equal(f.look.x, 0);
    assert.ok(f.r2 > 0.5 && f.r2 < 0.7);
    assert.ok(f.l2 > 0 && !f.held.l2, "a light squeeze is no button press");
    assert.ok(f.held.south && f.held.r2);
  });
  it("a trigger reported only as a button counts as fully pressed", () => {
    assert.equal(trigger({ pressed: true, value: 0 }), 1);
    assert.equal(trigger({ pressed: false, value: 0.02 }), 0);
  });
  it("each press fires once", () => {
    const a = readPad(snap([0, 0, 0, 0], { 0: 1 })).held, b = readPad(snap([0, 0, 0, 0], { 0: 1, 1: 1 })).held;
    assert.deepEqual(pressed(null, a), ["south"]);
    assert.deepEqual(pressed(a, b), ["east"]);
    assert.deepEqual(pressed(b, b), []);
  });
  it("a drifting stick inside the deadzone is not use", () => {
    assert.equal(padActive(readPad(snap([0.05, -0.08, 0.03, 0]))), false);
    assert.equal(padActive(readPad(snap([0, 0, 0, 0], { 9: 1 }))), true);
  });
});

describe("touch controls", () => {
  it("the floating stick: direction, edge sprint, anchor follows past the rim", () => {
    const s = { ox: 100, oy: 300 };
    const up = stickMove(s, 100, 250);
    assert.ok(up.y > 0.8 && Math.abs(up.x) < 1e-9 && !up.sprint);
    assert.ok(stickMove(s, 100, 300 - 70).sprint, "pushed past the edge sprints");
    const far = stickMove(s, 100, 100);
    assert.ok(s.oy < 300, "anchor moved with the thumb");
    assert.ok(far.mag <= 1);
    assert.equal(stickMove({ ox: 0, oy: 0 }, 2, 2).mag, 0, "dead centre");
  });
  it("the edge of the stick asks for a sprint whichever way (the body decides: foot.test.ts)", () => {
    assert.equal(stickMove({ ox: 0, oy: 0 }, 90, 0).sprint, true);
    assert.equal(stickMove({ ox: 0, oy: 0 }, 0, 90).sprint, true);
    assert.equal(stickMove({ ox: 0, oy: 0 }, 30, 0).sprint, false);
  });
  it("look accelerates with flick speed and honours sensitivity", () => {
    assert.equal(lookGain(0.1, 1), 1);
    assert.ok(lookGain(2, 1) > 2);
    assert.ok(lookGain(2, 1) <= 2.3);
    assert.ok(lookGain(0.1, 2) > lookGain(0.1, 1));
    assert.equal(clampSens(NaN), 1);
    assert.equal(clampSens(99), 2.5);
  });
  it("the action arc mirrors for left-handed play", () => {
    const r = arc(3, 100), l = arc(3, 100, 100, 190, true);
    assert.equal(r.length, 3);
    r.forEach((p, i) => assert.ok(Math.abs(p.x + l[i].x) < 1e-9 && p.y === l[i].y));
  });
  it("the on-foot buttons clear each other and the fire button, stay on the screen, and mirror", () => {
    const r = footLayout(), l = footLayout(true);
    const keys = Object.keys(r) as (keyof typeof r)[];
    assert.deepEqual([...keys].sort(), ["aim", "car", "crouch", "jump", "reload", "swap"]);
    for (const a of keys) {
      assert.ok(Math.hypot(r[a].x, r[a].y) >= 44 + FOOT_BTN / 2 + 8, `${a} clears the fire button`);
      assert.ok(r[a].y <= FOOT_BELOW_MAX, `${a} is whole above the bottom edge (${r[a].y.toFixed(0)})`);
      assert.ok(r[a].x < 0, `${a} is on the thumb's inner side`);
      assert.ok(Math.abs(r[a].x + l[a].x) < 1e-9 && r[a].y === l[a].y, `${a} mirrors`);
      for (const b of keys) if (a < b) assert.ok(Math.hypot(r[a].x - r[b].x, r[a].y - r[b].y) >= FOOT_BTN + 6, `${a} and ${b} don't touch`);
    }
    // Dead-eye (fixed in the stylesheet at 46, -84) keeps clear of the inner ring too.
    for (const a of keys) assert.ok(Math.hypot(r[a].x - 46, r[a].y + 84) >= FOOT_BTN + 4, `${a} clears dead-eye`);
  });
  it("the car button shows only near a car and never in a match", () => {
    assert.ok(!footActions({ nearCar: false, inMatch: false }).includes("car"));
    assert.ok(footActions({ nearCar: true, inMatch: false }).includes("car"));
    assert.ok(!footActions({ nearCar: true, inMatch: true }).includes("car"));
  });
});
