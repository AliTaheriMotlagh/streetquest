"use client";
// People in the open city talking (the lines: lib/street/barks.ts): a short line from the
// person it's about — the pedestrian you nearly hit, the driver whose car you shunted, the
// officer at the megaphone — heard from where they are (quieter further off, panned) with a
// speech bubble over their head that follows them (in Persian, or the English subtitle).
//  - The voice is the recorded line (npm run assets:voices → /sounds/voice/, fetched and
//    decoded once in the background); without recordings, the device's own Persian voice if
//    it has one (speechSynthesis — some Android phones); else only the bubble.
//  - Nobody talks over anybody: one line at a time near you, and each situation has its
//    quiet spell (QUIET_S) so a crowd running from a blast isn't a chorus.
import * as THREE from "three";
import { barkFile, pickBark, QUIET_S, sayFor, type Bark, type Situation, type VoiceKind } from "@/lib/street/barks";
import { getLocale } from "@/lib/i18n";
import { audioOut, isMuted } from "../game/sfx";

type Where = () => { x: number; y: number; z: number } | null;
type Bubble = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture; c: HTMLCanvasElement; where: Where | null; t: number };

/** Heard this far (m) at most; the bubble shows a little further. */
const HEAR_M = 45, SEE_M = 55;

let manifest: Promise<Set<string>> | null = null;
const bufs = new Map<string, AudioBuffer | null>();

function files() {
  manifest ??= fetch("/sounds/voice/manifest.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .then((m: { files?: unknown }) => new Set(Array.isArray(m.files) ? m.files.filter((f): f is string => typeof f === "string" && /^[\w-]+\.mp3$/.test(f)) : []))
    .catch(() => new Set<string>());
  return manifest;
}

async function load(file: string) {
  if (bufs.has(file)) return;
  bufs.set(file, null);
  const o = audioOut();
  if (!o) return bufs.delete(file);
  try {
    const r = await fetch(`/sounds/voice/${file}`);
    if (r.ok) bufs.set(file, await o.ctx.decodeAudioData(await r.arrayBuffer()));
  } catch {
    // Left silent: the bubble still shows.
  }
}

/** The device's Persian voice, if it has one. */
function persianVoice() {
  if (typeof speechSynthesis === "undefined") return null;
  return speechSynthesis.getVoices().find((v) => /^fa(-|_|$)/i.test(v.lang)) ?? null;
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
    // The recordings, in the background (they're small).
    void files().then((s) => s.forEach((f) => void load(f)));
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
    this.busyUntil = now + sayFor(b) * 600;
    if (d < HEAR_M) this.speak(b, v, d, at, me);
    this.bubble(b, where);
    return true;
  }

  private speak(b: Bark, v: VoiceKind, d: number, at: { x: number; z: number }, me: { x: number; z: number; yaw?: number }) {
    if (isMuted()) return;
    const vol = 1 / (1 + d / 12);
    const file = barkFile(b, v), buf = bufs.get(file);
    const o = audioOut();
    if (buf && o && o.ctx.state === "running") {
      const src = o.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = o.ctx.createGain();
      g.gain.value = Math.min(1, vol * 1.1);
      const p = o.ctx.createStereoPanner();
      // Left or right of where I'm facing (forward is −z turned by yaw).
      const yaw = me.yaw ?? 0, dx = at.x - me.x, dz = at.z - me.z, l = Math.hypot(dx, dz) || 1;
      p.pan.value = Math.max(-0.8, Math.min(0.8, ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / l) * 0.8));
      src.connect(g).connect(p).connect(o.out);
      src.onended = () => p.disconnect();
      src.start();
      return;
    }
    // No recording (yet): the device's own Persian voice, if any.
    const fa = persianVoice();
    if (!fa) return;
    const u = new SpeechSynthesisUtterance(b.fa);
    u.voice = fa;
    u.lang = fa.lang;
    u.volume = Math.min(1, vol * 1.2);
    u.rate = b.fa.includes("!") ? 1.15 : 1;
    u.pitch = v === "f" ? 1.45 : v === "cop" ? 0.85 : 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /** The line in a bubble over the speaker's head. */
  private bubble(b: Bark, where: Where) {
    const bub = this.bubbles.reduce((a, x) => (x.t < a.t ? x : a));
    const fa = getLocale() === "fa", text = fa ? b.fa : b.en;
    const g = bub.c.getContext("2d")!;
    const W = bub.c.width, H = bub.c.height;
    g.clearRect(0, 0, W, H);
    g.font = `700 40px ${fa ? "Vazirmatn, Tahoma" : "system-ui, sans-serif"}, sans-serif`;
    g.direction = fa ? "rtl" : "ltr";
    // Shrunk to fit if it's long.
    let size = 40;
    while (g.measureText(text).width > W - 70 && size > 22) g.font = `700 ${(size -= 2)}px ${fa ? "Vazirmatn, Tahoma" : "system-ui"}, sans-serif`;
    const tw = Math.min(W - 40, g.measureText(text).width + 50), x0 = (W - tw) / 2;
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
    g.fillText(text, W / 2, 61);
    bub.tex.needsUpdate = true;
    bub.where = where;
    bub.t = sayFor(b);
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
