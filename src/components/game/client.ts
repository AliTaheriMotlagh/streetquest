"use client";
import { fmtWhen, t } from "@/lib/i18n";
import type { ItemDef } from "@/lib/catalog";
import type { QuestDef } from "@/lib/quests";
import type { MoneyPickup } from "@/lib/money";
import type { OrderView, ProductView, ShopCard, ShopView } from "@/server/shops";
import type { PlaceMission } from "@/lib/places";
import type { WorldBusiness } from "@/server/business";

// No login: on the first 401 we mint a guest account (shared by concurrent calls) and retry.
let guest: Promise<void> | null = null;
function ensureGuest() {
  guest ??= fetch("/api/auth/guest", { method: "POST" })
    .then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("Couldn't start a game ({status})", { status: r.status }));
    })
    .finally(() => setTimeout(() => (guest = null), 1000));
  return guest;
}

/** A dead mobile connection can hang a request for minutes; give up and say so instead. */
const TIMEOUT_MS = 20_000;

export async function api<T = { message?: string }>(path: string, init?: { method?: string; body?: unknown }, retried = false): Promise<T> {
  // AbortController + timer rather than AbortSignal.timeout(): older Safari lacks it.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(t("The server is taking too long — check your connection and try again"));
    throw navigator.onLine === false ? new Error(t("You're offline — try again when you're back online")) : e;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried) {
    await ensureGuest();
    return api<T>(path, init, true);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? t("Request failed ({status})", { status: res.status }));
  return data as T;
}

/** A refused request. Branch on `status`, never on the (translated) message. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);

export type LatLng = { lat: number; lng: number };

export type Me = {
  id: string;
  username: string;
  avatar: string;
  role: string;
  xp: number;
  coins: number;
  /** The cash-out wallet, and toman already asked for in a pending cash-out. */
  toman: number;
  cashoutPending: number;
  timezone: string;
  level: number;
  levelPct: number;
  nextLevelXp: number;
  title: string;
  streak: number;
  dailyAvailable: boolean;
  dailyReward: { coins: number; xp: number; gems: number };
  referralCode: string;
  canSimulate: boolean;
  inventory: { key: string; qty: number; def: ItemDef }[];
  achievements: string[];
  activeRun: { id: string; title: string; targetLat: number; targetLng: number; deadline: string; rewardXp: number; rewardCoins: number; spawnId: string } | null;
  pendingFriends: number;
  gems: number;
  quest: { title: string; desc: string; progress: number; target: number; done: boolean; campaign: boolean } | null;
  questsReady: number;
  /** Street Empire: when the next dividend can be claimed (0 = now, once rank ≥ 1) and an unclaimed rank reward. */
  empire: { rank: number; dividendAt: number; rankUp: boolean } | null;
  /** Admin overrides of lib/settings — applied on the client with applyConfig. */
  settings: Record<string, unknown>;
  goalsReady: number;
  /** Playing from home: tap-to-travel, reduced rewards. */
  remotePlay: boolean;
  lastPos: LatLng | null;
  /** City-level guess from the connection, when there's no last position (desktop fallback). */
  ipPos: (LatLng & { city: string | null }) | null;
  walkedM: number;
  storyChapter: number;
  gpsGame: { id: string; kind: string } | null;
  /** My shop, for the Market badge: orders to hand over, closing date. */
  shop: { id: string; name: string; expiresAt: number; pending: number } | null;
};

/** An active GPS mini-game or story chapter, as the server lets the client see it. */
export type GpsView = {
  id: string;
  kind: "hunt" | "sprint" | "rally" | "story";
  status: string;
  title: string;
  startedAt: number;
  endsAt: number;
  heat?: { label: string; emoji: string; level: number; approx: number; trend: number } | null;
  progress?: number;
  goal?: number;
  target?: LatLng | null;
  points?: LatLng[];
  next?: number;
  dist?: number | null;
  reroutes?: number;
  chapter?: number;
  replay?: boolean;
  step?: number;
  steps?: number;
  text?: string;
  stepKind?: "go" | "find" | "hold";
  center?: LatLng | null;
  /** Story "find" steps: the gold circle to search in. */
  area?: { center: LatLng; radius: number } | null;
  hold?: { seconds: number; since: number | null; radius: number; inside: boolean } | null;
};

