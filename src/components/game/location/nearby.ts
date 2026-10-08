// Live positions of players physically close to us. The server sends them back on
// every /api/loc report (exact, unlike the privacy-fuzzed world list), so two people
// walking together — or sitting in the same car — see each other where they really are.
//
// Each player keeps their last two samples; between reports the marker is extrapolated
// along that velocity, so in a moving car it doesn't trail tens of metres behind.
import type { LatLng } from "@/lib/geo";

export type NearReport = { id: string; username: string; avatar: string; level: number; home: boolean; lat: number; lng: number; at: number };
type Sample = { lat: number; lng: number; at: number };
export type NearPlayer = Omit<NearReport, "lat" | "lng" | "at"> & { last: Sample; prev: Sample | null };

const M_PER_DEG = 111_320;
const EXPIRE_MS = 15_000; // no report for this long (backgrounded, offline) → drop them
const MAX_AHEAD_MS = 4_000; // never extrapolate further than this past the last sample
const MAX_SPEED_MS = 70;
const STILL_MS = 0.5;
/** Our own marker glides ~one fix behind the GPS; show others on the same clock. */
const DISPLAY_LAG_MS = 600;

type Listener = () => void;

class NearbyStore {
  private players = new Map<string, NearPlayer>();
  private offset = 0; // server clock − local clock
  private updatedAt = 0;
  private listeners = new Set<Listener>();
  private version = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getVersion = () => this.version;

  /** A fresh /api/loc answer: the complete list of who is near us right now. */
  set(list: NearReport[], serverTime: number) {
    const now = Date.now();
    this.offset = serverTime - now;
    this.updatedAt = now;
    const next = new Map<string, NearPlayer>();
    for (const r of list) {
      const old = this.players.get(r.id);
      const sample = { lat: r.lat, lng: r.lng, at: r.at };
      const fresh = !old || r.at > old.last.at;
      next.set(r.id, { id: r.id, username: r.username, avatar: r.avatar, level: r.level, home: r.home, last: fresh ? sample : old.last, prev: fresh ? (old?.last ?? null) : old.prev });
    }
    if (!next.size && !this.players.size) return;
    this.players = next;
    this.emit();
  }

  clear() {
    if (!this.players.size) return;
    this.players = new Map();
    this.emit();
  }

  list(): NearPlayer[] {
    if (this.players.size && Date.now() - this.updatedAt > EXPIRE_MS) this.players = new Map();
    return [...this.players.values()];
  }

  get(id: string) {
    return this.list().find((p) => p.id === id) ?? null;
  }

  /** Where to draw them right now: last report + velocity × time since, capped. */
  predict(p: NearPlayer, localNow = Date.now()): LatLng & { moving: boolean } {
    const { last, prev } = p;
    if (!prev) return { lat: last.lat, lng: last.lng, moving: false };
    const dt = (last.at - prev.at) / 1000;
    if (dt < 0.5 || dt > 15) return { lat: last.lat, lng: last.lng, moving: false };
    const kx = M_PER_DEG * Math.cos((last.lat * Math.PI) / 180);
    const vx = ((last.lng - prev.lng) * kx) / dt;
    const vy = ((last.lat - prev.lat) * M_PER_DEG) / dt;
    const v = Math.hypot(vx, vy);
    if (v < STILL_MS || v > MAX_SPEED_MS) return { lat: last.lat, lng: last.lng, moving: false };
    const ahead = Math.max(0, Math.min(MAX_AHEAD_MS, localNow + this.offset - DISPLAY_LAG_MS - last.at)) / 1000;
    return { lat: last.lat + (vy * ahead) / M_PER_DEG, lng: last.lng + (vx * ahead) / kx, moving: true };
  }

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

export const nearby = new NearbyStore();
