"use client";
// Game sound effects, synthesized with the Web Audio API: no audio files to host,
// license or download, and every sound is a few lines of oscillators + noise.
// Browsers only allow audio after a user gesture, so the context is unlocked on the
// first tap. Mute is remembered per device.

export type Sfx =
  | "tap" | "shot" | "miss" | "hit" | "hurt" | "down" | "explode" | "nuke" | "siren" | "reward" | "coin"
  | "levelup" | "error" | "beep" | "go" | "cut" | "reload" | "capture" | "alarm" | "whoosh" | "win" | "lose" | "photo";

const KEY = "sq_muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let out: AudioNode | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

if (typeof window !== "undefined") {
  try {
    muted = localStorage.getItem(KEY) === "1";
  } catch {}
  const unlock = () => {
    audio()?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // A gentle compressor keeps explosions from clipping on phone speakers.
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    out = comp;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export const isMuted = () => muted;
/** Shared audio graph for the background music (same context, own volume). */
export function audioOut() {
  const a = audio();
  return a && out ? { ctx: a, out } : null;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l(m));
}
export function onMuteChange(l: (m: boolean) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ---------------------------------------------------------------- building blocks
function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; delay?: number; attack?: number } = {}) {
  const a = ctx!;
  const t = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, opts: { vol?: number; from?: number; to?: number; delay?: number; q?: number; type?: BiquadFilterType } = {}) {
  const a = ctx!;
  const t = a.currentTime + (opts.delay ?? 0);
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = opts.type ?? "lowpass";
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.from ?? 4000, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to ?? 200), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const arp = (notes: number[], step: number, type: OscillatorType = "triangle", vol = 0.25) => notes.forEach((n, i) => tone(n, step * 1.6, { type, vol, delay: i * step }));

// ---------------------------------------------------------------- the sounds
const SOUNDS: Record<Sfx, () => void> = {
  tap: () => tone(620, 0.05, { type: "triangle", vol: 0.12 }),
  shot: () => {
    noise(0.16, { vol: 0.7, from: 6000, to: 300 });
    tone(160, 0.12, { type: "square", vol: 0.18, to: 60 });
  },
  miss: () => noise(0.08, { vol: 0.25, from: 2500, to: 800, type: "bandpass", q: 2 }),
  hit: () => {
    tone(880, 0.07, { type: "square", vol: 0.15 });
    tone(1320, 0.09, { type: "triangle", vol: 0.15, delay: 0.03 });
  },
  hurt: () => {
    tone(220, 0.25, { type: "sawtooth", vol: 0.22, to: 90 });
    noise(0.12, { vol: 0.3, from: 1500, to: 300 });
  },
  down: () => {
    tone(330, 0.9, { type: "sawtooth", vol: 0.25, to: 50 });
    noise(0.6, { vol: 0.4, from: 900, to: 60, delay: 0.1 });
  },
  explode: () => {
    noise(1.1, { vol: 0.9, from: 2200, to: 40 });
    tone(90, 0.8, { type: "sine", vol: 0.5, to: 30 });
  },
  nuke: () => {
    noise(3.2, { vol: 1, from: 1800, to: 25 });
    tone(55, 2.6, { type: "sine", vol: 0.7, to: 22 });
    tone(110, 1.4, { type: "sawtooth", vol: 0.15, to: 30, delay: 0.1 });
  },
  siren: () => {
    for (let i = 0; i < 3; i++) {
      tone(520, 0.45, { type: "sawtooth", vol: 0.12, to: 880, delay: i * 0.9 });
      tone(880, 0.45, { type: "sawtooth", vol: 0.12, to: 520, delay: i * 0.9 + 0.45 });
    }
  },
  alarm: () => [0, 0.25, 0.5].forEach((d) => tone(740, 0.16, { type: "square", vol: 0.14, delay: d })),
  reward: () => arp([660, 880, 1320], 0.07),
  coin: () => {
    tone(988, 0.08, { type: "square", vol: 0.12 });
    tone(1319, 0.22, { type: "square", vol: 0.12, delay: 0.08 });
  },
  levelup: () => arp([523, 659, 784, 1047, 1319], 0.09, "square", 0.16),
  win: () => arp([523, 659, 784, 1047], 0.12, "triangle", 0.3),
  lose: () => arp([440, 349, 294, 220], 0.16, "triangle", 0.25),
  error: () => tone(180, 0.22, { type: "square", vol: 0.15, to: 120 }),
  beep: () => tone(660, 0.12, { type: "square", vol: 0.14 }),
  go: () => tone(1320, 0.35, { type: "square", vol: 0.16 }),
  cut: () => {
    noise(0.05, { vol: 0.5, from: 7000, to: 3000, type: "highpass" });
    tone(2400, 0.04, { type: "square", vol: 0.08 });
  },
  reload: () => {
    noise(0.05, { vol: 0.35, from: 3000, to: 1500, type: "bandpass", q: 4 });
    noise(0.06, { vol: 0.35, from: 2000, to: 900, type: "bandpass", q: 4, delay: 0.18 });
  },
  capture: () => arp([392, 523, 659, 784], 0.1, "sawtooth", 0.14),
  whoosh: () => noise(0.5, { vol: 0.35, from: 300, to: 3000, type: "bandpass", q: 1.5 }),
  photo: () => {
    noise(0.04, { vol: 0.4, from: 5000, to: 2000, type: "highpass" });
    noise(0.06, { vol: 0.3, from: 4000, to: 1500, type: "highpass", delay: 0.09 });
  },
};

const last: Partial<Record<Sfx, number>> = {};
/** Play a sound. Never throws; silently does nothing when muted or audio is blocked. */
export function sfx(name: Sfx) {
  if (muted) return;
  try {
    const a = audio();
    if (!a || a.state === "closed") return;
    // Avoid machine-gun stacking of the same sound within 40 ms.
    const now = performance.now();
    if (now - (last[name] ?? 0) < 40) return;
    last[name] = now;
    if (a.state === "suspended") a.resume().catch(() => {});
    SOUNDS[name]();
  } catch {}
}
