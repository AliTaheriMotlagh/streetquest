"use client";
// Gunfire and combat sounds, synthesized like the rest of the game's audio (Web Audio,
// no files): a shot is a filtered noise crack, a low thump for its body and a short tail,
// shaped per gun (weapons.ts `sound`). Distant shots are quieter and duller, and panned to
// where they came from. Hit markers, kill and headshot dings, reloads, the bomb's beep.
import { audioOut, isMuted } from "../game/sfx";
import { playSample, SampleLoop } from "../game/samples";

let noise: AudioBuffer | null = null;
function noiseOf(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

let live = 0;
/** Many guns at once: cap simultaneous voices so phones don't crackle. */
const MAX_VOICES = 10;

function out(pan: number) {
  const o = audioOut();
  // Still waking up: skip this one rather than have it fire late with the next ones.
  if (!o || isMuted() || live >= MAX_VOICES || o.ctx.state !== "running") return null;
  const { ctx } = o;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(o.out);
  return { ctx, dest: p as AudioNode, t: ctx.currentTime };
}

function voice(ms: number) {
  live++;
  setTimeout(() => live--, ms);
}

/** A gunshot `dist` metres away, `pan` −1 (left) … 1 (right). */
export function shotSound(s: { body: number; crack: number; tail: number }, dist: number, pan: number) {
  const o = out(pan);
  if (!o) return;
  const { ctx, dest, t } = o;
  const near = 1 / (1 + dist / 18);
  const vol = 0.55 * near;
  if (vol < 0.01) return;
  voice(600);
  // Crack: bright noise burst, duller with distance.
  const n = ctx.createBufferSource();
  n.buffer = noiseOf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900 + 6500 * near * s.crack;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * s.crack, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.08 + s.tail * 0.25);
  n.connect(f).connect(g).connect(dest);
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
  o2.start(t);
  o2.stop(t + 0.2);
}

