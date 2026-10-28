"use client";
// Game sound effects, synthesized with the Web Audio API: no audio files to host,
// license or download. Browsers only allow audio after a user gesture, so the context
// is unlocked on the first tap. Mute is remembered per device.
//
// Sound design, in short:
//  - one mix chain for everything: sfx + a small generated room reverb + the music bus
//    → sub-cut (phone speakers can't play it, it only eats headroom) → glue compressor
//    → soft-clip limiter, so loud moments get bigger without ever distorting
//  - every sound is layered like a recorded one: a transient (the click/crack you
//    localize), a body (the tone), and a tail (noise/reverb that gives it size)
//  - UI sounds are FM bells/marimbas tuned to one key (C major pentatonic), so stacked
//    notifications, coins and rewards sound like one instrument, never like test tones
//  - repeated sounds (shots, hits, taps) vary pitch and level a little on every play,
//    so a burst doesn't sound like a machine gun of identical samples
//  - big moments (explosions, level up, win/lose, incoming call) duck the music under them
//
// Android, where most players are:
//  - audio may only start inside a real user activation — for touch that's the finger
//    lifting (pointerup/touchend/click), not pointerdown — so that's where it unlocks;
//  - a sound asked for while audio is still locked or asleep plays when it wakes only if
//    it's the latest and still fresh, never queued: a queue of taps all fired at once
//    when audio wakes up is a burst of noise;
//  - weak phones get a bigger output buffer and a cheaper mix (a short echo instead of
//    convolution reverb, no oversampling): the audio thread underrunning while the page
//    re-renders after a tap is heard as crackle;
//  - the audio thread sleeps when nothing has played for a while and nothing holds it
//    awake (music, the drive engine — see keepAwake), and whenever the page is hidden.

export type Sfx =
  | "tap" | "shot" | "miss" | "hit" | "hurt" | "down" | "explode" | "nuke" | "siren" | "reward" | "coin" | "gem"
  | "levelup" | "error" | "beep" | "go" | "cut" | "reload" | "capture" | "alarm" | "whoosh" | "win" | "lose" | "photo" | "ring";

const KEY = "sq_muted";
/** Asleep after this long without a sound (when nothing holds audio awake). */
const IDLE_MS = 20_000;
let ctx: AudioContext | null = null;
let lastSound = 0;
const awake = new Set<string>();
let sfxBus: GainNode | null = null; // dry sfx
let verb: GainNode | null = null; // send into the room reverb
let musicBus: GainNode | null = null; // background music (ducked under big sounds)
let white: AudioBuffer | null = null;
let pink: AudioBuffer | null = null;
let brown: AudioBuffer | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

if (typeof window !== "undefined") {
  try {
    muted = localStorage.getItem(KEY) === "1";
  } catch {}
  // The events that count as a user activation (pointerdown only does for a mouse).
  const unlock = () => {
    if (muted && !awake.size) return;
    const a = audio();
    if (a && a.state !== "running" && !document.hidden) a.resume().catch(() => {});
  };
  for (const ev of ["pointerup", "touchend", "click", "keydown"]) window.addEventListener(ev, unlock, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else if (awake.size) void ctx.resume().catch(() => {});
  });
  setInterval(() => {
    if (ctx?.state === "running" && !awake.size && performance.now() - lastSound > IDLE_MS) void ctx.suspend().catch(() => {});
  }, 5000);
}

/** Android, or a phone the game already runs lite (see components/perf). */
const weakAudio = () => {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number };
  return /Android/i.test(navigator.userAgent) || (n.deviceMemory != null && n.deviceMemory <= 4) || (n.hardwareConcurrency != null && n.hardwareConcurrency <= 4);
};

/**
 * Something that makes sound on its own schedule (music, the drive engine) keeps the
 * audio thread from sleeping while `on`.
 */
export function keepAwake(key: string, on: boolean) {
  if (on) awake.add(key);
  else awake.delete(key);
  if (on && ctx && ctx.state === "suspended" && !document.hidden) void ctx.resume().catch(() => {});
}

function noiseBuffer(a: BaseAudioContext, seconds: number, color: "white" | "pink" | "brown") {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "white") d[i] = w;
    else if (color === "pink") {
      // Paul Kellet's economy pink filter: softer, more natural than white noise.
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * w) / 1.02; // brown: rumble
      d[i] = last * 3.5;
    }
  }
  return buf;
}

