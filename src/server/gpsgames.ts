// GPS mini-games (treasure hunt, sprint, rally) and story chapters. Targets are
// generated on the server around the player's trusted position; hidden spots never
// leave the server — the client only learns how hot or cold it is.
import type { GpsGame, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM, offset, type LatLng } from "../lib/geo";
import { S } from "../lib/settings";
import { FIND_RADIUS_M, GPS_GAMES, heatOf, HOLD_RADIUS_M, MAX_REROUTES, STORY, type GpsGameKind } from "../lib/story";
import { giveGear } from "./hero";
import { HttpError } from "./http";
import { trackStat } from "./goals";
import { grant, lastKnownLocation } from "./rewards";

// last = distance at the latest check, prev = the one before (the hot/cold trend compares them)
type Hunt = { target: LatLng; best: number; last: number | null; prev?: number | null; reroutes: number };
type Sprint = { startWalked: number; meters: number };
type Rally = { points: LatLng[]; next: number; reroutes: number };
// area: the gold "search here" circle shown for hidden steps (contains the target, not centred on it)
type Story = { chapter: number; replay: boolean; step: number; target: LatLng | null; hidden: boolean; holdStart: number | null; center: LatLng | null; last: number | null; prev?: number | null; reroutes: number; area?: { center: LatLng; radius: number } | null };
const AREA_M = 110;
const searchArea = (target: LatLng) => ({ center: offset(target, Math.random() * AREA_M * 0.55, Math.random() * 360), radius: AREA_M });
type Data = Hunt | Sprint | Rally | Story;

const between = (a: number, b: number) => a + Math.random() * Math.max(0, b - a);
const spot = (from: LatLng, minM: number, maxM: number) => offset(from, between(minM, maxM), Math.random() * 360);
const reach = () => S.interactRadius + S.claimSlack;

export const storyChapterOf = (n: number) => ({ index: n % STORY.length, def: STORY[n % STORY.length], replay: n >= STORY.length });

export async function activeGame(userId: string) {
  const g = await prisma.gpsGame.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { startedAt: "desc" } });
  if (g && g.endsAt.getTime() < Date.now()) {
    await prisma.gpsGame.update({ where: { id: g.id }, data: { status: "LOST" } });
    return { lost: g };
  }
  return { game: g };
}

function storyStep(d: Story, here: LatLng): Story {
  const step = storyChapterOf(d.chapter).def.steps[d.step];
  if (step.kind === "hold") return { ...d, target: null, hidden: false, center: here, holdStart: null, last: null, prev: null, area: null };
  const target = spot(here, step.minM, step.maxM);
  return { ...d, target, hidden: step.kind === "find", center: null, holdStart: null, last: null, prev: null, area: step.kind === "find" ? searchArea(target) : null };
}

export async function startGame(u: User, kind: GpsGameKind) {
  const { game } = await activeGame(u.id);
  if (game) throw new HttpError(400, "Finish or quit your current GPS game first");
  const here = await lastKnownLocation(u.id);
  if (kind !== "story") {
    const last = await prisma.gpsGame.findFirst({ where: { userId: u.id, kind: { not: "story" }, status: { not: "ACTIVE" } }, orderBy: { startedAt: "desc" } });
    const finishedAt = (last?.data as { finishedAt?: number } | undefined)?.finishedAt ?? last?.endsAt.getTime() ?? 0;
    const wait = finishedAt + S.gpsGameCooldownMin * 60_000 - Date.now();
    if (last && wait > 0) throw new HttpError(429, `Catch your breath — next GPS game in ${Math.ceil(wait / 60_000)} min`);
  } else if (!S.storyEnabled) throw new HttpError(400, "Story missions are switched off");
  if (kind === "sprint" && u.remotePlay) throw new HttpError(400, "Sprints need real walking — switch to GPS mode to run one");

  let data: Data;
  let minutes: number;
  if (kind === "hunt") {
    data = { target: spot(here, S.huntMinM, S.huntMaxM), best: Infinity, last: null, reroutes: 0 };
    data.best = distanceM(here, data.target);
    minutes = S.huntMinutes;
  } else if (kind === "sprint") {
    data = { startWalked: u.walkedM, meters: S.sprintMeters };
    minutes = S.sprintMinutes;
  } else if (kind === "rally") {
    const points: LatLng[] = [];
    let from = here;
    for (let i = 0; i < S.rallyCheckpoints; i++) {
      from = spot(from, 120, 260);
      points.push(from);
    }
    data = { points, next: 0, reroutes: 0 };
    minutes = S.rallyMinutes;
  } else {
    const ch = storyChapterOf(u.storyChapter);
    data = storyStep({ chapter: u.storyChapter, replay: ch.replay, step: 0, target: null, hidden: false, holdStart: null, center: null, last: null, reroutes: 0 }, here);
    minutes = ch.def.minutes;
  }
  const g = await prisma.gpsGame.create({ data: { userId: u.id, kind, data: data as object, endsAt: new Date(Date.now() + minutes * 60_000) } });
  return g;
}

