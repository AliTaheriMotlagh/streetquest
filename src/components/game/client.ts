"use client";
import type { ItemDef } from "@/lib/catalog";
import type { Spawn } from "@/lib/spawns";
import type { BossDef } from "@/lib/bosses";
import type { Army, FactionKey, Vets } from "@/lib/rts";
import type { Affix } from "@/lib/gear";
import type { Bonus, Mods } from "@/lib/hero";
import type { QuestDef } from "@/lib/quests";
import type { PowerKey } from "@/lib/powers";
import type { Mood, Needs } from "@/lib/sims";

// No login: on the first 401 we mint a guest account (shared by concurrent calls) and retry.
let guest: Promise<void> | null = null;
function ensureGuest() {
  guest ??= fetch("/api/auth/guest", { method: "POST" })
    .then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Couldn't start a game (${r.status})`);
    })
    .finally(() => setTimeout(() => (guest = null), 1000));
  return guest;
}

export async function api<T = { message?: string }>(path: string, init?: { method?: string; body?: unknown }, retried = false): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried) {
    await ensureGuest();
    return api<T>(path, init, true);
  }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export type LatLng = { lat: number; lng: number };

export type Me = {
  id: string;
  username: string;
  avatar: string;
  role: string;
  xp: number;
  coins: number;
  timezone: string;
  level: number;
  levelPct: number;
  nextLevelXp: number;
  title: string;
  streak: number;
  dailyAvailable: boolean;
  dailyReward: { coins: number; xp: number };
  referralCode: string;
  canSimulate: boolean;
  inventory: { key: string; qty: number; def: ItemDef }[];
  achievements: string[];
  activeRun: { id: string; title: string; targetLat: number; targetLng: number; deadline: string; rewardXp: number; rewardCoins: number } | null;
  pendingFriends: number;
  faction: FactionKey | null;
  base: { id: string; name: string; lat: number; lng: number } | null;
  needs: Needs;
  needsAt: number;
  mood: Mood;
  restedAt: string | null;
  socialAt: string | null;
  heroClass: string | null;
  scrap: number;
  gems: number;
  trophies: number;
  league: League;
  freePoints: number;
  commandPoints: number;
  quest: { title: string; desc: string; progress: number; target: number; done: boolean; campaign: boolean } | null;
  questsReady: number;
};

export type League = { name: string; emoji: string; bonus: number; min: number };

export type HeroView = {
  heroClass: string | null;
  level: number;
  attrs: { str: number; agi: number; int: number; cha: number };
  freePoints: number;
  commandPoints: number;
  scrap: number;
  coins: number;
  gems: number;
  trophies: number;
  mods: Mods;
  bonus: Bonus;
  weapon: string;
  research: string[];
  buffUntil: string | null;
  gear: { id: string; slot: string; base: string; name: string; rarity: "common" | "rare" | "epic" | "legendary"; level: number; affixes: Affix[]; equipped: boolean }[];
  powers: { key: PowerKey; rank: number; lastUsedAt: string | null }[];
  quests: (QuestDef & { key: string; campaign: boolean; progress: number; done: boolean; claimed: boolean })[];
  campaignStep: number;
};

export type WorldSpawn = Spawn & { claimed: boolean };
export type WorldMission = { id: string; title: string; description: string; lat: number; lng: number; item?: ItemDef; rewardXp: number; rewardCoins: number; sponsor: string | null; claimed: boolean; activeTo: string };
export type WorldNote = { id: string; lat: number; lng: number; radiusM: number; author: { username: string; avatar: string }; createdAt: string; expiresAt: string; unlocked: boolean; body: string | null };
export type WorldEvent = { id: string; slug: string; title: string; description: string; lat: number; lng: number; radiusM: number; startsAt: string; endsAt: string; official: boolean; maxPlayers: number; rewardXp: number; rewardCoins: number; participants: number; joined?: boolean; checkedIn?: boolean };
export type WorldDelivery = { id: string; title: string; description: string; pickupLabel: string; pickupLat: number; pickupLng: number; dropoffLabel: string; dropoffLat: number; dropoffLng: number; reward: number; status: string; sender?: { username: string }; distanceM?: number };
export type WorldPlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; lat: number; lng: number };

export type WorldBase = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hp: number;
  mine: boolean;
  friend: boolean;
  shielded: boolean;
  hq: number;
  turrets: number;
  owner: { id: string; username: string; avatar: string; online: boolean };
  faction: FactionKey | null;
  liveMatch: string | null;
};
export type WorldOutpost = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  owner: { id: string; username: string; faction: string | null } | null;
  mine: boolean;
  shielded: boolean;
  garrison: Army | null;
  garrisonSize: string | null;
  guard: number | null;
};
export type WorldBoss = { id: string; lat: number; lng: number; expiresAt: number; def: BossDef; maxHp: number; hp: number; liveMatch: string | null };

export type BaseView = {
  faction: FactionKey | null;
  base: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    hp: number;
    shieldUntil: string | null;
    buildings: { type: string; level: number; readyAt: string }[];
    power: { made: number; used: number; ok: boolean };
    pending: number;
    defense: { atk: number; hp: number };
  } | null;
  army: Army;
  vets: Vets;
  attack: { atk: number; hp: number; count: number };
  research: { key: string; readyAt: string }[];
  scrap: number;
  gems: number;
  trophies: number;
  league: League;
  housing: { used: number; cap: number };
  builders: number;
  protection: number;
  timeMult: { build: number; train: number; research: number };
  queue: { id: string; unitType: string; qty: number; readyAt: string }[];
  battles: { id: string; kind: string; targetName: string; won: boolean; loot: number; stars: number; destruction: number; trophies: number; createdAt: string; side: "attack" | "defend"; revengeBaseId: string | null }[];
  defended: BaseView["battles"];
};

export type World = {
  serverTime: number;
  phase: "night" | "dawn" | "day" | "dusk";
  solarHour: number;
  spawns: WorldSpawn[];
  missions: WorldMission[];
  notes: WorldNote[];
  events: WorldEvent[];
  deliveries: WorldDelivery[];
  players: WorldPlayer[];
  bases: WorldBase[];
  bosses: WorldBoss[];
  outposts: WorldOutpost[];
  onlineNearby: number;
};

export type Selected =
  | { type: "spawn"; data: WorldSpawn }
  | { type: "mission"; data: WorldMission }
  | { type: "note"; data: WorldNote }
  | { type: "event"; data: WorldEvent }
  | { type: "delivery"; data: WorldDelivery }
  | { type: "player"; data: WorldPlayer }
  | { type: "base"; data: WorldBase }
  | { type: "boss"; data: WorldBoss }
  | { type: "outpost"; data: WorldOutpost };

export const fmtTime = (iso: string | number | Date) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
