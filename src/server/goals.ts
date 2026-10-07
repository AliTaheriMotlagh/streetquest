// Goals: one world operation everyone works on each week, one goal per faction
// each week, and permanent personal milestones. Game events feed counters through
// trackStat() (questEvent calls it for every quest kind), so no background jobs.
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { S, type GoalDef, type GoalReward, type MilestoneDef } from "../lib/settings";
import { FACTION_BY_KEY, type FactionKey } from "../lib/rts";
import { HttpError } from "./http";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Weeks start Monday 00:00 UTC (the epoch was a Thursday). */
export const weekIndex = (t = Date.now()) => Math.floor((t + 3 * DAY) / WEEK);
export const weekKey = (t = Date.now()) => `wk${weekIndex(t)}`;
export const weekEndsAt = (t = Date.now()) => (weekIndex(t) + 1) * WEEK - 3 * DAY;

const pick = <T,>(list: T[], i: number) => (list.length ? list[((i % list.length) + list.length) % list.length] : null);
export const worldGoal = (t = Date.now()) => pick<GoalDef>(S.worldGoals, weekIndex(t));
export const factionGoal = (t = Date.now()) => pick<GoalDef>(S.factionGoals, weekIndex(t));

type Scope = "user" | "faction" | "world";
const bump = (scope: Scope, scopeId: string, period: string, metric: string, n: number) =>
  prisma.goalCounter.upsert({
    where: { scope_scopeId_period_metric: { scope, scopeId, period, metric } },
    create: { scope, scopeId, period, metric, value: n },
    update: { value: { increment: n } },
  });

/** Count progress for every goal scope. Never throws — goals must not break gameplay. */
export async function trackStat(userId: string, metric: string, n = 1, faction?: string | null) {
  if (!n || n < 0 || !S.goalsEnabled) return;
  try {
    const f = faction !== undefined ? faction : (await prisma.user.findUnique({ where: { id: userId }, select: { faction: true } }))?.faction;
    const wk = weekKey();
    const world = worldGoal();
    const fgoal = factionGoal();
    const ops = [bump("user", userId, "all", metric, n), bump("user", userId, wk, metric, n)];
    if (world?.metric === metric) ops.push(bump("world", "all", wk, metric, n));
    if (f && fgoal?.metric === metric) ops.push(bump("faction", f, wk, metric, n));
    const rows = await Promise.all(ops);
    // Announce when this contribution completes a shared goal.
    const crossed = (v: number, target: number) => v >= target && v - n < target;
    if (world && world.metric === metric && crossed(rows[2].value, world.target)) await announce(`${world.emoji} World operation complete: ${world.title}`, "Everyone who helped can claim the reward in Hero → Goals");
    if (f && fgoal?.metric === metric) {
      const row = rows[rows.length - 1];
      if (crossed(row.value, fgoal.target)) {
        const fd = FACTION_BY_KEY[f as FactionKey];
        const members = await prisma.user.findMany({ where: { faction: f, lastSeenAt: { gt: new Date(Date.now() - 7 * DAY) } }, select: { id: true }, take: 2000 });
        await prisma.notification.createMany({ data: members.map((m) => ({ userId: m.id, kind: "reward", title: `${fd?.emoji ?? "🚩"} Faction goal complete: ${fgoal.title}`, body: "Claim your share in Hero → Goals" })) });
      }
    }
  } catch (e) {
    console.error("trackStat failed", e);
  }
}

async function announce(title: string, body: string) {
  const active = await prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true }, take: 5000 });
  await prisma.notification.createMany({ data: active.map((a) => ({ userId: a.id, kind: "reward", title, body })) });
}

const fmtReward = (r: GoalReward, mult = 1) => [r.xp && `${r.xp * mult} XP`, r.coins && `${r.coins * mult} 🪙`, r.gems && `${r.gems * mult} 💎`].filter(Boolean).join(" · ");

