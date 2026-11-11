// Scenarios on the server (lib/scenarios): the list (the six starters plus what admins made or
// changed), starting a run, finishing it and paying. The chase and the shooting happen in the
// player's browser, so the server only checks the run could have happened (lib/scenarios/
// plausibility.ts: places, time, distance, where the player ended) and limits the pay: one reward
// per scenario per window, a few a day.
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { MAX_VEHICLE_MULT } from "../lib/vehicles";
import { S } from "../lib/settings";
import type { LatLng } from "../lib/geo";
import { radiusOf } from "../lib/scenarios/anchors";
import { checkFinish, checkStart, endSpot, REWARDS_PER_DAY, RUN_TTL_MS, windowKey, type Claim } from "../lib/scenarios/plausibility";
import { STARTERS } from "../lib/scenarios/starters";
import type { Scenario } from "../lib/scenarios/types";
import { validateScenario } from "../lib/scenarios/validate";
import { HttpError } from "./http";
import { grant, lastKnownLocation } from "./rewards";

/** Every scenario: the starters, replaced or switched off by admin rows, plus the admin's own. */
export async function allScenarios(): Promise<(Scenario & { starter: boolean })[]> {
  const rows = await prisma.scenarioDef.findMany({ orderBy: { createdAt: "asc" } });
  const byId = new Map<string, Scenario & { starter: boolean }>(STARTERS.map((s) => [s.id, { ...s, starter: true }]));
  for (const r of rows) {
    const v = validateScenario(r.data);
    // A row that no longer validates (the format changed) is skipped; the starter underneath stays.
    if (!v.ok) continue;
    byId.set(r.id, { ...v.value, enabled: r.enabled, starter: STARTERS.some((s) => s.id === r.id) });
  }
  return [...byId.values()];
}

export async function scenarioById(id: string) {
  return (await allScenarios()).find((s) => s.id === id) ?? null;
}

/** What a player sees: the enabled scenarios, when each last paid, and their recent runs. */
export async function playerView(userId: string, admin?: { test: string | null }) {
  const [all, runs, paid] = await Promise.all([
    allScenarios(),
    prisma.scenarioRun.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { startedAt: "desc" }, take: 20, select: { id: true, scenarioId: true, status: true, startedAt: true, elapsedS: true, coins: true, xp: true, reason: true } }),
    prisma.scenarioRun.findMany({ where: { userId, window: windowKey(Date.now()) }, select: { scenarioId: true } }),
  ]);
  const paidNow = new Set(paid.map((p) => p.scenarioId));
  const done = new Set((await prisma.scenarioRun.findMany({ where: { userId, status: "WON" }, select: { scenarioId: true }, distinct: ["scenarioId"] })).map((r) => r.scenarioId));
  return {
    scenarios: all.filter((s) => s.enabled || (admin && s.id === admin.test)).map(({ starter: _s, ...s }) => ({ ...s, done: done.has(s.id), paidNow: paidNow.has(s.id) })),
    history: runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })),
  };
}

const ll = (p: LatLng) => ({ lat: p.lat, lng: p.lng });

export async function startRun(userId: string, id: string, claim: Claim, admin = false) {
  const scn = await scenarioById(id);
  if (!scn || (!scn.enabled && !admin)) throw new HttpError(404, t("That scenario isn't available"));
  const here = await lastKnownLocation(userId);
  const ok = checkStart(scn, claim, here);
  if (!ok.ok) throw new HttpError(400, t("The scenario's places don't fit where you are"));
  // One run at a time: an old unfinished one is over.
  await prisma.scenarioRun.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "ABANDONED", finishedAt: new Date(), reason: "restarted" } });
  const run = await prisma.scenarioRun.create({
    data: { userId, scenarioId: id, startLat: here.lat, startLng: here.lng, claim: { giver: ll(claim.giver), places: claim.places.map((p) => (p ? ll(p) : null)) } },
  });
  return { runId: run.id };
}

export type Finish = { result: "won" | "failed"; elapsedS: number; travelledM: number; reason?: string };

