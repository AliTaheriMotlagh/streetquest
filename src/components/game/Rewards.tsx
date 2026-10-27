"use client";
// Reward feedback, in three sizes:
//  - flyRewards / burst: coins, gems and XP pop out where you tapped and fly into their
//    counter in the HUD (data-fx-target), which bumps and rolls up as they land;
//  - <RollingNumber>: the HUD counters, which count to a new value instead of jumping;
//  - celebrate: a reward card (medal, title, the rewards counting up, confetti) — tapping
//    Collect sends the rewards flying into the HUD. Celebrations queue, never overwrite.
// Particles are plain DOM + the Web Animations API (no React state per coin), so a
// burst costs nothing to the game's render loop.
import { useEffect, useRef, useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import { ensureArt } from "@/components/art/sprite";
import { Art } from "@/components/art/Art";
import { sfx } from "./sfx";

export type RewardBag = { toman?: number; coins?: number; gems?: number; xp?: number };
export type Celebration = { title: string; body?: string; emoji?: string; art?: string; rewards?: RewardBag };
type FxKind = "coin" | "gem" | "xp" | "cash";

const FX_ART: Record<FxKind, string> = { coin: "coin", gem: "gem", xp: "star", cash: "cash" };
const KIND_BY_EMOJI: Record<string, FxKind> = { "🪙": "coin", "💎": "gem", "⭐": "xp", "✨": "xp", "💵": "cash" };

export const celebrate = (c: Celebration) => {
  // The HUD counters wait for the card's Collect: that's when the rewards fly in.
  const b = c.rewards ?? parseRewards(c.body);
  for (const row of ROWS) if (b[row.k]) landsAt[row.kind] = Date.now() + HOLD_MS;
  window.dispatchEvent(new CustomEvent("sq:celebrate", { detail: c }));
};
/** Coins/gems flying up to the HUD after a reward (from the last tap, or the middle of the screen). */
export const burst = (emoji: string, n = 10) => flyKind(KIND_BY_EMOJI[emoji] ?? "coin", n);

// ---------------------------------------------------------------- where the reward comes from
let lastTap = { x: 0, y: 0, at: 0 };
if (typeof window !== "undefined")
  window.addEventListener("pointerdown", (e) => (lastTap = { x: e.clientX, y: e.clientY, at: Date.now() }), { capture: true, passive: true });
const origin = () => (Date.now() - lastTap.at < 2500 ? { x: lastTap.x, y: lastTap.y } : { x: innerWidth / 2, y: innerHeight * 0.55 });

const calm = () =>
  typeof document !== "undefined" && (document.documentElement.classList.contains("lite") || matchMedia("(prefers-reduced-motion: reduce)").matches);

// ---------------------------------------------------------------- rewards in a message
const DIGITS: Record<string, string> = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
const num = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => DIGITS[d]).replace(/[,٬\s]/g, ""));
const REWARD_RE = {
  toman: /\+([\d۰-۹,٬]+)\s?(?:toman\b|تومان)/i,
  coins: /\+([\d۰-۹,٬]+)\s?(?:🪙|coins?\b|سکه)/i,
  gems: /\+([\d۰-۹,٬]+)\s?(?:💎|gems?\b|جم)/i,
  xp: /\+([\d۰-۹,٬]+)\s?(?:XP\b|تجربه)/i,
};
/** "+10,000 toman · +80 🪙 · +40 XP" → { toman: 10000, coins: 80, xp: 40 } (English or Persian, either digits). */
export function parseRewards(text: string | undefined | null): RewardBag {
  const out: RewardBag = {};
  if (!text) return out;
  for (const k of Object.keys(REWARD_RE) as (keyof RewardBag)[]) {
    const m = REWARD_RE[k].exec(text);
    if (m && num(m[1]) > 0) out[k] = num(m[1]);
  }
  return out;
}
const hasRewards = (b: RewardBag) => !!(b.toman || b.coins || b.gems || b.xp);

// ---------------------------------------------------------------- particles
let layer: HTMLDivElement | null = null;
const fxLayer = () => {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
};
/** When the first particle of each kind lands — counters wait for it before rolling. */
const landsAt: Record<FxKind, number> = { coin: 0, gem: 0, xp: 0, cash: 0 };
/** Longest a counter waits for a reward card to be collected. */
const HOLD_MS = 15_000;

