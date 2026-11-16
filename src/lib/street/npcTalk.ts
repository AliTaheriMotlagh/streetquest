// Talking to people in the street (pure; tests/npcTalk.test.ts) — walk up to a passer-by on foot and
// pick what to say, GTA-style: greet them, ask the way to a café / pharmacy / supermarket / restaurant
// (a real one round you, with how far and which way), ask what's good round here, chat, give them some
// money, insult them, ask them to follow you, say goodbye. Each person has a mood (friendly, busy or
// grumpy — from who they are, so the same person stays the same); being wanted by the police makes
// everyone run. The answer is words (an i18n key + params, said aloud by voices.talk) and what they do.
// Someone following you takes orders: wait here, come on, stay close, keep your distance, wait at the
// shop, wait by my car, keep watch (shout when the police come), go home.
import { hashStr } from "../geo";
import { msg } from "../i18n";
import type { StoreKind } from "../storeKinds";

export type TalkAct = "greet" | "way" | "recommend" | "chat" | "money" | "insult" | "follow" | "bye" | "store" | "wait" | "come" | "release" | "close" | "far" | "shop" | "car" | "watch";
export type Mood = "friendly" | "busy" | "grumpy";
/** What the asked-for place is, for "the way to…". */
export type WayKind = "cafe" | "food" | "pharmacy" | "market";
export const WAY_KINDS: { key: WayKind; emoji: string; label: string }[] = [
  { key: "cafe", emoji: "☕", label: msg("a café") },
  { key: "food", emoji: "🍽️", label: msg("a restaurant") },
  { key: "pharmacy", emoji: "💊", label: msg("a pharmacy") },
  { key: "market", emoji: "🛒", label: msg("a supermarket") },
];
/** Which stores count as each (lib/storeKinds storeKind). */
export const WAY_STORES: Record<WayKind, StoreKind[]> = { cafe: ["cafe"], food: ["restaurant", "fastfood"], pharmacy: ["pharmacy"], market: ["market", "produce"] };
/** Places worth recommending. */
export const GOOD_STORES: StoreKind[] = ["restaurant", "fastfood", "cafe", "sweets", "bakery"];
/**
 * What they do after answering. `pace`: following you right behind at a run ("close") or well back
 * ("far"); `goto`: walking off to wait somewhere (the shop's door, your car); `watch`: waiting here,
 * shouting if the police come.
 */
export type React = "stay" | "leave" | "flee" | "follow" | "angry" | "wait" | "goto" | "watch";
/** How a follower keeps up: right behind you, a few metres back (normal), well back. */
export type Pace = "close" | "normal" | "far";
/** A place they could point to: its name, how far (m) and its bearing from you relative to where you face (degrees, + = right). */
export type Spot = { name: string; dist: number; rel: number; rating?: number };

export type TalkCtx = {
  act: TalkAct;
  id: number;
  /** Wanted stars right now. */
  stars: number;
  /** How many times you've insulted them already. */
  insults: number;
  /** The way asked for, and the nearest such place (null: none known). */
  way?: { kind: WayKind; spot: Spot | null };
  /** A place worth recommending round here (null: none). */
  best?: Spot | null;
  /** The store nearest you ("what about this place?"), with a dish off its real menu when known. */
  store?: (Spot & { item?: string; price?: string }) | null;
  /** They're already following you (the follower's own words: waiting, coming, going home). */
  following?: boolean;
  /** "Wait at the shop": the open store nearest you (null: none round here). */
  shop?: Spot | null;
  /** "Wait by my car": how far your car is (null: you've none parked, or it's too far). */
  car?: { dist: number } | null;
  /** A distance in words ("200 m"). */
  fmt: (m: number) => string;
  /** Translates the words put inside the answer ("on your right", "a café"); the answer's own key is translated by the caller. */
  tr?: (key: string) => string;
};
export type Reply = { key: string; params?: Record<string, string | number>; react: React; secs: number; mood: Mood; pace?: Pace };

/** A person's mood, the same each time you meet them. */
export function moodOf(id: number): Mood {
  const h = hashStr(`mood:${id}`) % 100;
  return h < 55 ? "friendly" : h < 82 ? "busy" : "grumpy";
}

