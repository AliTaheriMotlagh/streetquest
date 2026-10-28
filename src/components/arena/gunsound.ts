"use client";
// Gunfire and combat sounds, synthesized like the rest of the game's audio (Web Audio,
// no files): a shot is a filtered noise crack, a low thump for its body and a short tail,
// shaped per gun (weapons.ts `sound`). Distant shots are quieter and duller, and panned to
// where they came from. Hit markers, kill and headshot dings, reloads, the bomb's beep.
import { audioOut, isMuted } from "../game/sfx";

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
