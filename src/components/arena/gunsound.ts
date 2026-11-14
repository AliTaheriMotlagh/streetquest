"use client";
// Gunfire, combat and street sounds, synthesized like the rest of the game's audio (Web
// Audio; a recording takes over where lib/soundSlots.ts has one): a shot is a filtered
// noise crack, a low thump for its body and a short tail, shaped per gun (weapons.ts
// `sound`). Anything that happens somewhere takes `at`, its place in the city — how loud,
// dull, late and from which side it's heard is game/spatial.ts's; leave `at` out for what
// is in the player's own hands. Hit markers, kill dings and the like are in the head.
import type { SoundKind, Vec } from "@/lib/audio/spatial";
import { audioOut, isMuted } from "../game/sfx";
import { playSample, SampleLoop } from "../game/samples";
import type { SoundKey } from "@/lib/soundSlots";
import { earDistance, Emitter, place, type Placed } from "../game/spatial";

type At = Vec | null | undefined;

let noise: AudioBuffer | null = null;
function noiseOf(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

// The layers of one sound share one place in the mix (`p`); `after` seconds into it.

/** A pitched layer: `freq` sliding to `freq × slide` over `len` seconds. */
function tone(p: Placed, freq: number, len: number, vol: number, type: OscillatorType = "square", slide = 1, after = 0) {
  if (vol < 0.0015) return;
  const { ctx, dest } = p, t = p.t + after;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  osc.connect(g).connect(dest);
  osc.onended = () => g.disconnect();
  osc.start(t);
  osc.stop(t + len + 0.02);
}

/** A noise layer: through a `type` filter at `freq`, `len` seconds, swelling for `attack`. */
function burst(p: Placed, freq: number, len: number, vol: number, type: BiquadFilterType = "bandpass", attack = 0.01, after = 0) {
  if (vol < 0.0015) return;
  const { ctx, dest } = p, t = p.t + after;
  const n = ctx.createBufferSource();
  n.buffer = noiseOf(ctx);
  n.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0008, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  n.connect(f).connect(g).connect(dest);
  n.onended = () => g.disconnect();
  n.start(t, Math.random() * 0.3);
  n.stop(t + len + 0.02);
}

/** One tone on its own. */
function blip(freq: number, len: number, vol: number, type: OscillatorType = "square", slide = 1, at?: At, kind: SoundKind = "small") {
  const p = place(at, kind, len + 0.05);
  if (p) tone(p, freq, len, vol, type, slide);
}
/** One noise burst on its own. */
function hiss(freq: number, len: number, vol: number, type: BiquadFilterType = "bandpass", attack = 0.01, at?: At, kind: SoundKind = "small") {
  const p = place(at, kind, len + 0.05);
  if (p) burst(p, freq, len, vol, type, attack);
}

/** A gunshot at `at` (nothing: my own gun): the weapon's recording (`gun` key) when there is one, else synthesized from its numbers. */
export function shotSound(s: { body: number; crack: number; tail: number }, at?: At, gun?: string) {
  if (gun && playSample(`gun_${gun}` as SoundKey, { vol: 0.9, at, kind: "gun" })) return;
  const p = place(at, "gun", 0.6);
  if (!p) return;
  const { ctx, dest, t } = p, vol = 0.55;
  // Crack: a bright noise burst (the air between dulls it — spatial.ts).
  const n = ctx.createBufferSource();
  n.buffer = noiseOf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900 + 6500 * s.crack;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * s.crack, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.08 + s.tail * 0.25);
  n.connect(f).connect(g).connect(dest);
  n.onended = () => g.disconnect();
  n.start(t, Math.random() * 0.3);
  n.stop(t + 0.45);
  // Body: a pitched-down thump.
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.setValueAtTime(140 + 60 * s.body, t);
  o2.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(vol * s.body * 1.1, t);
  g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
  o2.connect(g2).connect(dest);
  o2.onended = () => g2.disconnect();
  o2.start(t);
  o2.stop(t + 0.2);
}

export const hitSound = (head: boolean) => playSample("hitMarker", { vol: head ? 0.7 : 0.5, rate: head ? 1.25 : 1 }) || (head ? blip(2400, 0.08, 0.12, "triangle", 1.3) : blip(1500, 0.05, 0.09, "square"));
export const killSound = () => {
  if (playSample("kill", { vol: 0.7 })) return;
  const p = place(null, "small", 0.35);
  if (!p) return;
  tone(p, 880, 0.12, 0.12, "triangle");
  tone(p, 1320, 0.18, 0.12, "triangle", 1, 0.09);
};
export const hurtSound = () => playSample("hurt", { vol: 0.8 }) || blip(120, 0.18, 0.25, "sawtooth", 0.5);
export const emptySound = () => playSample("empty", { vol: 0.6 }) || blip(2200, 0.03, 0.06, "square");
export const beepSound = (urgent: boolean) => playSample("bombBeep", { vol: 0.6, rate: urgent ? 1.2 : 1 }) || blip(urgent ? 1900 : 1600, 0.06, 0.08, "sine");

