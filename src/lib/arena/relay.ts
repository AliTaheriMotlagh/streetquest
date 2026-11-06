// Street Arena without the realtime server: a match runs in its host's browser (the same
// hub as realtime/) and the other players link to it through the game server
// (/api/arena, server/arenaRelay.ts) with a few requests a second each. What travels:
//  - everyone's moves: a short trail of samples (lat/lng, on the match clock) that goes
//    straight to everyone on their next poll — one hop, like the open city's presence;
//  - the host's referee messages (hits, kills, the match, spawns), batched per poll;
//  - the host's snapshots of everyone (bots, health, teams), in the match frame.
// Pure: no DOM, no database — shared by the browser (components/arena/relay.ts), the
// server and the tests.
import { decodeSnap, encodeSnap, localFrame, type LL, type SnapEntity, type State } from "./protocol";

/** The host hasn't reported for this long: the match is gone. */
export const HOST_GONE_MS = 25_000;
/** A player who hasn't polled for this long has left. */
export const PEER_GONE_MS = 15_000;
/** How far back the host may rewind a target for a relayed player's shot (a hop or two of polling). */
export const RELAY_REWIND_MS = 1600;
/** A relayed shot's muzzle may be this far from where the host last had the shooter (their next sample can be a poll later). */
export const RELAY_MUZZLE_SLACK_M = 7;
/** Samples kept per player (≈ 0.7 s at the sampling rate below). */
export const TRAIL_MAX = 8;
export const TRAIL_GAP_MS = 90;
/** Snapshots of everyone the host sends per poll (the newest few, ≥ 80 ms apart). */
export const WORLD_SNAPS = 3;
/** Limits on what one poll may carry. */
export const UP_MAX = 80;
export const DOWN_MAX = 300;
export const SHOTS_PER_BATCH = 24;
/** Interpolation delay bounds for relayed players (ms behind the match clock). */
export const DELAY_MIN_MS = 220;
export const DELAY_MAX_MS = 2200;

export const isRoomId = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{6,16}$/.test(s);

// ---------------------------------------------------------------- moves
/** One sample of a player: where (lat/lng, metres up), facing, moving, how (F_* flags), on the match clock. */
export type Sample = { at: number; lat: number; lng: number; y: number; yaw: number; pitch: number; vx: number; vz: number; flags: number; weapon: number; vehicle: number };

const r = (v: number, k: number) => Math.round(v * k) / k;

/** A State in my local metres → a sample anyone can place. */
export function toSample(frame: { toLL: (x: number, z: number) => LL }, s: State, at: number): Sample {
  const ll = frame.toLL(s.x, s.z);
  return { at: Math.round(at), lat: ll.lat, lng: ll.lng, y: s.y, yaw: s.yaw, pitch: s.pitch, vx: s.vx, vz: s.vz, flags: s.flags, weapon: s.weapon, vehicle: s.vehicle };
}

/** A sample → a State in someone's local metres. */
export function toState(frame: { toXZ: (lat: number, lng: number) => { x: number; z: number } }, s: Sample): State {
  const p = frame.toXZ(s.lat, s.lng);
  return { flags: s.flags, vehicle: s.vehicle, weapon: s.weapon, x: p.x, y: s.y, z: p.z, yaw: s.yaw, pitch: s.pitch, vx: s.vx, vz: s.vz };
}

