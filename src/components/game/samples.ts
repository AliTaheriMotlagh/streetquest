"use client";
// Recorded sounds (lib/soundSlots.ts): public/sounds/manifest.json says which slots have
// files; they're fetched and decoded once, in the background, the first time the 3D city
// asks (warmSamples), and played through the game's shared audio graph (sfx.ts audioOut —
// same mute, same ducking). Until a slot's file is decoded — or when it has none — the
// callers fall back to their Web Audio synth, so a missing file is never silence.
import { readManifest, type SoundKey, type SoundManifest } from "@/lib/soundSlots";
import { audioOut, isMuted } from "./sfx";

let manifest: Promise<SoundManifest> | null = null;
const decoded = new Map<SoundKey, AudioBuffer[]>();
const loading = new Set<SoundKey>();
let live = 0;
/** Recorded one-shots at once (phones crackle past this). */
const MAX_VOICES = 12;

function getManifest() {
  manifest ??= fetch("/sounds/manifest.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then(readManifest)
    .catch(() => ({}));
  return manifest;
}

/** Fetch and decode a slot's files (once). */
async function load(key: SoundKey) {
  if (decoded.has(key) || loading.has(key)) return;
  const files = (await getManifest())[key];
  const o = audioOut();
  if (!files?.length || !o) return;
  loading.add(key);
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
 * Play a slot once: `vol` 0…1, `pan` −1…1, `rate` (pitch and speed; a little random
 * variation keeps repeats from sounding canned). False when it has no file (yet) — play
 * the synth instead.
 */
export function playSample(key: SoundKey, o: { vol: number; pan?: number; rate?: number }): boolean {
  const buf = take(key);
  if (!buf) return false;
  const out = audioOut();
  // Muted or asleep: "played" (the synth would be silent too).
  if (!out || isMuted() || out.ctx.state !== "running" || o.vol < 0.005) return true;
  if (live >= MAX_VOICES) return true;
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, o.vol);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
  src.connect(g).connect(p).connect(out.out);
  live++;
  src.onended = () => {
    live--;
    p.disconnect();
  };
  src.start();
  return true;
}

/** Has this slot a decoded file right now? (Loops check before they replace a synth.) */
export const hasSample = (key: SoundKey) => !!take(key);

/**
 * A recorded loop (a siren, a fire, the city around you): `level(v)` every frame, 0 = off;
 * fades rather than clicks. `level` returns false while the slot has no file — keep the synth.
 */
export class SampleLoop {
  private node: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  constructor(private key: SoundKey, private max = 0.6) {}
  level(v: number): boolean {
    if (!this.node && v <= 0) return decoded.has(this.key);
    const buf = take(this.key);
    if (!buf) return false;
    const out = audioOut();
    if (!out) return true;
    const want = isMuted() ? 0 : Math.max(0, Math.min(1, v)) * this.max;
    if (!this.node) {
      if (want <= 0) return true;
      const src = out.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = out.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(out.out);
      // Somewhere into the loop, so two of them don't start in step.
      src.start(0, Math.random() * buf.duration);
      this.node = { src, gain };
    }
    this.node.gain.gain.setTargetAtTime(want, out.ctx.currentTime, 0.3);
    return true;
  }
  stop() {
    if (!this.node) return;
    try {
      this.node.src.stop();
    } catch {}
    this.node.gain.disconnect();
    this.node = null;
  }
}
