// Recorded sounds the 3D city can play instead of its synthesized ones (pure: the slot list,
// shared by the converter script and the player — tests/soundSlots.test.ts holds it).
//
// Every slot is optional. Drop licensed recordings (e.g. bought on soundsnap.ir — the
// search words below find good ones) into assets/sounds/<slot>/, run `npm run assets:sounds`
// and they're converted, loudness-matched and listed in public/sounds/manifest.json; a slot
// with no file keeps the Web Audio synth (components/arena/gunsound.ts), so nothing ever
// goes silent. Several files in one slot are variations, picked at random each time.

import type { WeaponKey } from "./arena/weapons";

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

const BASE_SLOTS = {
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
  carAlarm: { what: "A car alarm going off (a parked car hit or shot)", search: "car alarm siren", maxS: 8 },
  carLock: { what: "Car locked: the remote's chirp", search: "car lock beep chirp", maxS: 1.2 },
  doorOpen: { what: "A car door opening", search: "car door open", maxS: 1.5 },
  doorClose: { what: "A car door shutting", search: "car door close slam", maxS: 1.5 },
  engineStart: { what: "A car engine starting: the starter, then it catches", search: "car engine start ignition", maxS: 3.5 },
} satisfies Record<string, SoundSlot>;

/** The game's interface sounds (components/game/sfx.ts synthesizes each; a recording in its `ui_` slot replaces it). */
export const UI_SFX = ["tap", "shot", "miss", "hit", "hurt", "down", "explode", "nuke", "siren", "reward", "coin", "gem", "levelup", "error", "beep", "go", "cut", "reload", "capture", "alarm", "whoosh", "win", "lose", "photo", "ring"] as const;
export type UiSfx = (typeof UI_SFX)[number];
/** The weapons, each with its own shot (arena/gunsound.ts synthesizes it from the weapon's numbers otherwise). */
export const GUN_SOUNDS = ["pistol", "smg", "rifle", "sniper", "shotgun", "deagle", "battle", "lmg", "dmr"] as const;
// Every weapon has its slot (a new weapon fails the build until it's listed here).
const _guns: Record<WeaponKey, true> = Object.fromEntries(GUN_SOUNDS.map((w) => [w, true])) as Record<(typeof GUN_SOUNDS)[number], true>;
void _guns;
/** The rest of the fight's sounds (arena/gunsound.ts). */
const FIGHT_SLOTS = {
  reload: { what: "A magazine out and in, the bolt", search: "gun reload magazine", maxS: 2.5 },
  hitMarker: { what: "My bullet hit someone (a short tick)", search: "hit marker tick", maxS: 0.4 },
  kill: { what: "I took someone down (a short two-note chime)", search: "kill confirm chime", maxS: 0.8 },
  hurt: { what: "I'm hit (a grunt or a thump)", search: "male grunt hurt", maxS: 0.8 },
  empty: { what: "Trigger on an empty gun: a dry click", search: "gun dry fire click empty", maxS: 0.4 },
  bombBeep: { what: "The bomb's beep", search: "bomb timer beep", maxS: 0.4 },
  throw: { what: "A grenade thrown: the swish", search: "grenade throw whoosh", maxS: 0.8 },
  flashbang: { what: "A flashbang going off", search: "flashbang stun grenade", maxS: 3 },
} satisfies Record<string, SoundSlot>;

const uiSlots = Object.fromEntries(UI_SFX.map((n) => [`ui_${n}`, { what: `Interface sound «${n}»`, search: `game ui ${n}`, maxS: 3 }])) as Record<`ui_${UiSfx}`, SoundSlot>;
const gunSlots = Object.fromEntries(GUN_SOUNDS.map((w) => [`gun_${w}`, { what: `A ${w} firing, once`, search: `${w} gunshot single`, maxS: 2 }])) as Record<`gun_${(typeof GUN_SOUNDS)[number]}`, SoundSlot>;

/** Every sound the game can play from a recording (each optional: an empty slot keeps the synth). */
export const SOUND_SLOTS: typeof BASE_SLOTS & typeof FIGHT_SLOTS & typeof uiSlots & typeof gunSlots = { ...BASE_SLOTS, ...FIGHT_SLOTS, ...uiSlots, ...gunSlots };

export type SoundKey = keyof typeof SOUND_SLOTS;
/** Which group a slot is in (the /dev/sounds panel). */
export const slotGroup = (k: SoundKey): "street" | "fight" | "guns" | "ui" => (k.startsWith("ui_") ? "ui" : k.startsWith("gun_") ? "guns" : k in FIGHT_SLOTS ? "fight" : "street");

/**
 * The licences a shipped recording may carry: CC0, public domain, CC BY (credited), and
 * fara-download.ir's (no licence stated; the site lets its sounds be copied with a link to
 * the source — which /credits gives).
 */
export const SHIP_LICENSE = /^(CC0|Public domain|CC BY [0-9.]+|Free, with a link to fara-download\.ir)$/;
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