/** Compact JSON for a trail: [at, lat, lng, y, yaw, pitch, vx, vz, flags, weapon, vehicle]. */
export function packTrail(list: Sample[]): number[][] {
  return list.slice(-TRAIL_MAX).map((s) => [s.at, r(s.lat, 1e7), r(s.lng, 1e7), r(s.y, 100), r(s.yaw, 1000), r(s.pitch, 1000), r(s.vx, 100), r(s.vz, 100), s.flags & 255, s.weapon & 255, s.vehicle & 255]);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A trail from the wire (anyone's): bad rows dropped, values clamped, oldest first. */
export function unpackTrail(raw: unknown): Sample[] {
  if (!Array.isArray(raw)) return [];
  const out: Sample[] = [];
  for (const row of raw.slice(-TRAIL_MAX)) {
    if (!Array.isArray(row) || row.length < 11 || !row.slice(0, 11).every(finite)) continue;
    const [at, lat, lng, y, yaw, pitch, vx, vz, flags, weapon, vehicle] = row as number[];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({
      at, lat, lng, y: Math.max(-5, Math.min(400, y)), yaw, pitch: Math.max(-1.6, Math.min(1.6, pitch)),
      vx: Math.max(-150, Math.min(150, vx)), vz: Math.max(-150, Math.min(150, vz)), flags: flags & 255, weapon: weapon & 255, vehicle: vehicle & 255,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The newest sample is always last; the ones before it are about TRAIL_GAP_MS apart (newest TRAIL_MAX). */
export function pushSample(trail: Sample[], s: Sample) {
  const n = trail.length;
  if (n >= 2 && s.at - trail[n - 2].at < TRAIL_GAP_MS) trail[n - 1] = s;
  else trail.push(s);
  if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX);
  return trail;
}

// ---------------------------------------------------------------- everyone (from the host)
const b64 = {
  enc(u8: Uint8Array) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(s: string) {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  },
};

/** The host's snapshots (entities in the match frame, centred on the arena), packed for the room row. */
export function encodeWorld(snaps: { t: number; list: SnapEntity[] }[]): string {
  const parts = snaps.slice(-WORLD_SNAPS).map((s) => new Uint8Array(encodeSnap(s.t, s.list)));
  const total = parts.reduce((n, p) => n + 4 + p.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const p of parts) {
    v.setUint32(o, p.length, true);
    out.set(p, o + 4);
    o += 4 + p.length;
  }
  return b64.enc(out);
}

export function decodeWorld(s: string | null | undefined): { t: number; list: SnapEntity[] }[] {
  if (!s) return [];
  let u8: Uint8Array;
  try {
    u8 = b64.dec(s);
  } catch {
    return [];
  }
  const out: { t: number; list: SnapEntity[] }[] = [];
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  while (o + 4 <= u8.length && out.length < WORLD_SNAPS) {
    const n = v.getUint32(o, true);
    if (o + 4 + n > u8.length) break;
    const snap = decodeSnap(new DataView(u8.buffer, u8.byteOffset + o + 4, n));
    if (snap) out.push(snap);
    o += 4 + n;
  }
  return out;
}

/** An entity in the match frame (centred on `origin`) → in `to`'s local metres. */
export function reframe(e: SnapEntity, origin: LL, to: { toXZ: (lat: number, lng: number) => { x: number; z: number } }): SnapEntity {
  const ll = localFrame(origin).toLL(e.x, e.z);
  const p = to.toXZ(ll.lat, ll.lng);
  return { ...e, x: p.x, z: p.z };
}

// ---------------------------------------------------------------- messages
/** Tracers are only for show: a batch keeps the newest few (the rest, in order). */
export function capShots(msgs: string[], max = SHOTS_PER_BATCH): string[] {
  let shots = 0;
  for (const m of msgs) if (m.startsWith('{"t":"shot"')) shots++;
  if (shots <= max) return msgs.slice(-DOWN_MAX);
  let skip = shots - max;
  return msgs.filter((m) => !(m.startsWith('{"t":"shot"') && skip-- > 0)).slice(-DOWN_MAX);
}

// ---------------------------------------------------------------- clocks
/**
 * The server's clock minus mine, from request round trips (measured at the middle of
 * each): jumps on the first sample, then glides; slow round trips (queued behind other
 * requests) count for less.
 */
export class ClockSync {
  offset = 0;
  rtt = 0;
  private n = 0;
  sample(sentAt: number, recvAt: number, serverTime: number) {
    const rtt = recvAt - sentAt;
    if (!(rtt >= 0 && rtt < 10_000) || !Number.isFinite(serverTime)) return this.offset;
    const off = serverTime - (sentAt + recvAt) / 2;
    this.rtt = this.n ? this.rtt * 0.8 + rtt * 0.2 : rtt;
    const k = this.n === 0 ? 1 : rtt <= this.rtt * 1.2 ? 0.2 : 0.05;
    this.offset += (off - this.offset) * k;
    this.n++;
    return this.offset;
  }
  get synced() {
    return this.n > 0;
  }
}

/**
 * How far behind to draw relayed players so there's (nearly) always a newer sample to
 * glide toward: per poll, how old the newest sample was when it arrived, plus how long
 * polls take to come — high percentiles of recent polls, so one stalled request doesn't
 * slow everything down for long. Grows fast (no freezes), shrinks slowly (no speed-ups).
 */
export class Lateness {
  private late: number[] = [];
  private gaps: number[] = [];
  private lastArrival = 0;
  private cur = 600;
  /** One poll's news from one source: how old its newest sample was on arrival (ms), at local time `now`. */
  add(lateMs: number, now = Date.now()) {
    if (!Number.isFinite(lateMs)) return;
    this.late.push(Math.max(0, lateMs));
    if (this.late.length > 25) this.late.shift();
    // Several sources in one poll arrive together: only a new poll counts as a gap.
    if (now - this.lastArrival > 25) {
      if (this.lastArrival) this.gaps.push(Math.min(3000, now - this.lastArrival));
      if (this.gaps.length > 25) this.gaps.shift();
      this.lastArrival = now;
    }
    const want = Math.max(DELAY_MIN_MS, Math.min(DELAY_MAX_MS, pct(this.late, 0.8) + pct(this.gaps, 0.8) + 80));
    this.cur += (want - this.cur) * (want > this.cur ? 0.5 : 0.08);
  }
  get delay() {
    return Math.round(this.cur);
  }
}

function pct(list: number[], q: number) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}
