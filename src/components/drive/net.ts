"use client";
// The 3D city's live link (/api/drive): sends where my vehicle is and hears where everyone
// else is, plus my party's round. One request in flight at a time, always the latest
// position; faster when there's someone to see (4×/s in a round or on foot with company,
// 2.5×/s with company, 1×/s alone), paused while the tab is hidden, backing off when the
// network is down. Without a realtime server this is also how players on foot see each
// other and how my health comes back (`me`, server/arena.ts).
import type { LatLng } from "@/lib/geo";
import type { PartyView } from "@/lib/party";
import type { VehicleKey } from "@/lib/vehicles";
import type { OtherDriver } from "@/server/drive";
import type { HttpMe } from "../arena/combat";

export type { OtherDriver };
export type Payload = { lat?: number; lng?: number; alt: number; yaw: number; speed: number; vehicle: VehicleKey; color: string; sim?: boolean; here?: LatLng; flags?: number; pitch?: number; weapon?: number };
export type NetState = { others: OtherDriver[]; party: PartyView | null; vehicle: VehicleKey; offset: number; rejected: boolean; me: HttpMe | null };

export class DriveNet {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = true;
  private fails = 0;
  private last: NetState | null = null;

  constructor(private read: () => Payload | null, private onState: (s: NetState) => void, private onError?: (status: number, message: string) => void, private fast?: () => boolean) {}

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    this.schedule(0);
  }

  /** Leaving the city: stop broadcasting right away (others stop seeing our vehicle). */
  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.timer) clearTimeout(this.timer);
    try {
      void fetch("/api/drive", { method: "DELETE", keepalive: true });
    } catch {}
  }

  /** Something changed (party joined, round started): report now. */
  kick() {
    this.schedule(0);
  }

  private onVisible = () => {
    if (document.visibilityState === "visible") this.schedule(0);
  };

  private gap() {
    if (this.fails) return Math.min(10_000, 1000 * 2 ** this.fails);
    const s = this.last;
    if (s?.party?.status === "LIVE" || (s?.others.length && this.fast?.())) return 250;
    if (s?.others.length || s?.party) return 400;
    return 1000;
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.send(), ms);
  }

  private async send() {
    this.timer = null;
    if (this.stopped || this.busy) return;
    if (document.visibilityState === "hidden") return; // onVisible resumes
    const body = this.read();
    if (!body) return this.schedule(500);
    this.busy = true;
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/drive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        this.fails = 0;
        // Server clock − local clock, measured at the middle of the round trip.
        const offset = data.serverTime - (sentAt + Date.now()) / 2;
        this.last = { others: data.others ?? [], party: data.party ?? null, vehicle: data.vehicle, offset, rejected: !!data.rejected, me: data.me ?? null };
        this.onState(this.last);
      } else {
        this.fails = Math.min(4, this.fails + 1);
        this.onError?.(res.status, data?.error ?? "");
      }
    } catch {
      this.fails = Math.min(4, this.fails + 1);
    } finally {
      this.busy = false;
      this.schedule(this.gap());
    }
  }
}
