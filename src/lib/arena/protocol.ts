// The realtime link between the 3D city and the realtime server (realtime/).
//
// Hot path in binary, everything else JSON:
//  - client → server, 20×/s: my state (STATE, 32 bytes);
//  - server → client, 20×/s: everyone I can see (SNAP, 11 + 28 bytes each).
// Positions travel in each client's own local metres (its "anchor" is the 3D city's
// origin, see lib/city makeFrame); the server keeps lat/lng and converts per recipient,
// so players who opened the city in different places still line up exactly.
import type { Difficulty, LobbyView, MatchView, ModeKey, Team } from "./modes";
import type { WeaponKey, Zone } from "./weapons";

export const PROTOCOL = 1;
export const TICK_HZ = 20;
export const OP_STATE = 1;
export const OP_SNAP = 2;

// STATE / SNAP flags
export const F_FOOT = 1;
export const F_CROUCH = 2;
export const F_AIM = 4;
export const F_SPRINT = 8;
export const F_AIR = 16;
export const F_RELOAD = 32;
export const F_FIRE = 64;
export const F_DEAD = 128;
// SNAP flags2 (set by the server)
export const G_PASSIVE = 1;
export const G_SHIELD = 2;
export const G_BOT = 4;
export const G_BOMB = 8;
export const G_ACTING = 16;

export type LL = { lat: number; lng: number };

/** Same projection as lib/city makeFrame (kept here so the server needn't load the city code). */
export function localFrame(origin: LL) {
  const ky = 110_540;
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    origin,
    toXZ: (lat: number, lng: number) => ({ x: (lng - origin.lng) * kx, z: -(lat - origin.lat) * ky }),
    toLL: (x: number, z: number): LL => ({ lat: origin.lat - z / ky, lng: origin.lng + x / kx }),
  };
}
export type LocalFrame = ReturnType<typeof localFrame>;

// ---------------------------------------------------------------- binary
export type State = { flags: number; vehicle: number; weapon: number; x: number; y: number; z: number; yaw: number; pitch: number; vx: number; vz: number };

export function encodeState(s: State) {
  const b = new ArrayBuffer(32);
  const v = new DataView(b);
  v.setUint8(0, OP_STATE);
  v.setUint8(1, s.flags);
  v.setUint8(2, s.vehicle);
  v.setUint8(3, s.weapon);
  v.setFloat32(4, s.x, true);
  v.setFloat32(8, s.y, true);
  v.setFloat32(12, s.z, true);
  v.setFloat32(16, s.yaw, true);
  v.setFloat32(20, s.pitch, true);
  v.setFloat32(24, s.vx, true);
  v.setFloat32(28, s.vz, true);
  return b;
}

export function decodeState(v: DataView): State | null {
  if (v.byteLength < 32 || v.getUint8(0) !== OP_STATE) return null;
  const s = { flags: v.getUint8(1), vehicle: v.getUint8(2), weapon: v.getUint8(3), x: v.getFloat32(4, true), y: v.getFloat32(8, true), z: v.getFloat32(12, true), yaw: v.getFloat32(16, true), pitch: v.getFloat32(20, true), vx: v.getFloat32(24, true), vz: v.getFloat32(28, true) };
  for (const n of [s.x, s.y, s.z, s.yaw, s.pitch, s.vx, s.vz]) if (!Number.isFinite(n)) return null;
  return s;
}

export type SnapEntity = State & { sid: number; hp: number; flags2: number; team: Team };
const ENT = 28;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const q16 = (v: number, scale: number) => Math.max(-32767, Math.min(32767, Math.round(v * scale)));

