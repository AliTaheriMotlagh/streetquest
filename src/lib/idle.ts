// Street Empire — the idle tycoon (AdVenture Capitalist / Idle Miner style). Buy street
// businesses, tap them to run a cycle or hire a manager to run them for you, hit count
// milestones for speed, buy upgrades, and earn while away (up to the vault's limit).
// Fame stars (prestige) and the steps you walk today multiply everything.
//
// Pure and deterministic — the server settles the authoritative state from a stored
// snapshot + timestamp, the client runs the same maths for a smooth counter.
import { msg } from "./i18n";

export type BizDef = { key: string; name: string; art: string; cost: number; rev: number; secs: number; k: number; manager: number; mgrName: string };

export const BUSINESSES: BizDef[] = [
  { key: "cart", name: msg("Hot Dog Cart"), art: "bizCart", cost: 4, rev: 1, secs: 1, k: 1.07, manager: 1_000, mgrName: msg("Sizzling Sam") },
  { key: "coffee", name: msg("Coffee Kiosk"), art: "bizCoffee", cost: 60, rev: 60, secs: 3, k: 1.15, manager: 15_000, mgrName: msg("Barista Bea") },
  { key: "wash", name: msg("Car Wash"), art: "bizWash", cost: 720, rev: 540, secs: 8, k: 1.14, manager: 100_000, mgrName: msg("Bubbles Bo") },
  { key: "pizza", name: msg("Pizza Place"), art: "bizPizza", cost: 8_640, rev: 4_320, secs: 15, k: 1.13, manager: 500_000, mgrName: msg("Nonna Nina") },
  { key: "taxi", name: msg("Taxi Company"), art: "bizTaxi", cost: 103_680, rev: 51_840, secs: 30, k: 1.12, manager: 1.2e6, mgrName: msg("Meter Max") },
  { key: "gym", name: msg("Street Gym"), art: "bizGym", cost: 1.24416e6, rev: 622_080, secs: 60, k: 1.11, manager: 1e7, mgrName: msg("Coach Kay") },
  { key: "cinema", name: msg("Cinema"), art: "bizCinema", cost: 1.492992e7, rev: 7.46496e6, secs: 120, k: 1.1, manager: 1.11e8, mgrName: msg("Director Dee") },
  { key: "tech", name: msg("Tech Startup"), art: "bizTech", cost: 1.7915904e8, rev: 8.957952e7, secs: 300, k: 1.09, manager: 5.55e8, mgrName: msg("Hacker Hal") },
  { key: "bank", name: msg("City Bank"), art: "bizBank", cost: 2.149908e9, rev: 1.074954e9, secs: 900, k: 1.08, manager: 1e10, mgrName: msg("Banker Bree") },
  { key: "tower", name: msg("Skyscraper"), art: "bizTower", cost: 2.5798902e10, rev: 2.9668737e10, secs: 2_700, k: 1.07, manager: 1e11, mgrName: msg("Mogul Mo") },
  { key: "space", name: msg("Spaceport"), art: "bizSpace", cost: 3.1e11, rev: 4.5e11, secs: 7_200, k: 1.07, manager: 1.5e12, mgrName: msg("Captain Cosmo") },
];
export const BIZ_BY_KEY = Object.fromEntries(BUSINESSES.map((b) => [b.key, b])) as Record<string, BizDef>;

/** Count milestones: each halves that business's cycle (speed ×2). */
export const SPEED_AT = [25, 50, 100, 200, 300, 400];
/** Further milestones multiply profit instead. */
export const PROFIT_AT = [500, 600, 700, 800, 900, 1000];
/** Every business at N: all profits ×2. */
export const ALL_AT = [25, 50, 100, 200, 300, 400];

export type UpgradeDef = { id: string; name: string; cost: number; kind: "biz" | "all" | "vault"; biz?: string; x: number };
export const UPGRADES: UpgradeDef[] = [
  ...BUSINESSES.map((b) => ({ id: `u1:${b.key}`, name: b.name, cost: b.manager * 25, kind: "biz" as const, biz: b.key, x: 3 })),
  ...BUSINESSES.map((b) => ({ id: `u2:${b.key}`, name: b.name, cost: b.manager * 1e5, kind: "biz" as const, biz: b.key, x: 3 })),
  ...[1e9, 1e13, 1e17, 1e21].map((cost, i) => ({ id: `all${i + 1}`, name: msg("Whole empire"), cost, kind: "all" as const, x: 3 })),
  ...[2e4, 5e7, 2e11, 1e15].map((cost, i) => ({ id: `vault${i + 1}`, name: msg("Bigger vault"), cost, kind: "vault" as const, x: 1 })),
].sort((a, b) => a.cost - b.cost);
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<string, UpgradeDef>;

