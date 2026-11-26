// Punching other players in the open city (realtime/space.ts punch, lib/street/melee.ts): only bare-handed,
// only at arm's length, only between players out of passive mode, never faster than the cooldown.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { World } from "../realtime/world";
import { Player, type Sock } from "../realtime/player";
import { F_FOOT, type ServerMsg } from "../src/lib/arena/protocol";
import { BARE_IDX, MAX_HP, WEAPONS } from "../src/lib/arena/weapons";
import { punchDamage, punchGapMs } from "../src/lib/street/melee";

const ANCHOR = { lat: 35.7, lng: 51.4 };
const sock = (inbox: ServerMsg[]): Sock => ({ readyState: 1, bufferedAmount: 0, send: (d) => typeof d === "string" && inbox.push(JSON.parse(d)), close() {} });

/** Two fighters `gap` metres apart along -z (A looks at B), both out of passive mode and far from where they started. */
function pair(gap: number) {
  const w = new World();
  const inbox: ServerMsg[] = [];
  const mk = (sid: number) => {
    const p = new Player({ sid, userId: `u${sid}`, name: `P${sid}`, avatar: "", level: 50, ws: sock(inbox), anchor: ANCHOR });
    w.add(p);
    p.flags = F_FOOT;
    p.passive = false;
    p.start = { lat: ANCHOR.lat + 0.1, lng: ANCHOR.lng };
    return p;
  };
  const a = mk(1), b = mk(2);
  const F = a.frame;
  a.moveTo(F.toLL(0, 0), 0, 1000);
  b.moveTo(F.toLL(0, -gap), 0, 1000);
  a.weapon = BARE_IDX;
  return { w, a, b };
}
const jab = (hook = false) => ({ t: "punch" as const, at: 1000, o: [0, 1.5, 0] as [number, number, number], d: [0, 0, -1] as [number, number, number], hook });

describe("punching players (realtime)", () => {
  it("lands at arm's length, harder with a hook", () => {
    const { w, a, b } = pair(1);
    w.punch(a, jab(), 1000);
    assert.equal(b.hp, MAX_HP - punchDamage("body", false));
    w.punch(a, jab(true), 1000 + punchGapMs(false));
    assert.equal(b.hp, MAX_HP - punchDamage("body", false) - punchDamage("body", true));
  });
  it("misses beyond reach", () => {
    const { w, a, b } = pair(4);
    w.punch(a, jab(), 1000);
    assert.equal(b.hp, MAX_HP);
  });
  it("needs empty hands", () => {
    const { w, a, b } = pair(1);
    a.weapon = WEAPONS.pistol.idx;
    w.punch(a, jab(), 1000);
    assert.equal(b.hp, MAX_HP);
  });
  it("respects the cooldown", () => {
    const { w, a, b } = pair(1);
    w.punch(a, jab(), 1000);
    w.punch(a, jab(), 1050);
    assert.equal(b.hp, MAX_HP - punchDamage("body", false));
  });
  it("never touches a player in passive mode", () => {
    const { w, a, b } = pair(1);
    b.passive = true;
    w.punch(a, jab(), 1000);
    assert.equal(b.hp, MAX_HP);
  });
  it("refuses a fist thrown from somewhere else", () => {
    const { w, a, b } = pair(1);
    w.punch(a, { ...jab(), o: [0, 1.5, -20] }, 1000);
    assert.equal(b.hp, MAX_HP);
  });
});