export async function finishRun(userId: string, runId: string, f: Finish) {
  const run = await prisma.scenarioRun.findFirst({ where: { id: runId, userId, status: "ACTIVE" } });
  if (!run) throw new HttpError(404, t("No active scenario run"));
  const now = Date.now();
  const wall = (now - run.startedAt.getTime()) / 1000;
  if (now - run.startedAt.getTime() > RUN_TTL_MS) {
    await prisma.scenarioRun.update({ where: { id: run.id }, data: { status: "ABANDONED", finishedAt: new Date(), reason: "expired" } });
    throw new HttpError(400, t("That run took too long and was called off"));
  }
  const mark = (status: string, extra: Record<string, unknown> = {}) =>
    prisma.scenarioRun.updateMany({ where: { id: run.id, status: "ACTIVE" }, data: { status, finishedAt: new Date(), elapsedS: Math.round(f.elapsedS), travelledM: Math.round(f.travelledM), reason: f.reason ?? null, ...extra } });

  if (f.result === "failed") {
    await mark("FAILED");
    return { status: "FAILED" as const, reward: null, message: t("Scenario failed") };
  }

  const scn = await scenarioById(run.scenarioId);
  if (!scn) throw new HttpError(404, t("That scenario isn't available"));
  const claim = run.claim as unknown as Claim;
  const start = { lat: run.startLat, lng: run.startLng };
  // The client's clock can't be longer than the real one (it is shorter after a retry from a checkpoint).
  if (f.elapsedS > wall + 5) throw new HttpError(400, t("That run doesn't add up"));
  const maxMs = ((S.driveSpeedKmh * MAX_VEHICLE_MULT) / 3.6) * 1.25;
  const end = endSpot(scn, claim, radiusOf);
  let here: LatLng | null = null;
  if (end) here = await lastKnownLocation(userId);
  const verdict = checkFinish(scn, claim, start, { elapsedS: f.elapsedS, travelledM: f.travelledM }, here, end, maxMs);
  if (!verdict.ok) {
    await mark("FAILED", { reason: `check:${verdict.why}` });
    throw new HttpError(400, t("That run doesn't add up"));
  }

  const day = new Date(now - 24 * 3600_000);
  const paidToday = await prisma.scenarioRun.count({ where: { userId, window: { not: null }, finishedAt: { gte: day } } });
  let reward: { xp: number; coins: number } | null = null;
  if (paidToday < REWARDS_PER_DAY) {
    // The unique (user, scenario, window) is what makes it one reward per window, even for two requests at once.
    const claimed = await prisma.scenarioRun.updateMany({ where: { id: run.id, status: "ACTIVE" }, data: { status: "WON", finishedAt: new Date(), elapsedS: Math.round(f.elapsedS), travelledM: Math.round(f.travelledM), window: windowKey(now), coins: scn.reward.coins, xp: scn.reward.xp } }).then((r) => r.count, (e: { code?: string }) => (e.code === "P2002" ? 0 : Promise.reject(e)));
    if (claimed) {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, coins: true } });
      const after = await grant(userId, { xp: scn.reward.xp, coins: scn.reward.coins });
      reward = { xp: after.xp - before.xp, coins: after.coins - before.coins };
    } else await mark("WON");
  } else await mark("WON");
  return { status: "WON" as const, reward, message: reward ? t("Scenario complete") : t("Scenario complete — no reward this time (already paid recently)") };
}

export async function abandonRun(userId: string, runId: string) {
  await prisma.scenarioRun.updateMany({ where: { id: runId, userId, status: "ACTIVE" }, data: { status: "ABANDONED", finishedAt: new Date(), reason: "abandoned" } });
}

// ---- admin
export async function adminList() {
  const [all, stats] = await Promise.all([allScenarios(), prisma.scenarioRun.groupBy({ by: ["scenarioId", "status"], _count: true })]);
  return all.map((s) => {
    const mine = stats.filter((x) => x.scenarioId === s.id);
    const n = (st: string) => mine.find((x) => x.status === st)?._count ?? 0;
    return { ...s, runs: { won: n("WON"), failed: n("FAILED"), abandoned: n("ABANDONED") } };
  });
}

export async function adminSave(raw: unknown, enabled?: boolean) {
  const v = validateScenario(raw);
  if (!v.ok) return v;
  const s = v.value;
  const on = enabled ?? s.enabled;
  const data = JSON.parse(JSON.stringify({ ...s, enabled: on }));
  await prisma.scenarioDef.upsert({ where: { id: s.id }, create: { id: s.id, data, enabled: on }, update: { data, enabled: on } });
  return v;
}

export async function adminDelete(id: string) {
  await prisma.scenarioDef.deleteMany({ where: { id } });
}