export async function goalsView(u: Pick<User, "id" | "faction">) {
  const wk = weekKey();
  const world = worldGoal();
  const fgoal = u.faction ? factionGoal() : null;
  const personal = S.personalGoals as MilestoneDef[];
  const metrics = [...new Set(personal.map((p) => p.metric))];
  const [mine, mineWeek, worldRow, factionRow, claims, top, factionTop] = await Promise.all([
    prisma.goalCounter.findMany({ where: { scope: "user", scopeId: u.id, period: "all", metric: { in: metrics } } }),
    prisma.goalCounter.findMany({ where: { scope: "user", scopeId: u.id, period: wk, metric: { in: [world?.metric ?? "", fgoal?.metric ?? ""] } } }),
    world ? prisma.goalCounter.findUnique({ where: { scope_scopeId_period_metric: { scope: "world", scopeId: "all", period: wk, metric: world.metric } } }) : null,
    fgoal && u.faction ? prisma.goalCounter.findUnique({ where: { scope_scopeId_period_metric: { scope: "faction", scopeId: u.faction, period: wk, metric: fgoal.metric } } }) : null,
    prisma.goalClaim.findMany({ where: { userId: u.id }, select: { key: true } }),
    world ? prisma.goalCounter.findMany({ where: { scope: "user", period: wk, metric: world.metric }, orderBy: { value: "desc" }, take: 5 }) : [],
    fgoal ? prisma.goalCounter.findMany({ where: { scope: "faction", period: wk, metric: fgoal.metric }, orderBy: { value: "desc" } }) : [],
  ]);
  const claimed = new Set(claims.map((c) => c.key));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: top.map((t) => t.scopeId) } }, select: { id: true, username: true, avatar: true } })).map((x) => [x.id, x]));
  const mineBy = new Map(mine.map((r) => [r.metric, r.value]));
  const weekBy = new Map(mineWeek.map((r) => [r.metric, r.value]));
  const shared = (def: GoalDef | null, value: number, key: string | null) =>
    def && {
      ...def,
      value: Math.floor(value),
      mine: Math.floor(weekBy.get(def.metric) ?? 0),
      done: value >= def.target,
      claimKey: key,
      claimed: key ? claimed.has(key) : false,
      rewardText: fmtReward(def.reward),
    };
  return {
    enabled: S.goalsEnabled,
    week: wk,
    endsAt: weekEndsAt(),
    world: shared(world, worldRow?.value ?? 0, world ? `w:${wk}:${world.key}` : null),
    worldTop: top.map((t) => ({ name: names.get(t.scopeId)?.username ?? "?", avatar: names.get(t.scopeId)?.avatar ?? "🕶️", value: Math.floor(t.value), me: t.scopeId === u.id })),
    faction: shared(fgoal, factionRow?.value ?? 0, fgoal && u.faction ? `f:${wk}:${u.faction}:${fgoal.key}` : null),
    factionRace: factionTop.map((r) => ({ faction: r.scopeId, value: Math.floor(r.value) })),
    personal: personal.map((p) => {
      const value = Math.floor(mineBy.get(p.metric) ?? 0);
      const tiers = p.tiers.map((target, i) => ({ target, done: value >= target, claimed: claimed.has(`p:${p.key}:${i}`), reward: fmtReward(p.reward, i + 1) }));
      const next = tiers.findIndex((t) => !t.done);
      return { ...p, value, tiers, next: next < 0 ? tiers.length : next, ready: tiers.filter((t) => t.done && !t.claimed).length };
    }),
  };
}

export async function goalsReady(u: Pick<User, "id" | "faction">) {
  if (!S.goalsEnabled) return 0;
  try {
    const g = await goalsView(u);
    return g.personal.reduce((s, p) => s + p.ready, 0) + (g.world?.done && g.world.mine > 0 && !g.world.claimed ? 1 : 0) + (g.faction?.done && g.faction.mine > 0 && !g.faction.claimed ? 1 : 0);
  } catch {
    return 0;
  }
}

/** Claim a goal reward. Returns what to grant. */
export async function claimGoal(u: Pick<User, "id" | "faction">, key: string): Promise<{ reward: GoalReward; title: string }> {
  if (!S.goalsEnabled) throw new HttpError(400, "Goals are switched off");
  const g = await goalsView(u);
  let reward: GoalReward | null = null;
  let title = "";
  for (const shared of [g.world, g.faction]) {
    if (shared?.claimKey !== key) continue;
    if (!shared.done) throw new HttpError(400, "Not reached yet — keep going!");
    if (shared.mine <= 0) throw new HttpError(400, "Only players who contributed this week can claim it");
    reward = shared.reward;
    title = shared.title;
  }
  const m = /^p:(.+):(\d+)$/.exec(key);
  if (m) {
    const p = g.personal.find((x) => x.key === m[1]);
    const i = Number(m[2]);
    if (!p || !p.tiers[i]) throw new HttpError(404, "Goal not found");
    if (!p.tiers[i].done) throw new HttpError(400, "Not reached yet");
    reward = { xp: (p.reward.xp ?? 0) * (i + 1), coins: (p.reward.coins ?? 0) * (i + 1), gems: (p.reward.gems ?? 0) * (i + 1) };
    title = `${p.title} · tier ${i + 1}`;
  }
  if (!reward) throw new HttpError(404, "Goal not found");
  try {
    await prisma.goalClaim.create({ data: { userId: u.id, key } });
  } catch {
    throw new HttpError(409, "Already claimed");
  }
  return { reward, title };
}
