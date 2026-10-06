// Process-wide realtime state. Stored on globalThis because the custom server
// (tsx) and Next's bundled route handlers load separate module instances.
import type { Server } from "socket.io";

export type Presence = {
  userId: string;
  username: string;
  avatar: string;
  level: number;
  lat: number;
  lng: number;
  at: number; // ms of last location fix
  sockets: number;
};

export type Notice = { title: string; body?: string; kind?: "info" | "reward" | "social" | "delivery" | "event" };

type Hub = { io?: Server; presence: Map<string, Presence> };
const g = globalThis as unknown as { __sqHub?: Hub };
export const hub: Hub = (g.__sqHub ??= { presence: new Map() });

export function notify(userId: string, n: Notice) {
  hub.io?.to(`user:${userId}`).emit("notify", n);
}
export function emitTo(room: string, event: string, payload: unknown) {
  hub.io?.to(room).emit(event, payload);
}
export const isOnline = (userId: string) => (hub.presence.get(userId)?.sockets ?? 0) > 0;
