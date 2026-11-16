"use client";
// People in the open city talking (the lines: lib/street/barks.ts): a short line from the
// person it's about — the pedestrian you nearly hit, the driver whose car you shunted, the
// officer at the megaphone — heard from where they are (game/spatial.ts) with a
// speech bubble over their head that follows them (in Persian, or the English subtitle).
//  - The voice is, first, the recorded line (npm run assets:voices → /sounds/voice/, fetched
//    and decoded once in the background); else the server's spoken copy (/api/tts — Azure's
//    or OpenAI's Persian voices, a man's or a woman's, made once and cached for good by the
//    CDN and the phone; the police's through a megaphone filter); else the device's own
//    Persian voice if it has one (speechSynthesis — some Android phones); else only the bubble.
//  - Players not in Persian hear English: the recordings in /sounds/voice/en/ (lib/street/
//    voiceLang.ts), else the device's English voice (a woman's for a woman, where its name
//    tells), else only the bubble. (/api/tts speaks Persian only.)
//  - Conversations (talk) and shopkeepers calling out their store's name (line with `spoken`) say any words: the
//    on-device voice of the player's language (tts/neural.ts — Persian, English or Turkish, downloaded while the city
//    loads; men, women and the police each as picked in Settings), else the phone's own voice, else a recorded line.
//    A new answer cuts the last one off.
//  - Nobody talks over anybody: one line at a time near you, and each situation has its
//    quiet spell (QUIET_S) so a crowd running from a blast isn't a chorus.
import * as THREE from "three";
import { barkById, barkKey, pickBark, QUIET_S, sayFor, textOf, type Bark, type Situation, type VoiceKind } from "@/lib/street/barks";
import { getLocale } from "@/lib/i18n";
import { lineFile, manifestPaths, pickDeviceVoice, talkClip, voiceLangOf, type VoiceLang } from "@/lib/street/voiceLang";
import { gainAt } from "@/lib/audio/spatial";
import { audioOut, isMuted } from "../game/sfx";
import { place } from "../game/spatial";
import { neuralReady, setTtsCountry, speakNeural, warmLanguage } from "./tts/neural";

/** The country the player is in (Drive sets it as they move): people in Turkey speak Turkish (voiceLangOf). */
let voiceCountry: string | null = null;
export const setVoiceCountry = (c: string | null) => void ((voiceCountry = c), setTtsCountry(c));

type Where = () => { x: number; y: number; z: number } | null;
type Bubble = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture; c: HTMLCanvasElement; where: Where | null; t: number };

/** Heard this far (m) at most; the bubble shows a little further. */
const HEAR_M = 45, SEE_M = 55;

let manifest: Promise<Set<string>> | null = null;
/**
 * The recordings: their bytes fetched as soon as the city opens (small, no audio needed), decoded on
 * first use. (They used to be decoded up front — which needs the audio context, and that only exists
 * after the player's first tap: a city opened before it never got its voices, and every person
 * stayed silent for the whole drive.)
 */
const raw = new Map<string, Promise<ArrayBuffer | null>>();
const bufs = new Map<string, AudioBuffer>();
/** Decoded lines kept at most (the bytes stay; a line falls out and is decoded again when needed). */
const DECODED_MAX = 40;

