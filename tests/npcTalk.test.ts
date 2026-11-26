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

test("a follower takes orders: wait here, come on, go home", () => {
  const id = find("friendly");
  assert.equal(reply(ctx({ act: "follow", id })).react, "follow");
  const w = reply(ctx({ act: "wait", id, following: true }));
  assert.equal(w.react, "wait");
  assert.ok(w.secs >= 60, "waits a good while");
  assert.equal(reply(ctx({ act: "wait", id })).react, "stay", "a stranger has nothing to wait for");
  assert.equal(reply(ctx({ act: "come", id, following: true })).react, "follow");
  assert.equal(reply(ctx({ act: "come", id: find("grumpy") })).react, "leave");
  assert.equal(reply(ctx({ act: "release", id, following: true })).react, "leave");
  assert.equal(reply(ctx({ act: "follow", id: find("grumpy") })).react, "leave");
});

test("asked about the store right here, they name a real dish and its price", () => {
  const r = reply(ctx({ act: "store", store: { name: "Nayeb", dist: 12, rel: 0, item: "Koobideh", price: "250,000" } }));
  assert.equal(r.react, "stay");
  assert.deepEqual(r.params, { place: "Nayeb", item: "Koobideh", price: "250,000" });
  assert.match(reply(ctx({ act: "store", store: { name: "X", dist: 12, rel: 0, rating: 3.1 } })).key, /Only \{rating\}/);
  assert.equal(reply(ctx({ act: "store", store: null })).key, "There's no shop right here I'd know.");
  // No dish, no rating: they at least say what kind of place it is.
  const k = reply(ctx({ act: "store", store: { name: "Nan-e Sahar", dist: 12, rel: 0, kind: "Bakery" } }));
  assert.equal(k.key, "{place}? It's a {kind}. I've never been in, to be honest.");
  assert.equal(k.params?.kind, "Bakery");
  assert.match(reply(ctx({ act: "recommend", best: { name: "Cafe Naderi", dist: 90, rel: 10, kind: "Café" } })).key, /the \{kind\}/);
});

test("street gossip about a store is the same line for the same seed and names the place", async () => {
  const { storeGossip } = await import("../src/lib/street/npcTalk");
  assert.deepEqual(storeGossip("Nayeb", 3, "Kabab", "100"), storeGossip("Nayeb", 3, "Kabab", "100"));
  assert.equal(storeGossip("Nayeb", 1).params.place, "Nayeb");
  assert.match(storeGossip("Nayeb", 0, "Kabab", "100").key, /\{item\}/);
});

test("a follower takes more orders: stay close, keep back, wait at the shop or by the car, keep watch", () => {
  const f = (p: Partial<TalkCtx>) => reply(ctx({ following: true, ...p }));
  assert.deepEqual([f({ act: "close" }).react, f({ act: "close" }).pace], ["follow", "close"]);
  assert.deepEqual([f({ act: "far" }).react, f({ act: "far" }).pace], ["follow", "far"]);
  const shop = f({ act: "shop", shop: { name: "Nayeb", dist: 20, rel: 0 } });
  assert.equal(shop.react, "goto");
  assert.equal(shop.params?.place, "Nayeb");
  assert.equal(f({ act: "shop", shop: null }).react, "stay");
  assert.equal(f({ act: "car", car: { dist: 30 } }).react, "goto");
  assert.equal(f({ act: "car", car: null }).react, "stay");
  assert.equal(f({ act: "watch" }).react, "watch");
  // Someone who isn't following you takes no orders.
  for (const act of ["close", "far", "shop", "car", "watch"] as const) assert.equal(reply(ctx({ act, shop: { name: "x", dist: 1, rel: 0 }, car: { dist: 1 } })).react, "stay", act);
});