/** A short, dark stereo room: decaying noise, a little denser at the start. */
function impulse(a: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(a.sampleRate * seconds);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.35 * (Math.random() * 2 - 1 - lp); // roll off the fizz
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

/** Soft clip: transparent at normal levels, rounds off peaks instead of cracking. */
function softClip(a: BaseAudioContext, cheap: boolean) {
  const ws = a.createWaveShaper();
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.4 * x) / Math.tanh(1.4);
  }
  ws.curve = curve;
  ws.oversample = cheap ? "none" : "2x";
  return ws;
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    // Not before the player's first tap: the page is busiest while it loads, and an audio
    // thread started then underruns (crackles) on budget phones for its first minutes.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return null;
    const cheap = weakAudio();
    let a: AudioContext;
    try {
      // A bigger buffer on weak phones: a little later, never crackling.
      a = new AC({ latencyHint: cheap ? "playback" : "interactive" });
    } catch {
      a = new AC();
    }
    ctx = a;
    build(a, cheap);
    // Music (music.ts) waits for this to start.
    queueMicrotask(() => window.dispatchEvent(new Event("sq-audio-ready")));
  }
  return ctx;
}

/** The mix chain, on `a`. `cheap`: echo instead of convolution, no oversampling. */
function build(a: BaseAudioContext, cheap: boolean) {
  {
    // Master: everything meets here, then sub-cut → glue compressor → limiter.
    const mix = a.createGain();
    mix.gain.value = 0.8;
    const hp = a.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 38;
    hp.Q.value = 0.7;
    const glue = a.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 12;
    glue.ratio.value = 3.5;
    glue.attack.value = 0.004;
    glue.release.value = 0.18;
    const ceiling = a.createGain();
    ceiling.gain.value = 0.9;
    mix.connect(hp).connect(glue).connect(softClip(a, cheap)).connect(ceiling).connect(a.destination);

    sfxBus = a.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(mix);
    // Room reverb on a send: gives sounds a space to live in instead of a dry, boxy beep.
    // Weak phones: two short darkened echoes — most of the space, a fraction of the work.
    const ret = a.createGain();
    const warm = a.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = cheap ? 2800 : 5200;
    verb = a.createGain();
    if (cheap) {
      ret.gain.value = 0.35;
      const d1 = a.createDelay(0.2), d2 = a.createDelay(0.2), fb = a.createGain();
      d1.delayTime.value = 0.047;
      d2.delayTime.value = 0.089;
      fb.gain.value = 0.32;
      verb.connect(warm);
      warm.connect(d1).connect(ret);
      warm.connect(d2).connect(fb).connect(d2);
      d2.connect(ret);
      ret.connect(mix);
    } else {
      ret.gain.value = 0.55;
      const conv = a.createConvolver();
      conv.buffer = impulse(a, 1.6, 3.2);
      verb.connect(conv).connect(warm).connect(ret).connect(mix);
    }

    musicBus = a.createGain();
    musicBus.connect(mix);

    // Short loops (long sounds loop them): less to compute on the first tap.
    white = noiseBuffer(a, 1, "white");
    pink = noiseBuffer(a, 1, "pink");
    brown = noiseBuffer(a, 2, "brown");
  }
}

export const isMuted = () => muted;
/**
 * Shared audio graph for sounds made outside this file — music, guns, the drive engine and
 * horn (same context, own bus, ducked under big sounds). Asking for it counts as making a
 * sound: it keeps the audio thread from falling asleep mid-fight and wakes it if it has.
 */
