// How a sound in the 3D city reaches the player's ears: how loud at a distance, how dull
// (air eats the highs first), how late (sound is slow), how much room it carries, where it
// sits around the head, and which sounds get a voice when too many play at once. Pure (no
// Web Audio, no DOM) — components/game/spatial.ts turns these numbers into audio nodes,
// tests drive them directly.
//
// The rules are the ones game audio engines share:
//  - inverse-distance fall-off: full volume inside a reference distance, then −6 dB every
//    time the distance doubles (what a point source does in open air), and a soft fade to
//    exact silence at the sound's range, so nothing pops out when it's culled;
//  - every kind of sound has its own reach: a gunshot carries streets away, a voice a few
//    car lengths;
//  - a far sound is not just quieter: it's duller, later, and mostly its echo.

export type Vec = { x: number; y?: number; z: number };
/** The listener: where (the player), which way they look (unit forward), which way is up. */
export type Ears = { x: number; y: number; z: number; fx: number; fy: number; fz: number; ux: number; uy: number; uz: number };

export const SOUND_KINDS = ["gun", "blast", "crash", "horn", "siren", "alarm", "voice", "fire", "small", "ambient"] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

/**
 * `ref` (m): full volume up to here. `max` (m): silent from here. `rolloff`: how fast it
 * drops in between (1 = open air; less = carries further, like a siren built to).
 */
export const REACH: Record<SoundKind, { ref: number; max: number; rolloff: number }> = {
  gun: { ref: 9, max: 420, rolloff: 1 },
  blast: { ref: 18, max: 700, rolloff: 0.9 },
  crash: { ref: 15, max: 220, rolloff: 1 },
  horn: { ref: 14, max: 200, rolloff: 1 },
  siren: { ref: 25, max: 420, rolloff: 0.7 },
  alarm: { ref: 15, max: 180, rolloff: 1 },
  voice: { ref: 6, max: 48, rolloff: 1 },
  fire: { ref: 9, max: 90, rolloff: 1 },
  small: { ref: 7, max: 70, rolloff: 1 },
  ambient: { ref: 10, max: 200, rolloff: 1 },
};

export const SPEED_OF_SOUND = 343;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Volume (0…1) of a `kind` of sound `d` metres away. */
export function gainAt(d: number, kind: SoundKind): number {
  const r = REACH[kind];
  if (!(d < r.max)) return 0;
  const inverse = r.ref / (r.ref + r.rolloff * (Math.max(d, r.ref) - r.ref));
  // The last 30% of its reach fades to nothing: culling a sound must never be heard.
  return inverse * (1 - smooth(r.max * 0.7, r.max, d));
}

/** Low-pass cutoff (Hz) for the air between: open (20 kHz) up close, a dull thud far off. */
export const airCutoffHz = (d: number) => clamp(20000 * Math.exp(-Math.max(0, d - 8) / 95), 650, 20000);

/** How long the sound takes to arrive (s): you see a far blast before you hear it. Capped. */
export const delayS = (d: number) => clamp(d / SPEED_OF_SOUND, 0, 1.5);

/** Share sent to the reverb (0…1): near is mostly the sound itself, far is mostly the street's echo of it. */
export const wetAt = (d: number, kind: SoundKind) => (kind === "ambient" ? 0 : clamp(0.06 + d / 260, 0.06, 0.55));

/**
 * Pitch factor for something closing in at `closing` m/s (negative: moving away) — a
 * siren coming is sharp, going it sags. Clamped: a teleport must not squeal.
 */
export function dopplerRate(closing: number): number {
  const v = clamp(closing, -60, 60);
  return clamp(SPEED_OF_SOUND / (SPEED_OF_SOUND - v), 0.8, 1.25);
}

export type Heard = {
  /** Metres from the ears. */
  dist: number;
  /** −1 (hard left) … 1 (hard right). */
  pan: number;
  /** 1 dead ahead … −1 right behind. */
  front: number;
};

/** Where `at` is, as the ears hear it. */
export function hear(e: Ears, at: Vec): Heard {
  const dx = at.x - e.x, dy = (at.y ?? e.y) - e.y, dz = at.z - e.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.05) return { dist, pan: 0, front: 1 };
  // right = forward × up
  const rx = e.fy * e.uz - e.fz * e.uy, ry = e.fz * e.ux - e.fx * e.uz, rz = e.fx * e.uy - e.fy * e.ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  return { dist, pan: clamp((dx * rx + dy * ry + dz * rz) / rl / dist, -1, 1), front: clamp((dx * e.fx + dy * e.fy + dz * e.fz) / dist, -1, 1) };
}

/**
 * Plain stereo (no 3D panner): left/right by where it is — never hard to one side, a
 * speaker pair has no "only the left ear" — and a little quieter and duller behind, which
 * is all two speakers can say about front and back.
 */
export function stereo(h: Heard): { pan: number; gain: number; cutoffK: number } {
  const behind = (1 - h.front) / 2; // 0 ahead … 1 behind
  return { pan: h.pan * 0.85, gain: 1 - 0.18 * behind, cutoffK: 1 - 0.45 * behind };
}

/**
 * 5.1: how much of a sound goes to the front pair and to the rear pair (equal power: the
 * two squared add up to 1, so a sound circling the player keeps its loudness).
 */
export function surround(h: Heard): { front: number; rear: number } {
  const k = (1 + h.front) / 2;
  return { front: Math.sqrt(k), rear: Math.sqrt(1 - k) };
}

/** Quieter than this (−50 dB) is not worth a voice. */
export const AUDIBLE = 0.003;

/**
 * May a new sound of volume `gain` start while `live` of `max` voices are busy? The first
 * 60% are free; past that only louder and louder (nearer) sounds get in, so a distant
 * horn never takes the last voice from the shot beside you.
 */
export function admit(live: number, max: number, gain: number): boolean {
  if (gain < AUDIBLE || live >= max) return false;
  const free = max * 0.6;
  if (live < free) return true;
  return gain >= ((live - free) / (max - free)) * 0.5;
}

/** Where the sound comes out. */
export const AUDIO_OUTPUTS = ["auto", "headphones", "speakers", "surround"] as const;
export type AudioOutput = (typeof AUDIO_OUTPUTS)[number];
export type Panning = "hrtf" | "stereo" | "surround";

/**
 * The panning a choice means on this device. "auto" is 3D for headphones (HRTF) unless
 * the phone is too weak for it; 5.1 only ever by choice, and only if the device has the
 * six channels (`channels` = the audio device's maximum).
 */
export function panningFor(pick: AudioOutput, o: { weak: boolean; channels: number }): Panning {
  if (pick === "surround") return o.channels >= 6 ? "surround" : "stereo";
  if (pick === "headphones") return "hrtf";
  if (pick === "speakers") return "stereo";
  return o.weak ? "stereo" : "hrtf";
}
export const readOutput = (v: unknown): AudioOutput => ((AUDIO_OUTPUTS as readonly unknown[]).includes(v) ? (v as AudioOutput) : "auto");
