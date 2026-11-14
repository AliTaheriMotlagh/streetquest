// Businesses (pure — client and server): real stores, restaurants and cafés that put
// their place on the game map and pay for a plan to bring players through the door.
// A campaign is a mission at the store: players check in on the spot (counted as a
// verified visit), and coupon campaigns add a code the cashier enters at the till
// (a verified sale). Coins come from the game; the business pays for the plan.
import { fmtNum, msg, t } from "./i18n";
import { countryAt } from "./region";

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
  { key: "free", name: msg("Free"), emoji: "🌱", priceCents: 0, locations: 1, campaigns: 1, visitsPerMonth: 30, coupons: false, featured: false, feed: false, push: false, perks: [msg("Your store on the map with its real name"), msg("Your own sign in the 3D city, with your opening hours"), msg("1 visit mission at a time"), msg("30 verified visits a month"), msg("Visit stats")] },
  { key: "starter", name: msg("Starter"), emoji: "🚀", priceCents: 2900, locations: 1, campaigns: 3, visitsPerMonth: 500, coupons: true, featured: false, feed: false, push: false, perks: [msg("Your logo, brand colour and banner line on your 3D storefront"), msg("Your menu and prices on the sign and the store card"), msg("A dressed shop front and a shopkeeper at the door"), msg("3 missions at a time"), msg("500 verified visits a month"), msg("Coupons redeemed at your till"), msg("Visits, redemptions and repeat customers")] },
  { key: "pro", name: msg("Pro"), emoji: "⭐", priceCents: 9900, locations: 1, campaigns: 10, visitsPerMonth: 3000, coupons: true, featured: true, feed: true, push: true, perks: [msg("Gold pin with your logo and a lit 3D billboard over your store"), msg("Everything in Starter"), msg("10 missions at a time"), msg("3,000 verified visits a month"), msg("Pinned in the nearby feed"), msg("Push to players near your store")] },
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

export const BIZ_LIMITS = { name: 50, about: 400, address: 120, phone: 30, website: 120, title: 60, description: 300, offer: 80, tagline: 60, menuTitle: 50 } as const;
/** Days a campaign can run for at most. */
export const CAMPAIGN_MAX_DAYS = 60;
/** How close a player must be to check in at a store (metres). */
export const BIZ_CHECKIN_M = 80;
/** A new business must be set up from inside (or right outside) the store. */
export const BIZ_SETUP_M = 150;
/** Coupon codes shown at the till: 6 characters without look-alikes. */
export const COUPON_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PLAN_DAYS = 30;

// ---------------------------------------------------------------- the store's look in the game
/**
 * How a business shows in the 3D city and on the map, by plan:
 *  - basic (Free): its own sign with its real name and hours, in its trade's colours;
 *  - brand (Starter): + logo, brand colour, a banner line, its menu, a dressed front and a shopkeeper;
 *  - featured (Pro, Chain): + a lit billboard over the store and a gold pin with the logo.
 */
export type BrandTier = "basic" | "brand" | "featured";
export const brandTier = (plan: PlanDef): BrandTier => (plan.featured ? "featured" : plan.key === "free" ? "basic" : "brand");

/** Items on a business's own menu at most. */
export const BIZ_MENU_MAX = 24;
export type BizMenuItem = { title: string; price: number };
/** Saturday = bit 0 … Friday = bit 6 (Week's order). */
export const OFF_DAY_BITS = 0x7f;

/** A brand colour as #rrggbb, lower case; anything else is "" (the trade's colours). */
export const cleanColor = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim().toLowerCase() : "");

/** The owner's menu as stored (JSON): titled lines with a whole, non-negative price; at most BIZ_MENU_MAX. */
export function cleanMenu(raw: unknown): BizMenuItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BizMenuItem[] = [];
  for (const r of raw) {
    if (out.length >= BIZ_MENU_MAX) break;
    const title = typeof r?.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, BIZ_LIMITS.menuTitle) : "";
    const price = Math.round(Number(r?.price));
    if (title && Number.isFinite(price) && price >= 0) out.push({ title, price: Math.min(price, 1e9) });
  }
  return out;
}

