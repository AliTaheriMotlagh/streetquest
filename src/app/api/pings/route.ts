// Crew coordination: drop a short-lived ping on the map (attack / help / rally / loot).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { PING_MS, PINGS } from "@/lib/td";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { notify, onlineSince } from "@/server/hub";
import { lastKnownLocation } from "@/server/rewards";
import { friendIds } from "@/server/rooms";

const Schema = z.object({ kind: z.enum(["attack", "help", "rally", "loot"]), lat: z.number().optional(), lng: z.number().optional() });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const here = await lastKnownLocation(u.id);
  const at = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : here;
  if (distanceM(here, at) > 3000) throw new HttpError(400, "Pings must be within 3 km of you");
  const recent = await prisma.ping.findFirst({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 15_000) } } });
  if (recent) throw new HttpError(429, "Easy on the radio — wait a few seconds");
  await prisma.ping.create({ data: { userId: u.id, kind: d.kind, lat: at.lat, lng: at.lng, expiresAt: new Date(Date.now() + PING_MS) } });
  const p = PINGS[d.kind];
  const crew = await prisma.user.findMany({ where: { id: { in: await friendIds(u.id) }, lastSeenAt: { gt: onlineSince() } }, select: { id: true } });
  for (const c of crew) await notify(c.id, { kind: "social", title: `${p.emoji} ${u.username}: ${p.label}!`, body: "Check the map for the ping" });
  return { message: `${p.emoji} Ping sent to your crew` };
});
