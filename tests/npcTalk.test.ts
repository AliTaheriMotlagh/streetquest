import { test } from "node:test";
import assert from "node:assert/strict";
import { callsPolice, moodOf, reply, sideOf, type TalkCtx } from "../src/lib/street/npcTalk";

const fmt = (m: number) => `${m} m`;
const find = (mood: string) => {
  for (let id = 1; id < 500; id++) if (moodOf(id) === mood) return id;
  throw new Error(mood);
};
const ctx = (p: Partial<TalkCtx>): TalkCtx => ({ act: "greet", id: find("friendly"), stars: 0, insults: 0, fmt, ...p });

test("a person's mood is theirs: the same every time, all three kinds exist", () => {
  assert.equal(moodOf(42), moodOf(42));
  for (const m of ["friendly", "busy", "grumpy"]) assert.ok(find(m));
});

test("directions name the place, how far and which way", () => {
  assert.equal(sideOf(0), "straight ahead");
  assert.equal(sideOf(90), "on your right");
  assert.equal(sideOf(-90), "on your left");
  assert.equal(sideOf(180), "behind you");
  assert.equal(sideOf(-170), "behind you");
  const r = reply(ctx({ act: "way", way: { kind: "cafe", spot: { name: "Café Lamiz", dist: 230, rel: 80 } } }));
  assert.equal(r.key, "{place} — about {dist} from here, {side}.");
  assert.deepEqual(r.params, { place: "Café Lamiz", dist: "230 m", side: "on your right" });
  assert.equal(reply(ctx({ act: "way", way: { kind: "pharmacy", spot: null } })).params?.kind, "a pharmacy");
  assert.equal(reply(ctx({ act: "way", way: { kind: "cafe", spot: { name: "X", dist: 10, rel: 0 } } })).key, "{place}? It's right here!");
});

test("recommendations carry the rating when there is one", () => {
  const r = reply(ctx({ act: "recommend", best: { name: "Pizza Rome", dist: 120, rel: -100, rating: 4.6 } }));
  assert.equal(r.params?.rating, 4.6);
  assert.equal(reply(ctx({ act: "recommend", best: null })).key, "I don't really know, I'm not from around here.");
});

test("reactions: friendly follow, grumpy refuse, insults escalate, wanted means everyone runs", () => {
  assert.equal(reply(ctx({ act: "follow" })).react, "follow");
  assert.equal(reply(ctx({ act: "follow", id: find("grumpy") })).react, "leave");
  const g = find("grumpy");
  assert.equal(reply(ctx({ act: "insult", id: g })).react, "angry");
  const second = reply(ctx({ act: "insult", id: g, insults: 1 }));
  assert.equal(second.react, "flee");
  assert.ok(callsPolice(second));
  assert.equal(reply(ctx({ act: "insult" })).react, "leave");
  assert.equal(reply(ctx({ act: "greet", stars: 2 })).react, "flee");
  assert.equal(reply(ctx({ act: "money", id: g })).react, "leave");
});

test("the words inside an answer are translated", () => {
  const r = reply(ctx({ act: "way", tr: (k) => `«${k}»`, way: { kind: "cafe", spot: { name: "A", dist: 300, rel: 0 } } }));
  assert.equal(r.params?.side, "«straight ahead»");
});