/** Opening hours as the owner types them: "09:00-22:00", two spans "09:00-13:00, 16:00-21:00", or "24" (all day). */
export const HOURS_RE = /^\s*(24|\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}(\s*[,|]\s*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})?)\s*$/;
const mins = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m && Number(m[1]) <= 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The owner's hours as a Week (lib/localData.ts: Saturday first, minutes, a span past midnight
 * runs over 1440). `offDays`: bits of the days it's shut. Null when no hours were given.
 */
export function bizWeek(hours: string, offDays = 0): [number, number][][] | null {
  const h = (hours ?? "").replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).trim();
  if (!h || !HOURS_RE.test(h)) return null;
  const spans: [number, number][] = [];
  if (h === "24") spans.push([0, 1440]);
  else
    for (const m of h.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)) {
      const a = mins(m[1]), b = mins(m[2]);
      if (a != null && b != null) spans.push([a, b <= a ? b + 1440 : b]);
    }
  if (!spans.length) return null;
  return Array.from({ length: 7 }, (_, d) => (offDays & (1 << d) ? [] : spans.map((s) => [...s] as [number, number])));
}

/** What the game shows of a business (the plan decides; see BrandTier). */
export type BizLook = { tier: BrandTier; color: string; tagline: string; logo: string | null; menu: BizMenuItem[]; week: [number, number][][] | null };

export function bizLook(
  b: { id: string; plan: string; planUntil: Date | string | null; color?: string; tagline?: string; menu?: unknown; hours?: string; offDays?: number; logoHash?: string },
  now = Date.now(),
): BizLook {
  const tier = brandTier(activePlan(b, now));
  const week = bizWeek(b.hours ?? "", b.offDays ?? 0);
  if (tier === "basic") return { tier, color: "", tagline: "", logo: null, menu: [], week };
  return {
    tier,
    color: cleanColor(b.color),
    tagline: (b.tagline ?? "").trim().slice(0, BIZ_LIMITS.tagline),
    logo: b.logoHash ? `/api/business/logo?id=${encodeURIComponent(b.id)}&v=${encodeURIComponent(b.logoHash)}` : null,
    menu: cleanMenu(b.menu),
    week,
  };
}

/** A darker shade of a #rrggbb colour (the sign's lower edge, the awning's stripe). */
export function shade(hex: string, k: number): string {
  const c = cleanColor(hex);
  if (!c) return hex;
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Light or dark text on a background colour (WCAG relative luminance). */
export function inkOn(hex: string): "#ffffff" | "#1a1a1a" {
  const c = cleanColor(hex);
  if (!c) return "#ffffff";
  const n = parseInt(c.slice(1), 16);
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#1a1a1a" : "#ffffff";
}

/** The owner's hours in OpenStreetMap's opening_hours shape (what the store card reads): "09:00-22:00; Fr off". */
export function bizOpeningHours(hours: string, offDays = 0): string {
  const w = bizWeek(hours, offDays);
  if (!w) return "";
  const days = ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"];
  const hm = (m: number) => `${String(Math.floor(m / 60) % 25).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const open = w.find((d) => d.length) ?? [];
  const spans = open.map(([a, b]) => `${hm(a)}-${hm(b > 1440 ? b - 1440 : b)}`).join(",");
  const off = days.filter((_, i) => offDays & (1 << i)).map((d) => `; ${d} off`).join("");
  return spans ? `${spans}${off}` : "off";
}

/** A menu price in the store's own money: toman in Iran, lira in Turkey, a plain number elsewhere. */
export function priceAt(n: number, at: { lat: number; lng: number }): string {
  const c = countryAt(at.lat, at.lng);
  return c === "IR" ? t("{n} toman", { n }) : c === "TR" ? `${fmtNum(n)} ₺` : fmtNum(n);
}
