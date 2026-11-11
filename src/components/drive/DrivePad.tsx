"use client";
// Touch controls for the 3D city, built like a racing game's: steering on the left
// (a wheel you drag, two buttons, or tilting the phone), pedals on the right, the
// handbrake and horn above them. Flyers get a drone stick instead of the wheel: left /
// right turns, up / down climbs and descends (mode 2, like a real drone remote).
//
// Everything here writes straight into the drive's input ref and paints itself through
// CSS variables and classes. No React state changes while you drive, so a busy HUD can
// never make a control lag, and the component itself is memoised: the drive's HUD
// updates don't re-render it.
//
// A control never waits on a touch the browser forgot to end (iOS drops the pointerup
// when a system swipe, a notification or the edge of the screen takes the finger):
// useLetGo releases it on any sign the finger is gone, and a new touch on a wheel or
// stick always takes it over instead of being ignored.
import { memo, useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { t } from "@/lib/i18n";
import type { Controls } from "./physics";
import { Icon } from "./icons";

export type SteerMode = "wheel" | "buttons" | "tilt";
export const STEER_MODES: SteerMode[] = ["wheel", "buttons", "tilt"];

type Input = { current: Controls & { focus?: boolean; nitro?: boolean } };
type Props = {
  input: Input;
  /** What the left thumb holds: a steering wheel, handlebars or a drone stick. */
  kind: "car" | "moto" | "air";
  mode: SteerMode;
  /** Pressed (true) and let go (false): the horn sounds while it's held. */
  onHorn: (on: boolean) => void;
  onLand: () => void;
};

/** Thumb travel (px) for full lock. Past it, the anchor follows, so turning back is instant. */
const WHEEL_TRAVEL = 64;
const STICK_R = 46;
/** Phone tilt (degrees) for full lock. */
const TILT_FULL = 24;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
/**
 * The safety net behind every control: `end(id)` for a pointer that ended anywhere on the
 * page, `end(null)` when the last finger leaves the screen or the page is hidden.
 */
function useLetGo(end: (id: number | null) => void) {
  const ref = useRef(end);
  ref.current = end;
  useEffect(() => {
    const one = (e: PointerEvent) => ref.current(e.pointerId);
    const touch = (e: TouchEvent) => e.touches.length === 0 && ref.current(null);
    const all = () => ref.current(null);
    const hidden = () => document.hidden && all();
    const opts = { capture: true, passive: true };
    window.addEventListener("pointerup", one, opts);
    window.addEventListener("pointercancel", one, opts);
    window.addEventListener("touchend", touch, opts);
    window.addEventListener("touchcancel", touch, opts);
    window.addEventListener("blur", all);
    window.addEventListener("pagehide", all);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerup", one, opts);
      window.removeEventListener("pointercancel", one, opts);
      window.removeEventListener("touchend", touch, opts);
      window.removeEventListener("touchcancel", touch, opts);
      window.removeEventListener("blur", all);
      window.removeEventListener("pagehide", all);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
}

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

type TiltEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
/** iOS asks for motion access once, from a tap. Elsewhere tilt is just there (or not at all). */
export async function askTilt(): Promise<boolean> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return false;
  const E = DeviceOrientationEvent as TiltEvent;
  if (typeof E.requestPermission !== "function") return true;
  try {
    return (await E.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export const DrivePad = memo(function DrivePad({ input, kind, mode, onHorn, onLand }: Props) {
  // Let go of everything when the controls change or go away.
  useEffect(() => {
    const release = () => Object.assign(input.current, { gas: 0, brake: 0, steer: 0, lift: 0, hand: false, focus: false, nitro: false });
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      release();
    };
  }, [input, kind, mode]);

  const air = kind === "air";
  return (
    <div className={`dpad ${air ? "air" : ""}`} data-mode={mode}>
      <div className="dpad-left">{air ? <Stick input={input} axes="yaw-lift" /> : mode === "buttons" ? <SteerButtons input={input} /> : mode === "tilt" ? <Tilt input={input} /> : <Wheel input={input} moto={kind === "moto"} />}</div>
      <div className="dpad-right">
        <div className="dpad-tools">
          {air ? (
            <button className="dpad-tool wide" onClick={onLand} aria-label={t("Land")}>
              <Icon name="land" size={20} />
              <span>{t("LAND")}</span>
            </button>
          ) : (
            <>
              <Hold className="dpad-tool" set={onHorn} label={t("Horn")}>
                <Icon name="horn" />
              </Hold>
              <Hold className="dpad-tool wide hand" set={(on) => (input.current.hand = on)} label={t("Handbrake")}>
                <Icon name="hand" size={20} />
                <span>{t("DRIFT")}</span>
              </Hold>
            </>
          )}
        </div>
        {!air && (
          // Hold: slow motion (focus) and nitro. Their meters are in the HUD (AbilityHud).
          <div className="dpad-tools ab">
            <Hold className="dpad-tool wide focus" set={(on) => (input.current.focus = on)} label={t("Focus (hold for slow motion)")}>
              <Icon name="focus" size={20} />
              <span>{t("FOCUS")}</span>
            </Hold>
            <Hold className="dpad-tool wide nitro" set={(on) => (input.current.nitro = on)} label={t("Nitro (hold)")}>
              <Icon name="nitro" size={20} />
              <span>{t("NITRO")}</span>
            </Hold>
          </div>
        )}
        {air ? <Stick input={input} axes="pitch" /> : <Pedals input={input} />}
      </div>
    </div>
  );
});

/** A button that's on while a finger is on it. */
function Hold({ set, className, label, children }: { set: (on: boolean) => void; className: string; label: string; children: React.ReactNode }) {
  const el = useRef<HTMLButtonElement>(null);
  const fingers = useRef(new Set<number>());
  const apply = () => {
    const v = fingers.current.size > 0;
    el.current?.classList.toggle("on", v);
    set(v);
  };
  const on = (e: RPointerEvent<HTMLButtonElement>, v: boolean) => {
    if (v) fingers.current.add(e.pointerId);
    else fingers.current.delete(e.pointerId);
    apply();
  };
  useLetGo((id) => {
    if (id == null ? !fingers.current.size : !fingers.current.delete(id)) return;
    if (id == null) fingers.current.clear();
    apply();
  });
  return (
    <button
      ref={el}
      className={className}
      aria-label={label}
      title={label}
      onPointerDown={(e) => (e.currentTarget.setPointerCapture?.(e.pointerId), on(e, true), buzz(6))}
      onPointerUp={(e) => on(e, false)}
      onPointerCancel={(e) => on(e, false)}
      onLostPointerCapture={(e) => on(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- pedals
/** How deep a pedal is pushed with the thumb at its very bottom (at the top: all the way). */
const PEDAL_MIN = 0.45;
/**
 * Gas and brake share one touch area, so a thumb can roll from one to the other without
 * lifting — whichever pedal is nearer the finger is the one pressed. Analog, like a sim
 * racer's: the higher up the pedal the thumb is, the deeper it's pushed (a feathered
 * throttle round a corner, a light brake in traffic); each pedal shows how deep it is.
 */
function Pedals({ input }: { input: Input }) {
  const gasEl = useRef<HTMLDivElement>(null);
  const brakeEl = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, { pedal: "gas" | "brake"; depth: number }>());
  const split = useRef(0);

  const apply = () => {
    let gas = 0, brake = 0;
    for (const f of fingers.current.values()) f.pedal === "gas" ? (gas = Math.max(gas, f.depth)) : (brake = Math.max(brake, f.depth));
    if (gas && !input.current.gas) buzz(8);
    if (brake && !input.current.brake) buzz(8);
    input.current.gas = gas;
    input.current.brake = brake;
    for (const [el, v] of [[gasEl.current, gas], [brakeEl.current, brake]] as const) {
      if (!el) continue;
      el.classList.toggle("on", v > 0);
      el.style.setProperty("--depth", v.toFixed(3));
    }
  };
  const read = (x: number, y: number) => {
    const pedal: "gas" | "brake" = x >= split.current ? "gas" : "brake";
    const r = (pedal === "gas" ? gasEl : brakeEl).current?.getBoundingClientRect();
    const k = r && r.height ? Math.max(0, Math.min(1, (r.bottom - y) / r.height)) : 1;
    return { pedal, depth: PEDAL_MIN + (1 - PEDAL_MIN) * k };
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const b = brakeEl.current?.getBoundingClientRect(), g = gasEl.current?.getBoundingClientRect();
    if (b && g) split.current = (b.right + g.left) / 2;
    fingers.current.set(e.pointerId, read(e.clientX, e.clientY));
    apply();
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, read(e.clientX, e.clientY));
    apply();
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (fingers.current.delete(e.pointerId)) apply();
  };
  useLetGo((id) => {
    if (id == null ? !fingers.current.size : !fingers.current.delete(id)) return;
    if (id == null) fingers.current.clear();
    apply();
  });
  useEffect(() => () => fingers.current.clear(), []);

  return (
    <div className="dpad-pedals" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      <div className="pedal-v2 brake" ref={brakeEl} role="button" aria-label={t("Brake / reverse")}>
        <i className="pedal-plate" />
        <i className="pedal-meter" />
        <span className="pedal-lb">{t("BRAKE")}</span>
      </div>
      <div className="pedal-v2 gas" ref={gasEl} role="button" aria-label={t("Gas")}>
        <i className="pedal-plate" />
        <i className="pedal-meter" />
        <span className="pedal-lb">{t("GAS")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- steering wheel
function Wheel({ input, moto }: { input: Input; moto: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const show = (s: number, held: boolean) => {
    const z = zone.current;
    if (!z) return;
    z.style.setProperty("--steer", s.toFixed(3));
    z.classList.toggle("on", held);
  };
  const release = (id: number | null) => {
    if (!drag.current || (id != null && drag.current.id !== id)) return;
    drag.current = null;
    input.current.steer = 0;
    show(0, false);
  };
  const end = (e: RPointerEvent) => release(e.pointerId);
  useLetGo(release);
  return (
    <div
      ref={zone}
      className={`dwheel ${moto ? "moto" : ""}`}
      aria-label={t("Steering: drag left or right")}
      onPointerDown={(e) => {
        // A new touch takes the wheel over: the old one may be a finger the browser lost.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX };
        show(input.current.steer, true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id !== e.pointerId) return;
        let dx = e.clientX - d.x;
        if (dx > WHEEL_TRAVEL) (d.x = e.clientX - WHEEL_TRAVEL), (dx = WHEEL_TRAVEL);
        if (dx < -WHEEL_TRAVEL) (d.x = e.clientX + WHEEL_TRAVEL), (dx = -WHEEL_TRAVEL);
        const s = clamp1(-dx / WHEEL_TRAVEL);
        input.current.steer = s;
        show(s, true);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="dwheel-rot">{moto ? <BarsArt /> : <WheelArt />}</div>
    </div>
  );
}

function WheelArt() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="dw-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4f5c" />
          <stop offset=".5" stopColor="#24272f" />
          <stop offset="1" stopColor="#121318" />
        </linearGradient>
        <radialGradient id="dw-hub" cx=".5" cy=".35" r=".7">
          <stop offset="0" stopColor="#555b69" />
          <stop offset="1" stopColor="#16181e" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="15" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="url(#dw-rim)" strokeWidth="12" />
      {/* Stitched grips at ten and two */}
      <path d="M17.7 38.5A50 50 0 0 1 35 16.7M85 16.7a50 50 0 0 1 17.3 21.8" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.2" strokeDasharray="2 3" />
      <circle cx="60" cy="60" r="55.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
      {/* Spokes: left, right, bottom */}
      <path d="M12 64 C30 66 40 70 46 70 M108 64 C90 66 80 70 74 70 M60 80 L60 108" fill="none" stroke="url(#dw-rim)" strokeWidth="9" strokeLinecap="round" />
      <circle cx="60" cy="66" r="17" fill="url(#dw-hub)" stroke="rgba(255,255,255,.18)" strokeWidth="1.2" />
      <circle cx="60" cy="66" r="6" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
      {/* Top-centre marker */}
      <rect x="56" y="4" width="8" height="12" rx="2" fill="var(--dpad-accent)" />
    </svg>
  );
}

function BarsArt() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden>
      <path d="M14 66 C30 56 44 52 60 52 C76 52 90 56 106 66" fill="none" stroke="#1a1c22" strokeWidth="9" strokeLinecap="round" />
      <path d="M14 66 C30 56 44 52 60 52 C76 52 90 56 106 66" fill="none" stroke="#5a606e" strokeWidth="5" strokeLinecap="round" />
      <rect x="2" y="60" width="24" height="13" rx="6" transform="rotate(-24 14 66)" fill="#16181d" stroke="rgba(255,255,255,.2)" />
      <rect x="94" y="60" width="24" height="13" rx="6" transform="rotate(24 106 66)" fill="#16181d" stroke="rgba(255,255,255,.2)" />
      <rect x="48" y="44" width="24" height="18" rx="5" fill="#2a2d35" stroke="rgba(255,255,255,.2)" />
      <circle cx="60" cy="53" r="3.5" fill="var(--dpad-accent)" />
    </svg>
  );
}

// ---------------------------------------------------------------- arrow buttons
function SteerButtons({ input }: { input: Input }) {
  const held = useRef({ l: new Set<number>(), r: new Set<number>() });
  const apply = (el: HTMLElement | null) => {
    const { l, r } = held.current;
    input.current.steer = (l.size ? 1 : 0) - (r.size ? 1 : 0);
    el?.parentElement?.querySelectorAll<HTMLElement>("[data-side]").forEach((b) => b.classList.toggle("on", held.current[b.dataset.side as "l" | "r"].size > 0));
  };
  const box = useRef<HTMLDivElement>(null);
  useLetGo((id) => {
    const { l, r } = held.current;
    if (id == null) {
      if (!l.size && !r.size) return;
      l.clear(), r.clear();
    } else if (!l.delete(id) && !r.delete(id)) return;
    apply(box.current?.firstElementChild as HTMLElement | null);
  });
  const handlers = (side: "l" | "r") => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      held.current[side].add(e.pointerId);
      buzz(6);
      apply(e.currentTarget);
    },
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => (held.current[side].delete(e.pointerId), apply(e.currentTarget)),
    onPointerCancel: (e: RPointerEvent<HTMLButtonElement>) => (held.current[side].delete(e.pointerId), apply(e.currentTarget)),
    onLostPointerCapture: (e: RPointerEvent<HTMLButtonElement>) => (held.current[side].delete(e.pointerId), apply(e.currentTarget)),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className="dsteer-btns" ref={box}>
      <button className="dsteer" data-side="l" aria-label={t("Steer left")} {...handlers("l")}>
        <Icon name="left" size={34} strokeWidth={2.6} />
      </button>
      <button className="dsteer" data-side="r" aria-label={t("Steer right")} {...handlers("r")}>
        <Icon name="right" size={34} strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- tilt
function Tilt({ input }: { input: Input }) {
  const el = useRef<HTMLButtonElement>(null);
  const zero = useRef<number | null>(null);
  const last = useRef(0);
  useEffect(() => {
    // Which way is "left" depends on how the phone is held.
    const angleOf = (e: DeviceOrientationEvent) => {
      const o = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
      if (o === 90) return e.beta ?? 0;
      if (o === -90 || o === 270) return -(e.beta ?? 0);
      return e.gamma ?? 0;
    };
    const on = (e: DeviceOrientationEvent) => {
      if (e.gamma == null && e.beta == null) return;
      const a = angleOf(e);
      last.current = a;
      if (zero.current == null) zero.current = a;
      const s = clamp1(-(a - zero.current) / TILT_FULL);
      input.current.steer = Math.abs(s) < 0.06 ? 0 : s;
      el.current?.style.setProperty("--steer", s.toFixed(3));
    };
    window.addEventListener("deviceorientation", on);
    return () => {
      window.removeEventListener("deviceorientation", on);
      input.current.steer = 0;
    };
  }, [input]);
  return (
    <button
      ref={el}
      className="dtilt"
      onClick={() => {
        zero.current = last.current;
        buzz(10);
      }}
      aria-label={t("Tilt to steer — tap to re-centre")}
    >
      <span className="dtilt-ring">
        <i className="dtilt-bar" />
        <i className="dtilt-dot" />
      </span>
      <span className="dtilt-lb">{t("Tap to centre")}</span>
    </button>
  );
}

// ---------------------------------------------------------------- flight sticks
/**
 * The flight sticks, laid out like a drone's or a helicopter's radio ("mode 2"): the left
 * stick turns (left / right) and climbs or sinks (up / down); the right one only tips the
 * nose — up flies forward, down backs off — as far as you push it.
 */
function Stick({ input, axes }: { input: Input; axes: "yaw-lift" | "pitch" }) {
  const zone = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const pitch = axes === "pitch";
  const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
  const show = (x: number, y: number, held: boolean) => {
    const z = zone.current;
    if (!z) return;
    z.style.setProperty("--kx", `${x.toFixed(1)}px`);
    z.style.setProperty("--ky", `${y.toFixed(1)}px`);
    z.classList.toggle("on", held);
  };
  const set = (x: number, y: number) => {
    if (pitch) {
      input.current.gas = Math.max(0, y);
      input.current.brake = Math.max(0, -y);
    } else {
      input.current.steer = x;
      input.current.lift = y;
    }
  };
  const release = (id: number | null) => {
    if (!drag.current || (id != null && drag.current.id !== id)) return;
    drag.current = null;
    set(0, 0);
    show(0, 0, false);
  };
  const end = (e: RPointerEvent) => release(e.pointerId);
  useLetGo(release);
  return (
    <div
      ref={zone}
      className={`dstick ${pitch ? "pitch" : ""}`}
      aria-label={pitch ? t("Stick: up to fly forward, down to back off") : t("Stick: left and right to turn, up and down to climb and descend")}
      onPointerDown={(e) => {
        // A new touch takes the stick over: the old one may be a finger the browser lost.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        show(0, 0, true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id !== e.pointerId) return;
        let dx = pitch ? 0 : e.clientX - d.x, dy = e.clientY - d.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_R) (dx *= STICK_R / len), (dy *= STICK_R / len);
        set(dead(-dx / STICK_R), dead(-dy / STICK_R));
        show(dx, dy, true);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="dstick-base">
        <i className="dstick-cross" />
        <i className="dstick-knob" />
      </div>
      <span className="dstick-lb">{pitch ? t("PITCH") : t("TURN · CLIMB")}</span>
    </div>
  );
}
