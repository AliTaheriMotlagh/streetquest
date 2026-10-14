// Video calls between crew members. The media is peer-to-peer WebRTC; Postgres only
// carries the handshake, polled by both phones while the call is up (see /api/calls).
import { prisma } from "../lib/db";
import { pushTo } from "./push";
import { t } from "../lib/i18n";
import { asUser } from "./hub";

/** An unanswered call stops ringing after this long. */
export const RING_MS = 40_000;
/** A side that hasn't polled for this long has closed the app or lost signal. */
const LOST_MS = 25_000;

type CallRow = { id: string; callerId: string; calleeId: string; status: string; createdAt: Date; callerSeen: Date; calleeSeen: Date };

/**
 * How phones find a path to each other. STUN finds each phone's public address —
 * enough on the same Wi-Fi and most home networks. Between networks (mobile data, most
 * carriers use symmetric NAT) the media can only flow through a TURN relay, so without
 * one calls ring and then freeze on "Connecting…". Configure one of:
 *
 * - Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 * - Metered: METERED_TURN_APP (the "<app>" in <app>.metered.live) + METERED_TURN_API_KEY
 * - Any TURN server with fixed credentials: TURN_URLS (comma-separated), TURN_USERNAME, TURN_CREDENTIAL
 *
 * The first two hand out short-lived credentials, fetched here and cached.
 */
export async function iceServers(): Promise<RTCIceServer[]> {
  // Two STUN providers: some mobile networks block Google's.
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  const turn = process.env.TURN_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (turn?.length) servers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  servers.push(...(await hostedTurn()));
  return servers;
}

/** Whether calls between different networks can work (for /api/health). */
export const turnConfigured = () =>
  !!(process.env.TURN_URLS || (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) || (process.env.METERED_TURN_APP && process.env.METERED_TURN_API_KEY));

const TURN_TTL_S = 24 * 3600;
let turnCache: { at: number; servers: RTCIceServer[] } | null = null;

/** Short-lived credentials from a hosted TURN provider, refreshed twice a day. Never throws. */
async function hostedTurn(): Promise<RTCIceServer[]> {
  if (turnCache && Date.now() - turnCache.at < (TURN_TTL_S / 2) * 1000) return turnCache.servers;
  const { CLOUDFLARE_TURN_KEY_ID: cfKey, CLOUDFLARE_TURN_API_TOKEN: cfToken, METERED_TURN_APP: app, METERED_TURN_API_KEY: meteredKey } = process.env;
  let servers: RTCIceServer[] = [];
  try {
    if (cfKey && cfToken) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfKey)}/credentials/generate`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfToken}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: TURN_TTL_S }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(t("Cloudflare TURN {status}", { status: r.status }));
      const d = (await r.json()) as { iceServers: RTCIceServer | RTCIceServer[] };
      servers = Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers];
    } else if (app && meteredKey) {
      const r = await fetch(`https://${encodeURIComponent(app)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(t("Metered TURN {status}", { status: r.status }));
      servers = (await r.json()) as RTCIceServer[];
    }
  } catch (e) {
    console.error("TURN credentials unavailable — calls between networks may not connect", e);
    return turnCache?.servers ?? [];
  }
  turnCache = { at: Date.now(), servers };
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
    const n = await asUser(c.calleeId, () => ({ title: t("📵 Missed video call"), body: t("{name} tried to call you", { name: caller?.username ?? t("Someone") }) }));
    await prisma.notification.create({ data: { userId: c.calleeId, kind: "social", ...n } }).catch(() => {});
    // Same tag as the ringing notification, so it turns into "missed" instead of ringing on.
    void pushTo(c.calleeId, { ...n, kind: "social", tag: `call-${c.id}`, call: c.id, url: "/play?panel=crew" }, { evenIfActive: true });
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