/** What the client may see. */
export function gameView(g: GpsGame, here: LatLng | null, walkedM: number) {
  const base = { id: g.id, kind: g.kind as GpsGameKind, status: g.status, startedAt: g.startedAt.getTime(), endsAt: g.endsAt.getTime() };
  const heat = (target: LatLng, prev: number | null | undefined) => {
    if (!here) return null;
    const d = distanceM(here, target);
    return { ...heatOf(d), approx: Math.max(10, Math.round(d / 10) * 10), trend: prev == null ? 0 : d < prev - 4 ? 1 : d > prev + 4 ? -1 : 0 };
  };
  if (g.kind === "hunt") {
    const d = g.data as Hunt;
    return { ...base, title: "Treasure Hunt", heat: heat(d.target, d.prev), reroutes: MAX_REROUTES - d.reroutes };
  }
  if (g.kind === "sprint") {
    const d = g.data as Sprint;
    return { ...base, title: "Street Sprint", progress: Math.max(0, Math.round(walkedM - d.startWalked)), goal: d.meters };
  }
  if (g.kind === "rally") {
    const d = g.data as Rally;
    return { ...base, title: "Checkpoint Rally", points: d.points, next: d.next, dist: here ? Math.round(distanceM(here, d.points[d.next])) : null, reroutes: MAX_REROUTES - d.reroutes };
  }
  const d = g.data as Story;
  const ch = storyChapterOf(d.chapter);
  const step = ch.def.steps[d.step];
  return {
    ...base,
    title: `${ch.def.emoji} ${ch.def.title}`,
    chapter: ch.index,
    replay: d.replay,
    step: d.step,
    steps: ch.def.steps.length,
    text: step.text,
    stepKind: step.kind,
    target: d.hidden ? null : d.target,
    center: d.center,
    area: d.hidden ? (d.area ?? null) : null,
    heat: d.hidden && d.target ? heat(d.target, d.prev) : null,
    dist: !d.hidden && d.target && here ? Math.round(distanceM(here, d.target)) : null,
    hold: step.kind === "hold" ? { seconds: step.holdS ?? 30, since: d.holdStart, radius: HOLD_RADIUS_M, inside: here && d.center ? distanceM(here, d.center) <= HOLD_RADIUS_M : false } : null,
    reroutes: MAX_REROUTES - d.reroutes,
  };
}

async function win(u: User, g: GpsGame, msg: string) {
  await prisma.gpsGame.update({ where: { id: g.id }, data: { status: "WON", data: { ...(g.data as object), finishedAt: Date.now() } } });
  if (g.kind === "story") {
    const d = g.data as Story;
    const ch = storyChapterOf(d.chapter);
    const half = d.replay ? 0.5 : 1;
    const r = { xp: Math.round(ch.def.reward.xp * half), coins: Math.round(ch.def.reward.coins * half), gems: Math.round(ch.def.reward.gems * half) };
    await prisma.user.updateMany({ where: { id: u.id, storyChapter: d.chapter }, data: { storyChapter: { increment: 1 } } });
    await grant(u.id, r);
    if (ch.def.reward.gear && !d.replay) await giveGear(u.id, { floor: ch.def.reward.gear, source: ch.def.title });
    await trackStat(u.id, "story", 1, u.faction);
    return { won: true, message: `📖 Chapter complete: ${ch.def.title}! +${r.xp} XP +${r.coins} 🪙 +${r.gems} 💎${ch.def.reward.gear && !d.replay ? ` + ${ch.def.reward.gear} gear` : ""}`, outro: ch.def.outro };
  }
  const xp = g.kind === "hunt" ? S.huntXp : g.kind === "sprint" ? S.sprintXp : S.rallyXp;
  const coins = g.kind === "hunt" ? S.huntCoins : g.kind === "sprint" ? S.sprintCoins : S.rallyCoins;
  await grant(u.id, { xp, coins, gems: S.gpsGameGems });
  await trackStat(u.id, "gps_game", 1, u.faction);
  return { won: true, message: `${msg} +${xp} XP +${coins} 🪙${S.gpsGameGems ? ` +${S.gpsGameGems} 💎` : ""}` };
}

