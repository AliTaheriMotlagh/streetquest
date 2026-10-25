// Businesses (pure — client and server): real stores, restaurants and cafés that put
// their place on the game map and pay for a plan to bring players through the door.
// A campaign is a mission at the store: players check in on the spot (counted as a
// verified visit), and coupon campaigns add a code the cashier enters at the till
// (a verified sale). Coins come from the game; the business pays for the plan.
import { msg } from "./i18n";

export type PlanKey = "free" | "starter" | "pro" | "chain";

export type PlanDef = {
  key: PlanKey;
  name: string;
  emoji: string;
  /** Monthly price in cents (USD by default — see S.currency). */
  priceCents: number;
  locations: number;
  campaigns: number; // running at once
  visitsPerMonth: number; // check-ins paid for across all campaigns
  coupons: boolean;
  /** Glowing billboard over the store in the 3D city, gold pin on the map. */
  featured: boolean;
  /** Its posts are pinned to the top of the nearby feed. */
  feed: boolean;
  /** A push to players who are near the store when a campaign starts. */
  push: boolean;
  perks: string[];
};

export const PLANS: PlanDef[] = [
  { key: "free", name: msg("Free"), emoji: "🌱", priceCents: 0, locations: 1, campaigns: 1, visitsPerMonth: 30, coupons: false, featured: false, feed: false, push: false, perks: [msg("Your store on the map with its real name"), msg("1 visit mission at a time"), msg("30 verified visits a month"), msg("Visit stats")] },
  { key: "starter", name: msg("Starter"), emoji: "🚀", priceCents: 2900, locations: 1, campaigns: 3, visitsPerMonth: 500, coupons: true, featured: false, feed: false, push: false, perks: [msg("3 missions at a time"), msg("500 verified visits a month"), msg("Coupons redeemed at your till"), msg("Visits, redemptions and repeat customers")] },
  { key: "pro", name: msg("Pro"), emoji: "⭐", priceCents: 9900, locations: 1, campaigns: 10, visitsPerMonth: 3000, coupons: true, featured: true, feed: true, push: true, perks: [msg("10 missions at a time"), msg("3,000 verified visits a month"), msg("Gold pin and a 3D billboard over your store"), msg("Pinned in the nearby feed"), msg("Push to players near your store")] },
  { key: "chain", name: msg("Chain"), emoji: "🏙️", priceCents: 29900, locations: 10, campaigns: 40, visitsPerMonth: 15000, coupons: true, featured: true, feed: true, push: true, perks: [msg("Up to 10 locations"), msg("40 missions at a time"), msg("15,000 verified visits a month"), msg("Everything in Pro, for every location")] },
];
export const PLAN_BY_KEY = Object.fromEntries(PLANS.map((p) => [p.key, p])) as Record<PlanKey, PlanDef>;
export const PLAN_KEYS = PLANS.map((p) => p.key) as [PlanKey, ...PlanKey[]];

/** The plan in force: a paid plan past its date is back on Free. */
export const activePlan = (b: { plan: string; planUntil: Date | string | null }, now = Date.now()): PlanDef => {
  const p = PLAN_BY_KEY[b.plan as PlanKey] ?? PLAN_BY_KEY.free;
  if (p.key === "free") return p;
  return b.planUntil && new Date(b.planUntil).getTime() > now ? p : PLAN_BY_KEY.free;
};

export const BIZ_LIMITS = { name: 50, about: 400, address: 120, phone: 30, website: 120, title: 60, description: 300, offer: 80 } as const;
/** Days a campaign can run for at most. */
export const CAMPAIGN_MAX_DAYS = 60;
/** How close a player must be to check in at a store (metres). */
export const BIZ_CHECKIN_M = 80;
/** A new business must be set up from inside (or right outside) the store. */
export const BIZ_SETUP_M = 150;
/** Coupon codes shown at the till: 6 characters without look-alikes. */
export const COUPON_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PLAN_DAYS = 30;
