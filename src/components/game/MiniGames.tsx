"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Lockpick: a needle sweeps the dial — tap when it's in the green zone.
 * Set 3 pins before 3 slips. Score: 3 = flawless, 1–2 = opened, 0 = failed.
 */
export function Lockpick({ onDone }: { onDone: (score: number) => void }) {
  const [pins, setPins] = useState<("ok" | "bad" | "")[]>([]);
  const [zone, setZone] = useState(() => ({ start: Math.random() * 300, size: 50 }));
  const [angle, setAngle] = useState(0);
  const speed = useRef(150); // deg/s
  const ang = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      ang.current = (ang.current + ((t - last) / 1000) * speed.current) % 360;
      last = t;
      setAngle(ang.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ok = pins.filter((p) => p === "ok").length;
  const bad = pins.filter((p) => p === "bad").length;

  const finish = (score: number) => {
    if (done.current) return;
    done.current = true;
    setTimeout(() => onDone(score), 500);
  };

  const pick = () => {
    if (done.current) return;
    navigator.vibrate?.(30);
    const rel = (ang.current - zone.start + 360) % 360;
    const hit = rel <= zone.size;
    const next = [...pins, hit ? "ok" : "bad"] as typeof pins;
    setPins(next);
    const nOk = next.filter((p) => p === "ok").length;
    const nBad = next.length - nOk;
    if (hit) {
      speed.current += 70;
      setZone({ start: Math.random() * 300, size: Math.max(28, zone.size - 8) });
    }
    if (nOk >= 3) finish(nBad === 0 ? 3 : nBad === 1 ? 2 : 1);
    else if (nBad >= 3) finish(0);
  };

  return (
    <div>
      <h2>Crack the chest</h2>
      <p className="muted small">Tap when the needle is in the green zone</p>
      <div className="lock" onClick={pick} role="button" aria-label="Pick lock">
        <div
          className="zone"
          style={{ background: `conic-gradient(from ${zone.start}deg, rgba(61,255,143,.55) 0deg ${zone.size}deg, transparent ${zone.size}deg)` }}
        />
        <div className="needle" style={{ transform: `rotate(${angle + 180}deg)` }} />
        <div className="hub" />
      </div>
      <div className="pins">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < ok ? "ok" : ""} />
        ))}
        <span style={{ width: 16 }} />
        {[0, 1, 2].map((i) => (
          <i key={`b${i}`} className={i < bad ? "bad" : ""} />
        ))}
      </div>
      <button className="btn yellow block" onClick={pick} style={{ marginTop: 8 }}>
        PICK
      </button>
    </div>
  );
}

/** Tap Rush: 15 seconds to smash as many targets as you can. Gold ones are worth 3. */
export function TapRush({ onDone }: { onDone: (score: number) => void }) {
  const [time, setTime] = useState(15);
  const [score, setScore] = useState(0);
  const [targets, setTargets] = useState<{ id: number; x: number; y: number; gold: boolean }[]>([]);
  const [started, setStarted] = useState(false);
  const id = useRef(0);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (!started) return;
    const spawn = setInterval(() => {
      const t = { id: ++id.current, x: 10 + Math.random() * 80, y: 10 + Math.random() * 80, gold: Math.random() < 0.15 };
      setTargets((ts) => [...ts.slice(-5), t]);
      setTimeout(() => setTargets((ts) => ts.filter((x) => x.id !== t.id)), 950);
    }, 420);
    const clock = setInterval(() => setTime((s) => s - 1), 1000);
    return () => {
      clearInterval(spawn);
      clearInterval(clock);
    };
  }, [started]);

  useEffect(() => {
    if (time <= 0) onDone(scoreRef.current);
  }, [time]); // eslint-disable-line react-hooks/exhaustive-deps

  const hit = (t: { id: number; gold: boolean }) => {
    navigator.vibrate?.(15);
    scoreRef.current += t.gold ? 3 : 1;
    setScore(scoreRef.current);
    setTargets((ts) => ts.filter((x) => x.id !== t.id));
  };

  return (
    <div>
      <h2>Tap Rush</h2>
      <div className="row" style={{ justifyContent: "space-around", marginTop: 8 }}>
        <div>
          <div className="big-num" style={{ color: "var(--yellow)" }}>{score}</div>
          <div className="small muted">SCORE</div>
        </div>
        <div>
          <div className="big-num" style={{ color: time <= 5 ? "var(--red)" : "var(--cyan)" }}>{Math.max(0, time)}</div>
          <div className="small muted">SECONDS</div>
        </div>
      </div>
      <div className="arena">
        {!started && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <button className="btn" onClick={() => setStarted(true)}>
              ▶ Start
            </button>
          </div>
        )}
        {targets.map((t) => (
          <button key={t.id} className="target-dot" style={{ left: `${t.x}%`, top: `${t.y}%` }} onPointerDown={() => hit(t)}>
            {t.gold ? "💰" : "🎯"}
          </button>
        ))}
      </div>
    </div>
  );
}
