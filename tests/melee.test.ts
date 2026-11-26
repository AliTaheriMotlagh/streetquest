import { test } from "node:test";
import assert from "node:assert/strict";
import { armDirs, COMBO_GAP_S, COOLDOWN_S, HIT_AT_S, HOOK_COOLDOWN_S, nextHand, punchCurve, punchDamage, PUNCH_S, startHand, throwPunch, type PunchState } from "../src/lib/street/melee";

test("punches chain right, left, right hook; a pause starts over; nothing while one recovers", () => {
  const s: PunchState = { last: null };
  const a = throwPunch(s, 10)!;
  assert.deepEqual([a.side, a.hook, a.combo], [1, false, 1]);
  assert.equal(throwPunch(s, 10 + COOLDOWN_S - 0.01), null);
  const b = throwPunch(s, 10 + COOLDOWN_S)!;
  assert.deepEqual([b.side, b.hook, b.combo], [-1, false, 2]);
  const c = throwPunch(s, b.at + COOLDOWN_S)!;
  assert.deepEqual([c.side, c.hook, c.combo], [1, true, 3]);
  assert.equal(throwPunch(s, c.at + COOLDOWN_S), null); // the hook recovers longer
  const d = throwPunch(s, c.at + HOOK_COOLDOWN_S)!;
  assert.deepEqual([d.side, d.hook, d.combo], [1, false, 1]); // after the hook: a fresh combo
  const e = throwPunch(s, d.at + COMBO_GAP_S + 0.01)!;
  assert.equal(e.combo, 1);
});

test("damage: the head hurts most, legs least, a hook ×1.6; a punch never one-shots", () => {
  assert.equal(punchDamage("body", false), 12);
  assert.equal(punchDamage("head", false), 18);
  assert.equal(punchDamage("legs", false), 8);
  assert.equal(punchDamage("head", true), 29);
  for (const z of ["head", "body", "legs"] as const) assert.ok(punchDamage(z, true) < 100 / 3);
});

test("the strike peaks when the fist lands, then returns to the guard", () => {
  assert.equal(punchCurve(-1), 0);
  assert.ok(punchCurve(0.03) < 0); // the pull back
  assert.ok(Math.abs(punchCurve(HIT_AT_S) - 1) < 1e-9);
  assert.equal(punchCurve(0.15), 1);
  assert.ok(punchCurve(0.3) > 0 && punchCurve(0.3) < 0.5);
  assert.equal(punchCurve(PUNCH_S), 0);
  let prev = -Infinity;
  for (let t = 0.05; t <= HIT_AT_S; t += 0.005) (assert.ok(punchCurve(t) >= prev - 1e-9), (prev = punchCurve(t)));
});

test("arm directions are unit vectors; the guard keeps fists up, the jab reaches forward, the hook swings across", () => {
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  for (const side of [1, -1] as const)
    for (const ext of [-0.15, 0, 0.5, 1])
      for (const hook of [false, true]) {
        const d = armDirs(side, ext, hook);
        assert.ok(Math.abs(len(d.upper) - 1) < 1e-9 && Math.abs(len(d.fore) - 1) < 1e-9);
      }
  const g = armDirs(1, 0);
  assert.ok(g.upper[1] < -0.5 && g.fore[1] > 0.5); // elbow down, fist up by the chin
  const jab = armDirs(1, 1);
  assert.ok(jab.upper[2] < -0.95 && jab.fore[2] < -0.95); // straight out in front (−z)
  const hook = armDirs(1, 1, true);
  assert.ok(hook.fore[0] < -0.8); // the right fist crosses to the left
  assert.ok(armDirs(-1, 1, true).fore[0] > 0.8); // mirrored
  assert.ok(armDirs(1, -0.15).upper[2] > g.upper[2]); // pulled back: the elbow goes behind
});

test("the swap button: fists first in the city, guns only in a match", () => {
  const lo = ["pistol", "smg"] as const;
  assert.equal(nextHand("fists", [...lo], false), "pistol");
  assert.equal(nextHand("pistol", [...lo], false), "smg");
  assert.equal(nextHand("smg", [...lo], false), "fists");
  assert.equal(nextHand("smg", [...lo], true), "pistol");
  assert.equal(nextHand("fists", [...lo], true), "pistol"); // fists aren't on offer: start the guns
  assert.equal(nextHand("rifle", [...lo], false), "fists");
  assert.equal(nextHand("fists", [], true), "fists");
  assert.equal(startHand(false, "smg"), "fists");
  assert.equal(startHand(true, "rifle"), "rifle");
});
