// The game's art kit: every icon is a few vector shapes on a 64×64 grid, painted with
// shared top-lit "materials" (gradients) and wrapped in one dark sticker outline, the
// look of a mobile strategy game's UI art. Pure strings — no DOM — so the same art can
// be drawn by React, inside Leaflet marker HTML, or into a preview sheet.

/** Outline colour and width (in 64-grid units): ~1.5px at 20px, ~4px at 56px. */
export const OL = "#1c1430";
export const OLW = 5;

// ---------------------------------------------------------------- materials
// [top, middle, bottom] — light comes from the top-left.
export const MATERIALS: Record<string, [string, string, string]> = {
  gold: ["#fff6b5", "#ffcf3a", "#e88a00"],
  goldDark: ["#ffd25a", "#e9a100", "#a95a00"],
  silver: ["#ffffff", "#d3dbe8", "#8792aa"],
  bronze: ["#ffd9ad", "#e3904f", "#97471b"],
  red: ["#ffa3a8", "#ff3d55", "#ae0f2c"],
  redDark: ["#ff6b77", "#d01a35", "#7c0a1f"],
  orange: ["#ffd79a", "#ff8c1f", "#c44a00"],
  yellow: ["#fff9b8", "#ffe03d", "#e3a400"],
  green: ["#c3ffd3", "#3ddc6e", "#0f7d36"],
  greenDark: ["#7de39a", "#1f9e4a", "#0a5a27"],
  lime: ["#efffb0", "#a6e83a", "#5a9a0f"],
  cyan: ["#c9fbff", "#28d6f0", "#0a77a3"],
  blue: ["#b5dbff", "#3d86f5", "#1a3aa6"],
  navy: ["#7d95d9", "#2c4596", "#141f57"],
  purple: ["#e6ccff", "#a95af7", "#5e1d9e"],
  pink: ["#ffc9e6", "#ff4fa6", "#b0126a"],
  wood: ["#f0c286", "#b97a3c", "#73431b"],
  woodDark: ["#b07a44", "#7a4a20", "#45260c"],
  steel: ["#eef2f8", "#97a3bb", "#4d5873"],
  dark: ["#77708f", "#3b3554", "#1b1730"],
  white: ["#ffffff", "#f1f4fa", "#c3cddd"],
  paper: ["#fffbf0", "#f5e6c6", "#d6b984"],
  skin: ["#ffe4c8", "#f6b98a", "#cc8550"],
  glass: ["#eafcff", "#8fe6ff", "#2f9fd8"],
  fire: ["#fff4a3", "#ffa21f", "#ff3d1f"],
  stone: ["#d9dde8", "#9aa1b8", "#5b6280"],
  sand: ["#fff1c2", "#f2c46a", "#c58a2a"],
  sky: ["#d6f1ff", "#7cc8ff", "#3b86d6"],
  mint: ["#d6fff1", "#4fe3b5", "#119a74"],
  black: ["#5d5870", "#2a2638", "#100d1a"],
  olive: ["#d3e09a", "#7f9a3a", "#435716"],
  brown: ["#e0a878", "#9c5f33", "#5a3015"],
};