function blip(freq: number, len: number, vol: number, type: OscillatorType = "square", slide = 1) {
  const o = out(0);
  if (!o) return;
  const { ctx, dest, t } = o;
  voice(len * 1000 + 50);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

export const hitSound = (head: boolean) => (head ? blip(2400, 0.08, 0.12, "triangle", 1.3) : blip(1500, 0.05, 0.09, "square"));
export const killSound = () => {
  blip(880, 0.12, 0.12, "triangle");
  setTimeout(() => blip(1320, 0.18, 0.12, "triangle"), 90);
};
export const hurtSound = () => blip(120, 0.18, 0.25, "sawtooth", 0.5);
export const emptySound = () => blip(2200, 0.03, 0.06, "square");
export const beepSound = (urgent: boolean) => blip(urgent ? 1900 : 1600, 0.06, 0.08, "sine");

export function reloadSound(seconds: number) {
  blip(700, 0.04, 0.08, "square", 0.6);
  setTimeout(() => blip(500, 0.05, 0.1, "square", 0.7), seconds * 450);
  setTimeout(() => blip(900, 0.05, 0.1, "square", 1.2), seconds * 880);
}

export function boomSound(dist: number) {
  // A recorded explosion when there is one (lib/soundSlots.ts), else the synth.
  if (playSample("explosion", { vol: 1 / (1 + dist / 40), rate: dist > 60 ? 0.85 : 1 })) return;
  const o = out(0);
  if (!o) return;
  const { ctx, dest, t } = o;
  voice(2500);
  const vol = 0.9 / (1 + dist / 40);
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
  n.start(t);
  n.stop(t + 2.3);
  blip(60, 1.2, vol * 0.8, "sine", 0.5);
}

// ---- grenades and C4 (lib/arena/throwables)

/** A filtered noise burst: `type` filter at `freq`, `len` seconds, swelling for `attack`. */
function hiss(freq: number, len: number, vol: number, type: BiquadFilterType = "bandpass", attack = 0.01, pan = 0) {
  const o = out(pan);
  if (!o || vol < 0.005) return;
  const { ctx, dest, t } = o;
  voice(len * 1000 + 50);
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
  n.start(t, Math.random() * 0.3);
  n.stop(t + len + 0.02);
}

const near = (dist: number, k = 25) => 1 / (1 + dist / k);

/** The pin and the throw: a click and a swish. */
export function throwSound() {
  blip(2600, 0.025, 0.06, "square");
  setTimeout(() => hiss(1400, 0.22, 0.08, "bandpass", 0.08), 60);
}

/** Metal on stone: a grenade bouncing or landing `dist` m away. */
export const clinkSound = (dist: number) => blip(1700 + Math.random() * 500, 0.07, 0.07 * near(dist, 15), "triangle", 0.8);

/** A smoke grenade's long hiss as the cloud pours out. */
export const smokeSound = (dist: number) => hiss(2400, 3.2, 0.12 * near(dist), "highpass", 0.15);

/** Fire: a run of crackles over `seconds` (a molotov breaking, then burning). */
export function fireSound(dist: number, seconds: number) {
  const v = near(dist, 18);
  if (playSample("fire", { vol: 0.7 * v })) return;
  hiss(900, 0.5, 0.25 * v, "lowpass", 0.02);
  for (let i = 0; i < seconds * 6; i++) setTimeout(() => hiss(1800 + Math.random() * 2400, 0.05 + Math.random() * 0.08, (0.03 + Math.random() * 0.05) * v, "bandpass"), i * 160 + Math.random() * 120);
}

/** A flashbang's bang, then the ringing in your ears for as long as you're blind. */
export function flashSound(dist: number, blindS: number) {
  hiss(3000, 0.35, 0.5 * near(dist, 30), "highpass", 0.005);
  blip(180, 0.25, 0.4 * near(dist, 30), "sine", 0.4);
  if (blindS > 0.3) blip(3600 + Math.random() * 400, blindS, 0.05, "sine", 0.98);
}

// ---- the street (crashes, horns, sirens — drive/street.ts)

/** A crash `dist` m away, `k` 0 (a scrape) … 1 (a wreck): a thump, crunching metal, glass, a panel ringing. */
export function crashSound(k: number, dist: number, pan = 0) {
  const v = Math.min(1, 0.25 + k * 0.75) * near(dist, 30);
  if (v < 0.02) return;
  // Recorded: a crunch (heavier the harder), glass on a bad one.
  if (playSample(k > 0.4 ? "crashHeavy" : "crashLight", { vol: v, pan, rate: dist > 40 ? 0.9 : 1 })) {
    if (k > 0.55) setTimeout(() => playSample("glass", { vol: v * 0.7, pan }), 60);
    return;
  }
  blip(70 + Math.random() * 25, 0.28, v * 0.7, "sine", 0.5);
  hiss(1300, 0.22 + k * 0.35, v * 0.5, "bandpass", 0.004, pan);
  if (k > 0.25) setTimeout(() => hiss(5200, 0.15 + k * 0.3, v * 0.22, "highpass", 0.004, pan), 40);
  if (k > 0.45) blip(300 + Math.random() * 220, 0.45, v * 0.1, "triangle", 0.88);
}

/** A street car's horn `dist` m away: two reedy notes at once (each car a little sharper or flatter). */
export function hornSound(dist: number, pitch = 1, len = 0.32) {
  const v = 0.09 * near(dist, 28);
  if (v < 0.008) return;
  if (playSample("horn", { vol: v * 5, rate: pitch })) return;
  blip(415 * pitch, len, v, "square", 1);
  blip(523 * pitch, len, v * 0.75, "square", 1);
}

/** Someone falling hard (hit by a car): a dull thud. */
export const thudSound = (dist: number) => playSample("thud", { vol: 0.6 * near(dist, 20) }) || blip(95, 0.18, 0.35 * near(dist, 20), "sine", 0.6);

/** Tyres screeching (a hard brake or a slide at speed), `k` 0…1 how hard. */
export const skidSound = (k: number, dist: number) => playSample("skid", { vol: 0.5 * k * near(dist, 25) }) || hiss(2600, 0.3 + k * 0.4, 0.05 * k * near(dist, 25), "bandpass", 0.05);

/**
 * The police siren: one wailing voice for every patrol car together, louder the nearer the
 * nearest one is. `level(v)` each frame (0 = off).
 */
export class Siren {
  private node: { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  /** A recorded siren when there is one (it takes over from the synth). */
  private rec = new SampleLoop("siren", 0.5);
  level(v: number) {
    if (this.rec.level(v)) {
      if (this.node) this.stopSynth();
      return;
    }
    // Silent and not started: don't touch the audio (asking for it keeps it awake).
    if (!this.node && v <= 0) return;
    const o = audioOut();
    if (!o) return;
    const { ctx } = o;
    const want = isMuted() ? 0 : Math.max(0, Math.min(1, v)) * 0.05;
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
      osc.connect(filter).connect(gain).connect(o.out);
      osc.start();
      lfo.start();
      this.node = { osc, lfo, lfoGain, gain, filter };
    }
    this.node.gain.gain.setTargetAtTime(want, ctx.currentTime, 0.25);
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
  }
}
