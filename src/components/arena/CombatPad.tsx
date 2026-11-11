"use client";
// Touch controls on foot (rebuilt; the maths is in lib/input/touch.ts, styling in app/controls.css):
//  - left half: a floating stick that appears under the thumb wherever it lands; push it to the edge
//    to sprint (the ring turns amber);
//  - right half: drag anywhere to look, faster flicks turn further (and a look-sensitivity setting);
//    when the sights are up, a quick tap on it fires one shot;
//  - an arc of actions around the fire button under the right thumb: aim (hold to aim, tap to lock
//    it on), jump, crouch, reload, switch gun, and "car" only while one is within reach;
//  - a dead-eye button (slow motion while aiming), left-handed layout mirrors it all.
// Every finger is tracked by its pointer id, so a thumb on the stick, one on the look area and a
// third on a button never steal each other's events. Everything writes straight into the combat
// input (no React state while you play); the component is memoised so HUD updates never lag it.
import { memo, useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { t } from "@/lib/i18n";
import type { CombatInput } from "./combat";
import { SENS_TOUCH } from "./combat";
import { arc, footActions, lookGain, STICK_R, stickMove, type FootAction, type Stick } from "@/lib/input/touch";
import { buzz, useTouchPrefs } from "../drive/touchPrefs";

type Props = {
  input: CombatInput;
  /** Look sensitivity multiplier right now (aiming slows it). */
  sens: () => number;
  onReload: () => void;
  onSwap: () => void;
  onJump: () => void;
  onCar: () => void;
  /** Dead-eye held (slow motion while aiming). */
  onFocus: (on: boolean) => void;
  nearCar: boolean;
  inMatch: boolean;
};

const ARC_R = 134;
const TAP_MS = 220;
const TAP_PX = 12;

type Look = { x: number; y: number; t: number; x0: number; y0: number; t0: number; moved: boolean; fire: boolean };
const SLOTS: (FootAction | "swap")[] = ["swap", "reload", "crouch", "jump", "aim", "car"];

export const CombatPad = memo(function CombatPad({ input, sens, onReload, onSwap, onJump, onCar, onFocus, nearCar, inMatch }: Props) {
  const prefs = useTouchPrefs();
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef<(Stick & { id: number }) | null>(null);
  const looks = useRef(new Map<number, Look>());
  const firing = useRef(new Set<number>());
  const aimHeld = useRef<{ id: number; at: number } | null>(null);
  const aimLocked = useRef(false);
  const focusing = useRef(new Set<number>());
  const root = useRef<HTMLDivElement>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const cb = useRef({ onFocus });
  cb.current = { onFocus };

  const paintAim = () => root.current?.querySelector(".cp-btn.aim")?.classList.toggle("on", input.aim);
  const setAim = (v: boolean) => {
    input.aim = v;
    paintAim();
  };
  const setFire = () => {
    input.fire = firing.current.size > 0;
    root.current?.querySelector(".cp-fire")?.classList.toggle("on", input.fire);
  };

  // A finger that ended anywhere (iOS drops events for system swipes and the screen edge): release whatever it held.
  const endPointer = (id: number) => {
    if (stick.current?.id === id) {
      stick.current = null;
      input.mx = input.mz = 0;
      input.sprint = false;
      base.current?.classList.remove("on", "sprint");
      if (knob.current) knob.current.style.transform = "";
    }
    const l = looks.current.get(id);
    if (l) {
      looks.current.delete(id);
      // A quick, still tap on the look area fires one shot, but only with the sights up.
      if (!l.fire && !l.moved && performance.now() - l.t0 < TAP_MS && input.aim) {
        input.fire = true;
        setTimeout(setFire, 90);
      }
    }
    if (firing.current.delete(id)) setFire();
    if (aimHeld.current?.id === id) {
      const quick = performance.now() - aimHeld.current.at < 260;
      aimHeld.current = null;
      // Hold = aim while held; a quick tap locks the sights on (tap again to drop them).
      if (quick) {
        aimLocked.current = !aimLocked.current;
        setAim(aimLocked.current);
      } else if (!aimLocked.current) setAim(false);
    }
    if (focusing.current.delete(id) && focusing.current.size === 0) {
      cb.current.onFocus(false);
      root.current?.querySelector(".cp-btn.focus")?.classList.remove("on");
    }
  };

  useEffect(() => {
    const one = (e: PointerEvent) => endPointer(e.pointerId);
    const all = () => {
      for (const id of [stick.current?.id, ...looks.current.keys(), ...firing.current, aimHeld.current?.id, ...focusing.current]) if (id != null) endPointer(id);
      aimLocked.current = false;
      Object.assign(input, { mx: 0, mz: 0, sprint: false, fire: false, aim: false, act: false });
      cb.current.onFocus(false);
    };
    const hidden = () => document.hidden && all();
    window.addEventListener("pointerup", one, { capture: true, passive: true });
    window.addEventListener("pointercancel", one, { capture: true, passive: true });
    window.addEventListener("blur", all);
    window.addEventListener("pagehide", all);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerup", one, { capture: true });
      window.removeEventListener("pointercancel", one, { capture: true });
      window.removeEventListener("blur", all);
      window.removeEventListener("pagehide", all);
      document.removeEventListener("visibilitychange", hidden);
      all();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // ---- the floating stick
  const stickDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    const b = base.current;
    if (b) {
      const r = e.currentTarget.getBoundingClientRect();
      b.style.setProperty("--sx", `${e.clientX - r.left}px`);
      b.style.setProperty("--sy", `${e.clientY - r.top}px`);
      b.classList.add("on");
    }
    buzz(6);
  };
  const stickMoved = (e: RPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    const r = stickMove(s, e.clientX, e.clientY);
    input.mx = r.x;
    input.mz = r.y;
    if (r.sprint !== input.sprint) {
      input.sprint = r.sprint;
      if (r.sprint) buzz(12);
      base.current?.classList.toggle("sprint", r.sprint);
    }
    // The base follows the anchor when the thumb drags it past the rim.
    const el = e.currentTarget.getBoundingClientRect();
    base.current?.style.setProperty("--sx", `${s.ox - el.left}px`);
    base.current?.style.setProperty("--sy", `${s.oy - el.top}px`);
    if (knob.current) knob.current.style.transform = `translate(${r.knobX}px, ${r.knobY}px)`;
  };

  // ---- looking (the look area and the fire button)
  const lookDown = (e: RPointerEvent<HTMLElement>, fire = false) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now, x0: e.clientX, y0: e.clientY, t0: now, moved: false, fire });
  };
  const lookMoved = (e: RPointerEvent<HTMLElement>) => {
    const l = looks.current.get(e.pointerId);
    if (!l) return;
    const now = performance.now();
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    // Pixels per millisecond since the last event: a flick is fast, a nudge is slow.
    const speed = Math.hypot(dx, dy) / Math.max(4, now - l.t);
    const k = SENS_TOUCH * sens() * lookGain(speed, prefsRef.current.look);
    input.lookX += dx * k;
    input.lookY += dy * k;
    l.x = e.clientX;
    l.y = e.clientY;
    l.t = now;
    if (!l.moved && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) > TAP_PX) l.moved = true;
  };
  const fireDown = (e: RPointerEvent<HTMLElement>) => {
    lookDown(e, true);
    firing.current.add(e.pointerId);
    setFire();
    buzz(8);
  };

  // ---- the action buttons
  const tap = (fn: () => void, ms = 10) => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    buzz(ms);
    fn();
  };
  const aimDown = (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    aimHeld.current = { id: e.pointerId, at: performance.now() };
    setAim(true);
    buzz(8);
  };
  const crouchTap = tap(() => {
    input.crouch = !input.crouch;
    root.current?.querySelector(".cp-btn.crouch")?.classList.toggle("on", input.crouch);
  });
  const focusDown = (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    focusing.current.add(e.pointerId);
    cb.current.onFocus(true);
    e.currentTarget.classList.add("on");
    buzz(12);
  };

  const slots = arc(SLOTS.length, ARC_R, 94, 210, prefs.left);
  const shown = new Set<string>([...footActions({ nearCar, inMatch }), "swap"]);
  const rootCls = `cpad ${prefs.left ? "lh" : ""}`;
  const label: Record<string, string> = { swap: t("Switch gun"), reload: t("Reload"), crouch: t("Crouch"), jump: t("Jump"), aim: t("Aim"), car: t("Get in the car") };
  const onDown: Record<string, (e: RPointerEvent<HTMLElement>) => void> = {
    swap: tap(onSwap),
    reload: tap(onReload),
    crouch: crouchTap,
    jump: tap(onJump, 14),
    aim: aimDown,
    car: tap(onCar, 18),
  };

  return (
    <div className={rootCls} ref={root}>
      <div className="cpad-move" onPointerDown={stickDown} onPointerMove={stickMoved}>
        <div className="cpad-stick" ref={base}>
          <div className="cpad-knob" ref={knob} style={{ "--r": `${STICK_R}px` } as CSSProperties} />
        </div>
      </div>
      <div className="cpad-look" onPointerDown={(e) => lookDown(e)} onPointerMove={lookMoved} />
      <div className="cp-arc">
        <button className="cp-fire" aria-label={t("Fire")} onPointerDown={fireDown} onPointerMove={lookMoved}>
          <Icon d="crosshair" />
        </button>
        {!inMatch && (
          <button className="cp-btn focus" aria-label={t("Dead-eye (slow motion while aiming)")} onPointerDown={focusDown}>
            <Icon d="eye" />
          </button>
        )}
        {SLOTS.map((k, i) =>
          shown.has(k) ? (
            <button key={k} className={`cp-btn ${k}`} style={{ "--ax": `${slots[i].x}px`, "--ay": `${slots[i].y}px` } as CSSProperties} aria-label={label[k]} onPointerDown={onDown[k]}>
              <Icon d={k} />
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
});

const PATHS: Record<string, React.ReactNode> = {
  crosshair: (
    <>
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </>
  ),
  aim: (
    <>
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  jump: <path d="M6 14l6-6 6 6M6 19h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  crouch: <path d="M6 10l6 6 6-6M6 5h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  reload: <path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  swap: <path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  car: <path d="M4 15l1.6-5A2 2 0 0 1 7.5 8.5h9a2 2 0 0 1 1.9 1.5L20 15v3h-2.5v-1.5h-11V18H4zM7 12.5h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      {PATHS[d]}
    </svg>
  );
}

/**
 * Grenades on touch: hold the big button to see the throw's arc (keep looking with the
 * other thumb), let go to throw; with my C4 out it sets it off. The chip above it changes
 * which one is in hand.
 */
export function ThrowButton({ emoji, left, c4Out, aiming, onHold, onCycle, label, cycleLabel }: { emoji: string; left: number; c4Out: boolean; aiming: boolean; onHold: (on: boolean) => void; onCycle: () => void; label: string; cycleLabel: string }) {
  return (
    <div className="cpad-throw">
      <button className="cpad-throw-pick" aria-label={cycleLabel} onPointerDown={onCycle}>
        ⟳
      </button>
      <button
        className={`cpad-btn throw ${aiming ? "on" : ""} ${c4Out ? "det" : ""} ${left <= 0 && !c4Out ? "empty" : ""}`}
        aria-label={label}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), onHold(true))}
        onPointerUp={() => onHold(false)}
        onPointerCancel={() => onHold(false)}
      >
        <span aria-hidden>{c4Out ? "📡" : emoji}</span>
        {!c4Out && <b>{left}</b>}
      </button>
    </div>
  );
}

/** Hold-to-act (plant / defuse): a separate button, shown only when it applies. */
export function ActButton({ input, label, progress }: { input: CombatInput; label: string; progress: number }) {
  return (
    <button
      className="cpad-act"
      style={{ "--p": progress } as React.CSSProperties}
      onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), (input.act = true))}
      onPointerUp={() => (input.act = false)}
      onPointerCancel={() => (input.act = false)}
      onKeyDown={(e) => e.key === " " && (input.act = true)}
      onKeyUp={() => (input.act = false)}
    >
      <i aria-hidden />
      <span>{label}</span>
    </button>
  );
}
