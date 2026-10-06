"use client";
import type { ItemDef } from "@/lib/catalog";
import type { Spawn } from "@/lib/spawns";
import type { BossDef } from "@/lib/bosses";
import type { Army, FactionKey } from "@/lib/rts";
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
  attack: { atk: number; hp: number; count: number };
  queue: { id: string; unitType: string; qty: number; readyAt: string }[];
  battles: { id: string; kind: string; targetName: string; won: boolean; loot: number; createdAt: string; side: "attack" | "defend" }[];
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
  | { type: "boss"; data: WorldBoss };

export const fmtTime = (iso: string | number | Date) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
