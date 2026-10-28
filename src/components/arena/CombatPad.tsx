"use client";
// Touch controls on foot, laid out like a mobile shooter:
//  - left thumb: a floating stick wherever you put it down (push it to the edge to sprint);
//  - right thumb: drag anywhere to look; the big fire button aims too while you hold it
//    (fire and turn with one thumb), with a second fire button above the stick;
//  - aim (sights), jump, crouch, reload, swap gun; a hold button to plant / defuse.
// Everything writes straight into the combat input (no React state while you play) and
// the component is memoised, so HUD updates never make a control lag.
import { memo, useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { t } from "@/lib/i18n";
import type { CombatInput } from "./combat";
import { SENS_TOUCH } from "./combat";

type Props = {
  input: CombatInput;
  /** Look sensitivity multiplier (aiming slows it). */
  sens: () => number;
  onReload: () => void;
  onSwap: () => void;
  onJump: () => void;
};

const STICK_R = 54;

export const CombatPad = memo(function CombatPad({ input, sens, onReload, onSwap, onJump }: Props) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const looks = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const release = () => {
      Object.assign(input, { mx: 0, mz: 0, sprint: false, fire: false, aim: false, act: false });
      stick.current = null;
      looks.current.clear();
    };
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      release();
    };
  }, [input]);

  // ---- the stick
  const stickDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const b = base.current;
    if (b) {
      const r = e.currentTarget.getBoundingClientRect();
      b.style.setProperty("--sx", `${e.clientX - r.left}px`);
      b.style.setProperty("--sy", `${e.clientY - r.top}px`);
      b.classList.add("on");
    }
  };
  const stickMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const d = Math.hypot(dx, dy);
    // Past the rim the base follows the thumb (no dead zone when you reverse).
    if (d > STICK_R * 1.25) {
      s.x += (dx / d) * (d - STICK_R * 1.25);
      s.y += (dy / d) * (d - STICK_R * 1.25);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    const k = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const ang = Math.atan2(dy, dx);
    input.mx = Math.cos(ang) * k;
    input.mz = -Math.sin(ang) * k;
    input.sprint = Math.hypot(dx, dy) > STICK_R * 1.1 && input.mz > 0.6;
    if (knob.current) knob.current.style.transform = `translate(${Math.cos(ang) * k * STICK_R}px, ${Math.sin(ang) * k * STICK_R}px)`;
    base.current?.classList.toggle("sprint", input.sprint);
  };
  const stickUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    input.mx = input.mz = 0;
    input.sprint = false;
    base.current?.classList.remove("on", "sprint");
    if (knob.current) knob.current.style.transform = "";
  };

  // ---- looking (the look area and the fire buttons)
  const lookDown = (e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const lookMove = (e: RPointerEvent<HTMLElement>) => {
    const l = looks.current.get(e.pointerId);
    if (!l) return;
    const k = SENS_TOUCH * sens();
    input.lookX += (e.clientX - l.x) * k;
    input.lookY += (e.clientY - l.y) * k;
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: RPointerEvent<HTMLElement>) => {
    looks.current.delete(e.pointerId);
  };
  const fireDown = (e: RPointerEvent<HTMLElement>) => {
    lookDown(e);
    input.fire = true;
    e.currentTarget.classList.add("on");
  };
  const fireUp = (e: RPointerEvent<HTMLElement>) => {
    lookUp(e);
    // Another finger may still be on a fire button.
    input.fire = [...document.querySelectorAll(".cpad-fire.on")].length > 1;
    e.currentTarget.classList.remove("on");
  };
  const hold = (key: "aim" | "act" | "crouch", toggle = false) => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      input[key] = toggle ? !input[key] : true;
      e.currentTarget.classList.toggle("on", input[key]);
    },
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => {
      if (!toggle) {
        input[key] = false;
        e.currentTarget.classList.remove("on");
      }
    },
    onPointerCancel: (e: RPointerEvent<HTMLButtonElement>) => {
      if (!toggle) {
        input[key] = false;
        e.currentTarget.classList.remove("on");
      }
    },
  });

  return (
    <div className="cpad">
      <div className="cpad-move" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}>
        <div className="cpad-stick" ref={base}>
          <div className="cpad-knob" ref={knob} />
        </div>
      </div>
      <div className="cpad-look" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      <button className="cpad-fire small" aria-label={t("Fire")} onPointerDown={fireDown} onPointerMove={lookMove} onPointerUp={fireUp} onPointerCancel={fireUp}>
        <Crosshair />
      </button>
      <div className="cpad-right">
        <button className="cpad-fire" aria-label={t("Fire")} onPointerDown={fireDown} onPointerMove={lookMove} onPointerUp={fireUp} onPointerCancel={fireUp}>
          <Crosshair />
        </button>
        <button className="cpad-btn aim" aria-label={t("Aim")} {...hold("aim", true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>
        </button>
        <button className="cpad-btn jump" aria-label={t("Jump")} onPointerDown={onJump}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M6 14l6-6 6 6M6 19h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className="cpad-btn crouch" aria-label={t("Crouch")} {...hold("crouch", true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M6 10l6 6 6-6M6 5h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className="cpad-btn reload" aria-label={t("Reload")} onPointerDown={onReload}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className="cpad-btn swap" aria-label={t("Switch gun")} onPointerDown={onSwap}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
});

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

function Crosshair() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
