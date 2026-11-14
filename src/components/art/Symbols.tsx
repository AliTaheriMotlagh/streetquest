// Small original symbols for the places the game knows: the Iran and Turkey flags (the public national flags, redrawn as
// simple shapes), a line-art Istanbul emblem and a region chip. Inline SVG, no downloads, currentColor for the emblem.
import type { Country } from "@/lib/region";

/** A five-pointed star: r = outer radius, rotated by `rot` degrees (alternating outer and inner points). */
const starPoints = (cx: number, cy: number, r: number, rot: number) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = ((rot + k * 36) * Math.PI) / 180, rr = k % 2 ? r * 0.382 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

type FlagProps = { size?: number; className?: string; title?: string };
const flagStyle = (size: number) => ({ width: size * 1.5, height: size, borderRadius: size * 0.12, boxShadow: "0 0 0 1px rgba(255,255,255,.18)", flex: "none" as const, verticalAlign: "middle" });

export function FlagTR({ size = 16, className, title }: FlagProps) {
  return (
    <svg viewBox="0 0 30 20" className={className} style={flagStyle(size)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="30" height="20" fill="#e30a17" />
      <circle cx="10.6" cy="10" r="5" fill="#fff" />
      <circle cx="11.9" cy="10" r="4" fill="#e30a17" />
      <polygon points={starPoints(15.2, 10, 2.1, 0)} fill="#fff" />
    </svg>
  );
}

export function FlagIR({ size = 16, className, title }: FlagProps) {
  return (
    <svg viewBox="0 0 30 20" className={className} style={flagStyle(size)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="30" height="6.67" fill="#239f40" />
      <rect y="6.67" width="30" height="6.66" fill="#fff" />
      <rect y="13.33" width="30" height="6.67" fill="#da0000" />
      {/* A simple four-petal mark in the middle band. */}
      <g fill="#da0000" transform="translate(15 10)">
        {[0, 90].map((a) => <ellipse key={a} rx="0.9" ry="2.6" transform={`rotate(${a})`} />)}
        <circle r="0.7" fill="#fff" />
      </g>
    </svg>
  );
}

/** The flag for a country the game has words for; nothing for the rest. */
export function Flag({ country, size, className, title }: { country: Country } & FlagProps) {
  if (country === "TR") return <FlagTR size={size} className={className} title={title} />;
  if (country === "IR") return <FlagIR size={size} className={className} title={title} />;
  return null;
}

/** Istanbul as a line drawing: a domed mosque with two minarets, Galata Tower, the Bosphorus below. */
export function IstanbulEmblem({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 40" width={size * 1.6} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: "none", verticalAlign: "middle" }}>
      {/* Dome and half-domes. */}
      <path d="M10 28 V22 Q10 12 22 12 Q34 12 34 22 V28" />
      <path d="M10 22 Q10 17 14 17 M34 22 Q34 17 30 17" />
      <path d="M22 12 V9 M20.5 9 h3" />
      {/* Minarets with pencil tips. */}
      <path d="M5 28 V14 l1.6 -5 l1.6 5 V28 M36 28 V14 l1.6 -5 l1.6 5 V28" />
      <path d="M5 17 h3.2 M36 17 h3.2" />
      {/* Galata Tower: a drum with a gallery and a cone. */}
      <path d="M49 28 V17 h8 V28 M47.5 17 h11 M49 17 l4 -8 l4 8 M53 9 V6" />
      {/* The Bosphorus. */}
      <path d="M2 33 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 M8 38 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0" strokeWidth="1.3" />
    </svg>
  );
}

/** Flag (or, in Istanbul, the city mark) with the place's name — the small chip wherever a location shows. */
export function RegionChip({ country, label, istanbul }: { country: Country; label?: string; istanbul?: boolean }) {
  if (country !== "TR" && country !== "IR") return null;
  return (
    <span className="region-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {istanbul ? <IstanbulEmblem size={16} /> : <Flag country={country} size={13} />}
      {label && <span>{label}</span>}
    </span>
  );
}
