// Video and voice call signaling. Each phone polls GET while a call is up (status + the other
// side's offer/answer/ICE) and POSTs its own. The video itself never touches the server.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { callFor, endCall, iceServers, liveCall, markSeen } from "@/server/calls";
import { body, HttpError, route } from "@/server/http";
import { pushSoon } from "@/server/push";
import { areFriends } from "@/server/rooms";
import { t } from "@/lib/i18n";
import { asUser } from "@/server/hub";

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const c = await callFor(u.id, sp.get("id") ?? "");
  if (!c) throw new HttpError(404, t("Call not found"));
  if (c.status !== "ENDED") await markSeen(c, u.id);
  const signals =
    c.status === "ENDED"
      ? []
      : await prisma.callSignal.findMany({
          where: { callId: c.id, fromId: { not: u.id }, id: { gt: Number(sp.get("after")) || 0 } },
          orderBy: { id: "asc" },
          select: { id: true, kind: true, data: true },
        });
  return { status: c.status, endReason: c.endReason, video: c.video, signals };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), userId: z.string(), video: z.boolean().default(true) }),
  z.object({ action: z.enum(["accept", "decline", "end"]), callId: z.string(), reason: z.enum(["failed", "norelay", "lost"]).optional(), diag: z.record(z.unknown()).optional() }),
  z.object({
    action: z.literal("signal"),
    callId: z.string(),
    // iPhone offers list many H.264 profiles: SDPs can run well past 20 KB.
    signals: z.array(z.object({ kind: z.enum(["offer", "answer", "ice", "state"]), data: z.string().max(100_000) })).min(1).max(60),
  }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "start") {
    if (d.userId === u.id) throw new HttpError(400, t("You can't call yourself"));
    if (!(await areFriends(u.id, d.userId))) throw new HttpError(403, t("You can only call players in your crew"));
    // A call this phone left hanging (app killed mid-call) shouldn't block a new one.
    const mine = await liveCall(u.id);
    if (mine) await endCall(mine, "hangup");
    const theirs = await liveCall(d.userId);
    if (theirs) throw new HttpError(409, t("They're on another call — try again in a bit"));
    const call = await prisma.call.create({ data: { callerId: u.id, calleeId: d.userId, video: d.video } });
    // Ring the phone even if the app looks open: it may be in a pocket with the tab hidden.
    // It expires with the ring, so a phone that was offline doesn't ring hours later.
    const ring = await asUser(d.userId, () =>
      d.video
        ? { title: t("📹 {name} is calling", { name: u.username }), body: t("Video call · tap to answer"), actions: { answer: t("📹 Answer"), decline: t("Decline") } }
        : { title: t("📞 {name} is calling", { name: u.username }), body: t("Voice call · tap to answer"), actions: { answer: t("📞 Answer"), decline: t("Decline") } },
    );
    pushSoon(d.userId, { ...ring, tag: `call-${call.id}`, kind: "social", call: call.id, ring: true, url: `/play?call=${call.id}`, ttl: 40 }, { evenIfActive: true });
    return { callId: call.id, iceServers: await iceServers() };
  }

  const c = await callFor(u.id, d.callId);
  if (!c) throw new HttpError(404, t("Call not found"));

  if (d.action === "accept" || d.action === "decline") {
    if (c.calleeId !== u.id) throw new HttpError(400, t("That's not your call to answer"));
    if (d.action === "decline") {
      await endCall(c, "declined");
      return { ok: true };
    }
    const { count } = await prisma.call.updateMany({ where: { id: c.id, status: "RINGING" }, data: { status: "ACTIVE", answeredAt: new Date(), calleeSeen: new Date() } });
    if (!count) throw new HttpError(410, t("The call already ended"));
    return { iceServers: await iceServers() };
  }

  if (d.action !== "signal") {
    // Why a call couldn't connect, as seen by this phone (Vercel → Logs, search "call-diag").
    if (d.diag) console.warn("[call-diag]", JSON.stringify({ callId: c.id, user: u.username, ...d.diag }).slice(0, 2000));
    // A call that couldn't connect ends with that reason, so the other phone says so too.
    await endCall(c, c.status === "RINGING" ? "missed" : (d.reason ?? "hangup"));
    return { ok: true };
  }

  if (c.status === "ENDED") throw new HttpError(410, t("The call already ended"));
  await prisma.callSignal.createMany({ data: d.signals.map((s) => ({ callId: c.id, fromId: u.id, kind: s.kind, data: s.data })) });
  return { ok: true };
});
