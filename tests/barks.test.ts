// What people in the open city say (lib/street/barks.ts): every situation has lines for the
// voices that speak in it, the recordings have safe unique names, and nobody repeats the
// line they just said.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BARKS, barkById, barkFile, barkKey, pickBark, QUIET_S, sayFor, type Situation } from "@/lib/street/barks";
import { pickScene, SCENES, sceneLength, sceneScript } from "@/lib/street/scenes";

it("every line is Persian with an English subtitle, and a unique recording", () => {
  const files = new Set<string>();
  for (const b of BARKS) {
    assert.match(b.fa, /[؀-ۿ]/, b.id);
    assert.ok(b.en.length > 2, b.id);
    for (const v of b.voices) {
      const f = barkFile(b, v);
      assert.match(f, /^[\w-]+\.mp3$/);
      assert.ok(!files.has(f), f);
      files.add(f);
    }
    assert.ok(sayFor(b) >= 1.8 && sayFor(b) <= 4.5);
  }
});

it("each situation has someone to say it: men and women on the street, officers for the police", () => {
  // Vendors and taxi drivers calling out are men; the scenes check their own voices below.
  const menOnly: Situation[] = ["vendor", "taxi"];
  for (const s of Object.keys(QUIET_S) as Situation[]) {
    if (menOnly.includes(s)) {
      assert.ok(pickBark(s, "m", Math.random), s);
      continue;
    }
    const cop = s.startsWith("cop");
    for (const v of cop ? (["cop"] as const) : (["m", "f"] as const)) assert.ok(pickBark(s, v, Math.random), `${s} / ${v}`);
  }
  assert.equal(pickBark("copStop", "m", Math.random), null, "a passer-by doesn't shout police orders");
});

it("nobody says the same thing twice in a row (while there's another line)", () => {
  const first = pickBark("flee", "m", () => 0)!;
  for (let i = 0; i < 20; i++) assert.notEqual(pickBark("flee", "m", Math.random, [first.id])!.id, first.id);
  // Only one line: it's said again rather than nothing.
  const only = pickBark("copBusted", "cop", () => 0)!;
  assert.equal(pickBark("copBusted", "cop", Math.random, [only.id])!.id, only.id);
});

it("a line's spoken copy has its own address: the same words, the same key; new words, a new one", () => {
  const b = BARKS[0];
  assert.equal(barkKey(b, "m"), barkKey(b, "m"));
  assert.notEqual(barkKey(b, "m"), barkKey(b, "f"));
  assert.notEqual(barkKey(b, "m"), barkKey({ ...b, fa: b.fa + "!" }, "m"));
  assert.match(barkKey(b, "m"), /^[0-9a-z]{1,8}$/);
});

it("street scenes: every line exists, the cast can say it, they play in order", () => {
  for (const sc of SCENES)
    for (const l of sc.lines) {
      const b = barkById(l.bark);
      assert.ok(b, `${sc.id}: ${l.bark}`);
      assert.equal(b.s, sc.id);
      if (sc.cast === "taxi" || sc.id === "vendor") assert.ok(b.voices.includes("m"));
      else assert.deepEqual([...b.voices].sort(), ["f", "m"], `${l.bark}: men and women`);
    }
  const argue = SCENES.find((s) => s.id === "argue")!;
  const script = sceneScript(argue, Math.random);
  assert.deepEqual(script.map((l) => l.who), [0, 1, 0, 1]);
  assert.ok(script.every((l, i) => i === 0 || l.at > script[i - 1].at), "in order");
  assert.ok(sceneLength(script) > script[script.length - 1].at + 1.5);
  // A vendor calls just one of their lines.
  assert.equal(sceneScript(SCENES.find((s) => s.id === "vendor")!, () => 0.5).length, 1);
});

it("scenes are picked by weight, only among the casts that can be found", () => {
  const n: Record<string, number> = {};
  let x = 0;
  for (let i = 0; i < 1300; i++) {
    const s = pickScene(() => (x = (x + 0.618034) % 1))!;
    n[s.id] = (n[s.id] ?? 0) + 1;
  }
  assert.ok(n.friends > n.snatch * 2, JSON.stringify(n));
  for (let i = 0; i < 50; i++) assert.equal(pickScene(Math.random, ["taxi"])!.cast, "taxi");
  assert.equal(pickScene(Math.random, []), null);
});
