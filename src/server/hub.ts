// Serverless-friendly "realtime": everything lives in Postgres and clients poll
// /api/sync. Works on Vercel (no long-lived sockets) and anywhere else.
import { prisma } from "../lib/db";

export type Notice = { title: string; body?: string; kind?: "info" | "reward" | "social" | "delivery" | "event" };

/** A player counts as online if their client pinged within this window. */
export const ONLINE_MS = 90_000;
export const onlineSince = () => new Date(Date.now() - ONLINE_MS);
export const isOnline = (lastSeenAt: Date | null) => !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_MS;

export async function notify(userId: string, n: Notice) {
  await prisma.notification.create({ data: { userId, kind: n.kind ?? "info", title: n.title, body: n.body } }).catch(() => {});
}
