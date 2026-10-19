// Street Empire on the server: the stored snapshot is settled to "now" on every request
// (lib/idle.ts), then the action is checked against that settled state. Actions run one
// at a time per player (actionRoute), so a double tap can't buy twice.
import type { Empire, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import {
  BIZ_BY_KEY,
  BOOST_MAX_H,
  BOOST_MINUTES,
  buyCost,
  BUSINESSES,
  DIVIDEND_H,
  dividendCoins,
  emptyEmpire,
  fameFor,
  fullRate,
  managedRate,
  maxAffordable,
  rankOf,
  rankReward,
  RUSH_MINUTES,
  RUSH_PER_DAY,
  RUSH_STEPS,
  settle,
  UPGRADE_BY_ID,
  type BizState,
  type EmpireState,
} from "../lib/idle";
import { HttpError } from "./http";
import { bumpNeeds } from "./needs";
import { questEvent } from "./quests";
import { grant } from "./rewards";
import { stepsToday } from "./steps";
import { trackStat } from "./goals";
import { dayKey } from "../lib/progression";

/** Away longer than this counts as "while you were away" (shown on return). */
const AWAY_REPORT_S = 5 * 60;

const toState = (e: Empire): EmpireState => ({
  cash: e.cash,
  run: e.run,
  total: e.total,
  fame: e.fame,
  biz: (e.biz ?? {}) as Record<string, BizState>,
  upg: e.upg,
  boostUntil: e.boostUntil.getTime(),
  tickAt: e.tickAt.getTime(),
});

async function loadRow(u: User) {
  const found = await prisma.empire.findUnique({ where: { userId: u.id } });
  if (found) return found;
  const s = emptyEmpire(Date.now());
  return prisma.empire.upsert({ where: { userId: u.id }, create: { userId: u.id, cash: s.cash, biz: s.biz }, update: {} });
}

async function save(userId: string, s: EmpireState, extra: Partial<Pick<Empire, "stepsSpent" | "rankClaimed" | "dividendAt" | "prestiges" | "rushDay" | "rushes">> = {}) {
  await prisma.empire.update({
    where: { userId },
    data: { cash: s.cash, run: s.run, total: s.total, fame: s.fame, biz: s.biz, upg: s.upg, boostUntil: new Date(s.boostUntil), tickAt: new Date(s.tickAt), ...extra },
  });
}

/** Load, settle to now and save. Everything else starts from here. */
export async function settled(u: User) {
  const row = await loadRow(u);
  const steps = await stepsToday(u);
  const { s, earned, away } = settle(toState(row), { now: Date.now(), stepsToday: steps });
  await save(u.id, s);
  return { row, s, steps, offline: away >= AWAY_REPORT_S && earned > 0 ? { earned, seconds: Math.round(away) } : null };
}

/** What the client needs to draw the empire and run its own counter. */
export function view(row: Empire, s: EmpireState, steps: number, stepsTotal: number) {
  const mods = { stepsToday: steps };
  const rank = rankOf(s.total);
  const next = row.dividendAt ? row.dividendAt.getTime() + DIVIDEND_H * 3600_000 : 0;
  return {
    state: s,
    now: Date.now(),
    stepsToday: steps,
    stepBank: Math.max(0, stepsTotal - row.stepsSpent),
    perSec: managedRate(s, mods),
    fullPerSec: fullRate(s, mods),
    fameGain: Math.max(0, fameFor(s.run) - s.fame),
    rank,
    rankClaimed: row.rankClaimed,
    dividend: { coins: dividendCoins(rank), readyAt: next },
    prestiges: row.prestiges,
  };
}

export type EmpireAction =
  | { action: "buy"; biz: string; count: number }
  | { action: "run"; biz: string }
  | { action: "hire"; biz: string }
  | { action: "upgrade"; id: string }
  | { action: "rush" }
  | { action: "prestige" }
  | { action: "dividend" }
  | { action: "rank" };

/** Apply one action. Returns a message for the player (or none). */
export async function act(u: User, a: EmpireAction): Promise<{ message?: string }> {
  const { row, s, steps } = await settled(u);
  const mods = { stepsToday: steps };
  const spend = (cost: number) => {
    if (cost > s.cash * (1 + 1e-9)) throw new HttpError(400, t("Not enough cash"));
    s.cash = Math.max(0, s.cash - cost);
  };
  const def = "biz" in a ? BIZ_BY_KEY[a.biz] : null;
  if ("biz" in a && !def) throw new HttpError(400, t("No such business"));

  switch (a.action) {
    case "buy": {
      const st = s.biz[def!.key] ?? { n: 0, at: null };
      const count = a.count > 0 ? Math.min(1000, Math.floor(a.count)) : maxAffordable(def!, st.n, s.cash);
      if (count < 1) throw new HttpError(400, t("Not enough cash"));
      spend(buyCost(def!, st.n, count));
      const first = st.n === 0;
      s.biz[def!.key] = { ...st, n: st.n + count, at: st.at ?? null };
      await save(u.id, s);
      await questEvent(u.id, "empire");
      if (first) {
        return { message: t("🎉 {name} is open for business!", { name: t(def!.name) }) };
      }
      return {};
    }
    case "run": {
      const st = s.biz[def!.key];
      if (!st || st.n < 1) throw new HttpError(400, t("Buy this business first"));
      if (st.mgr) return {};
      if (st.at != null) return {}; // already running
      st.at = Date.now();
      await save(u.id, s);
      return {};
    }
    case "hire": {
      const st = s.biz[def!.key];
      if (!st || st.n < 1) throw new HttpError(400, t("Buy this business first"));
      if (st.mgr) throw new HttpError(409, t("Already has a manager"));
      spend(def!.manager);
      st.mgr = true;
      st.at = null;
      await save(u.id, s);
      await questEvent(u.id, "empire");
      return { message: t("🤝 {name} now runs your {biz}", { name: t(def!.mgrName), biz: t(def!.name) }) };
    }
    case "upgrade": {
      const up = UPGRADE_BY_ID[a.id];
      if (!up) throw new HttpError(400, t("No such upgrade"));
      if (s.upg.includes(up.id)) throw new HttpError(409, t("Already bought"));
      spend(up.cost);
      s.upg.push(up.id);
      await save(u.id, s);
      return { message: up.kind === "vault" ? t("🏦 Vault upgraded: earns offline for longer") : up.kind === "all" ? t("📈 Whole empire profits ×{x}", { x: up.x }) : t("📈 {name} profits ×{x}", { name: t(up.name), x: up.x }) };
    }
    case "rush": {
      const bank = u.stepsTotal - row.stepsSpent;
      if (bank < RUSH_STEPS) throw new HttpError(400, t("Walk {n} more steps to rush", { n: RUSH_STEPS - Math.max(0, bank) }));
      const day = dayKey(u.timezone);
      const done = row.rushDay === day ? row.rushes : 0;
      if (done >= RUSH_PER_DAY) throw new HttpError(429, t("That's {n} rushes today — more tomorrow", { n: RUSH_PER_DAY }));
      const gain = fullRate(s, mods) * RUSH_MINUTES * 60;
      if (gain <= 0) throw new HttpError(400, t("Buy a business first"));
      s.cash += gain;
      s.run += gain;
      s.total += gain;
      await save(u.id, s, { stepsSpent: row.stepsSpent + RUSH_STEPS, rushDay: day, rushes: done + 1 });
      return { message: t("👟 Step Rush! {min} minutes of income, instantly", { min: RUSH_MINUTES }) };
    }
    case "prestige": {
      const gain = fameFor(s.run) - s.fame;
      if (gain < 1) throw new HttpError(400, t("Earn more before cashing in your fame"));
      const fresh = emptyEmpire(Date.now());
      fresh.fame = s.fame + gain;
      fresh.total = s.total;
      fresh.run = 0;
      fresh.boostUntil = s.boostUntil;
      // Fame is permanent; businesses, managers and cash upgrades start over.
      await save(u.id, fresh, { prestiges: row.prestiges + 1 });
      // Gems only for a big cash-in (at least doubling your fame), so it can't be farmed.
      await grant(u.id, { xp: Math.min(500, 100 + 5 * gain), gems: gain >= Math.max(10, s.fame) ? 5 : 0 });
      return { message: t("⭐ +{n} fame! Every business earns {pct}% more, forever", { n: gain, pct: Math.round(fresh.fame * 2) }) };
    }
    case "dividend": {
      const ready = !row.dividendAt || Date.now() >= row.dividendAt.getTime() + DIVIDEND_H * 3600_000;
      if (!ready) throw new HttpError(400, t("Your next dividend isn't ready yet"));
      if (rankOf(s.total) < 1) throw new HttpError(400, t("Earn 1K to start paying dividends"));
      const coins = dividendCoins(rankOf(s.total));
      await save(u.id, s, { dividendAt: new Date() });
      await grant(u.id, { coins, xp: 20 });
      await bumpNeeds(u.id, { fun: 10 });
      return { message: t("💰 Dividend paid: +{n} 🪙", { n: coins }) };
    }
    case "rank": {
      const rank = rankOf(s.total);
      if (row.rankClaimed >= rank) throw new HttpError(400, t("Nothing to claim yet"));
      const sum = { coins: 0, xp: 0, gems: 0 };
      for (let r = row.rankClaimed + 1; r <= rank; r++) {
        const g = rankReward(r);
        sum.coins += g.coins;
        sum.xp += g.xp;
        sum.gems += g.gems;
      }
      await save(u.id, s, { rankClaimed: rank });
      await grant(u.id, sum);
      await trackStat(u.id, "empire_rank", rank - row.rankClaimed, u.faction);
      return { message: [t("🏆 Empire rank {n}!", { n: rank }), t("+{n} 🪙", { n: sum.coins }), sum.gems ? t("+{n} 💎", { n: sum.gems }) : ""].filter(Boolean).join(" · ") };
    }
  }
}

/** A power cell from the map: double income for a while (stacks up to a cap). */
export async function addBoost(u: User, minutes = BOOST_MINUTES) {
  const { s } = await settled(u);
  const now = Date.now();
  s.boostUntil = Math.min(now + BOOST_MAX_H * 3600_000, Math.max(now, s.boostUntil) + minutes * 60_000);
  await save(u.id, s);
  return s.boostUntil;
}

export const EMPIRE_BIZ_KEYS = BUSINESSES.map((b) => b.key);