export function audioOut() {
  const a = audio();
  if (!a || !musicBus) return null;
  lastSound = performance.now();
  if (a.state === "suspended" && !document.hidden && (!muted || awake.size)) void a.resume().catch(() => {});
  return { ctx: a, out: musicBus as AudioNode };
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
type Out = { pan?: number; wet?: number; delay?: number };
const now = (delay = 0) => ctx!.currentTime + delay;
/** Small random spread, so repeats never sound identical. */
const vary = (x: number, amount = 0.04) => x * (1 + (Math.random() * 2 - 1) * amount);

/** Route a voice to the dry bus (panned) and the reverb send. */
function route(node: AudioNode, o: Out) {
  const a = ctx!;
  let last: AudioNode = node;
  if (o.pan && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    last = node.connect(p);
  }
  last.connect(sfxBus!);
  if (o.wet) {
    const s = a.createGain();
    s.gain.value = o.wet;
    last.connect(s).connect(verb!);
  }
}

/** Attack (linear), then exponential decay to silence — how real struck/plucked things fade. */
function envelope(g: GainNode, t: number, vol: number, attack: number, dur: number, hold = 0) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  if (hold) g.gain.setValueAtTime(vol, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

type ToneOpts = Out & {
  type?: OscillatorType; vol?: number; to?: number; glide?: number; attack?: number; hold?: number;
  /** Detuned copies (cents) layered for width. */
  unison?: number[];
  /** Lowpass: start → end frequency over the sound (brass/synth "wah"). */
  lp?: [number, number]; q?: number;
  vibrato?: number;
};
function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const a = ctx!;
  const t = now(o.delay);
  const g = a.createGain();
  envelope(g, t, o.vol ?? 0.3, o.attack ?? 0.004, dur, o.hold);
  let head: AudioNode = g;
  if (o.lp) {
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.lp[0], t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp[1]), t + dur);
    f.connect(g);
    head = f;
  }
  const cents = o.unison ?? [0];
  // Vibrato (Hz of wobble) that eases in, like a held sung note.
  let vib: GainNode | null = null;
  if (o.vibrato) {
    const lfo = a.createOscillator();
    lfo.frequency.value = 5.5;
    vib = a.createGain();
    vib.gain.setValueAtTime(0, t);
    vib.gain.linearRampToValueAtTime(o.vibrato, t + dur * 0.5);
    lfo.connect(vib);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  for (const c of cents) {
    const osc = a.createOscillator();
    osc.type = o.type ?? "sine";
    osc.detune.value = c;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.glide ?? dur));
    vib?.connect(osc.frequency);
    const lvl = a.createGain();
    lvl.gain.value = 1 / Math.sqrt(cents.length);
    osc.connect(lvl).connect(head);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  route(g, o);
}

/** FM bell / marimba / chime: a sine carrier whose brightness (modulation) dies away faster than its level. */
function bell(freq: number, dur: number, o: Out & { vol?: number; ratio?: number; index?: number; attack?: number } = {}) {
  const a = ctx!;
  const t = now(o.delay);
  const car = a.createOscillator();
  const mod = a.createOscillator();
  const modGain = a.createGain();
  const g = a.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * (o.ratio ?? 3.5);
  const idx = freq * (o.index ?? 2.2);
  modGain.gain.setValueAtTime(idx, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.02), t + dur * 0.6);
  mod.connect(modGain).connect(car.frequency);
  envelope(g, t, o.vol ?? 0.22, o.attack ?? 0.002, dur);
  car.connect(g);
  route(g, { wet: 0.25, ...o });
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

type NoiseOpts = Out & {
  vol?: number; color?: "white" | "pink" | "brown"; type?: BiquadFilterType;
  from?: number; to?: number; q?: number; attack?: number; hold?: number;
  /** Pan from `pan` to this over the sound (fly-bys). */
  panTo?: number;
};
function noise(dur: number, o: NoiseOpts = {}) {
  const a = ctx!;
  const t = now(o.delay);
  const src = a.createBufferSource();
  const buf = o.color === "brown" ? brown! : o.color === "pink" ? pink! : white!;
  src.buffer = buf;
  src.loop = dur > buf.duration - 0.1;
  const f = a.createBiquadFilter();
  f.type = o.type ?? "lowpass";
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.from ?? 4000, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to ?? o.from ?? 4000), t + dur);
  const g = a.createGain();
  envelope(g, t, o.vol ?? 0.4, o.attack ?? 0.002, dur, o.hold);
  src.connect(f).connect(g);
  if (o.panTo !== undefined && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.setValueAtTime(o.pan ?? 0, t);
    p.pan.linearRampToValueAtTime(o.panTo, t + dur);
    g.connect(p);
    route(p, { ...o, pan: 0 });
  } else route(g, o);
  // Start somewhere random in the buffer: two layers of the same noise never phase.
  src.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.05));
  src.stop(t + dur + 0.05);
}