function files() {
  manifest ??= fetch("/sounds/voice/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .then((m: { files?: unknown; en?: unknown }) => new Set(manifestPaths(m)))
    .catch(() => new Set<string>());
  return manifest;
}

function fetchLine(file: string) {
  let p = raw.get(file);
  if (!p) {
    p = fetch(`/sounds/voice/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    raw.set(file, p);
  }
  return p;
}

/** A recording decoded (now if it already is), or null: not shipped, not fetched, no audio yet. */
function decoded(file: string): AudioBuffer | Promise<AudioBuffer | null> | null {
  const had = bufs.get(file);
  if (had) return had;
  const p = raw.get(file);
  if (!p) return null;
  return p.then(async (bytes) => {
    const o = audioOut("voices");
    if (!bytes || !o) return null;
    try {
      // (decodeAudioData detaches what it's given: a copy, so the bytes can be decoded again.)
      const buf = await o.ctx.decodeAudioData(bytes.slice(0));
      bufs.set(file, buf);
      while (bufs.size > DECODED_MAX) bufs.delete(bufs.keys().next().value!);
      return buf;
    } catch {
      return null;
    }
  });
}

/** The server's spoken lines: decoded, being fetched, or "none" (no speech service there). */
const tts = new Map<string, AudioBuffer | Promise<AudioBuffer | null> | "none">();
let ttsOff = false;

/** The server's spoken copy of a line (fetched once; the HTTP cache keeps it after that). */
function ttsLine(b: Bark, v: VoiceKind, lang: VoiceLang = "fa"): AudioBuffer | Promise<AudioBuffer | null> | null {
  if (ttsOff) return null;
  const key = `${lang}:${b.id}-${v}`, have = tts.get(key);
  if (have === "none") return null;
  if (have) return have;
  const o = audioOut("voices");
  if (!o) return null;
  const p = fetch(`/api/tts?id=${encodeURIComponent(b.id)}&v=${v}&k=${barkKey(b, v, lang)}${lang === "fa" ? "" : `&l=${lang}`}`)
    .then(async (r) => {
      // No service set up on the server: stop asking for the rest of the session.
      if (r.status === 404) ttsOff = true;
      if (!r.ok) return null;
      return o.ctx.decodeAudioData(await r.arrayBuffer());
    })
    .catch(() => null)
    .then((buf) => (tts.set(key, buf ?? "none"), buf));
  tts.set(key, p);
  return p;
}

/** The device's own voice for the language and speaker, if it has one. */
function deviceVoice(lang: VoiceLang, v: VoiceKind) {
  if (typeof speechSynthesis === "undefined") return null;
  return pickDeviceVoice(speechSynthesis.getVoices(), lang, v);
}

export class Voices {
  private bubbles: Bubble[] = [];
  private quietUntil = new Map<Situation, number>();
  private busyUntil = 0;
  private recent: string[] = [];
  private v = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 160;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.6, 0.81, 1);
      sprite.visible = false;
      sprite.renderOrder = 6;
      scene.add(sprite);
      this.bubbles.push({ sprite, mat, tex, c, where: null, t: 0 });
    }
    // The recordings of the player's language, in the background (they're small).
    const lang = voiceLangOf(getLocale(), voiceCountry);
    // The on-device voices of the player's language (only that one), brought onto the device while the city loads
    // (DriveBoot shows how far) so the first conversation is spoken.
    warmLanguage(lang);
    void files().then((s) => s.forEach((f) => (lang === "fa" ? !/^(en|tr)\//.test(f) : f.startsWith(`${lang}/`)) && void fetchLine(f)));
  }

  /**
   * Someone says something about `s` in voice `v` from `where` (followed while the bubble
   * is up), `me` the listener. False when it's not the moment (someone's talking, too far,
   * or this was just said).
   */
  say(s: Situation, v: VoiceKind, where: Where, me: { x: number; z: number; yaw?: number }, now = performance.now()): boolean {
    const at = where();
    if (!at || now < this.busyUntil || now < (this.quietUntil.get(s) ?? 0)) return false;
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (d > SEE_M) return false;
    const b = pickBark(s, v, Math.random, this.recent);
    if (!b) return false;
    this.recent = [b.id, ...this.recent].slice(0, 6);
    this.quietUntil.set(s, now + QUIET_S[s] * 1000);
    this.busyUntil = now + sayFor(b, v) * 600;
    if (d < HEAR_M) this.speak(b, v, d, at, me);
    this.bubble(b, v, where);
    return true;
  }

  /**
   * A street scene's line (lib/street/scenes.ts): this exact line, now — the scene keeps
   * its own timing, so nobody's quiet spell holds it back. False if it's too far to matter.
   */
  line(id: string, v: VoiceKind, where: Where, me: { x: number; z: number; yaw?: number }, now = performance.now(), caption?: string, spoken?: string, who?: number) {
    const b = barkById(id), at = where();
    if (!b || !at) return false;
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (d > SEE_M) return false;
    this.busyUntil = Math.max(this.busyUntil, now + sayFor(b, v) * 600);
    if (d < HEAR_M) {
      // Words of its own (a shopkeeper calling out the store's name): said as they are where a voice here can say
      // any words — else the recorded line, which can't.
      if (spoken && !isMuted()) this.sayWords(b, v, spoken, d, at, me, who);
      else this.speak(b, v, d, at, me);
    }
    this.bubble(b, v, where, caption);
    return true;
  }

  /** `text` in place of the bark `b`: the on-device voice (Persian) or the phone's own; else `b` as recorded. */
  private sayWords(b: Bark, v: VoiceKind, text: string, d: number, at: { x: number; z: number }, me: { x: number; z: number; yaw?: number }, who?: number) {
    const lang = voiceLangOf(getLocale(), voiceCountry), vol = gainAt(d, "voice");
    const recorded = () => this.speak(b, v, d, at, me);
    if (neuralReady(v, who, lang)) return this.neuralOr(text, v, at, lang, 5000, recorded, undefined, false, undefined, who);
    if (lang !== "fa" && this.deviceText(text, v, vol, lang)) return;
    recorded();
  }

  /** Into the game's audio: quieter further off, panned to where it is; the police through a megaphone. */
  private play(buf: AudioBuffer, at: { x: number; z: number }, megaphone: boolean, must = false): AudioBufferSourceNode | null {
    // Heard from where they stand (game/spatial.ts): how loud, from which side, how muffled.
    const o = place({ x: at.x, y: 1.6, z: at.z }, "voice", buf.duration + 0.2, must);
    if (!o) return null;
    const src = o.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = o.ctx.createGain();
    g.gain.value = 0.85;
    let head: AudioNode = src;
    if (megaphone) {
      // A horn speaker's narrow band, driven a little hard.
      const band = o.ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1500;
      band.Q.value = 0.8;
      const drive = o.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
      drive.curve = curve;
      head = head.connect(band).connect(drive);
      g.gain.value = 1;
    }
    head.connect(g).connect(o.dest);
    src.onended = () => g.disconnect();
    src.start(o.t);
    return src;
  }

  private speak(b: Bark, v: VoiceKind, d: number, at: { x: number; z: number }, me: { x: number; z: number; yaw?: number }) {
    if (isMuted()) return;
    // The phone's own speech has no place in the mix: just its volume at that distance.
    const vol = gainAt(d, "voice");
    const lang = voiceLangOf(getLocale(), voiceCountry);
    // A recording (already filtered for the police): decoded now, or in a moment.
    const rec = decoded(lineFile(b, v, lang));
    if (rec instanceof AudioBuffer) return this.play(rec, at, false);
    if (rec) {
      const asked = performance.now();
      void rec.then((buf) => {
        if (buf) performance.now() - asked < 800 && this.play(buf, at, false);
        else this.unrecorded(b, v, vol, at, lang);
      });
      return;
    }
    this.unrecorded(b, v, vol, at, lang);
  }

  /** A line with no recording here: the server's copy, the on-device model, the phone's voice. */
  private unrecorded(b: Bark, v: VoiceKind, vol: number, at: { x: number; z: number }, lang: VoiceLang) {
    // English: the device's voice (it always has one). Persian and Turkish: the server's spoken copy
    // (Azure / OpenAI) — now if it's here, else as soon as it arrives (if that's soon) — then the device's.
    // English: no server copy — the on-device English voice, else the device's own.
    if (lang === "en") return this.neuralOr(textOf(b, v)[lang], v, at, lang, 2500, () => this.device(b, v, vol, lang));
    const spoken = ttsLine(b, v, lang);
    if (spoken instanceof AudioBuffer) return this.play(spoken, at, v === "cop");
    if (spoken) {
      const asked = performance.now();
      void spoken.then((s) => {
        if (s) {
          if (performance.now() - asked < 2500) this.play(s, at, v === "cop");
        } else this.neuralOr(textOf(b, v)[lang], v, at, lang, 2500, () => this.device(b, v, vol, lang));
      });
      return;
    }
    this.neuralOr(textOf(b, v)[lang], v, at, lang, 2500, () => this.device(b, v, vol, lang));
  }

  /**
   * The on-device neural voice (tts/neural.ts — Persian, where this device runs it) if it's ready
   * within `wait` ms; else `fallback` (the phone's own voice) straight away.
   */
  private neuralOr(text: string, v: VoiceKind, at: { x: number; z: number }, lang: VoiceLang, wait: number, fallback: () => void, onPlay?: (secs: number) => void, must = false, live: () => boolean = () => true, who?: number) {
    const n = speakNeural(text, v, who, lang);
    if (!n) return fallback();
    const asked = performance.now();
    let done = false;
    const late = setTimeout(() => (done = true, fallback()), wait);
    void n.then((buf) => {
      if (done) return;
      clearTimeout(late);
      done = true;
      // (A conversation's answer that's no longer the latest isn't said: the next one has been asked.)
      if (!live()) return;
      if (buf && performance.now() - asked < wait) {
        const src = this.play(buf, at, v === "cop", must);
        if (must) this.answer = src;
        onPlay?.(buf.duration);
      }
      else fallback();
    });
  }

  /**
   * Someone says `text` (any words — a shopkeeper naming a dish, a passer-by's directions) in voice
   * `v` from `where`: the bubble at once, the voice from the on-device model (Persian), else the
   * phone's own voice, else the bubble alone. `close`: right beside you (a conversation) — full
   * volume, waited for a little longer. Returns how long the bubble stays (s).
   */
  talk(text: string, v: VoiceKind, where: Where, me: { x: number; z: number }, close = true, onSpeak?: (secs: number) => void, who?: number): number {
    const at = where();
    const secs = Math.min(9, 1.6 + text.length * 0.065);
    // The subtitles follow the voice: told once, when it actually starts, how long it runs.
    let told = false;
    const said = (d: number) => {
      if (told) return;
      told = true;
      onSpeak?.(Math.max(0.6, d));
    };
    if (!at) return said(secs), secs;
    this.busyUntil = Math.max(this.busyUntil, performance.now() + secs * 700);
    // (The bubble keeps it short; the whole answer is in the conversation panel.)
    this.bubbleText(text.length > 64 ? `${text.slice(0, 62).trim()}…` : text, secs, where);
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (isMuted() || d > HEAR_M) return said(secs), secs;
    const lang = voiceLangOf(getLocale(), voiceCountry);
    const vol = close ? 1 : gainAt(d, "voice");
    // A new answer in a conversation: the last one stops (no two answers over each other).
    const turn = close ? ++this.turn : this.turn;
    if (close) this.stopAnswer();
    // (Asked only when the voice is on the device: then it's worth waiting for — the model's first load on a phone
    // takes several seconds, and a conversation's answer dropped for being late left the person mute.)
    this.neuralOr(text, v, at, lang, close ? 15000 : 6000, () => {
      if (this.deviceText(text, v, vol, lang, () => said(secs))) return;
      said(secs);
      // No voice for these words on this device (most phones have no Persian voice, and the neural
      // one isn't here): the speaker still says *something* — a recorded greeting in their voice,
      // once per conversation — while the bubble and the panel carry the words.
      const now = performance.now();
      if (talkClip({ neural: false, device: false, now, lastClip: this.clipAt })) {
        const b = pickBark("greet", v === "cop" ? "m" : v, Math.random, this.recent);
        const rec = b && decoded(lineFile(b, v === "cop" ? "m" : v, lang));
        if (rec) (this.clipAt = now), void Promise.resolve(rec).then((buf) => buf && this.play(buf, at, false, close));
      }
    }, said, close, () => !close || turn === this.turn, who);
    return secs;
  }
  /** The conversation's answer being said now, and which answer is the latest. */
  private answer: AudioBufferSourceNode | null = null;
  private turn = 0;
  private stopAnswer() {
    try {
      this.answer?.stop();
    } catch {}
    this.answer = null;
  }
  /** When a recorded greeting last stood in for a conversation's words. */
  private clipAt = -Infinity;

  /** The phone's own voice saying any text; false when it has none for the language. */
  private deviceText(text: string, v: VoiceKind, vol: number, lang: VoiceLang, onStart?: () => void): boolean {
    const dv = deviceVoice(lang, v);
    if (!dv) return false;
    const u = new SpeechSynthesisUtterance(text);
    if (onStart) (u.onstart = onStart), (u.onerror = onStart);
    u.voice = dv;
    u.lang = dv.lang;
    u.volume = Math.min(1, vol * 1.2);
    u.pitch = lang === "en" ? (v === "f" ? 1.15 : v === "cop" ? 0.9 : 1) : v === "f" ? 1.45 : v === "cop" ? 0.85 : 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  }

  /** The device's own voice in the player's language, if it has one. */
  private device(b: Bark, v: VoiceKind, vol: number, lang: VoiceLang) {
    const dv = deviceVoice(lang, v);
    if (!dv) return;
    const say = textOf(b, v)[lang];
    const u = new SpeechSynthesisUtterance(say);
    u.voice = dv;
    u.lang = dv.lang;
    u.volume = Math.min(1, vol * 1.2);
    u.rate = say.includes("!") ? 1.15 : 1;
    // (English: the voice is picked by gender where its name tells, so only a nudge.)
    u.pitch = lang === "en" ? (v === "f" ? 1.15 : v === "cop" ? 0.9 : 1) : v === "f" ? 1.45 : v === "cop" ? 0.85 : 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /** The line in a bubble over the speaker's head. */
  private bubble(b: Bark, v: VoiceKind, where: Where, caption?: string) {
    const loc = getLocale(), words = textOf(b, v), text = caption ?? (loc === "fa" ? words.fa : loc === "tr" ? words.tr : words.en);
    this.bubbleText(text, sayFor(b, v), where);
  }

  /** Any words in a bubble over `where`, for `secs` s. */
  private bubbleText(text: string, secs: number, where: Where) {
    const bub = this.bubbles.reduce((a, x) => (x.t < a.t ? x : a));
    const fa = /[\u0600-\u06ff]/.test(text) || getLocale() === "fa";
    const g = bub.c.getContext("2d")!;
    const W = bub.c.width, H = bub.c.height;
    g.clearRect(0, 0, W, H);
    const family = fa ? "Vazirmatn, Tahoma, sans-serif" : "system-ui, sans-serif";
    g.direction = fa ? "rtl" : "ltr";
    // One line if it fits at a readable size, else two (split at the space nearest the middle).
    const room = W - 80;
    let size = 40, lines = [text];
    const fits = (l: string[]) => l.every((x) => g.measureText(x).width <= room);
    g.font = `700 ${size}px ${family}`;
    while (!fits(lines) && size > 30) g.font = `700 ${(size -= 2)}px ${family}`;
    if (!fits(lines)) {
      const words = text.split(" ");
      let best = 1, bestD = Infinity;
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(words.slice(0, i).join(" ").length - text.length / 2);
        if (d < bestD) (bestD = d), (best = i);
      }
      lines = words.length > 1 ? [words.slice(0, best).join(" "), words.slice(best).join(" ")] : [text];
      size = 34;
      g.font = `700 ${size}px ${family}`;
      while (!fits(lines) && size > 18) g.font = `700 ${(size -= 2)}px ${family}`;
    }
    const tw = Math.min(W - 40, Math.max(...lines.map((l) => g.measureText(l).width)) + 50), x0 = (W - tw) / 2;
    g.fillStyle = "rgba(255,255,255,.94)";
    g.beginPath();
    g.roundRect(x0, 12, tw, 96, 30);
    g.fill();
    g.beginPath();
    g.moveTo(W / 2 - 16, 106);
    g.lineTo(W / 2, 140);
    g.lineTo(W / 2 + 16, 106);
    g.fill();
    g.fillStyle = "#14171c";
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (lines.length === 1) g.fillText(text, W / 2, 61);
    else lines.forEach((l, i) => g.fillText(l, W / 2, 61 + (i ? 1 : -1) * size * 0.58));
    bub.tex.needsUpdate = true;
    bub.where = where;
    bub.t = secs;
    bub.sprite.visible = true;
  }

  tick(dt: number) {
    for (const b of this.bubbles) {
      if (b.t <= 0) continue;
      b.t -= dt;
      const at = b.where?.();
      if (!at || b.t <= 0) {
        b.t = 0;
        b.sprite.visible = false;
        continue;
      }
      b.sprite.position.copy(this.v.set(at.x, at.y + 0.75, at.z));
      b.mat.opacity = Math.min(1, b.t * 3);
    }
  }

  /** Quiet (a match started, drive mode closing). */
  clear() {
    for (const b of this.bubbles) (b.t = 0), (b.sprite.visible = false);
    this.stopAnswer();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  dispose() {
    this.clear();
    for (const b of this.bubbles) {
      this.scene.remove(b.sprite);
      b.mat.dispose();
      b.tex.dispose();
    }
  }
}
