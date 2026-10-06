import type { Server } from "socket.io";
import { prisma } from "../lib/db";
import { distanceM, regionKey } from "../lib/geo";
import { levelForXp } from "../lib/progression";
import { hub } from "./hub";
import { friendIds, roomAudience } from "./rooms";
import { SESSION_COOKIE, canSimulate, verifySession } from "./session";

type SocketUser = { id: string; username: string; avatar: string; role: string };

function readCookie(header: string | undefined, name: string) {
  const m = header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
}

const MAX_SPEED_MS = 70; // ~250 km/h — anything faster is a spoofed jump

async function broadcastPresence(userId: string, online: boolean) {
  for (const fid of await friendIds(userId)) hub.io?.to(`user:${fid}`).emit("presence", { userId, online });
}

export function attachRealtime(io: Server) {
  hub.io = io;

  io.use(async (socket, next) => {
    const id = await verifySession(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
    if (!user || user.banned) return next(new Error("unauthorized"));
    socket.data.user = { id: user.id, username: user.username, avatar: user.avatar, role: user.role } satisfies SocketUser;
    socket.data.xp = user.xp;
    next();
  });

  io.on("connection", (socket) => {
    const u = socket.data.user as SocketUser;
    socket.join(`user:${u.id}`);
    socket.join("global");

    let p = hub.presence.get(u.id);
    if (!p) {
      p = { userId: u.id, username: u.username, avatar: u.avatar, level: levelForXp(socket.data.xp), lat: 0, lng: 0, at: 0, sockets: 0 };
      hub.presence.set(u.id, p);
    }
    const presence = p;
    presence.sockets++;
    if (presence.sockets === 1) void broadcastPresence(u.id, true);

    let region: string | null = null;
    let lastDbWrite = 0;
    let lastChat = 0;

    socket.on("loc", async (d: { lat: number; lng: number; sim?: boolean }) => {
      if (!Number.isFinite(d?.lat) || !Number.isFinite(d?.lng) || Math.abs(d.lat) > 90 || Math.abs(d.lng) > 180) return;
      const now = Date.now();
      const trusted = canSimulate(u.role);
      if (d.sim && !trusted) return;
      if (presence.at && !trusted) {
        const dist = distanceM(presence, d);
        const dt = Math.max(1, (now - presence.at) / 1000);
        if (dist > 500 && dist / dt > MAX_SPEED_MS) {
          socket.emit("notify", { title: "GPS jump ignored", body: "That was faster than any getaway car." });
          return;
        }
      }
      presence.lat = d.lat;
      presence.lng = d.lng;
      presence.at = now;

      const r = regionKey(d);
      if (r !== region) {
        if (region) socket.leave(`local:${region}`);
        region = r;
        socket.join(`local:${r}`);
        socket.emit("region", r);
      }
      if (now - lastDbWrite > 10_000) {
        lastDbWrite = now;
        await prisma.user.update({ where: { id: u.id }, data: { lastLat: d.lat, lastLng: d.lng, lastSeenAt: new Date() } }).catch(() => {});
      }
    });

    socket.on("chat:send", async (d: { room: string; body: string }, ack?: (r: { error?: string }) => void) => {
      const body = String(d?.body ?? "").trim().slice(0, 500);
      if (!body) return ack?.({ error: "Empty message" });
      if (Date.now() - lastChat < 700) return ack?.({ error: "Slow down" });
      lastChat = Date.now();
      const audience = await roomAudience(u.id, String(d.room));
      if (!audience) return ack?.({ error: "You can't post in that room" });
      const msg = await prisma.message.create({ data: { room: d.room, authorId: u.id, body } });
      const out = { id: msg.id, room: msg.room, body, createdAt: msg.createdAt, author: { id: u.id, username: u.username, avatar: u.avatar } };
      if (audience === "broadcast") io.to(d.room === "global" ? "global" : d.room).emit("chat:msg", out);
      else for (const id of audience) io.to(`user:${id}`).emit("chat:msg", out);
      ack?.({});
    });

    socket.on("disconnect", () => {
      presence.sockets--;
      if (presence.sockets <= 0) {
        presence.sockets = 0;
        void broadcastPresence(u.id, false);
        void prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      }
    });
  });
}