export function reloadSound(seconds: number) {
  if (playSample("reload", { vol: 0.7, rate: 2.3 / Math.max(0.6, seconds) })) return;
  blip(700, 0.04, 0.08, "square", 0.6);
  setTimeout(() => blip(500, 0.05, 0.1, "square", 0.7), seconds * 450);
  setTimeout(() => blip(900, 0.05, 0.1, "square", 1.2), seconds * 880);
}

/** An explosion at `at`, `power` 0…1 (a frag is smaller than a car going up). */
export function boomSound(at?: At, power = 1) {
  const far = at ? earDistance(at) : 0;
  // A recorded explosion when there is one (lib/soundSlots.ts), else the synth.
  if (playSample("explosion", { vol: power, at, kind: "blast", rate: far > 60 ? 0.85 : 1 })) return;
  const p = place(at, "blast", 2.5);
  if (!p) return;
  const { ctx, dest, t } = p, vol = 0.9 * power;
  const n = ctx.createBufferSource();
  n.buffer = noiseOf(ctx);
  n.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
  n.connect(f).connect(g).connect(dest);
  n.onended = () => g.disconnect();
  n.start(t);
  n.stop(t + 2.3);
  tone(p, 60, 1.2, vol * 0.8, "sine", 0.5);
}

// ---- grenades and C4 (lib/arena/throwables)

/** The pin and the throw: a click and a swish. */
export function throwSound() {
  if (playSample("throw", { vol: 0.7 })) return;
  const p = place(null, "small", 0.35);
  if (!p) return;
  tone(p, 2600, 0.025, 0.06, "square");
  burst(p, 1400, 0.22, 0.08, "bandpass", 0.08, 0.06);
}

/** Metal on stone: a grenade bouncing or landing. */
export const clinkSound = (at: At) => blip(1700 + Math.random() * 500, 0.07, 0.07, "triangle", 0.8, at);

/** A smoke grenade's long hiss as the cloud pours out. */
export const smokeSound = (at: At) => hiss(2400, 3.2, 0.12, "highpass", 0.15, at, "fire");

/** Fire: a run of crackles over `seconds` (a molotov breaking, then burning). */
export function fireSound(at: At, seconds: number) {
  if (playSample("fire", { vol: 0.7, at, kind: "fire" })) return;
  const p = place(at, "fire", seconds + 0.6);
  if (!p) return;
  burst(p, 900, 0.5, 0.25, "lowpass", 0.02);
  for (let i = 0; i < seconds * 6; i++) burst(p, 1800 + Math.random() * 2400, 0.05 + Math.random() * 0.08, 0.03 + Math.random() * 0.05, "bandpass", 0.01, i * 0.16 + Math.random() * 0.12);
}

/** A flashbang's bang, then the ringing in your ears for as long as you're blind. */
export function flashSound(at: At, blindS: number) {
  const p = playSample("flashbang", { vol: 1, at, kind: "blast" }) ? null : place(at, "blast", 0.5);
  if (p) (burst(p, 3000, 0.35, 0.5, "highpass", 0.005), tone(p, 180, 0.25, 0.4, "sine", 0.4));
  if (blindS > 0.3) blip(3600 + Math.random() * 400, blindS, 0.05, "sine", 0.98);
}

// ---- the street (crashes, horns, sirens — drive/street.ts)

/** A crash at `at` (nothing: my own car), `k` 0 (a scrape) … 1 (a wreck): a thump, crunching metal, glass, a panel ringing. */
export function crashSound(k: number, at?: At) {
  const v = Math.min(1, 0.25 + k * 0.75), far = at ? earDistance(at) : 0;
  // Recorded: a crunch (heavier the harder), glass on a bad one.
  if (playSample(k > 0.4 ? "crashHeavy" : "crashLight", { vol: v, at, kind: "crash", rate: far > 40 ? 0.9 : 1 })) {
    if (k > 0.55) playSample("glass", { vol: v * 0.7, at, kind: "crash", after: 0.06 });
    return;
  }
  const p = place(at, "crash", 0.9);
  if (!p) return;
  tone(p, 70 + Math.random() * 25, 0.28, v * 0.7, "sine", 0.5);
  burst(p, 1300, 0.22 + k * 0.35, v * 0.5, "bandpass", 0.004);
  if (k > 0.25) burst(p, 5200, 0.15 + k * 0.3, v * 0.22, "highpass", 0.004, 0.04);
  if (k > 0.45) tone(p, 300 + Math.random() * 220, 0.45, v * 0.1, "triangle", 0.88);
}

