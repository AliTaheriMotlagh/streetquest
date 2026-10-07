"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMBO_MAX,
  COMBO_STEP,
  DEFUSE_MS,
  DEFUSE_STRIKES,
  defuseRounds,
  defuseScore,
  RANGE_MAG,
  RANGE_MS,
  RANGE_POINTS,
  RANGE_RELOAD_MS,
  RANGE_SLOTS,
  rangeSchedule,
  WIRES,
} from "@/lib/minigames";

/** Milliseconds since `startAt`, re-rendering every animation frame. */
function useClock(startAt: number, running: boolean) {
  const [t, setT] = useState(() => Date.now() - startAt);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      setT(Date.now() - startAt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startAt, running]);
  return t;
}

const fmt = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}`;

/**
 * Shooting Range: hostiles pop up in the windows of a street facade. Tap them,
 * spare the civilians, reload when the mag runs dry. Hits in a row build a combo.
 * Same seed = same targets for every player in the lobby.
 */
export function ShootingRange({ seed, startAt, onDone }: { seed: number; startAt: number; onDone: (score: number) => void }) {
  const schedule = useMemo(() => rangeSchedule(seed), [seed]);
  const [done, setDone] = useState(false);
  const t = useClock(startAt, !done);
  const [hit, setHit] = useState<Set<number>>(() => new Set());
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [ammo, setAmmo] = useState(RANGE_MAG);
  const [reloadUntil, setReloadUntil] = useState(0);
  const [fx, setFx] = useState<{ slot: number; text: string; good: boolean; id: number } | null>(null);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (!done && t >= RANGE_MS) {
      setDone(true);
      onDone(scoreRef.current);
    }
  }, [t, done, onDone]);

  const reloading = Date.now() < reloadUntil;
  useEffect(() => {
    if (reloadUntil && !reloading) setAmmo(RANGE_MAG);
  }, [reloading, reloadUntil]);

  const reload = () => {
    if (reloading || ammo === RANGE_MAG) return;
    navigator.vibrate?.(20);
    setReloadUntil(Date.now() + RANGE_RELOAD_MS);
  };

  const shoot = (slot: number) => {
    if (done || t < 0) return;
    if (reloading) return;
    if (ammo <= 0) return reload();
    setAmmo((a) => a - 1);
    const target = schedule.find((p) => p.slot === slot && !hit.has(p.id) && t >= p.t && t < p.t + p.dur);
    let delta = 0;
    if (!target) {
      setCombo(0);
    } else {
      setHit((h) => new Set(h).add(target.id));
      if (target.kind === "civilian") {
        delta = RANGE_POINTS.civilian;
        setCombo(0);
        navigator.vibrate?.([60, 40, 60]);
      } else {
        const bonus = Math.min(COMBO_MAX, combo * COMBO_STEP);
        delta = RANGE_POINTS[target.kind] + bonus;
        setCombo((c) => c + 1);
        navigator.vibrate?.(15);
      }
    }
    scoreRef.current += delta;
    setScore(scoreRef.current);
    setFx({ slot, text: target ? (delta > 0 ? `+${delta}` : `${delta}`) : "miss", good: delta > 0, id: Math.random() });
  };

  const visible = (slot: number) => schedule.find((p) => p.slot === slot && t >= p.t && t < p.t + p.dur);

  return (
    <div className="mg">
      <div className="mg-hud">
        <div><b className="big-num" style={{ color: "var(--yellow)" }}>{score}</b><span>SCORE</span></div>
        <div><b className="big-num" style={{ color: combo >= 3 ? "var(--pink)" : "var(--muted)" }}>×{combo}</b><span>COMBO</span></div>
        <div><b className="big-num" style={{ color: RANGE_MS - t < 5000 ? "var(--red)" : "var(--cyan)" }}>{t < 0 ? fmt(RANGE_MS) : fmt(RANGE_MS - t)}</b><span>SEC</span></div>
      </div>
      <div className="facade">
        {Array.from({ length: RANGE_SLOTS }, (_, slot) => {
          const p = visible(slot);
          const shot = p && hit.has(p.id);
          return (
            <button key={slot} className={`window ${p ? "open" : ""} ${p?.kind ?? ""} ${shot ? "shot" : ""}`} onPointerDown={() => shoot(slot)} aria-label={`Window ${slot + 1}`}>
              <span className="shade" />
              {p && <span className="who">{shot ? (p.kind === "civilian" ? "😱" : "💥") : p.emoji}</span>}
              {fx?.slot === slot && <span key={fx.id} className={`pop ${fx.good ? "good" : "bad"}`}>{fx.text}</span>}
            </button>
          );
        })}
        {t < 0 && <div className="mg-count">{fmt(-t)}</div>}
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="mag">
          {Array.from({ length: RANGE_MAG }, (_, i) => <i key={i} className={i < ammo && !reloading ? "on" : ""} />)}
        </div>
        <button className="btn yellow small" onPointerDown={reload} disabled={reloading || ammo === RANGE_MAG}>{reloading ? "Reloading…" : ammo === 0 ? "⟳ RELOAD!" : "⟳ Reload"}</button>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>Hostiles +10 · 😈 boss +30 · civilians −25 · combos add up to +10</p>
    </div>
  );
}

/**
 * Bomb Defuse: the detonator flashes a wire sequence — cut the wires in that order.
 * Three rounds, longer each time. Two wrong cuts are forgiven; the third is BOOM.
 */
export function BombDefuse({ seed, startAt, onDone, title = "Defuse the crate" }: { seed: number; startAt: number; onDone: (score: number) => void; title?: string }) {
  const rounds = useMemo(() => defuseRounds(seed), [seed]);
  const [round, setRound] = useState(0);
  const [cut, setCut] = useState<number[]>([]); // wire ids cut correctly this round
  const [strikes, setStrikes] = useState(0);
  const [showFrom, setShowFrom] = useState(startAt); // when the current sequence playback started
  const [result, setResult] = useState<"won" | "boom" | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const t = useClock(startAt, !result);
  const finished = useRef(false);

  const r = rounds[Math.min(round, rounds.length - 1)];
  const FLASH = 520;
  const GAP = 160;
  const showT = Date.now() - showFrom;
  const showing = showT < r.sequence.length * (FLASH + GAP);
  const lit = showing && showT >= 0 && showT % (FLASH + GAP) < FLASH ? r.sequence[Math.floor(showT / (FLASH + GAP))] : null;

  const finish = (score: number, how: "won" | "boom") => {
    if (finished.current) return;
    finished.current = true;
    setResult(how);
    navigator.vibrate?.(how === "boom" ? [200, 80, 200] : [40, 30, 40]);
    setTimeout(() => onDone(score), 900);
  };

  useEffect(() => {
    if (!finished.current && t >= DEFUSE_MS) finish(defuseScore(round, 0), "boom");
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  const snip = (wire: number) => {
    if (result || showing || t < 0) return;
    const need = r.sequence[cut.length];
    if (wire === need) {
      navigator.vibrate?.(20);
      const next = [...cut, wire];
      if (next.length === r.sequence.length) {
        if (round + 1 >= rounds.length) return finish(defuseScore(rounds.length, DEFUSE_MS - t), "won");
        setRound(round + 1);
        setCut([]);
        setShowFrom(Date.now() + 500);
      } else setCut(next);
      return;
    }
    setWrong(wire);
    setTimeout(() => setWrong(null), 400);
    if (strikes + 1 > DEFUSE_STRIKES) return finish(defuseScore(round, 0), "boom");
    setStrikes(strikes + 1);
    setCut([]);
    setShowFrom(Date.now() + 600); // replay the sequence
  };

  const left = DEFUSE_MS - Math.max(0, t);
  return (
    <div className="mg">
      <h2 style={{ margin: "0 0 4px" }}>{title}</h2>
      <div className={`bomb ${result ?? ""}`}>
        <div className="bomb-top">
          <span className="led-time">{t < 0 ? "--:--" : `00:${String(Math.max(0, Math.ceil(left / 1000))).padStart(2, "0")}`}</span>
          <span className="bomb-round">ROUND {Math.min(round + 1, 3)}/3</span>
          <span className="bomb-strikes">{Array.from({ length: DEFUSE_STRIKES + 1 }, (_, i) => <i key={i} className={i < strikes ? "x" : ""} />)}</span>
        </div>
        <div className="bomb-seq">
          {r.sequence.map((w, i) => (
            <i key={i} style={{ background: i < cut.length ? WIRES[w].color : lit === w && Math.floor(showT / (FLASH + GAP)) === i ? WIRES[w].color : undefined }} className={i < cut.length ? "done" : ""} />
          ))}
        </div>
        <div className="wires">
          {r.wires.map((w) => (
            <button
              key={w}
              className={`wire ${lit === w ? "lit" : ""} ${wrong === w ? "wrong" : ""} ${cut.includes(w) && cut[cut.length - 1] === w ? "snipped" : ""}`}
              style={{ ["--c" as string]: WIRES[w].color }}
              onPointerDown={() => snip(w)}
              aria-label={`Cut ${WIRES[w].key} wire`}
            >
              <span />
            </button>
          ))}
        </div>
        {t < 0 && <div className="mg-count">{fmt(-t)}</div>}
        {result === "boom" && <div className="mg-count boom">💥</div>}
        {result === "won" && <div className="mg-count" style={{ color: "var(--green)" }}>✓</div>}
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>{showing ? "👀 Watch the detonator…" : t < 0 ? "Get ready…" : "✂️ Cut the wires in the order shown"}</p>
    </div>
  );
}