/** Advance the game from the player's trusted position. */
export async function checkGame(u: User, g: GpsGame) {
  const here = await lastKnownLocation(u.id);
  const save = (data: Data) => prisma.gpsGame.update({ where: { id: g.id }, data: { data: data as object } });
  if (g.kind === "hunt") {
    const d = g.data as Hunt;
    const dist = distanceM(here, d.target);
    if (dist <= FIND_RADIUS_M + S.claimSlack) return win(u, g, "🧭 Treasure found!");
    await save({ ...d, best: Math.min(d.best ?? dist, dist), prev: d.last, last: dist });
    return { won: false };
  }
  if (g.kind === "sprint") {
    const d = g.data as Sprint;
    if (u.walkedM - d.startWalked >= d.meters) return win(u, g, "🏃 Sprint complete!");
    return { won: false };
  }
  if (g.kind === "rally") {
    const d = g.data as Rally;
    if (distanceM(here, d.points[d.next]) > reach()) return { won: false };
    if (d.next + 1 >= d.points.length) return win(u, g, "🏁 Rally complete!");
    await save({ ...d, next: d.next + 1 });
    return { won: false, message: `✅ Checkpoint ${d.next + 1}/${d.points.length}!` };
  }
  // story
  const d = g.data as Story;
  const ch = storyChapterOf(d.chapter).def;
  const step = ch.steps[d.step];
  let done = false;
  if (step.kind === "hold") {
    const inside = d.center && distanceM(here, d.center) <= HOLD_RADIUS_M;
    if (!inside) {
      await save({ ...d, holdStart: null });
      return { won: false, message: d.holdStart ? "⚠️ You left the zone — the timer reset" : undefined };
    }
    if (!d.holdStart) {
      await save({ ...d, holdStart: Date.now() });
      return { won: false };
    }
    done = Date.now() - d.holdStart >= (step.holdS ?? 30) * 1000;
  } else if (d.target) {
    const dist = distanceM(here, d.target);
    done = dist <= (d.hidden ? FIND_RADIUS_M + S.claimSlack : reach());
    if (!done) {
      await save({ ...d, prev: d.last, last: dist });
      return { won: false };
    }
  }
  if (!done) return { won: false };
  if (d.step + 1 >= ch.steps.length) return win(u, g, "");
  await save(storyStep({ ...d, step: d.step + 1, reroutes: d.reroutes }, here));
  return { won: false, message: `✅ ${ch.steps[d.step + 1].text}` };
}

/** New waypoint for the current target (it landed somewhere unreachable). */
export async function rerouteGame(u: User, g: GpsGame) {
  const here = await lastKnownLocation(u.id);
  const d = g.data as Hunt & Rally & Story;
  if ((d.reroutes ?? 0) >= MAX_REROUTES) throw new HttpError(400, "No reroutes left");
  if (g.kind === "hunt") {
    d.target = spot(here, S.huntMinM * 0.7, S.huntMaxM * 0.7);
    d.last = null;
    d.prev = null;
  }
  else if (g.kind === "rally") d.points[d.next] = spot(here, 100, 220);
  else if (g.kind === "story") {
    const step = storyChapterOf(d.chapter).def.steps[d.step];
    if (step.kind === "hold") throw new HttpError(400, "Nothing to reroute — just hold your ground");
    d.target = spot(here, step.minM * 0.7, step.maxM * 0.7);
    d.last = null;
    d.prev = null;
    if (d.hidden) d.area = searchArea(d.target);
  } else throw new HttpError(400, "Sprints go anywhere — no route needed");
  d.reroutes = (d.reroutes ?? 0) + 1;
  await prisma.gpsGame.update({ where: { id: g.id }, data: { data: d as object } });
}

export { GPS_GAMES };