/** Offline earnings: hours the vault holds, +1 h per vault upgrade. */
export const BASE_OFFLINE_H = 2;
/** Each fame star: +2% income. */
export const FAME_BONUS = 0.02;
/** Steps walked today: up to ×2 income at the daily goal. */
export const STEP_GOAL = 10_000;
/** Step Rush: spend banked steps for instant income. */
export const RUSH_STEPS = 1_000;
export const RUSH_MINUTES = 30;
/** Step Rushes a day (keeps a forged step count from printing endless income). */
export const RUSH_PER_DAY = 10;
/** Power cells on the map: ×2 income for a while (stacks up to the cap). */
export const BOOST_MINUTES = 30;
export const BOOST_MAX_H = 4;
/** Dividends: coins for the main game every few hours. */
export const DIVIDEND_H = 4;

export type BizState = { n: number; mgr?: boolean; at?: number | null };
export type EmpireState = {
  cash: number;
  /** Earned since the last fame reset (drives fame). */
  run: number;
  /** Earned ever (drives empire rank). */
  total: number;
  fame: number;
  biz: Record<string, BizState>;
  upg: string[];
  boostUntil: number;
  tickAt: number;
};
export type Mods = { stepsToday: number; now: number };

export const emptyEmpire = (now: number): EmpireState => ({ cash: 5, run: 0, total: 0, fame: 0, biz: { cart: { n: 1, at: null } }, upg: [], boostUntil: 0, tickAt: now });

// ---------------------------------------------------------------- multipliers
export const stepMult = (steps: number) => 1 + Math.min(1, Math.max(0, steps) / STEP_GOAL);
export const fameMult = (fame: number) => 1 + fame * FAME_BONUS;
export const offlineHours = (s: EmpireState) => BASE_OFFLINE_H + s.upg.filter((u) => u.startsWith("vault")).length;

/** Lowest count across all businesses (0 if any is unowned) — for the "all" milestones. */
const minCount = (s: EmpireState) => Math.min(...BUSINESSES.map((b) => s.biz[b.key]?.n ?? 0));

export function speedOf(s: EmpireState, key: string) {
  const n = s.biz[key]?.n ?? 0;
  return 2 ** SPEED_AT.filter((m) => n >= m).length;
}
export const cycleSecs = (s: EmpireState, key: string) => BIZ_BY_KEY[key].secs / speedOf(s, key);

/** Profit multiplier of one business, before the empire-wide ones. */
export function bizMult(s: EmpireState, key: string) {
  const n = s.biz[key]?.n ?? 0;
  let m = 2 ** PROFIT_AT.filter((x) => n >= x).length;
  for (const id of s.upg) {
    const u = UPGRADE_BY_ID[id];
    if (u?.kind === "biz" && u.biz === key) m *= u.x;
  }
  return m;
}

/** Empire-wide multiplier, without timed boosts. */
export function globalMult(s: EmpireState, mods: Pick<Mods, "stepsToday">) {
  let m = fameMult(s.fame) * stepMult(mods.stepsToday) * 2 ** ALL_AT.filter((x) => minCount(s) >= x).length;
  for (const id of s.upg) if (UPGRADE_BY_ID[id]?.kind === "all") m *= UPGRADE_BY_ID[id].x;
  return m;
}

/** Cash one cycle of a business pays (with everything except boosts). */
export function cycleRevenue(s: EmpireState, key: string, mods: Pick<Mods, "stepsToday">) {
  const n = s.biz[key]?.n ?? 0;
  return BIZ_BY_KEY[key].rev * n * bizMult(s, key) * globalMult(s, mods);
}
/** Income per second from businesses that run themselves. */
export function managedRate(s: EmpireState, mods: Pick<Mods, "stepsToday">) {
  let r = 0;
  for (const b of BUSINESSES) if (s.biz[b.key]?.mgr && (s.biz[b.key]?.n ?? 0) > 0) r += cycleRevenue(s, b.key, mods) / cycleSecs(s, b.key);
  return r;
}
/** Everything the empire could make per second if every business ran non-stop. */
export function fullRate(s: EmpireState, mods: Pick<Mods, "stepsToday">) {
  let r = 0;
  for (const b of BUSINESSES) if ((s.biz[b.key]?.n ?? 0) > 0) r += cycleRevenue(s, b.key, mods) / cycleSecs(s, b.key);
  return r;
}