export function encodeSnap(serverTime: number, list: SnapEntity[]) {
  const b = new ArrayBuffer(11 + list.length * ENT);
  const v = new DataView(b);
  v.setUint8(0, OP_SNAP);
  v.setFloat64(1, serverTime, true);
  v.setUint16(9, list.length, true);
  let o = 11;
  for (const e of list) {
    v.setUint16(o, e.sid, true);
    v.setFloat32(o + 2, e.x, true);
    v.setFloat32(o + 6, e.y, true);
    v.setFloat32(o + 10, e.z, true);
    v.setInt16(o + 14, q16(wrap(e.yaw), 32767 / Math.PI), true);
    v.setInt16(o + 16, q16(e.pitch, 32767 / Math.PI), true);
    v.setInt16(o + 18, q16(e.vx, 100), true);
    v.setInt16(o + 20, q16(e.vz, 100), true);
    v.setUint8(o + 22, e.flags);
    v.setUint8(o + 23, e.vehicle);
    v.setUint8(o + 24, e.weapon);
    v.setUint8(o + 25, Math.max(0, Math.min(255, Math.round(e.hp))));
    v.setUint8(o + 26, e.flags2);
    v.setUint8(o + 27, e.team);
    o += ENT;
  }
  return b;
}

export function decodeSnap(v: DataView): { t: number; list: SnapEntity[] } | null {
  if (v.byteLength < 11 || v.getUint8(0) !== OP_SNAP) return null;
  const t = v.getFloat64(1, true);
  const n = v.getUint16(9, true);
  if (v.byteLength < 11 + n * ENT) return null;
  const list: SnapEntity[] = [];
  let o = 11;
  for (let i = 0; i < n; i++, o += ENT)
    list.push({
      sid: v.getUint16(o, true), x: v.getFloat32(o + 2, true), y: v.getFloat32(o + 6, true), z: v.getFloat32(o + 10, true),
      yaw: (v.getInt16(o + 14, true) * Math.PI) / 32767, pitch: (v.getInt16(o + 16, true) * Math.PI) / 32767,
      vx: v.getInt16(o + 18, true) / 100, vz: v.getInt16(o + 20, true) / 100,
      flags: v.getUint8(o + 22), vehicle: v.getUint8(o + 23), weapon: v.getUint8(o + 24), hp: v.getUint8(o + 25), flags2: v.getUint8(o + 26), team: v.getUint8(o + 27) as Team,
    });
  return { t, list };
}

// ---------------------------------------------------------------- JSON
/** Streets and buildings inside a new arena, in the host's local metres (rounded to 10 cm). */
export type ArenaGeo = { roads: number[][]; buildings: { p: number[]; h: number; mh: number }[] };

export type ClientMsg =
  | { t: "hello"; v: number; ticket: string; anchor: LL }
  | { t: "ping"; c: number; rtt?: number }
  | { t: "look"; color: string }
  | { t: "fire"; w: WeaponKey; at: number; o: [number, number, number]; d: [number, number, number][] }
  | { t: "reload" }
  | { t: "passive"; on: boolean }
  | { t: "respawn"; x: number; y: number; z: number }
  | { t: "lobbies" }
  | { t: "create"; mode: ModeKey; radius: number; bots: number; difficulty: Difficulty; geo: ArenaGeo }
  | { t: "join"; id: string }
  | { t: "leave" }
  | { t: "start" }
  | { t: "team"; team: Team }
  | { t: "loadout"; primary: WeaponKey }
  | { t: "act"; on: boolean };

export type RosterEntry = { sid: number; id: string; name: string; avatar: string; level: number; color: string; friend: boolean; bot: boolean };

export type ServerMsg =
  | { t: "welcome"; sid: number; now: number; passive: boolean }
  | { t: "pong"; c: number; s: number }
  | { t: "roster"; add: RosterEntry[]; del: number[] }
  | { t: "hit"; from: number; to: number; dmg: number; zone: Zone; hp: number; kill: boolean; fx: number; fz: number }
  | { t: "kill"; killer: number; victim: number; w: WeaponKey | "zone" | "bomb"; head: boolean; killerName: string; victimName: string; killerTeam: Team; victimTeam: Team }
  | { t: "you"; hp: number; dead: boolean; respawnAt: number; passive: boolean; ammo: number; reloadUntil: number; loadout: WeaponKey[]; team: Team; space: string }
  | { t: "shot"; sid: number; w: WeaponKey; x: number; y: number; z: number; ex: number; ey: number; ez: number }
  | { t: "spawn"; x: number; y: number; z: number; yaw: number }
  | { t: "lobbies"; list: LobbyView[] }
  | { t: "match"; m: MatchView | null }
  | { t: "toast"; text: string; vars?: Record<string, string | number> }
  | { t: "err"; text: string; vars?: Record<string, string | number> };
