// Steps: the phone's motion sensor reports what it counted; GPS distance on foot is
// turned into steps whenever the sensor isn't counting (not granted, unsupported, or
// the phone just isn't reporting). Each report is capped by a believable cadence over
// the time since the last one, so a shaken phone or a forged request can't farm.
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { dayKey } from "../lib/progression";
import { DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M } from "../lib/steps";
import { questEvent } from "./quests";

const today = (u: Pick<User, "timezone">) => dayKey(u.timezone);
const total = (d: { motion: number; gps: number }) => d.motion + d.gps;

async function dayRow(userId: string, day: string) {
  return prisma.stepDay.upsert({ where: { userId_day: { userId, day } }, create: { userId, day }, update: {} });
}

async function credit(u: Pick<User, "id" | "faction">, n: number) {
  if (n <= 0) return;
  await prisma.user.update({ where: { id: u.id }, data: { stepsTotal: { increment: n } } });
  // Quest progress (it also counts the "steps" stat for goals).
  await questEvent(u.id, "steps", n);
}

/** Steps the motion sensor counted since its last report. Returns what was accepted. */
export async function addMotionSteps(u: User, steps: number) {
  const day = today(u);
  const row = await dayRow(u.id, day);
  const now = Date.now();
  // First report of the day (or after a long gap): a minute's worth.
  const window = row.motionAt ? Math.min(MAX_REPORT_S, (now - row.motionAt.getTime()) / 1000) : 60;
  const add = Math.max(0, Math.min(Math.floor(steps), Math.ceil(window * MAX_CADENCE), DAILY_STEP_CAP - total(row)));
  const d = await prisma.stepDay.update({ where: { id: row.id }, data: { motion: { increment: add }, motionAt: new Date(now) } });
  await credit(u, add);
  return { added: add, today: total(d) };
}

/** Distance walked (already checked as on-foot by /api/loc) → steps, unless the sensor is counting. */
export async function addGpsSteps(u: User, meters: number) {
  const row = await dayRow(u.id, today(u));
  if (row.motionAt && Date.now() - row.motionAt.getTime() < SENSOR_FRESH_MS) return 0;
  const add = Math.max(0, Math.min(Math.round(meters / STRIDE_M), DAILY_STEP_CAP - total(row)));
  if (!add) return 0;
  await prisma.stepDay.update({ where: { id: row.id }, data: { gps: { increment: add } } });
  await credit(u, add);
  return add;
}

/** Steps walked today (player's own day). */
export async function stepsToday(u: Pick<User, "id" | "timezone">) {
  const d = await prisma.stepDay.findUnique({ where: { userId_day: { userId: u.id, day: today(u) } } });
  return d ? total(d) : 0;
}

/** The last 7 days, oldest first, for the chart. */
export async function stepWeek(u: Pick<User, "id" | "timezone">) {
  const days = Array.from({ length: 7 }, (_, i) => dayKey(u.timezone, new Date(Date.now() - (6 - i) * 86_400_000)));
  const rows = await prisma.stepDay.findMany({ where: { userId: u.id, day: { in: days } } });
  const by = new Map(rows.map((r) => [r.day, total(r)]));
  return days.map((day) => ({ day, steps: by.get(day) ?? 0 }));
}
