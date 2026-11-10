// Recorded sounds the 3D city can play instead of its synthesized ones (pure: the slot list,
// shared by the converter script and the player — tests/soundSlots.test.ts holds it).
//
// Every slot is optional. Drop licensed recordings (e.g. bought on soundsnap.ir — the
// search words below find good ones) into assets/sounds/<slot>/, run `npm run assets:sounds`
// and they're converted, loudness-matched and listed in public/sounds/manifest.json; a slot
// with no file keeps the Web Audio synth (components/arena/gunsound.ts), so nothing ever
// goes silent. Several files in one slot are variations, picked at random each time.

export type SoundSlot = {
  /** What it is (README / the script's report). */
  what: string;
  /** Words to search for on a sound library (soundsnap.ir: English titles). */
  search: string;
  /** Played as a seamless loop (sirens, ambience) rather than once. */
  loop?: boolean;
  /** Seconds kept from each file at most (one-shots are trimmed; loops are kept whole). */
  maxS: number;
  /** Mono (placed in the world, panned) or stereo (ambience around you). */
  stereo?: boolean;
};

export const SOUND_SLOTS = {
  siren: { what: "Police siren (Iranian wail), looping", search: "police siren wail loop", loop: true, maxS: 30 },
  crashLight: { what: "A light car bump: thud and a crunch of plastic", search: "car crash light impact bumper", maxS: 2.5 },
  crashHeavy: { what: "A hard car crash: metal crumpling, glass", search: "car crash metal impact heavy", maxS: 4 },
  glass: { what: "Car glass shattering", search: "car glass shatter window break", maxS: 2.5 },
  horn: { what: "A car horn, short", search: "car horn honk short", maxS: 1.5 },
  explosion: { what: "A car exploding", search: "car explosion", maxS: 5 },
  fire: { what: "A car burning: crackling flames, looping", search: "fire burning crackle loop", loop: true, maxS: 20 },
  skid: { what: "Tyres screeching", search: "tire skid screech", maxS: 3 },
  thud: { what: "Someone hit by a car: a body thud", search: "body hit thud impact", maxS: 1.5 },
  city: { what: "City street ambience (traffic, distant horns, people)", search: "city traffic ambience street tehran", loop: true, maxS: 60, stereo: true },
} satisfies Record<string, SoundSlot>;

export type SoundKey = keyof typeof SOUND_SLOTS;
export const SOUND_KEYS = Object.keys(SOUND_SLOTS) as SoundKey[];

/** Who made a recording the game ships (CC BY ones must be named on /credits). */
export type SoundCredit = { title: string; author: string; url: string; license: string };
/** What public/sounds/manifest.json holds: each slot's files (published paths under /sounds/), and the credits. */
export type SoundManifest = Partial<Record<SoundKey, string[]>> & { credits?: SoundCredit[] };

/** The manifest's credits, if any (well-formed entries only). */
export function soundCredits(raw: unknown): SoundCredit[] {
  const c = (raw as { credits?: unknown } | null)?.credits;
  if (!Array.isArray(c)) return [];
  return c.filter((x): x is SoundCredit => !!x && typeof x === "object" && ["title", "author", "url", "license"].every((k) => typeof (x as Record<string, unknown>)[k] === "string") && /^https:\/\//.test((x as SoundCredit).url));
}

/** Which files of the manifest are real slots with files (anything else in it is ignored). */
export function readManifest(raw: unknown): SoundManifest {
  const out: SoundManifest = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of SOUND_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (!Array.isArray(v)) continue;
    const files = v.filter((f): f is string => typeof f === "string" && /^[\w.-]+\.(mp3|ogg|m4a|wav)$/i.test(f));
    if (files.length) out[k] = files;
  }
  return out;
}

/** The converted file's name for the n-th recording in a slot. */
export const slotFile = (key: SoundKey, n: number) => `${key}-${n + 1}.mp3`;