function targetOf(kind: FxKind) {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-fx-target="${kind}"]`)].find((e) => e.offsetParent !== null || e.getClientRects().length);
  const r = el?.getBoundingClientRect();
  return { el, x: r ? r.left + Math.min(r.width, 40) / 2 + 4 : innerWidth / 2, y: r ? r.top + r.height / 2 : 24 };
}

function bump(el: HTMLElement | undefined) {
  if (!el) return;
  el.classList.remove("fx-bump");
  void el.offsetWidth; // restart the animation
  el.classList.add("fx-bump");
}

function flyKind(kind: FxKind, n: number, from = origin()) {
  if (typeof document === "undefined") return;
  const to = targetOf(kind);
  const count = Math.max(1, Math.min(calm() ? 3 : 14, n));
  const travel = 620;
  landsAt[kind] = Date.now() + 260 + travel;
  ensureArt(FX_ART[kind]);
  const host = fxLayer();
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `fx-p fx-${kind}`;
    p.innerHTML = `<svg class="art" viewBox="0 0 64 64" data-art=""><use href="#art-${FX_ART[kind]}"/></svg>`;
    host.appendChild(p);
    // Pop out in a little fountain, hang for a beat, then arc into the counter.
    const a = Math.random() * Math.PI * 2;
    const r = 26 + Math.random() * 46;
    const sx = from.x + Math.cos(a) * r;
    const sy = from.y + Math.sin(a) * r * 0.7 - 18;
    const cx = (sx + to.x) / 2 + (Math.random() - 0.5) * 120;
    const cy = Math.min(sy, to.y) - 60 - Math.random() * 60;
    const pt = (u: number) => ({ x: (1 - u) ** 2 * sx + 2 * (1 - u) * u * cx + u * u * to.x, y: (1 - u) ** 2 * sy + 2 * (1 - u) * u * cy + u * u * to.y });
    const frames: Keyframe[] = [
      { transform: `translate(${from.x}px, ${from.y}px) scale(.3)`, opacity: 0, offset: 0 },
      { transform: `translate(${sx}px, ${sy}px) scale(1.15)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${sx}px, ${sy + 4}px) scale(1)`, opacity: 1, offset: 0.32 },
    ];
    for (const u of [0.25, 0.5, 0.75]) {
      const q = pt(u);
      frames.push({ transform: `translate(${q.x}px, ${q.y}px) scale(${1 - u * 0.35})`, opacity: 1, offset: 0.32 + u * 0.68 });
    }
    frames.push({ transform: `translate(${to.x}px, ${to.y}px) scale(.5)`, opacity: 0.9, offset: 1 });
    const delay = i * 38;
    const anim = p.animate(frames, { duration: 260 + travel + 140, delay, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" });
    anim.onfinish = () => {
      p.remove();
      bump(to.el);
      if (i === 0 || i === count - 1) sfx(kind === "gem" ? "gem" : "coin");
    };
  }
}

/** Send a reward bag flying into the HUD, from a point (default: the last tap). */
export function flyRewards(b: RewardBag, from?: { x: number; y: number }) {
  if (b.toman) flyKind("cash", Math.round(4 + Math.log10(b.toman + 1) * 1.5), from);
  if (b.coins) flyKind("coin", Math.round(4 + Math.log10(b.coins + 1) * 3), from);
  if (b.gems) setTimeout(() => flyKind("gem", Math.min(8, 2 + b.gems!), from), 90);
  if (b.xp) setTimeout(() => flyKind("xp", Math.round(3 + Math.log10(b.xp! + 1) * 2), from), 180);
}

// ---------------------------------------------------------------- counters
const compact = (n: number) => (Math.abs(n) >= 1e5 ? fmtNum(n, undefined, { notation: "compact", maximumFractionDigits: 1 }) : fmtNum(Math.round(n)));

/** A HUD number that rolls to its new value (after the reward particles land). */
export function RollingNumber({ value, kind }: { value: number; kind: FxKind }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const from = cur.current;
    if (from === value) return;
    let raf = 0;
    const dur = calm() ? 0 : Math.min(900, 300 + Math.abs(value - from) / 4);
    const began = Date.now();
    let start = 0;
    const step = (now: number) => {
      // Rewards still in the air (or on a card not collected yet): hold, then roll as they land.
      if (!start) {
        if (!calm() && landsAt[kind] > Date.now() && Date.now() - began < HOLD_MS) {
          raf = requestAnimationFrame(step);
          return;
        }
        start = now;
      }
      const u = dur ? Math.max(0, Math.min(1, (now - start) / dur)) : 1;
      const v = from + (value - from) * (1 - (1 - u) ** 3);
      cur.current = v;
      setShown(v);
      if (u < 1) raf = requestAnimationFrame(step);
      else setDir(null);
    };
    setDir(value > from ? "up" : "down");
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, kind]);
  return <span className={`roll ${dir ? `roll-${dir}` : ""}`}>{compact(shown)}</span>;
}

// ---------------------------------------------------------------- confetti
function confetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx || calm()) return () => {};
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#f0c05a", "#f6d58c", "#4fd1c5", "#ee7fae", "#a48bfa", "#eef1f7"];
  const cx = innerWidth / 2, cy = innerHeight * 0.38;
  const bits = Array.from({ length: 90 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const v = 6 + Math.random() * 9;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0] };
  });
  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const age = (now - t0) / 1000;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1.4) / 0.8);
    for (const b of bits) {
      b.vy += 0.32;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 1);
      ctx.restore();
    }
    if (age < 2.2) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// ---------------------------------------------------------------- the reward card
/** Counts from 0 to `to` once, for the reward rows on the card. */
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [v, setV] = useState(calm() ? to : 0);
  useEffect(() => {
    if (calm()) return setV(to);
    let raf = 0;
    const start = performance.now() + delay;
    const dur = Math.min(1100, 450 + to * 2);
    const step = (now: number) => {
      const u = Math.max(0, Math.min(1, (now - start) / dur));
      setV(Math.round(to * (1 - (1 - u) ** 3)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <>{fmtNum(v)}</>;
}

const ROWS: { k: keyof RewardBag; kind: FxKind; label: string }[] = [
  { k: "toman", kind: "cash", label: msg("toman") },
  { k: "coins", kind: "coin", label: msg("coins") },
  { k: "gems", kind: "gem", label: msg("gems") },
  { k: "xp", kind: "xp", label: msg("XP") },
];

/** Body text without the reward amounts the card already shows as rows. */
const strip = (body: string) =>
  body
    .replace(/\+[\d۰-۹,٬]+\s?(?:🪙|💎|toman\b|coins?\b|gems?\b|XP\b|تومان|سکه|جم|تجربه)/gi, "")
    .replace(/^[\s·,،:|—-]+|[\s·,،:|—-]+$/g, "")
    .replace(/\s*[·,،]\s*(?=[·,،]|$)/g, "")
    .trim();

export function CelebrationLayer() {
  const [queue, setQueue] = useState<(Celebration & { id: number })[]>([]);
  const show = queue[0] ?? null;
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const onCel = (e: Event) => setQueue((q) => [...q.slice(0, 4), { ...(e as CustomEvent<Celebration>).detail, id: Date.now() + Math.random() }]);
    window.addEventListener("sq:celebrate", onCel);
    return () => window.removeEventListener("sq:celebrate", onCel);
  }, []);

  const rewards: RewardBag = show ? (show.rewards ?? parseRewards(show.body)) : {};
  const body = show?.body ? (hasRewards(rewards) && !show.rewards ? strip(show.body) : show.body) : "";

  useEffect(() => {
    if (!show) return;
    closing.current = false;
    sfx("levelup");
    navigator.vibrate?.([60, 40, 60, 40, 120]);
    const stop = canvas.current ? confetti(canvas.current) : () => {};
    const auto = setTimeout(() => dismiss(), hasRewards(rewards) ? 6000 : 4200);
    return () => {
      stop();
      clearTimeout(auto);
    };
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    if (!show || closing.current) return;
    closing.current = true;
    // The rewards leave the card and fly into the HUD.
    if (card.current)
      for (const row of ROWS) {
        const n = rewards[row.k];
        const el = card.current.querySelector<HTMLElement>(`[data-reward="${row.k}"]`);
        if (!n || !el) continue;
        const r = el.getBoundingClientRect();
        flyRewards({ [row.k]: n }, { x: r.left + 22, y: r.top + r.height / 2 });
      }
    card.current?.classList.add("out");
    setTimeout(() => setQueue((q) => q.slice(1)), 220);
  };

  if (!show) return null;
  const any = hasRewards(rewards);
  return (
    <div className="cel" onClick={dismiss} role="dialog" aria-live="polite" aria-label={show.title}>
      <canvas ref={canvas} className="cel-confetti" />
      <div className="cel-glow" />
      <div className="cel-card" ref={card} key={show.id} onClick={(e) => e.stopPropagation()}>
        <div className="cel-medal">
          <span className="cel-ring" />
          <span className="cel-icon">{show.art ? <Art k={show.art} /> : show.emoji ?? "🏆"}</span>
        </div>
        <h2 className="cel-title">{show.title}</h2>
        {body && <p className="cel-body">{body}</p>}
        {any && (
          <div className="cel-rewards">
            {ROWS.map((row, i) =>
              rewards[row.k] ? (
                <div key={row.k} className={`cel-reward ${row.kind}`} data-reward={row.k}>
                  <Art k={FX_ART[row.kind]} size={30} />
                  <b>+<CountUp to={rewards[row.k]!} delay={250 + i * 150} /></b>
                  <span>{t(row.label)}</span>
                </div>
              ) : null,
            )}
          </div>
        )}
        <button className="btn block cel-go" onClick={dismiss} autoFocus>
          {any ? t("Collect") : t("Continue")}
        </button>
        {queue.length > 1 && <div className="cel-more small muted">{t("{n} more", { n: queue.length - 1 })}</div>}
      </div>
    </div>
  );
}
