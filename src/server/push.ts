// Web Push (VAPID). Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT to
// enable it; without them everything still works, just without pushes.
import webpush from "web-push";
import { prisma } from "../lib/db";

const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
let ready = false;
if (PUB && PRIV) {
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", PUB, PRIV);
    ready = true;
  } catch (e) {
    console.error("Invalid VAPID keys — push disabled", e);
  }
}
export const pushReady = () => ready;
export const pushPublicKey = () => (ready ? PUB! : null);

export type PushPayload = { title: string; body?: string; kind?: string; url?: string; tag?: string };

/**
 * Push to every device of a player. Skipped while they're actively playing (the
 * in-game toast already shows it). Never throws.
 */
export async function pushTo(userId: string, p: PushPayload, opts: { evenIfActive?: boolean } = {}) {
  if (!ready) return 0;
  try {
    if (!opts.evenIfActive) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { lastSeenAt: true } });
      if (u?.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 45_000) return 0;
    }
    const subs = await prisma.pushSub.findMany({ where: { userId } });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: p.title, body: p.body ?? "", url: p.url ?? "/play", tag: p.tag ?? p.kind ?? "sq" }),
            { TTL: 6 * 3600, urgency: p.kind === "reward" ? "normal" : "high", topic: (p.tag ?? p.kind ?? "sq").slice(0, 32) },
          );
          sent++;
          await prisma.pushSub.update({ where: { id: s.id }, data: { lastPush: new Date() } }).catch(() => {});
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await prisma.pushSub.delete({ where: { id: s.id } }).catch(() => {});
          else console.error("push failed", code ?? e);
        }
      }),
    );
    return sent;
  } catch (e) {
    console.error("push error", e);
    return 0;
  }
}
