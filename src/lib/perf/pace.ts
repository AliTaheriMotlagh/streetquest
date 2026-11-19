// Frame pacing for the 3D city: how many frames a second it needs right now, so a phone or an iPad isn't drawing
// 60–120 frames a second it doesn't need (heat, battery). Pure — Drive.tsx asks every animation frame, tests drive it.

import type { Tier } from "@/components/drive/graphics/quality";

/** No input and standing still this long → idle. */
export const IDLE_MS = 12_000;
/** The simulation clamps a step at 50 ms (Drive.tsx), so nothing runs slower than 20 fps — below that it'd be slow motion. */
export const IDLE_FPS = 20;
export const CAP_FPS = 30;

export type PaceIn = {
  tier: Tier;
  /** The player's battery saver, or the battery is low and not charging. */
  saver: boolean;
  /** ms since the last touch, key, pad input — or since the car/hero last moved. */
  sinceActive: number;
  /** A match, a flight, a cutscene: never idle. */
  busy: boolean;
  /** Something covers part of the city (a side menu, a store card). */
  covered: boolean;
  /** Nothing of the city shows (a full-screen menu or store): keep it ticking, draw nothing. */
  hidden: boolean;
};

export type Pace = {
  /** Frames a second to run at; 0 = as fast as the screen refreshes. */
  fps: number;
  /** Draw the city this frame (false: simulate only). */
  draw: boolean;
  /** These frame times say how fast the device is (false: the pace, not the device, sets them). */
  measure: boolean;
};

export function pace(i: PaceIn): Pace {
  if (i.hidden) return { fps: IDLE_FPS, draw: false, measure: false };
  if (!i.busy && i.sinceActive >= IDLE_MS) return { fps: IDLE_FPS, draw: true, measure: false };
  const capped = i.saver || i.tier === "low" || i.tier === "medium" || i.covered;
  return { fps: capped ? CAP_FPS : 0, draw: true, measure: !i.covered };
}

/**
 * Lets through one animation frame per 1/fps second. Frames arrive on the screen's refresh (60, 90, 120 Hz) with a
 * little jitter, so a frame up to 2 ms early still counts, and the clock moves on by whole intervals — no drift,
 * and a 120 Hz screen paced to 30 runs exactly every 4th frame.
 */
export class Pacer {
  private next = 0;
  ready(now: number, fps: number): boolean {
    if (fps <= 0) {
      this.next = 0;
      return true;
    }
    const iv = 1000 / fps;
    if (now < this.next - 2) return false;
    // Too far behind (the tab was away, a long frame): start over from now rather than catching up.
    this.next = now - this.next > iv ? now + iv : this.next + iv;
    return true;
  }
}

/** The battery says it's low (≤ 20 %) and not charging. */
export const lowBattery = (b: { level: number; charging: boolean } | null | undefined) => !!b && !b.charging && b.level <= 0.2;
