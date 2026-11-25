// Context in street conversations (lib/street/npcTalk.ts): who they are (personaOf), a gun in your hand, shots
// or a crash a moment ago, the time of day, having met before, insults adding up — on top of their mood.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callsPolice, moodOf, personaOf, reply, type Mood, type Persona, type TalkCtx } from "@/lib/street/npcTalk";

const fmt = (m: number) => `${m} m`;
/** The first person who is all of these. */
const who = (mood?: Mood, p: Partial<Persona> = {}) => {
  for (let id = 1; id < 5000; id++) {
    const me = personaOf(id);
    if ((!mood || moodOf(id) === mood) && Object.entries(p).every(([k, v]) => me[k as keyof Persona] === v)) return id;
  }
  throw new Error(`${mood} ${JSON.stringify(p)}`);
};
const ctx = (p: Partial<TalkCtx>): TalkCtx => ({ act: "greet", id: who("friendly", { brave: false, temper: "calm" }), stars: 0, insults: 0, fmt, ...p });

describe("personaOf", () => {
  it("is theirs for good, and every kind exists", () => {
    assert.deepEqual(personaOf(7), personaOf(7));
    for (const age of ["young", "adult", "old"] as const) assert.ok(who(undefined, { age }));
    for (const temper of ["calm", "hot"] as const) assert.ok(who(undefined, { temper }));
    assert.ok(who(undefined, { brave: true }) && who(undefined, { brave: false }));
  });
});

describe("reply in context", () => {
  it("a gun in your hand: most run, the brave ask you to put it away, your crew stays", () => {
    assert.equal(reply(ctx({ armed: true })).react, "flee");
    const brave = who("friendly", { brave: true });
    const r = reply(ctx({ id: brave, armed: true, act: "chat" }));
    assert.equal(r.key, "Easy — put that gun away, friend.");
    assert.equal(r.react, "stay");
    assert.equal(reply(ctx({ id: brave, armed: true, act: "insult" })).react, "flee");
    assert.equal(reply(ctx({ armed: true, act: "wait", following: true })).react, "wait");
  });

  it("shots a moment ago: most get away, the brave stay and talk about it", () => {
    assert.equal(reply(ctx({ recent: "shots" })).key, "Did you hear that? I'm getting out of here!");
    assert.equal(reply(ctx({ id: who("friendly", { brave: true }), recent: "blast", act: "chat" })).key, "Did you hear that? Something's going on round here.");
    assert.equal(reply(ctx({ recent: "crash", act: "chat" })).key, "Did you see that crash? People drive like maniacs.");
  });

  it("greets by the time of day, and remembers you", () => {
    assert.equal(reply(ctx({ hour: 8 })).key, "Good morning! How are you doing?");
    assert.equal(reply(ctx({ hour: 20 })).key, "Good evening! How are you doing?");
    assert.equal(reply(ctx({ hour: 14 })).key, "Hello! How are you doing?");
    assert.equal(reply(ctx({ hour: 1 })).key, "Hello — out late, aren't you?");
    assert.equal(reply(ctx({ id: who("grumpy"), hour: 23 })).key, "It's late — what do you want?");
    assert.equal(reply(ctx({ met: true })).key, "You again! Hello, good to see you.");
    assert.notEqual(reply(ctx({ id: who("grumpy"), met: true })).key, "You again! Hello, good to see you.", "grumpy isn't glad");
  });

  it("insults: a hot temper answers back, and the third one brings the police from anyone", () => {
    assert.equal(reply(ctx({ act: "insult" })).react, "leave", "calm and friendly walks off");
    const hot = who("friendly", { temper: "hot" });
    const r = reply(ctx({ id: hot, act: "insult" }));
    assert.equal(r.react, "angry");
    assert.equal(r.key, "Watch your mouth!");
    assert.ok(callsPolice(reply(ctx({ act: "insult", insults: 2 }))));
    assert.ok(callsPolice(reply(ctx({ id: who("busy"), act: "insult", insults: 2 }))));
  });

  it("old and young people chat about their own things", () => {
    const old = who("friendly", { age: "old" });
    const keys = new Set(Array.from({ length: 10 }, (_, i) => reply(ctx({ id: old, act: "chat" }), i).key));
    assert.ok(keys.has("In my day this street was all gardens."));
  });

  it("without context, nothing changes", () => {
    assert.equal(reply(ctx({})).key, "Hello! How are you doing?");
  });
});