/** Sub-heavy thump: a sine falling fast in pitch (kick drum / body of an impact). */
const thump = (from: number, to: number, dur: number, vol: number, o: Out = {}) => tone(from, dur, { vol, to, glide: dur * 0.5, ...o });
/** A very short bright click: the transient you hear first. */
const click = (vol: number, o: Out & { freq?: number } = {}) => noise(0.018, { vol, type: "highpass", from: o.freq ?? 5000, ...o });

/** Push the music down under a big moment, then bring it back. */
function duck(depth: number, hold: number) {
  if (!musicBus) return;
  const t = now();
  const g = musicBus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(depth, t + 0.04);
  g.setValueAtTime(depth, t + hold);
  g.linearRampToValueAtTime(1, t + hold + 0.9);
}

// Notes (Hz), C major pentatonic plus the odd neighbour.
const N = { G3: 196, C4: 261.6, E4: 329.6, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568, B6: 1975.5, C7: 2093 };
const BRASS = [-9, 0, 8];

// ---------------------------------------------------------------- the sounds
const SOUNDS: Record<Sfx, () => void> = {
  // Soft, woody UI tick — felt more than heard.
  tap: () => {
    bell(vary(N.C6, 0.02), 0.07, { vol: 0.07, ratio: 2, index: 0.8, wet: 0 });
    click(0.05, { freq: 6500 });
  },

  shot: () => {
    const p = vary(1, 0.06);
    click(0.55, { freq: 7000 });
    noise(0.12, { vol: vary(0.55, 0.1), color: "white", type: "bandpass", from: 2400 * p, to: 500, q: 0.9 });
    thump(150 * p, 45, 0.16, 0.5);
    noise(0.45, { vol: 0.12, color: "pink", from: 1800, to: 200, delay: 0.02, wet: 0.6 }); // the street echo
  },
  // Bullet fly-by: a quick bandpassed zip across the stereo field.
  miss: () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    noise(0.14, { vol: 0.3, type: "bandpass", from: vary(4200), to: 900, q: 3, pan: -0.7 * side, panTo: 0.7 * side, attack: 0.02 });
  },
  // Landed a hit: a tight punch + a bright metallic confirm, so it reads as "yes!".
  hit: () => {
    thump(vary(240), 70, 0.09, 0.4);
    noise(0.05, { vol: 0.35, type: "bandpass", from: 2600, to: 1400, q: 1.4 });
    bell(vary(N.E6, 0.015), 0.16, { vol: 0.09, ratio: 3.01, index: 1.5, delay: 0.015 });
  },
  hurt: () => {
    thump(vary(130), 45, 0.22, 0.55);
    noise(0.16, { vol: 0.35, color: "pink", from: 1400, to: 180 });
    tone(vary(196), 0.26, { type: "sawtooth", vol: 0.1, to: 98, unison: [-14, 14], lp: [900, 160] });
  },
  // Knocked out: everything slumps — a falling, filtered chord with a heavy landing.
  down: () => {
    duck(0.35, 1);
    tone(N.E4, 1.1, { type: "sawtooth", vol: 0.16, to: 70, unison: BRASS, lp: [1600, 120], wet: 0.4 });
    tone(N.C4, 1.1, { type: "sawtooth", vol: 0.12, to: 55, unison: BRASS, lp: [1400, 100], wet: 0.4 });
    thump(110, 30, 0.6, 0.6, { delay: 0.12 });
    noise(0.9, { vol: 0.3, color: "brown", from: 700, to: 60, delay: 0.12, wet: 0.5 });
  },

  // Explosion = crack (transient) + fireball (pink, closing filter) + sub kick + rumble tail.
  explode: () => {
    duck(0.3, 0.9);
    click(0.7, { freq: 3000 });
    noise(1.2, { vol: 0.8, color: "pink", from: 3200, to: 160, wet: 0.35 });
    thump(vary(85), 28, 1.0, 0.85);
    noise(2.2, { vol: 0.6, color: "brown", from: 500, to: 50, delay: 0.05, wet: 0.6 });
    noise(0.5, { vol: 0.12, type: "highpass", from: 3000, to: 6000, delay: 0.25, pan: 0.4, wet: 0.5 }); // debris
  },
  nuke: () => {
    duck(0.15, 3);
    noise(0.25, { vol: 0.5, type: "highpass", from: 2500, to: 1200, wet: 0.8 }); // the flash
    thump(60, 18, 3.6, 0.95);
    noise(4, { vol: 0.85, color: "brown", from: 900, to: 35, attack: 0.15, wet: 0.7 });
    noise(3, { vol: 0.45, color: "pink", from: 2400, to: 90, attack: 0.3, delay: 0.1, wet: 0.6 }); // the shock wave rolling in
    tone(55, 3, { type: "sawtooth", vol: 0.08, to: 30, unison: BRASS, lp: [400, 60], delay: 0.2 });
  },

  // Air-raid siren: two detuned horns rising and falling, in a big space.
  siren: () => {
    duck(0.4, 2.6);
    for (let i = 0; i < 3; i++) {
      const d = i * 0.9;
      tone(470, 0.5, { type: "sawtooth", vol: 0.1, to: 830, glide: 0.42, attack: 0.06, hold: 0.3, unison: [-12, 12], lp: [2200, 1600], delay: d, wet: 0.45 });
      tone(830, 0.45, { type: "sawtooth", vol: 0.1, to: 470, attack: 0.02, hold: 0.25, unison: [-12, 12], lp: [2200, 1400], delay: d + 0.45, wet: 0.45 });
    }
  },
  // Urgent but not grating: three rounded pulses.
  alarm: () =>
    [0, 0.22, 0.44].forEach((d) => {
      tone(N.A5, 0.15, { type: "square", vol: 0.07, lp: [2400, 1800], delay: d, wet: 0.2 });
      bell(N.A5, 0.18, { vol: 0.08, ratio: 2, index: 1, delay: d, wet: 0.2 });
    }),

  // Rewards: bright chimes, rising — the "something good" family.
  reward: () => {
    [N.C6, N.E6, N.G6].forEach((f, i) => bell(f, 0.6, { vol: 0.14, ratio: 3.5, index: 1.6, delay: i * 0.065, pan: (i - 1) * 0.3, wet: 0.35 }));
    noise(0.5, { vol: 0.05, type: "highpass", from: 7000, to: 9000, delay: 0.12, wet: 0.5 }); // sparkle
  },
  coin: () => {
    const p = vary(1, 0.015);
    bell(N.B5 * p, 0.09, { vol: 0.13, ratio: 3.5, index: 1.4, wet: 0.15 });
    bell(N.E6 * p, 0.45, { vol: 0.15, ratio: 3.5, index: 1.8, delay: 0.075, wet: 0.3 });
  },
  // Glassier and higher than a coin: a gem landing.
  gem: () => {
    const p = vary(1, 0.02);
    bell(N.E6 * p, 0.12, { vol: 0.1, ratio: 5.4, index: 1.1, wet: 0.3 });
    bell(N.B6 * p, 0.6, { vol: 0.11, ratio: 5.4, index: 1.3, delay: 0.06, wet: 0.5 });
  },
  levelup: () => {
    duck(0.35, 1.4);
    [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => {
      bell(f, 0.5, { vol: 0.12, ratio: 2, index: 1.2, delay: i * 0.075, pan: (i - 2) * 0.2 });
      tone(f, 0.25, { type: "triangle", vol: 0.06, delay: i * 0.075 });
    });
    // ...landing on a warm, opening chord.
    [N.C5, N.E5, N.G5, N.C6].forEach((f) => tone(f, 1.4, { type: "sawtooth", vol: 0.05, unison: BRASS, lp: [600, 4000], attack: 0.08, delay: 0.38, wet: 0.5 }));
    bell(N.G6, 1.2, { vol: 0.1, ratio: 3.5, index: 1.5, delay: 0.4, wet: 0.6 });
    noise(0.9, { vol: 0.05, type: "highpass", from: 6000, to: 10000, delay: 0.4, wet: 0.7 });
  },
  // Victory fanfare: brass-like (detuned saws through an opening filter).
  win: () => {
    duck(0.3, 1.6);
    const brass = (f: number, d: number, len: number, vol = 0.09) => tone(f, len, { type: "sawtooth", vol, unison: BRASS, lp: [700, 3800], attack: 0.03, hold: len * 0.4, delay: d, wet: 0.35 });
    brass(N.G4, 0, 0.16);
    brass(N.C5, 0.14, 0.16);
    brass(N.E5, 0.28, 0.16);
    [N.C5, N.E5, N.G5].forEach((f) => brass(f, 0.44, 1.2, 0.08));
    thump(120, 50, 0.3, 0.35, { delay: 0.44 });
    bell(N.C7, 1, { vol: 0.07, ratio: 3.5, index: 1.2, delay: 0.46, wet: 0.6 });
  },
  // Defeat: a slow, falling, slightly sad line — disappointing, never annoying.
  lose: () => {
    duck(0.35, 1.6);
    [N.G4, 370, N.E4 * 1.06, N.E4].forEach((f, i) =>
      tone(f, i === 3 ? 1.1 : 0.32, { type: "triangle", vol: 0.16, lp: [1800, 700], attack: 0.02, hold: i === 3 ? 0.4 : 0.12, delay: i * 0.3, vibrato: i === 3 ? 6 : 0, wet: 0.35 }),
    );
    tone(N.C4 / 2, 1.2, { type: "sine", vol: 0.15, attack: 0.05, delay: 0.9 });
  },
  // Gentle "nope": two low, rounded knocks — clear without being harsh.
  error: () => {
    tone(N.E4, 0.11, { type: "square", vol: 0.07, lp: [900, 500] });
    bell(N.E4, 0.14, { vol: 0.12, ratio: 1, index: 0.6 });
    tone(311, 0.16, { type: "square", vol: 0.07, lp: [800, 400], delay: 0.11 });
    bell(311, 0.2, { vol: 0.12, ratio: 1, index: 0.6, delay: 0.11 });
  },
  // Notification: a soft two-note marimba "ding-ding".
  beep: () => {
    bell(N.G5, 0.35, { vol: 0.14, ratio: 4, index: 0.9, wet: 0.2 });
    bell(N.D6, 0.55, { vol: 0.14, ratio: 4, index: 0.9, delay: 0.11, wet: 0.3 });
  },
  // Incoming call (repeats every 2 s): a friendly marimba phrase, like a phone's ringtone.
  ring: () => {
    duck(0.25, 1.4);
    [N.E5, N.G5, N.C6, N.G5, N.E6, N.D6].forEach((f, i) => bell(f, 0.4, { vol: 0.16, ratio: 4, index: 1.1, delay: i * 0.14, pan: i % 2 ? 0.15 : -0.15, wet: 0.2 }));
  },
  // "Go!": a bright stab with a punch under it.
  go: () => {
    thump(160, 60, 0.18, 0.4);
    [N.C6, N.G6].forEach((f) => bell(f, 0.5, { vol: 0.13, ratio: 2, index: 1.6, wet: 0.35 }));
    tone(N.C5, 0.3, { type: "sawtooth", vol: 0.06, unison: BRASS, lp: [3000, 900] });
  },
  // Wire cut: a sharp snip with a metallic ring.
  cut: () => {
    click(0.4, { freq: 6000 });
    noise(0.04, { vol: 0.3, type: "bandpass", from: 4200, to: 2600, q: 5 });
    bell(vary(3200, 0.03), 0.12, { vol: 0.05, ratio: 1.41, index: 2, wet: 0.2 });
  },
  // Magazine out → slide → magazine in, with a chunky final latch.
  reload: () => {
    noise(0.03, { vol: 0.3, type: "bandpass", from: 2800, to: 2000, q: 6 });
    thump(260, 160, 0.04, 0.15);
    noise(0.09, { vol: 0.12, type: "bandpass", from: 1400, to: 3200, q: 3, delay: 0.07 });
    noise(0.035, { vol: 0.45, type: "bandpass", from: 3400, to: 2200, q: 5, delay: 0.19 });
    thump(220, 120, 0.06, 0.3, { delay: 0.19 });
  },
  // Flag taken: a triumphant rising call ending on a bell.
  capture: () => {
    duck(0.4, 0.9);
    [N.G4, N.C5, N.E5, N.G5].forEach((f, i) =>
      tone(f, i === 3 ? 0.8 : 0.16, { type: "sawtooth", vol: 0.08, unison: BRASS, lp: [800, 3500], attack: 0.02, delay: i * 0.1, wet: 0.35 }),
    );
    bell(N.G6, 0.9, { vol: 0.1, ratio: 3.5, index: 1.4, delay: 0.3, wet: 0.5 });
  },
  whoosh: () => noise(0.55, { vol: 0.4, color: "pink", type: "bandpass", from: 350, to: 2600, q: 1.2, attack: 0.2, pan: -0.6, panTo: 0.6, wet: 0.25 }),
  // Camera shutter: two mechanical clicks with a little body.
  photo: () => {
    click(0.35, { freq: 4500 });
    noise(0.03, { vol: 0.3, type: "bandpass", from: 2200, to: 1500, q: 3 });
    click(0.28, { freq: 5000, delay: 0.085 });
    noise(0.04, { vol: 0.22, type: "bandpass", from: 1800, to: 1100, q: 3, delay: 0.085 });
    thump(180, 120, 0.05, 0.12, { delay: 0.085 });
  },
};