/** Which way a place is, in words: ahead, on your right/left, behind you. */
export function sideOf(rel: number): string {
  const a = ((rel % 360) + 540) % 360 - 180;
  return Math.abs(a) <= 40 ? msg("straight ahead") : Math.abs(a) >= 140 ? msg("behind you") : a > 0 ? msg("on your right") : msg("on your left");
}

const CHAT: Record<Mood, string[]> = {
  friendly: [
    msg("The traffic today was something else — took me an hour to get here."),
    msg("Have you tried the bakery round the corner? The sangak is still warm at this time."),
    msg("Prices again! Everything went up this week."),
    msg("Lovely weather today, isn't it? Perfect for a walk."),
    msg("My son wants to be a footballer. I told him to study first!"),
  ],
  busy: [msg("Sorry, I've got a bus to catch."), msg("I'm late for work — another time!"), msg("Can't talk, my phone keeps ringing.")],
  grumpy: [msg("Do I know you?"), msg("Not interested in chatting."), msg("This city is too loud.")],
};
const pickOf = (l: string[], seed: number) => l[seed % l.length];

/** Their answer and what they do. `seed` varies the chat line (the conversation's turn number). */
export function reply(c: TalkCtx, seed = 0): Reply {
  const mood = moodOf(c.id), tr = c.tr ?? ((k: string) => k);
  const r = (key: string, react: React, secs = 6, params?: Record<string, string | number>): Reply => ({ key, react, secs, mood, ...(params ? { params } : {}) });
  // Wanted: nobody stays to talk.
  if (c.stars >= 2) return r(msg("Stay away from me!"), "flee", 5);
  switch (c.act) {
    case "greet":
      return mood === "friendly" ? r(msg("Hello! How are you doing?"), "stay") : mood === "busy" ? r(msg("Hi — sorry, I'm in a bit of a hurry."), "stay", 4) : r(msg("Hm. What do you want?"), "stay", 5);
    case "way": {
      const w = c.way;
      if (!w?.spot) return r(msg("Sorry, I don't know {kind} around here."), "stay", 5, { kind: tr(WAY_KINDS.find((k) => k.key === w?.kind)?.label ?? "") });
      const s = w.spot;
      if (s.dist < 40) return r(msg("{place}? It's right here!"), "stay", 5, { place: s.name });
      return r(mood === "grumpy" ? msg("{place}. {dist}, {side}. Now leave me alone.") : msg("{place} — about {dist} from here, {side}."), mood === "grumpy" ? "leave" : "stay", 6, { place: s.name, dist: c.fmt(s.dist), side: tr(sideOf(s.rel)) });
    }
    case "recommend": {
      const s = c.best;
      if (!s) return r(msg("I don't really know, I'm not from around here."), "stay", 5);
      if (s.rating) return r(msg("Try {place}, {dist} {side} — people give it {rating} stars."), "stay", 6, { place: s.name, dist: c.fmt(s.dist), side: tr(sideOf(s.rel)), rating: s.rating });
      return r(msg("Try {place}, {dist} {side}. I go there myself."), "stay", 6, { place: s.name, dist: c.fmt(s.dist), side: tr(sideOf(s.rel)) });
    }
    case "chat":
      return r(pickOf(CHAT[mood], seed + c.id), mood === "busy" ? "leave" : "stay", mood === "friendly" ? 7 : 4);
    case "money":
      return mood === "grumpy" ? r(msg("Keep your money, I don't need it."), "leave", 4) : r(msg("Oh, thank you! God bless you."), "stay", 5);
    case "insult":
      if (mood === "grumpy" && c.insults === 0) return r(msg("Say that again and see what happens!"), "angry", 5);
      if (mood === "friendly" && c.insults === 0) return r(msg("That wasn't nice. Goodbye."), "leave", 3);
      return r(mood === "grumpy" ? msg("That's it, I'm calling the police!") : msg("What's wrong with you?!"), "flee", 4);
    case "follow":
      if (c.following) return r(msg("I'm right behind you."), "follow", 90);
      // Friendly: yes. Busy: a coin toss by who they are. Grumpy: no.
      return mood === "friendly" || (mood === "busy" && c.id % 2 === 0) ? r(msg("Sure, lead the way!"), "follow", 90) : r(msg("No, I've got things to do."), "leave", 4);
    case "store": {
      const s = c.store;
      if (!s) return r(msg("There's no shop right here I'd know."), "stay", 4);
      if (s.item && s.price) return r(pickOf([msg("{place}? Their {item} is the best — about {price} toman."), msg("Get the {item} at {place}, {price} toman. You won't regret it.")], seed + c.id), "stay", 6, { place: s.name, item: s.item, price: s.price });
      if (s.rating) return r(s.rating >= 4 ? msg("{place} is good — people give it {rating} stars.") : msg("{place}? Only {rating} stars… I'd go somewhere else."), "stay", 6, { place: s.name, rating: s.rating });
      return r(msg("{place}, {dist} {side}. I've never been in, to be honest."), "stay", 5, { place: s.name, dist: c.fmt(s.dist), side: tr(sideOf(s.rel)) });
    }
    case "wait":
      return r(c.following ? msg("OK, I'll wait here for you.") : msg("Wait for what?"), c.following ? "wait" : "stay", c.following ? 120 : 4);
    case "come":
      return c.following || mood !== "grumpy" ? r(msg("Coming!"), "follow", 90) : r(msg("No, I've got things to do."), "leave", 4);
    case "release":
      return r(msg("OK, see you around!"), "leave", 3);
    case "close":
      if (!c.following) return r(msg("Close to what?"), "stay", 4);
      return { ...r(msg("Right behind you!"), "follow", 90), pace: "close" };
    case "far":
      if (!c.following) return r(msg("I'm not following you."), "stay", 4);
      return { ...r(msg("Fine, I'll keep back a bit."), "follow", 90), pace: "far" };
    case "shop":
      if (!c.following) return r(msg("Wait for what?"), "stay", 4);
      if (!c.shop) return r(msg("There's no shop near here to wait at."), "stay", 4);
      return r(msg("OK, I'll wait for you at {place}."), "goto", 180, { place: c.shop.name });
    case "car":
      if (!c.following) return r(msg("Wait for what?"), "stay", 4);
      if (!c.car) return r(msg("What car? I don't see one."), "stay", 4);
      return r(msg("OK, I'll wait by your car."), "goto", 180);
    case "watch":
      if (!c.following) return r(msg("Wait for what?"), "stay", 4);
      return r(mood === "grumpy" ? msg("Fine. I'll shout if the police come.") : msg("I'll keep watch — I'll shout if the police come!"), "watch", 150);
    case "bye":
      return r(mood === "grumpy" ? msg("Finally.") : msg("Goodbye, take care!"), "leave", 3);
  }
}