// ---------------------------------------------------------------- buying
export function buyCost(def: BizDef, owned: number, count: number) {
  return (def.cost * def.k ** owned * (def.k ** count - 1)) / (def.k - 1);
}
/** How many you can afford right now (at least 0). */
export function maxAffordable(def: BizDef, owned: number, cash: number) {
  const x = (cash * (def.k - 1)) / (def.cost * def.k ** owned) + 1;
  return Math.max(0, Math.floor(Math.log(x) / Math.log(def.k) + 1e-9));
}
/** Next count milestone for a business, and what it gives. */
export function nextMilestone(n: number): { at: number; kind: "speed" | "profit" } | null {
  const s = SPEED_AT.find((m) => n < m);
  if (s) return { at: s, kind: "speed" };
  const p = PROFIT_AT.find((m) => n < m);
  return p ? { at: p, kind: "profit" } : null;
}

// ---------------------------------------------------------------- time
/** Seconds of [from, to] that fall before `until` (a timed boost). */
const overlap = (from: number, to: number, until: number) => Math.max(0, Math.min(to, until) - from) / 1000;

/**
 * Bring the empire up to `now`: managed businesses earn for the elapsed time (capped by
 * the vault), finished manual cycles pay out and stop. Returns the new state and what
 * was earned while away. Mutates nothing.
 */
export function settle(s0: EmpireState, mods: Mods): { s: EmpireState; earned: number; away: number } {
  const s: EmpireState = { ...s0, biz: Object.fromEntries(Object.entries(s0.biz).map(([k, v]) => [k, { ...v }])), upg: [...s0.upg] };
  const now = Math.max(mods.now, s.tickAt);
  const away = (now - s.tickAt) / 1000;
  const capS = offlineHours(s) * 3600;
  // Time that counts: everything up to the vault's limit (the most recent part).
  const from = Math.max(s.tickAt, now - capS * 1000);
  const secs = (now - from) / 1000;
  const boosted = overlap(from, now, s.boostUntil);
  let earned = managedRate(s, mods) * (secs + boosted);
  for (const b of BUSINESSES) {
    const st = s.biz[b.key];
    if (!st || st.mgr || st.at == null || st.n <= 0) continue;
    const done = st.at + cycleSecs(s, b.key) * 1000;
    if (done <= now) {
      earned += cycleRevenue(s, b.key, mods) * (done <= s.boostUntil ? 2 : 1);
      st.at = null;
    }
  }
  s.cash += earned;
  s.run += earned;
  s.total += earned;
  s.tickAt = now;
  return { s, earned, away };
}

/** Boost multiplier right now. */
export const boostNow = (s: EmpireState, now: number) => (s.boostUntil > now ? 2 : 1);

// ---------------------------------------------------------------- fame & rank
/** Fame stars your run's earnings are worth in total (AdVenture Capitalist's angel curve). */
export const fameFor = (run: number) => Math.floor(150 * Math.sqrt(Math.max(0, run) / 1e13));
/** Empire rank: 1 at 1K earned ever, then one more every ×31.6 (1.5 orders of magnitude). */
const RANK_STEP = 1.5;
export const rankOf = (total: number) => (total < 1000 ? 0 : Math.floor((Math.log10(total) - 3) / RANK_STEP + 1e-9) + 1);
/** Earnings (ever) that reach a rank. */
export const rankAt = (rank: number) => 10 ** (3 + RANK_STEP * (rank - 1));
/** What reaching a rank pays in the main game. */
export const rankReward = (rank: number) => ({ coins: 80 * rank, xp: 60 * rank, gems: rank >= 3 ? Math.min(10, Math.floor(rank / 2) + 1) : 0 });
/** Dividend: coins every few hours, growing with rank. */
export const dividendCoins = (rank: number) => 25 + 15 * rank;

// ---------------------------------------------------------------- numbers
const SUFFIX_EN = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
const SUFFIX_FA = ["", "هزار", "میلیون", "میلیارد", "تریلیون", "کوادریلیون", "کوینتیلیون", "سکستیلیون", "سپتیلیون", "اکتیلیون", "نونیلیون", "دسیلیون"];
/** 1.23M / ۱٫۲۳ میلیون — idle-game numbers. */
export function bigNum(n: number, fa = false, fmt: (x: number, o?: Intl.NumberFormatOptions) => string = (x, o) => x.toLocaleString("en-US", o)) {
  if (!Number.isFinite(n)) return "∞";
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) return (neg ? "-" : "") + fmt(n < 10 ? Math.floor(n * 10) / 10 : Math.floor(n), { maximumFractionDigits: 1 });
  let i = Math.min(SUFFIX_EN.length - 1, Math.floor(Math.log10(n) / 3));
  let v = n / 1000 ** i;
  if (v >= 999.995 && i < SUFFIX_EN.length - 1) (v /= 1000), i++;
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const body = fmt(Math.floor(v * 10 ** digits) / 10 ** digits, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${neg ? "-" : ""}${body}${fa ? ` ${SUFFIX_FA[i]}` : SUFFIX_EN[i]}`;
}