/** A street car's horn: two reedy notes at once (each car a little sharper or flatter). */
export function hornSound(at: At, pitch = 1, len = 0.32) {
  if (playSample("horn", { vol: 0.45, at, kind: "horn", rate: pitch })) return;
  const p = place(at, "horn", len + 0.05);
  if (!p) return;
  tone(p, 415 * pitch, len, 0.09, "square", 1);
  tone(p, 523 * pitch, len, 0.07, "square", 1);
}

/** A car door opening or shutting (silent with no recording: the synth has no door). */
export const doorSound = (open: boolean, at?: At) => playSample(open ? "doorOpen" : "doorClose", { vol: 0.75, at });

/** The engine turning over and catching. */
export const engineStartSound = () => playSample("engineStart", { vol: 0.7 });

/** The remote locking a car: a chirp (two short beeps without a recording). */
export function lockSound(at?: At) {
  if (playSample("carLock", { vol: 0.5, at })) return;
  const p = place(at, "small", 0.3);
  if (!p) return;
  tone(p, 1850, 0.07, 0.05, "square", 1);
  tone(p, 1850, 0.07, 0.05, "square", 1, 0.14);
}

/** A parked car's alarm going off (a wailing two-tone without a recording). */
export function carAlarmSound(at: At) {
  if (playSample("carAlarm", { vol: 0.6, at, kind: "alarm", rate: 0.95 + Math.random() * 0.1 })) return;
  const p = place(at, "alarm", 3.2);
  if (!p) return;
  for (let i = 0; i < 8; i++) tone(p, i % 2 ? 1100 : 1500, 0.32, 0.05, "square", 1, i * 0.38);
}

/** Someone falling hard (hit by a car): a dull thud. */
export const thudSound = (at?: At) => playSample("thud", { vol: 0.6, at }) || blip(95, 0.18, 0.35, "sine", 0.6, at);

/** Tyres screeching (a hard brake or a slide at speed), `k` 0…1 how hard. */
export function skidSound(k: number, at?: At, after = 0) {
  if (playSample("skid", { vol: 0.5 * k, at, kind: "crash", after })) return;
  const p = place(at, "crash", after + 0.3 + k * 0.4);
  if (p) burst(p, 2600, 0.3 + k * 0.4, 0.05 * k, "bandpass", 0.05, after);
}

/**
 * The police siren: one wailing voice for every patrol car together, heard from the
 * nearest one — louder the nearer, sharper as it closes in, sagging as it pulls away.
 * `level(v, at)` each frame (0 = off).
 */
export class Siren {
  private node: { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode; gain: GainNode; filter: BiquadFilterNode; into: AudioNode } | null = null;
  /** A recorded siren when there is one (it takes over from the synth). */
  private rec = new SampleLoop("siren", 0.5, "siren");
  private emitter = new Emitter("siren");
  level(v: number, at?: At) {
    if (this.rec.level(v, at)) {
      if (this.node) this.stopSynth();
      return;
    }
    // Silent and not started: don't touch the audio (asking for it keeps it awake).
    if (!this.node && v <= 0) return;
    const o = audioOut("vehicles");
    if (!o) return;
    const { ctx } = o;
    const want = isMuted() ? 0 : Math.max(0, Math.min(1, v)) * 0.05;
    const e = at ? this.emitter.at(at, 1) : null, into = e ? e.input : o.out;
    if (!this.node) {
      if (want <= 0) return;
      const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoGain = ctx.createGain(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 900;
      // A slow wail: up and down between ~650 and ~1350 Hz.
      lfo.type = "sine";
      lfo.frequency.value = 0.42;
      lfoGain.gain.value = 350;
      filter.type = "lowpass";
      filter.frequency.value = 2400;
      gain.gain.value = 0;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(filter).connect(gain).connect(into);
      osc.start();
      lfo.start();
      this.node = { osc, lfo, lfoGain, gain, filter, into };
    }
    if (into !== this.node.into) (this.node.gain.disconnect(), this.node.gain.connect(into), (this.node.into = into));
    this.node.gain.gain.setTargetAtTime(want, ctx.currentTime, 0.25);
    if (e) this.node.osc.detune.setTargetAtTime(1200 * Math.log2(e.rate), ctx.currentTime, 0.15);
  }
  stop() {
    this.rec.stop();
    this.stopSynth();
  }
  private stopSynth() {
    if (!this.node) return;
    try {
      this.node.osc.stop();
      this.node.lfo.stop();
    } catch {}
    this.node.gain.disconnect();
    this.node = null;
    this.emitter.stop();
  }
}
