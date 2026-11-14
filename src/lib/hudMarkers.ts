// Pure rules for the 3D city's markers and the HUD waypoints (no DOM, no three):
// how a beacon fades and shrinks with distance, where an off-screen arrow sits on the screen
// edge, which icon and colour a job or pickup gets, and pickup rarity.
import type { IconName } from "./iconPaths";

/** One small palette for every marker, HUD chip and 2D map pin (flat, no gradients). */
export const MARKER_COLORS = {
  job: "#f2b53a", // pick-ups and money jobs: the one accent
  visit: "#4cc38a", // check-ins
  biz: "#5aa9f0", // businesses
  deliver: "#ec6fa4", // deliveries and the active run
  party: "#a78bfa", // play-together
  neutral: "#aab2c0",
} as const;

export type Rarity = "common" | "rare" | "epic";
export const RARITY_COLORS: Record<Rarity, string> = { common: "#dfe5ee", rare: "#5aa9f0", epic: "#c084fc" };

/** Pick-up rarity: admin drops are epic, higher money tiers rare, the rest common. */
export function rarityOf(m: { drop: unknown; tier: number }): Rarity {
  return m.drop ? "epic" : m.tier >= 2 ? "rare" : "common";
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Opacity of a marker's light pillar / ring by distance (m): faint right on top of it (it would
 * fill the screen), full in the mid range, gone far off so the city isn't a forest of columns.
 */
export function markerFade(d: number, near = 18, far = 700): number {
  return smooth(near * 0.4, near, d) * (1 - smooth(far * 0.55, far, d));
}

/** Pillar width: shrinks to a thin line when you are close, full size from `full` m. */
export function markerScale(d: number, near = 8, full = 60): number {
  return 0.35 + 0.65 * smooth(near, full, d);
}

/** Where a waypoint draws: on the screen (icon + distance) or pinned to the edge (arrow). */
export type EdgeResult = { x: number; y: number; angle: number; edge: boolean };

/**
 * `nx, ny`: the point in normalised device coordinates (-1..1, y up), `behind`: it is behind the
 * camera. Returns pixel coordinates inside a w x h box, kept `m` px from each edge; `angle` (rad,
 * 0 = pointing right, clockwise on screen) is the way the arrow points when `edge`.
 * Writes into `out` so a per-frame caller allocates nothing.
 */
export function edgeArrow(nx: number, ny: number, behind: boolean, w: number, h: number, m: number, out: EdgeResult = { x: 0, y: 0, angle: 0, edge: false }): EdgeResult {
  // Behind the camera the projection is mirrored: flip it so the arrow points the way to turn.
  if (behind) (nx = -nx), (ny = -ny);
  const inside = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
  const cx = w / 2, cy = h / 2;
  const hw = cx - m, hh = cy - m;
  const px = nx * cx, py = -ny * cy; // screen-pixel offset from the centre
  out.angle = Math.atan2(py, px);
  out.edge = !inside;
  if (inside) {
    out.x = cx + Math.max(-hw, Math.min(hw, px));
    out.y = cy + Math.max(-hh, Math.min(hh, py));
    return out;
  }
  let dx = px, dy = py;
  if (dx === 0 && dy === 0) dy = hh; // dead behind: point down
  const k = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  out.x = cx + dx * k;
  out.y = cy + dy * k;
  return out;
}

/** "850 m" / "1.2 km" with the digits left to tabular figures in CSS. */
export function shortDistance(m: number): { value: string; unit: "m" | "km" } {
  if (m < 1000) return { value: String(Math.max(0, Math.round(m / 5) * 5 || Math.round(m))), unit: "m" };
  const km = m / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: "km" };
}

// Business / pickup emoji from the data -> the HUD's line icons (the HUD never draws an emoji).
// The specific kinds come first; the broad families after them catch the rest.
const EMOJI_ICON: [RegExp, IconName][] = [
  [/[🍕]/u, "pizza"],
  [/[🍔🍟🌭🥙🥪]/u, "burger"],
  [/[🍦🍨🍧]/u, "icecream"],
  [/[🍰🧁🍩🎂🍪]/u, "cake"],
  [/[🥖🥐🍞🥨]/u, "bread"],
  [/[🍎🍏🥕🍌🍇🥦]/u, "apple"],
  [/[🥩🍖🍗🐟]/u, "meat"],
  [/[🥤🧃🍹🍸🍺]/u, "drink"],
  [/[🍲🍜🍝🍣🥗🍽🍴]/u, "food"],
  [/[☕🍵🧋]/u, "cup"],
  [/[🛒🧺]/u, "cart"],
  [/[🏦💳🏧]/u, "bank"],
  [/[🎬🎞📽🍿]/u, "film"],
  [/[⛽]/u, "fuel"],
  [/[🔧🛠🔨]/u, "wrench"],
  [/[🚗🚙🚘🏍]/u, "car"],
  [/[💊🩹]/u, "pill"],
  [/[🩺]/u, "doctor"],
  [/[🏥⚕]/u, "medical"],
  [/[💇💅💄✂]/u, "scissors"],
  [/[👗👕👟👠👔]/u, "shirt"],
  [/[👜🎒🛍]/u, "bag"],
  [/[🛋🪑]/u, "sofa"],
  [/[🧱🪵]/u, "brick"],
  [/[📱💻🖥🎧]/u, "phone"],
  [/[🎓🏫✏]/u, "school"],
  [/[🏋💪⚽🏀]/u, "dumbbell"],
  [/[🏠🏡]/u, "home"],
  [/[🏨🛏]/u, "bed"],
  [/[🐾🐶🐱]/u, "paw"],
  [/[🌳🌲🌿]/u, "tree"],
  [/[📚📖]/u, "book"],
  [/[📢📣]/u, "megaphone"],
  [/[🎁📦💐]/u, "gift"],
  [/[💰💵]/u, "coin"],
  [/[🎯🏁]/u, "flag"],
  [/[🏢🏬🏛]/u, "building"],
  [/[🏪]/u, "store"],
  [/[🏷]/u, "tag"],
  [/[🔑]/u, "key"],
  [/[⭐🌟✨]/u, "star"],
];

/** A data emoji as one of the line icons, or null when none fits (the map then draws the emoji as art). */
export function glyphFor(emoji: string): IconName | null {
  for (const [re, name] of EMOJI_ICON) if (re.test(emoji)) return name;
  return null;
}
/** A job's or place's data emoji as one of the HUD icons (`pin` when nothing fits). */
export function iconForEmoji(emoji: string): IconName {
  return glyphFor(emoji) ?? "pin";
}

/** The marker colour family for a job kind. */
export function colorForKind(kind: "pickup" | "visit" | "biz" | "deliver"): string {
  return kind === "pickup" ? MARKER_COLORS.job : kind === "visit" ? MARKER_COLORS.visit : kind === "biz" ? MARKER_COLORS.biz : MARKER_COLORS.deliver;
}
