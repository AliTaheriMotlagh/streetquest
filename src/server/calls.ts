// Video calls between crew members. The media is peer-to-peer WebRTC; Postgres only
// carries the handshake, polled by both phones while the call is up (see /api/calls).
import { prisma } from "../lib/db";
import { notify } from "./hub";

/** An unanswered call stops ringing after this long. */
export const RING_MS = 40_000;
/** A side that hasn't polled for this long has closed the app or lost signal. */
const LOST_MS = 25_000;

type CallRow = { id: string; callerId: string; calleeId: string; status: string; createdAt: Date; callerSeen: Date; calleeSeen: Date };

/**
 * STUN finds each phone's public address; that's enough on most Wi-Fi. Mobile carriers
 * and strict NATs also need a TURN relay: set TURN_URLS (comma-separated),
 * TURN_USERNAME and TURN_CREDENTIAL to add one.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.TURN_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (turn?.length) servers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return servers;
}

/** Why a still-open call should be closed now, or null if it's healthy. */
function staleReason(c: CallRow, now = Date.now()) {
  if (c.status === "RINGING") {
    if (now - c.createdAt.getTime() > RING_MS) return "missed";
    if (now - c.callerSeen.getTime() > LOST_MS) return "lost";
  }
  if (c.status === "ACTIVE" && (now - c.callerSeen.getTime() > LOST_MS || now - c.calleeSeen.getTime() > LOST_MS)) return "lost";
  return null;
}

/** Close a call (once). A call that rang out or was cancelled shows up as missed for the callee. */
export async function endCall(c: CallRow, reason: string) {
  const { count } = await prisma.call.updateMany({ where: { id: c.id, status: { not: "ENDED" } }, data: { status: "ENDED", endReason: reason, endedAt: new Date() } });
  if (count && c.status === "RINGING" && reason !== "declined" && reason !== "busy") {
    const caller = await prisma.user.findUnique({ where: { id: c.callerId }, select: { username: true } });
    await notify(c.calleeId, { kind: "social", title: "📵 Missed video call", body: `${caller?.username ?? "Someone"} tried to call you` });
  }
  return count > 0;
}

/** The call this player is in or being rung for, closing any that went stale. */
export async function liveCall(userId: string) {
  const open = await prisma.call.findMany({ where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: userId }, { calleeId: userId }] } });
  let live: (typeof open)[number] | null = null;
  for (const c of open) {
    const why = staleReason(c);
    if (why) await endCall(c, why);
    else live ??= c;
  }
  return live;
}

/** A call (as one of its two sides), with stale ones closed on the way. */
export async function callFor(userId: string, callId: string) {
  const c = await prisma.call.findUnique({ where: { id: callId } });
  if (!c || (c.callerId !== userId && c.calleeId !== userId)) return null;
  if (c.status !== "ENDED") {
    const why = staleReason(c);
    if (why && (await endCall(c, why))) return { ...c, status: "ENDED", endReason: why };
  }
  return c;
}

/** Record that this side is still here (throttled: polls come every second or so). */
export async function markSeen(c: CallRow, userId: string) {
  const side = c.callerId === userId ? "callerSeen" : "calleeSeen";
  if (Date.now() - c[side].getTime() < 4000) return;
  await prisma.call.update({ where: { id: c.id }, data: { [side]: new Date() } }).catch(() => {});
}