const last: Partial<Record<Sfx, number>> = {};
/**
 * A sound asked for while audio is asleep plays when it wakes, if it's still this fresh.
 * Waking takes a few hundred ms on many Android phones: with less, the first sound after
 * a quiet spell (the next coin, the next shot) was always lost.
 */
const WAKE_MS = 700;
/** Only the latest sound asked for while waking: never a backlog that all fires at once. */
let waiting: { name: Sfx; at: number } | null = null;
let waking = false;

/** Play a sound. Never throws; silently does nothing when muted or audio is blocked. */
export function sfx(name: Sfx) {
  if (muted) return;
  try {
    const a = audio();
    if (!a || a.state === "closed") return;
    // Avoid machine-gun stacking of the same sound within 40 ms.
    const t = performance.now();
    if (t - (last[name] ?? 0) < 40) return;
    last[name] = t;
    lastSound = t;
    if (a.state !== "running") {
      // Locked (no tap yet) or asleep: wake it, and play the latest sound once it's up.
      if (waiting) stats.dropped++;
      waiting = { name, at: t };
      if (waking) return;
      waking = true;
      a.resume()
        .catch(() => {})
        .finally(() => {
          waking = false;
          const w = waiting;
          waiting = null;
          if (!w) return;
          if (a.state === "running" && !muted && performance.now() - w.at < WAKE_MS) (SOUNDS[w.name](), stats.played++);
          else stats.dropped++;
        });
      return;
    }
    SOUNDS[name]();
    stats.played++;
  } catch {}
}