export type HeroView = {
  level: number;
  coins: number;
  gems: number;
  toman: number;
  quests: (QuestDef & { key: string; campaign: boolean; progress: number; done: boolean; claimed: boolean })[];
  campaignStep: number;
  stats: { walkedM: number; money: number; places: number; earned: number; cashedOut: number; achievements: number; gpsGames: number; story: number; streak: number; memberDays: number };
};

export type CashoutView = {
  toman: number;
  min: number;
  enabled: boolean;
  today: number;
  dailyCap: number;
  requests: { id: string; amount: number; status: "PENDING" | "PAID" | "REJECTED"; note: string | null; account: string; createdAt: number; decidedAt: number | null }[];
};

export type WorldMoney = MoneyPickup;
export type WorldPlace = PlaceMission & { done: boolean; toman: number };
export type { WorldBusiness };
export type WorldNote = { id: string; lat: number; lng: number; radiusM: number; author: { username: string; avatar: string }; createdAt: string; expiresAt: string; unlocked: boolean; body: string | null; hasPhoto: boolean; likes: number; mine: boolean };
export type WorldEvent = { id: string; slug: string; title: string; description: string; lat: number; lng: number; radiusM: number; startsAt: string; endsAt: string; official: boolean; maxPlayers: number; rewardXp: number; rewardCoins: number; participants: number; joined?: boolean; checkedIn?: boolean };
export type WorldDelivery = { id: string; title: string; description: string; pickupLabel: string; pickupLat: number; pickupLng: number; dropoffLabel: string; dropoffLat: number; dropoffLng: number; reward: number; status: string; sender?: { username: string }; distanceM?: number };
export type WorldRide = { id: string; pickupLabel: string; pickupLat: number; pickupLng: number; dropoffLabel: string; dropoffLat: number; dropoffLng: number; seats: number; note: string; fare: number; status: string; createdAt: string; rider?: { username: string; avatar: string }; distanceM?: number };
export type WorldLottery = { id: string; name: string; lat: number; lng: number; radiusM: number; ticketPrice: number; maxTickets: number; drawAt: number; pot: number; status: "OPEN" | "DRAWN" | "REFUNDED"; official: boolean; host: string; winner: string | null; players: number; totalTickets: number; myTickets: number; mine: boolean; won: boolean };
export type WorldShop = { id: string; name: string; emoji: string; lat: number; lng: number; mine: boolean; live: boolean; deal: number };
// Player shops: the server's own views (plain JSON — numbers and strings only).
export type { OrderView as ShopOrder, ProductView as ShopProduct, ShopCard, ShopView };
export type ShopDeal = ShopCard["showcase"][number] & { shopId: string; shopName: string; shopEmoji: string; distanceM: number | null };
export type WorldPlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; home?: boolean; lat: number; lng: number };
export type World = {
  serverTime: number;
  phase: "night" | "dawn" | "day" | "dusk";
  solarHour: number;
  /** Money to pick up: the nearest few, admin drops first. */
  money: WorldMoney[];
  notes: WorldNote[];
  events: WorldEvent[];
  deliveries: WorldDelivery[];
  rides: WorldRide[];
  lotteries: WorldLottery[];
  shops: WorldShop[];
  /** Missions at real stores (restaurants, cafés, shops…) around the player. */
  places: WorldPlace[];
  /** Real businesses on the map, with their running campaigns. */
  businesses: WorldBusiness[];
  players: WorldPlayer[];
  onlineNearby: number;
};

export type Selected =
  | { type: "money"; data: WorldMoney }
  | { type: "note"; data: WorldNote }
  | { type: "event"; data: WorldEvent }
  | { type: "delivery"; data: WorldDelivery }
  | { type: "ride"; data: WorldRide }
  | { type: "lottery"; data: WorldLottery }
  | { type: "shop"; data: WorldShop }
  | { type: "place"; data: WorldPlace }
  | { type: "biz"; data: WorldBusiness }
  | { type: "player"; data: WorldPlayer };

/** A timestamp in the player's language and calendar (Solar Hijri in Persian). */
export const fmtTime = (iso: string | number | Date) => fmtWhen(iso);