/** <defs> with every material as a gradient (`url(#m-gold)`), plus a soft sphere shine. */
export function materialDefs() {
  let out = "";
  for (const [k, [a, b, c]] of Object.entries(MATERIALS))
    out += `<linearGradient id="m-${k}" x1="0.15" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  // Radial versions for balls and domes.
  for (const k of ["dark", "black", "red", "blue", "green", "yellow", "purple", "cyan", "orange", "gold", "white", "pink", "sky", "mint", "steel", "lime"]) {
    const [a, b, c] = MATERIALS[k];
    out += `<radialGradient id="r-${k}" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
  }
  out += `<radialGradient id="m-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  return out;
}

// ---------------------------------------------------------------- shapes
type Attrs = Record<string, string | number | undefined>;
export type Shape = {
  el: "path" | "circle" | "ellipse" | "rect" | "polygon";
  a: Attrs;
  /** Material name, `r:<name>` for the radial version, or a literal colour. */
  fill?: string;
  stroke?: string;
  sw?: number;
  /** Part of the silhouette outline (default true). Details and shines are not. */
  ol?: boolean;
  op?: number;
  /** Extra markup inside the element (SMIL animation). */
  inner?: string;
};

const paint = (v: string | undefined) =>
  v == null ? undefined : v.startsWith("#") || v === "none" || v.startsWith("url(") ? v : v.startsWith("r:") ? `url(#r-${v.slice(2)})` : `url(#m-${v})`;

function attrs(a: Attrs) {
  let s = "";
  for (const [k, v] of Object.entries(a)) if (v !== undefined) s += ` ${k}="${v}"`;
  return s;
}
const tag = (s: Shape, a: Attrs, inner = "") => `<${s.el}${attrs({ ...s.a, ...a })}${inner ? `>${inner}</${s.el}>` : "/>"}`;

export const p = (d: string, fill: string, o: Partial<Shape> = {}): Shape => ({ el: "path", fill, ...o, a: { d, ...(o.a ?? {}) } });
export const c = (cx: number, cy: number, r: number, fill: string, o: Partial<Shape> = {}): Shape => ({ el: "circle", fill, ...o, a: { cx, cy, r, ...(o.a ?? {}) } });
export const e = (cx: number, cy: number, rx: number, ry: number, fill: string, o: Partial<Shape> = {}): Shape => ({ el: "ellipse", fill, ...o, a: { cx, cy, rx, ry, ...(o.a ?? {}) } });
export const r = (x: number, y: number, w: number, h: number, rx: number, fill: string, o: Partial<Shape> = {}): Shape => ({ el: "rect", fill, ...o, a: { x, y, width: w, height: h, rx, ...(o.a ?? {}) } });
export const poly = (pts: number[], fill: string, o: Partial<Shape> = {}): Shape => ({ el: "polygon", fill, ...o, a: { points: pts.join(" "), ...(o.a ?? {}) } });
/** A stroked line or curve that's part of the silhouette (handles, poles, fuses). */
export const ln = (d: string, color: string, w: number, o: Partial<Shape> = {}): Shape => ({ el: "path", fill: "none", stroke: color, sw: w, ...o, a: { d, "stroke-linecap": "round", "stroke-linejoin": "round", ...(o.a ?? {}) } });
/** A detail line drawn on top (no outline). */
export const dl = (d: string, color: string, w: number, op?: number): Shape => ln(d, color, w, { ol: false, op });
/** Glossy highlight. */
export const hl = (d: string, op = 0.6): Shape => ({ el: "path", a: { d }, fill: "#fff", ol: false, op });
/** Shade on the dark side. */
export const sh = (d: string, op = 0.22): Shape => ({ el: "path", a: { d }, fill: OL, ol: false, op });
/** Round sparkle (no outline). */
export const dot = (cx: number, cy: number, rr: number, fill = "#fff", op = 0.9): Shape => c(cx, cy, rr, fill, { ol: false, op });

/** Inner part with its own thin outline (drawn over the shapes behind it). */
export const IN: Partial<Shape> = { ol: false, stroke: OL, sw: 2.4 };
export const inner = (o: Partial<Shape> = {}): Partial<Shape> => ({ ...IN, ...o });

/** Group shapes under one transform (for rotated parts). */
export const tf = (transform: string, shapes: Shape[]): Shape[] => shapes.map((s) => ({ ...s, a: { ...s.a, transform: s.a.transform ? `${transform} ${s.a.transform}` : transform } }));

// ---------------------------------------------------------------- geometry helpers
const f = (n: number) => Math.round(n * 100) / 100;
/** Star polygon points. */
export function starPts(cx: number, cy: number, R: number, rr: number, n = 5, rot = -90) {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rad = i % 2 ? rr : R;
    pts.push(f(cx + rad * Math.cos(a)), f(cy + rad * Math.sin(a)));
  }
  return pts;
}
/** Cog outline as a path. */
export function gearPath(cx: number, cy: number, R: number, rr: number, teeth: number) {
  let d = "";
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [rr, a - step * 0.5],
      [rr, a - step * 0.3],
      [R, a - step * 0.18],
      [R, a + step * 0.18],
      [rr, a + step * 0.3],
    ];
    for (const [rad, ang] of pts) d += `${d ? "L" : "M"}${f(cx + rad * Math.cos(ang))} ${f(cy + rad * Math.sin(ang))}`;
  }
  return `${d}Z`;
}
/** Ring sector (pie slice with a hole) as a path; angles in degrees, 0 = east, clockwise. */
export function sector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const pt = (rad: number, a: number) => `${f(cx + rad * Math.cos((a * Math.PI) / 180))} ${f(cy + rad * Math.sin((a * Math.PI) / 180))}`;
  const big = a2 - a1 > 180 ? 1 : 0;
  return `M${pt(r2, a1)}A${r2} ${r2} 0 ${big} 1 ${pt(r2, a2)}L${pt(r1, a2)}A${r1} ${r1} 0 ${big} 0 ${pt(r1, a1)}Z`;
}
/** 4-point twinkle star. */
export const twinkle = (cx: number, cy: number, s: number) => `M${cx} ${cy - s}Q${cx + s * 0.18} ${cy - s * 0.18} ${cx + s} ${cy}Q${cx + s * 0.18} ${cy + s * 0.18} ${cx} ${cy + s}Q${cx - s * 0.18} ${cy + s * 0.18} ${cx - s} ${cy}Q${cx - s * 0.18} ${cy - s * 0.18} ${cx} ${cy - s}Z`;
/** SMIL twinkle: fades and scales a sparkle in a loop, each with its own phase. */
export const blink = (dur = 2.4, begin = 0) => `<animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.15;0.35;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`;

// ---------------------------------------------------------------- render
/** Markup for one icon: the outline pass, then the painted shapes. */
export function render(shapes: Shape[]) {
  let back = "";
  let front = "";
  for (const s of shapes) {
    if (s.ol !== false) {
      const w = (s.sw ?? 0) + OLW;
      back += tag(s, { fill: s.fill === "none" ? "none" : OL, stroke: OL, "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: undefined });
    }
    front += tag(s, { fill: paint(s.fill), stroke: paint(s.stroke), "stroke-width": s.sw, opacity: s.op }, s.inner);
  }
  return `<g>${back}</g>${front}`;
}
