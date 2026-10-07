"use client";
// Background music, generated live with Web Audio: soft pads, a quiet bass and
// sparse music-box notes with an echo. It never repeats exactly, costs no
// download, and sits far below the sound effects. Day/night change the mood.
// Off when muted, when the tab is hidden, or when the player turns music off.
import { audioOut, isMuted, onMuteChange } from "./sfx";

export type Mood = "day" | "night" | "off";

const KEY_ON = "sq_music";
const KEY_VOL = "sq_music_vol";
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Chords as MIDI notes [bass, ...pad]. Day: F major, I–V–vi–IV. Night: D minor, i–VI–III–VII.
const PROGS: Record<Exclude<Mood, "off">, { chords: number[][]; scale: number[]; bpm: number }> = {
  day: { chords: [[41, 65, 69, 72], [36, 64, 67, 72], [38, 62, 65, 69], [34, 62, 65, 70]], scale: [72, 74, 76, 77, 79, 81, 84, 86], bpm: 76 },
  night: { chords: [[38, 62, 65, 69], [34, 62, 65, 70], [41, 65, 69, 72], [36, 64, 67, 72]], scale: [74, 77, 79, 81, 84, 86], bpm: 64 },
};

let on = true;
let volume = 0.35;
let mood: Mood = "day";
let bus: GainNode | null = null;
let echo: { input: GainNode } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBeat = 0;
let beat = 0;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    on = localStorage.getItem(KEY_ON) !== "0";
    const v = Number(localStorage.getItem(KEY_VOL));
    if (localStorage.getItem(KEY_VOL) != null && Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
  } catch {}
}

export const musicOn = () => on;
export const musicVolume = () => volume;
export function onMusicChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function setMusicOn(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY_ON, v ? "1" : "0");
  } catch {}
  refresh();
  listeners.forEach((l) => l());
}
export function setMusicVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(KEY_VOL, String(volume));
  } catch {}
  refresh();
  listeners.forEach((l) => l());
}
export function setMusicMood(m: Mood) {
  if (m === mood) return;
  mood = m;
  refresh();
}

function graph() {
  const a = audioOut();
  if (!a) return null;
  if (!bus) {
    bus = a.ctx.createGain();
    bus.gain.value = 0;
    // Gentle low-pass keeps everything warm and out of the way of effects.
    const lp = a.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    bus.connect(lp).connect(a.out);
    // Feedback echo for the music-box notes.
    const input = a.ctx.createGain();
    const delay = a.ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = a.ctx.createGain();
    fb.gain.value = 0.38;
    const wet = a.ctx.createGain();
    wet.gain.value = 0.45;
    input.connect(delay).connect(fb).connect(delay);
    delay.connect(wet).connect(bus);
    input.connect(bus);
    echo = { input };
  }
  return { ctx: a.ctx, bus, echo: echo! };
}

let ducked = 0;
/** Silence the music while something else plays sound (a video ad). Call again with false to restore. */
export function duckMusic(d: boolean) {
  ducked = Math.max(0, ducked + (d ? 1 : -1));
  refresh();
}
const target = () => (on && !ducked && !isMuted() && mood !== "off" && typeof document !== "undefined" && !document.hidden ? volume * 0.32 : 0);

function refresh() {
  const g = graph();
  if (!g) return;
  const t = g.ctx.currentTime;
  const v = target();
  g.bus.gain.cancelScheduledValues(t);
  g.bus.gain.setValueAtTime(g.bus.gain.value, t);
  g.bus.gain.linearRampToValueAtTime(v, t + (v ? 4 : 1.2));
  if (v && !timer) {
    nextBeat = Math.max(nextBeat, t + 0.2);
    timer = setInterval(schedule, 250);
  } else if (!v && timer) {
    setTimeout(() => {
      if (!target() && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 1500);
  }
}

function voice(freq: number, start: number, dur: number, opts: { type: OscillatorType; vol: number; attack: number; release: number; detune?: number; dest?: AudioNode }) {
  const g = graph()!;
  const o = g.ctx.createOscillator();
  const env = g.ctx.createGain();
  o.type = opts.type;
  o.frequency.value = freq;
  o.detune.value = opts.detune ?? 0;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(opts.vol, start + opts.attack);
  env.gain.setValueAtTime(opts.vol, start + Math.max(opts.attack, dur - opts.release));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(env).connect(opts.dest ?? g.bus);
  o.start(start);
  o.stop(start + dur + 0.1);
}

function pluck(freq: number, start: number, vol: number) {
  const g = graph()!;
  for (const [mult, v] of [[1, 1], [2, 0.25], [3, 0.08]] as const) {
    const o = g.ctx.createOscillator();
    const env = g.ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(vol * v, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 1.6 / mult);
    o.connect(env).connect(g.echo.input);
    o.start(start);
    o.stop(start + 1.8);
  }
}

function schedule() {
  const g = graph();
  if (!g || g.ctx.state !== "running" || mood === "off") return;
  const p = PROGS[mood];
  const spb = 60 / p.bpm;
  if (nextBeat < g.ctx.currentTime - 0.5) nextBeat = g.ctx.currentTime + 0.1; // resumed after a pause
  const beatsPerChord = 8;
  while (nextBeat < g.ctx.currentTime + 1.2) {
    const chord = p.chords[Math.floor(beat / beatsPerChord) % p.chords.length];
    const t = nextBeat;
    if (beat % beatsPerChord === 0) {
      const dur = spb * beatsPerChord + 1.5;
      voice(midi(chord[0]), t, dur, { type: "sine", vol: 0.16, attack: 0.8, release: 1.5 });
      for (const n of chord.slice(1)) {
        voice(midi(n - 12), t, dur, { type: "triangle", vol: 0.045, attack: 1.6, release: 2, detune: -6 });
        voice(midi(n - 12), t, dur, { type: "sine", vol: 0.05, attack: 1.8, release: 2, detune: 7 });
      }
    }
    // Sparse music box: chord tones and the scale, more likely on strong beats.
    const chance = beat % 2 === 0 ? 0.5 : 0.22;
    if (Math.random() < chance) {
      const pool = Math.random() < 0.6 ? chord.slice(1).map((n) => n + 12) : p.scale;
      pluck(midi(pool[Math.floor(Math.random() * pool.length)]), t + (Math.random() < 0.3 ? spb / 2 : 0), 0.05);
    }
    nextBeat += spb;
    beat++;
  }
}

/** Call once from the game. Starts on the first tap (browsers block audio before). */
export function startMusic() {
  if (typeof window === "undefined") return () => {};
  const kick = () => setTimeout(refresh, 50);
  const onVis = () => refresh();
  window.addEventListener("pointerdown", kick, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  const offMute = onMuteChange(() => refresh());
  refresh();
  return () => {
    window.removeEventListener("pointerdown", kick);
    document.removeEventListener("visibilitychange", onVis);
    offMute();
    mood = "off";
    refresh();
  };
}
