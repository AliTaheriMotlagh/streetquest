"use client";
// Recorded sounds (lib/soundSlots.ts): public/sounds/manifest.json says which slots have
// files; they're fetched and decoded once, in the background, the first time the 3D city
// asks (warmSamples), and played through the game's shared audio graph (sfx.ts audioOut —
// same mute, same ducking). Until a slot's file is decoded — or when it has none — the
// callers fall back to their Web Audio synth, so a missing file is never silence.
import { readManifest, SOUND_SLOTS, type SoundKey, type SoundManifest } from "@/lib/soundSlots";
import type { SoundKind, Vec } from "@/lib/audio/spatial";
import { audioOut, isMuted } from "./sfx";
import { Emitter, place } from "./spatial";

let manifest: Promise<SoundManifest> | null = null;
const decoded = new Map<SoundKey, AudioBuffer[]>();
const loading = new Set<SoundKey>();

function getManifest() {
  // Asked again each visit (a cheap 304 when nothing changed): a list kept forever would
  // leave a phone on the old sounds — or none — after new recordings ship.
  manifest ??= fetch("/sounds/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then(readManifest)
    .catch(() => ({}));
  return manifest;
}

/** Fetch and decode a slot's files (once). */
async function load(key: SoundKey) {
  if (decoded.has(key) || loading.has(key)) return;
  // Taken before the wait: two callers at once mustn't both download the slot.
  loading.add(key);
  const all = (await getManifest())[key];
  const o = audioOut();
  if (!all?.length || !o) return void loading.delete(key);
  // Not every take on a phone's data: a loop needs one, a one-shot a few to vary (picked at random each visit).
  const files = [...all].sort(() => Math.random() - 0.5).slice(0, "loop" in SOUND_SLOTS[key] && SOUND_SLOTS[key].loop ? 1 : 3);
  const bufs = await Promise.all(
    files.map((f) =>
      fetch(`/sounds/${f}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => o.ctx.decodeAudioData(b))
        .catch(() => null),
    ),
  );
  loading.delete(key);
  const ok = bufs.filter((b): b is AudioBuffer => !!b);
  if (ok.length) decoded.set(key, ok);
}

/** Start loading these slots now (the 3D city calls it on open), so the first crash already sounds real. */
export function warmSamples(keys: SoundKey[]) {
  void getManifest().then((m) => keys.forEach((k) => m[k] && void load(k)));
}

/** A decoded take of this slot (a random one of its variations), or null (and it starts loading). */
function take(key: SoundKey): AudioBuffer | null {
  const b = decoded.get(key);
  if (!b) {
    void load(key);
    return null;
  }
  return b[Math.floor(Math.random() * b.length)];
}

/**
 * Play a slot once: `vol` 0…1 at the source, `at` where in the city (nothing: in the
 * player's own hands) — distance, direction and the time it takes to arrive are
 * spatial.ts's — `rate` (pitch and speed; a little random variation keeps repeats from
 * sounding canned), `after` seconds from now. False when it has no file (yet) — play the
 * synth instead.
 */
export function playSample(key: SoundKey, o: { vol: number; at?: Vec | null; kind?: SoundKind; rate?: number; after?: number }): boolean {
  const buf = take(key);
  if (!buf) return false;
  if (o.vol < 0.005) return true;
  const rate = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
  // Muted, asleep or out of earshot: "played" (the synth would be silent too).
  const p = place(o.at, o.kind ?? "small", buf.duration / rate + (o.after ?? 0));
  if (!p) return true;
  const src = p.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = p.ctx.createGain();
  g.gain.value = Math.min(1, o.vol);
  src.connect(g).connect(p.dest);
  src.onended = () => g.disconnect();
  src.start(p.t + (o.after ?? 0));
  return true;
}

/** Has this slot a decoded file right now? (Loops check before they replace a synth.) */
export const hasSample = (key: SoundKey) => !!take(key);

/**
 * A recorded loop (a siren, a fire, the city around you): `level(v)` every frame, 0 = off;
 * fades rather than clicks. `level` returns false while the slot has no file — keep the
 * synth. With a `kind` it has a place: pass where it is each frame (`level(v, at)`) and it
 * is heard from there, its pitch bending as it comes and goes.
 */
export class SampleLoop {
  private node: { src: AudioBufferSourceNode; gain: GainNode; into: AudioNode } | null = null;
  private emitter: Emitter | null;
  constructor(private key: SoundKey, private max = 0.6, kind?: SoundKind) {
    this.emitter = kind ? new Emitter(kind) : null;
  }
  level(v: number, at?: Vec | null): boolean {
    if (!this.node && v <= 0) return decoded.has(this.key);
    const buf = take(this.key);
    if (!buf) return false;
    const out = audioOut();
    if (!out) return true;
    const want = isMuted() ? 0 : Math.max(0, Math.min(1, v)) * this.max;
    const e = this.emitter && at ? this.emitter.at(at, 1) : null;
    if (!this.node) {
      if (want <= 0) return true;
      const src = out.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = out.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(e ? e.input : out.out);
      // Somewhere into the loop, so two of them don't start in step.
      src.start(0, Math.random() * buf.duration);
      this.node = { src, gain, into: e ? e.input : out.out };
    }
    // The emitter rebuilt its place in the mix (the player changed the sound output): follow it.
    if (e && e.input !== this.node.into) (this.node.gain.disconnect(), this.node.gain.connect(e.input), (this.node.into = e.input));
    this.node.gain.gain.setTargetAtTime(want, out.ctx.currentTime, 0.3);
    if (e) this.node.src.playbackRate.setTargetAtTime(e.rate, out.ctx.currentTime, 0.15);
    return true;
  }
  stop() {
    if (!this.node) return;
    try {
      this.node.src.stop();
    } catch {}
    this.node.gain.disconnect();
    this.node = null;
    this.emitter?.stop();
  }
}

/**
 * A sound held for as long as a button is: the recording's attack, then its steady middle
 * looped, then a short fade when let go — a horn honks as long as you lean on it, from a
 * tap's beep to a long blast. Always the same take for one player (`pick`), so your car
 * keeps its own voice. Returns the release, or null while the slot has no decoded file.
 */
export function holdSample(key: SoundKey, vol: number, pick = 0): (() => void) | null {
  const all = decoded.get(key);
  if (!all?.length) return void load(key), null;
  const out = audioOut();
  if (!out || isMuted()) return () => {};
  const buf = all[Math.abs(pick) % all.length];
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // The steady part: past the attack, before the tail (most horn takes ring off for the last fifth).
  src.loop = true;
  src.loopStart = Math.min(0.12, buf.duration * 0.2);
  src.loopEnd = Math.max(src.loopStart + 0.08, buf.duration * 0.78);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.min(1, vol), ctx.currentTime + 0.012);
  src.connect(g).connect(out.out);
  src.start();
  // A tap still sounds like a horn: at least this long.
  const t0 = ctx.currentTime, MIN = 0.16;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const at = Math.max(ctx.currentTime, t0 + MIN);
    g.gain.setValueAtTime(Math.min(1, vol), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.stop(at + 0.09);
    src.onended = () => g.disconnect();
  };
}