/**
 * A passer-by remarks on a store as they walk past it (no one asked): what's good there, the
 * stars, the queue. `item`/`price`: a dish off its real menu when known. The same person and
 * store give the same line.
 */
export function storeGossip(place: string, seed: number, item?: string, price?: string, rating?: number): { key: string; params: Record<string, string | number> } {
  const lines = item && price
    ? [msg("The {item} at {place} is so good — {price} toman."), msg("I always get the {item} at {place}."), msg("Have you tried {place}? Their {item} is amazing.")]
    : rating && rating >= 4.3
      ? [msg("{place} is always full — {rating} stars, they say."), msg("Best place on this street, {place}.")]
      : [msg("{place} opened a while ago, I should try it."), msg("My cousin works at {place}."), msg("Is {place} open now? I need something.")];
  return { key: lines[Math.abs(seed) % lines.length], params: { place, ...(item ? { item } : {}), ...(price ? { price } : {}), ...(rating ? { rating } : {}) } };
}

/** Insulting a grumpy person twice, they call the police: a little heat (lib/street/wanted.ts). */
export const callsPolice = (r: Reply) => r.react === "flee" && r.key === "That's it, I'm calling the police!";

/** What a lookout shouts when a patrol car comes near (one at random). */
export const LOOKOUT_SHOUTS = [msg("Police! The police are coming!"), msg("Watch out — police!"), msg("Cops! Run!")];