const stats = { played: 0, dropped: 0 };

/**
 * Tests only (dev builds): render one sound through the real mix chain offline and
 * report its peak and the level left at the end — clipping or a tail that never dies
 * is what players hear as noise.
 */
async function renderTest(name: Sfx, cheap: boolean) {
  const off = new OfflineAudioContext(2, 48000 * 3, 48000);
  const saved = { ctx, sfxBus, verb, musicBus, white, pink, brown };
  ctx = off as unknown as AudioContext;
  build(off, cheap);
  try {
    SOUNDS[name]();
  } finally {
    ({ ctx, sfxBus, verb, musicBus, white, pink, brown } = saved);
  }
  const buf = await off.startRendering();
  let peak = 0, tail = 0, bad = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (!Number.isFinite(v)) bad++;
      else if (v > peak) peak = v;
      if (i > d.length - 4800) tail = Math.max(tail, v);
    }
  }
  return { peak, tail, bad };
}
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  (window as unknown as { __sfx?: unknown }).__sfx = { stats, state: () => ctx?.state ?? "none", latency: () => ctx?.baseLatency ?? null, render: renderTest, names: () => Object.keys(SOUNDS), awake: () => [...awake], cheap: weakAudio, play: sfx,
    /** Hold audio locked (as before the first tap on a phone) until the returned release is called. */
    lock: async () => {
      const a = ctx!, real = a.resume.bind(a);
      let release = () => {};
      const gate = new Promise<void>((r) => (release = r));
      await a.suspend();
      a.resume = () => gate.then(() => real());
      return () => ((a.resume = real), release());
    } };
