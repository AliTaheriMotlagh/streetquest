"use client";
import { io, type Socket } from "socket.io-client";
import type { ItemDef } from "@/lib/catalog";
import type { Spawn } from "@/lib/spawns";

export async function api<T = { message?: string }>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = "/login?next=/play";
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

let socket: Socket | null = null;
export function getSocket() {
  socket ??= io({ path: "/rt", transports: ["websocket", "polling"] });
  return socket;
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
};

export type WorldSpawn = Spawn & { claimed: boolean };
export type WorldMission = { id: string; title: string; description: string; lat: number; lng: number; item?: ItemDef; rewardXp: number; rewardCoins: number; sponsor: string | null; claimed: boolean; activeTo: string };
export type WorldNote = { id: string; lat: number; lng: number; radiusM: number; author: { username: string; avatar: string }; createdAt: string; expiresAt: string; unlocked: boolean; body: string | null };
export type WorldEvent = { id: string; slug: string; title: string; description: string; lat: number; lng: number; radiusM: number; startsAt: string; endsAt: string; official: boolean; maxPlayers: number; rewardXp: number; rewardCoins: number; participants: number; joined?: boolean; checkedIn?: boolean };
export type WorldDelivery = { id: string; title: string; description: string; pickupLabel: string; pickupLat: number; pickupLng: number; dropoffLabel: string; dropoffLat: number; dropoffLng: number; reward: number; status: string; sender?: { username: string }; distanceM?: number };
export type WorldPlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; lat: number; lng: number };

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
};

export type Selected =
  | { type: "spawn"; data: WorldSpawn }
  | { type: "mission"; data: WorldMission }
  | { type: "note"; data: WorldNote }
  | { type: "event"; data: WorldEvent }
  | { type: "delivery"; data: WorldDelivery }
  | { type: "player"; data: WorldPlayer };

export const fmtTime = (iso: string | number | Date) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
