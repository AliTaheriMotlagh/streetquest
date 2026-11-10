"use client";
// Sounds with a place in the 3D city. The rules — how loud, dull, late and echoing a sound
// is at a distance, and where it sits around the head — are lib/audio/spatial.ts; this
// file turns them into Web Audio nodes in front of the game's mix (sfx.ts):
//
//   source → air (low-pass) → distance gain → panner → mix          (+ a send to the reverb)
//
// The panner is the player's output choice: HRTF for headphones (a sound really is above,
// behind, to the left), plain stereo for speakers, front/rear pairs for 5.1. Distance is
// always ours (one curve for every output), never the panner's.
//
// The ears: the 3D city sets them every frame (setEars) — where the player is, which way
// the camera looks. A third-person camera hangs metres behind the car, so distance is
// measured from the player and direction from the camera: the car beside you is loud, and
// what's on the left of the screen is in the left ear.
import { admit, airCutoffHz, delayS, dopplerRate, gainAt, hear, stereo, surround, wetAt, type Ears, type Panning, type SoundKind, type Vec } from "@/lib/audio/spatial";
import { audioOut, audioPeek, isMuted, isWeakAudio, panning } from "./sfx";

const ears: Ears = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
type V3 = { x: number; y: number; z: number };

/** Every frame: the player's head, and the camera's forward and up (unit vectors). */
export function setEars(at: V3, fwd: V3, up: V3) {
  (ears.x = at.x), (ears.y = at.y), (ears.z = at.z);
  (ears.fx = fwd.x), (ears.fy = fwd.y), (ears.fz = fwd.z);
  (ears.ux = up.x), (ears.uy = up.y), (ears.uz = up.z);
  const ctx = audioPeek();
  if (!ctx || ctx.state !== "running" || panning() !== "hrtf") return;
  const l = ctx.listener;
  if (l.positionX) {
    (l.positionX.value = at.x), (l.positionY.value = at.y), (l.positionZ.value = at.z);
    (l.forwardX.value = fwd.x), (l.forwardY.value = fwd.y), (l.forwardZ.value = fwd.z);
    (l.upX.value = up.x), (l.upY.value = up.y), (l.upZ.value = up.z);
  } else {
    // Firefox: the older calls.
    l.setPosition(at.x, at.y, at.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}
export const earsNow = (): Readonly<Ears> => ears;
/** Metres from the ears to `at`. */
export const earDistance = (at: Vec) => hear(ears, at).dist;

let live = 0;
/** Sounds at once. Each is a filter and a panner on the audio thread; phones crackle past this. */
const maxVoices = () => (isWeakAudio() ? 14 : 22);

type Chain = { mode: Panning; input: GainNode; air: BiquadFilterNode; wet: GainNode; hrtf?: PannerNode; pan?: StereoPannerNode; front?: GainNode; rear?: GainNode; nodes: AudioNode[] };
type Out = NonNullable<ReturnType<typeof audioOut>>;

function chain(o: Out): Chain {
  const { ctx } = o, mode = panning();
  const input = ctx.createGain(), air = ctx.createBiquadFilter(), wet = ctx.createGain();
  air.type = "lowpass";
  air.Q.value = 0.5;
  input.connect(air);
  // The echo of a sound has no direction: the reverb takes it before the panner.
  air.connect(wet).connect(o.verb);
  const c: Chain = { mode, input, air, wet, nodes: [input, air, wet] };
  if (mode === "hrtf") {
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.rolloffFactor = 0; // direction only: the distance curve is gainAt()
    air.connect(p).connect(o.out);
    c.hrtf = p;
    c.nodes.push(p);
  } else {
    const p = ctx.createStereoPanner();
    air.connect(p);
    c.pan = p;
    c.nodes.push(p);
    if (mode === "surround") {
      c.front = ctx.createGain();
      c.rear = ctx.createGain();
      p.connect(c.front).connect(o.out);
      p.connect(c.rear).connect(o.rear);
      c.nodes.push(c.front, c.rear);
    } else p.connect(o.out);
  }
  return c;
}

/** Point the chain at `at`, at volume `level`: at once (`glide` 0) or over `glide` seconds. Returns the distance. */
function aim(c: Chain, ctx: AudioContext, at: Vec, kind: SoundKind, level: number, t: number, glide: number) {
  const h = hear(ears, at);
  let gain = gainAt(h.dist, kind) * level, cutoff = airCutoffHz(h.dist);
  const set = (p: AudioParam, v: number) => (glide > 0 ? p.setTargetAtTime(v, t, glide) : p.setValueAtTime(v, t));
  if (c.hrtf) {
    const y = at.y ?? ears.y;
    if (c.hrtf.positionX) (c.hrtf.positionX.value = at.x), (c.hrtf.positionY.value = y), (c.hrtf.positionZ.value = at.z);
    else c.hrtf.setPosition(at.x, y, at.z);
  } else if (c.pan) {
    const s = stereo(h);
    set(c.pan.pan, s.pan);
    if (c.front && c.rear) {
      // 5.1 has real rear speakers: behind is behind, not "a bit duller".
      const sr = surround(h);
      set(c.front.gain, sr.front);
      set(c.rear.gain, sr.rear);
    } else (gain *= s.gain), (cutoff *= s.cutoffK);
  }
  set(c.input.gain, gain);
  set(c.air.frequency, cutoff);
  set(c.wet.gain, wetAt(h.dist, kind));
  return { dist: h.dist, gain };
}

export type Placed = {
  ctx: AudioContext;
  /** Connect the sound here. */
  dest: AudioNode;
  /** When it's heard (now + the time sound takes to get here): schedule from this. */
  t: number;
  /** Its volume at the ears, 0…1 (already applied — for deciding what's worth layering). */
  gain: number;
  dist: number;
};

/**
 * A place in the mix for a one-shot of `kind` at `at` (nothing: in the player's own hands)
 * lasting `lifeS`. Null when it isn't worth playing: muted, audio asleep, out of earshot,
 * or every voice is busy with something louder.
 */
export function place(at: Vec | null | undefined, kind: SoundKind, lifeS: number): Placed | null {
  const o = audioOut();
  // Still waking up: skip this one rather than have it fire late with the next ones.
  if (!o || isMuted() || o.ctx.state !== "running") return null;
  const { ctx } = o;
  const h = at ? hear(ears, at) : null;
  const gain = h ? gainAt(h.dist, kind) : 1;
  if (!admit(live, maxVoices(), gain)) return null;
  const wait = h ? delayS(h.dist) : 0;
  live++;
  if (!at) {
    setTimeout(() => live--, lifeS * 1000);
    return { ctx, dest: o.out, t: ctx.currentTime, gain: 1, dist: 0 };
  }
  const c = chain(o);
  aim(c, ctx, at, kind, 1, ctx.currentTime, 0);
  setTimeout(() => {
    live--;
    c.nodes.forEach((n) => n.disconnect());
  }, (wait + lifeS + 0.3) * 1000);
  return { ctx, dest: c.input, t: ctx.currentTime + wait, gain, dist: h!.dist };
}

/**
 * Something that keeps sounding while it moves (a siren, a fire): `at()` every frame.
 * Fades rather than clicks, and reports the pitch shift of its movement (Doppler).
 */
export class Emitter {
  private c: Chain | null = null;
  private lastDist = -1;
  private lastT = 0;
  private closing = 0;
  constructor(private kind: SoundKind) {}

  /**
   * Now at `at`, at `level` 0…1. Gives where to connect the source and the pitch factor to
   * play it at; null while audio isn't there.
   */
  at(at: Vec, level: number): { ctx: AudioContext; input: AudioNode; rate: number; gain: number } | null {
    const o = audioOut();
    if (!o) return null;
    const { ctx } = o;
    if (this.c && this.c.mode !== panning()) this.stop(); // the player changed the output
    const fresh = !this.c;
    if (!this.c) {
      this.c = chain(o);
      this.c.input.gain.value = 0;
    }
    const t = ctx.currentTime, dt = t - this.lastT;
    const a = aim(this.c, ctx, at, this.kind, isMuted() ? 0 : level, t, fresh ? 0 : 0.08);
    // Just started: placed at once, but faded in.
    if (fresh) (this.c.input.gain.cancelScheduledValues(t), this.c.input.gain.setValueAtTime(0, t), this.c.input.gain.setTargetAtTime(a.gain, t, 0.08));
    if (!fresh && this.lastDist >= 0 && dt > 0.001 && dt < 0.5) this.closing += ((this.lastDist - a.dist) / dt - this.closing) * Math.min(1, dt * 4);
    else if (fresh || dt >= 0.5) this.closing = 0;
    (this.lastDist = a.dist), (this.lastT = t);
    return { ctx, input: this.c.input, rate: dopplerRate(this.closing), gain: a.gain };
  }

  stop() {
    this.c?.nodes.forEach((n) => n.disconnect());
    this.c = null;
    this.lastDist = -1;
  }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __spatial?: unknown }).__spatial = { ears: earsNow, live: () => live, panning, place, out: audioOut };
