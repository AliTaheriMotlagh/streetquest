// Streams the player's position to the server (/api/loc), which is also the presence
// heartbeat and where tower fire is resolved.
//
// Policy: always send the *latest* position, never a queue of old ones.
//  - moved ≥ MIN_MOVE_M → send, at most once every MIN_GAP_MS (one timer, not reset by
//    every fix, so a fast stream of fixes can't starve it)
//  - one request in flight; fixes that arrive meanwhile are coalesced into one follow-up
//  - heartbeat every HEARTBEAT_MS so the player stays "online" when standing still
//  - network failure → retry with backoff; back on screen → report right away
//  - another player physically near us: report faster, so both of us see each other live
import { distanceM, type LatLng } from "@/lib/geo";
import { nearby, type NearReport } from "./nearby";
import type { LocationSnapshot } from "./tracker";

export type FireReport = { hp: number; maxHp: number; hits: { by: string; emoji: string; dmg: number }[]; downed: { by: string; coins: number } | null; protectedReason?: string };

const MIN_MOVE_M = 3;
const MIN_GAP_MS = 2_000;
const NEAR_GAP_MS = 1_000;
const HEARTBEAT_MS = 20_000;
const NEAR_HEARTBEAT_MS = 3_000;
const UNDER_FIRE_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

type Sent = { pos: LatLng; sim: boolean; at: number };

export class LocationReporter {
  private sent: Sent | null = null;
  private inflight: Promise<void> | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dueAt = Infinity;
  private failures = 0;
  private stopped = false;
  /** Someone is near us: shorter gaps both ways (they move on our map, we on theirs). */
  private hasNear = false;

  constructor(
    private read: () => LocationSnapshot,
    private onFire: (f: FireReport) => void,
  ) {}

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    this.update();
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clear();
    nearby.clear();
  }

  /** Call whenever the location snapshot changes. */
  update() {
    const { pos, simulated } = this.read();
    if (!pos || this.stopped) return;
    const last = this.sent;
    const moved = !last || last.sim !== simulated || distanceM(last.pos, pos) >= MIN_MOVE_M;
    if (!moved) return this.schedule((this.hasNear ? NEAR_HEARTBEAT_MS : HEARTBEAT_MS) - (Date.now() - last.at));
    if (this.inflight) {
      this.dirty = true;
      return;
    }
    this.schedule(last && last.sim === simulated ? (this.hasNear ? NEAR_GAP_MS : MIN_GAP_MS) - (Date.now() - last.at) : 0);
  }

  /**
   * Make sure the server has our latest position before a location-checked action.
   * Only sends when the server's copy is actually off (≥ MIN_MOVE_M, other mode, or
   * stale): GPS jitters by a metre every second, and an extra round trip before
   * every tap is what made actions feel slow while walking.
   */
  async flush() {
    if (this.inflight) await this.inflight;
    const { pos, simulated } = this.read();
    const last = this.sent;
    if (pos && (!last || last.sim !== simulated || distanceM(last.pos, pos) >= MIN_MOVE_M || Date.now() - last.at > 60_000)) await this.send();
  }

  private onVisible = () => {
    if (document.visibilityState === "visible") this.schedule(0);
  };

  /** Keep the earliest pending deadline: a later request never postpones an earlier one. */
  private schedule(ms: number) {
    const at = Date.now() + Math.max(0, ms);
    if (this.timer && at >= this.dueAt) return;
    this.clear();
    this.dueAt = at;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.dueAt = Infinity;
      void this.send();
    }, at - Date.now());
  }

  private clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dueAt = Infinity;
  }

  private send(): Promise<void> {
    if (this.inflight) {
      this.dirty = true;
      return this.inflight;
    }
    const { pos, simulated, accuracy } = this.read();
    if (!pos || this.stopped) return Promise.resolve();
    this.dirty = false;
    this.clear();
    const p = (async () => {
      let next = HEARTBEAT_MS;
      try {
        const res = await fetch("/api/loc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: pos.lat, lng: pos.lng, sim: simulated, acc: accuracy ?? undefined }),
        });
        // A brand-new guest's first ping can land before their account exists, and a
        // rejected jump (409) isn't delivered either: flush()/the next fix resend it.
        if (res.ok) {
          this.sent = { pos, sim: simulated, at: Date.now() };
          this.failures = 0;
          const data = await res.json().catch(() => null);
          if (data?.fire) this.onFire(data.fire);
          const near: NearReport[] = Array.isArray(data?.near) ? data.near : [];
          nearby.set(near, typeof data?.serverTime === "number" ? data.serverTime : Date.now());
          this.hasNear = near.length > 0;
          if (this.hasNear) next = NEAR_HEARTBEAT_MS;
          // Under fire: report more often so damage (and escaping) feel immediate.
          if (data?.fire?.hits?.length) next = Math.min(next, UNDER_FIRE_MS);
        } else if (res.status === 401 || res.status >= 500) {
          next = this.backoff(); // account still being created, or a server hiccup
        }
      } catch {
        next = this.backoff(); // offline / flaky network
      }
      return next;
    })().then((next) => {
      this.inflight = null;
      if (this.stopped) return;
      if (this.dirty) this.update();
      this.schedule(next);
    });
    this.inflight = p;
    return p;
  }

  private backoff() {
    this.failures++;
    return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** this.failures);
  }
}
