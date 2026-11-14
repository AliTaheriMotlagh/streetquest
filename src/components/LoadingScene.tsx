"use client";
// The one loading scene, wherever the game waits (the app starting, the 3D code downloading, the
// city being drawn): a dusk sky over Tehran — the Alborz behind, Milad and Azadi towers on the
// skyline (over Istanbul for Turkish players: hills, a domed mosque with minarets, Galata Tower) — whose windows light up one by one as loading goes on, a car driving down a road that
// scrolls under it, the title with a light sweeping across, the bar, what's happening and a tip.
// `out`: the scene lifts away like a curtain (the city is ready). All SVG + CSS (app/loading.css),
// nothing to download; still when the device asks for less motion.
import type { ReactNode } from "react";
import { fmtNum } from "@/lib/i18n";
import { useLocale } from "./I18nProvider";

/** A small deterministic random (the skyline is the same every time). */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The near blocks of flats: x, width, height (viewBox 1200 × 300, ground at 262). */
const BLOCKS = Array.from({ length: 22 }, (_, i) => {
  const w = 38 + Math.floor(rnd(i) * 40), h = 40 + Math.floor(rnd(i + 50) * 75);
  return { x: i * 56 - 10 + Math.floor(rnd(i + 9) * 14), w, h };
});
/** Their windows, in the order they light up. */
const WINDOWS = BLOCKS.flatMap((b, bi) => {
  const out: { x: number; y: number; k: number }[] = [];
  for (let y = 262 - b.h + 10; y < 250; y += 15) for (let x = b.x + 6; x < b.x + b.w - 8; x += 11) out.push({ x, y, k: rnd(bi * 97 + x * 3 + y) });
  return out;
}).sort((a, b) => a.k - b.k);

export function LoadingScene({ pct, title, sub, stage, tip, out, className, children }: { pct?: number | null; title: string; sub?: string; stage?: string; tip?: string; out?: boolean; className?: string; children?: ReactNode }) {
  const istanbul = useLocale() === "tr";
  const known = typeof pct === "number";
  const lit = Math.round(WINDOWS.length * (known ? Math.max(0.06, pct! / 100) : 0.35));
  return (
    <div className={`ls ${out ? "out" : ""} ${className ?? ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct! : undefined} aria-label={stage ?? title}>
      <div className="ls-sky" aria-hidden>
        <i className="ls-sun" />
        <i className="ls-stars" />
      </div>
      <svg className="ls-city" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
        {istanbul ? (
          <>
            {/* The hills above the Bosphorus. */}
            <path className="ls-mtn" d="M0 190 Q120 140 260 175 T520 160 T800 170 T1060 150 T1200 170 V300 H0Z" />
            <g className="ls-far">
              {/* A domed mosque: the dome, half-domes and two pencil minarets. */}
              <path d="M440 266 V205 Q440 160 500 160 Q560 160 560 205 V266Z M424 266 V190 l6 -22 l6 22 V266Z M564 266 V190 l6 -22 l6 22 V266Z M440 215 Q440 188 466 188 V215Z M560 215 Q560 188 534 188 V215Z" />
              <rect x="498" y="140" width="4" height="22" />
              {/* Galata Tower: the drum, the gallery, the cone. */}
              <rect x="684" y="150" width="22" height="116" />
              <rect x="679" y="146" width="32" height="8" />
              <path d="M684 146 L695 104 L706 146Z" />
              <circle cx="695" cy="100" r="3" className="ls-blink" />
              {/* Low far blocks. */}
              <path d="M0 266 V214 h60 V200 h50 V222 h70 V206 h60 V266Z M780 266 V208 h70 V194 h60 V216 h90 V202 h80 V266Z M1000 266 V212 h70 V198 h60 V218 h70 V266Z" />
            </g>
          </>
        ) : (
          <>
        {/* The Alborz, snow on the tops. */}
          <path className="ls-mtn" d="M0 170 L90 120 L160 150 L260 80 L340 130 L430 95 L520 140 L610 70 L700 125 L790 100 L880 145 L980 85 L1080 135 L1200 105 L1200 300 L0 300Z" />
          <path className="ls-snow" d="M245 90 L260 80 L276 92 L266 96Z M597 80 L610 70 L626 82 L614 86Z M966 95 L980 85 L995 97 L984 100Z" />
          {/* Milad Tower: the shaft, the pod, the mast. */}
          <g className="ls-far">
            <rect x="688" y="96" width="10" height="170" />
            <path d="M672 120 h42 l-6 22 h-30z" />
            <rect x="691" y="40" width="4" height="58" />
            <circle cx="693" cy="40" r="3" className="ls-blink" />
            {/* Azadi Tower: the arch on its wide feet, the flared crown. */}
            <path d="M470 266 L490 150 Q525 108 560 150 L580 266 L554 266 Q525 190 496 266Z M482 152 h86 l-7 -16 h-72z" />
            {/* Low far blocks. */}
            <path d="M0 266 V214 h60 V200 h50 V222 h70 V206 h60 V266Z M380 266 V208 h70 V194 h60 V216 h90 V202 h80 V266Z M940 266 V210 h80 V196 h70 V218 h110 V266Z" />
          </g>
          </>
        )}
        {/* Near blocks of flats, their windows lighting up as it loads. */}
        <g className="ls-near">
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x} y={262 - b.h} width={b.w} height={b.h} rx="2" />
          ))}
        </g>
        <g className="ls-win">
          {WINDOWS.map((w, i) => (
            <rect key={i} x={w.x} y={w.y} width="6" height="8" className={i < lit ? "on" : ""} />
          ))}
        </g>
      </svg>
      <div className="ls-road" aria-hidden>
        <i className="ls-dash" />
        <svg className="ls-car" viewBox="0 0 120 50" aria-hidden>
          <path className="ls-beam" d="M112 30 L240 14 L240 52Z" />
          <path className="ls-body" d="M6 34 Q6 26 16 25 L34 23 L48 12 Q54 8 64 8 L84 9 Q92 10 98 18 L104 24 Q114 25 114 32 L114 38 L6 38Z" />
          <path className="ls-glass" d="M50 13 Q55 11 63 11 L72 11 L72 23 L40 23Z M76 11 L84 12 Q90 13 94 19 L97 23 L76 23Z" />
          <circle className="ls-lamp" cx="111" cy="29" r="2.5" />
          <g className="ls-wheel" style={{ transformOrigin: "30px 38px" }}><circle cx="30" cy="38" r="9" /><path d="M30 31v14M23 38h14" /></g>
          <g className="ls-wheel" style={{ transformOrigin: "92px 38px" }}><circle cx="92" cy="38" r="9" /><path d="M92 31v14M85 38h14" /></g>
        </svg>
      </div>
      <div className="ls-card">
        <div className="ls-title">{title}</div>
        {sub && <div className="ls-sub">{sub}</div>}
        <div className={`ls-bar ${known ? "" : "wait"}`} aria-hidden>
          <i style={known ? { transform: `scaleX(${Math.max(0.02, pct! / 100)})` } : undefined} />
        </div>
        {(stage || known) && (
          <div className="ls-stage">
            <span>{stage}</span>
            {known && <b>{fmtNum(Math.round(pct!))}%</b>}
          </div>
        )}
        {tip && (
          <p className="ls-tip" key={tip}>
            {tip}
          </p>
        )}
        {children && <div className="ls-actions">{children}</div>}
      </div>
    </div>
  );
}
