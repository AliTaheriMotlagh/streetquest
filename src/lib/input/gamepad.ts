// Game controllers (Gamepad API, "standard" mapping): pure rules, no DOM. The poller in
// components/drive/gamepad.ts reads the browser's pad and hands a snapshot to readPad(),
// which returns what the game wants: sticks with a radial deadzone and a response curve,
// analog triggers, and which buttons are held. Tests drive it with plain objects.

export type PadSnapshot = { id: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] };
export type PadKind = "xbox" | "playstation" | "switch" | "generic";

/** Standard-layout button names (index in `buttons`). */
export const PAD_BUTTONS = ["south", "east", "west", "north", "l1", "r1", "l2", "r2", "select", "start", "l3", "r3", "up", "down", "left", "right"] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];
export type PadHeld = Record<PadButton, boolean>;

export type PadFrame = {
  /** Left stick, x right / y forward (up is +1), after deadzone and curve. */
  move: { x: number; y: number };
  /** Right stick, x right / y up. */
  look: { x: number; y: number };
  /** Triggers 0…1. */
  l2: number;
  r2: number;
  held: PadHeld;
};

/** Vendor / product text in the id string decides the glyphs shown to the player. */
export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/054c|sony|playstation|dualshock|dualsense|ps[345]\b/.test(s)) return "playstation";
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(s)) return "switch";
  if (/045e|xbox|microsoft|xinput|x-box/.test(s)) return "xbox";
  return "generic";
}

type Names = Record<"south" | "east" | "west" | "north" | "l1" | "r1" | "l2" | "r2" | "l3" | "r3" | "start", string>;
const XBOX: Names = { south: "A", east: "B", west: "X", north: "Y", l1: "LB", r1: "RB", l2: "LT", r2: "RT", l3: "LS", r3: "RS", start: "Menu" };
const PS: Names = { south: "✕", east: "○", west: "□", north: "△", l1: "L1", r1: "R1", l2: "L2", r2: "R2", l3: "L3", r3: "R3", start: "Options" };
// Nintendo's A/B and X/Y sit the other way round to Xbox: the labels follow the printed ones.
const SWITCH: Names = { south: "B", east: "A", west: "Y", north: "X", l1: "L", r1: "R", l2: "ZL", r2: "ZR", l3: "L3", r3: "R3", start: "+" };
export const padNames = (k: PadKind): Names => (k === "playstation" ? PS : k === "switch" ? SWITCH : XBOX);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Radial deadzone: inside it nothing, outside it the rest of the range rescaled to 0…1, direction kept. */
export function radial(x: number, y: number, dead = 0.18, outer = 0.98) {
  const m = Math.hypot(x, y);
  if (m <= dead) return { x: 0, y: 0 };
  const k = clamp((m - dead) / (outer - dead), 0, 1) / m;
  return { x: x * k, y: y * k };
}

/** A stick through deadzone and curve (the curve acts on the magnitude, so diagonals stay round). */
export function stick(x: number, y: number, dead = 0.18, exp = 1.6) {
  const r = radial(x, y, dead);
  const m = Math.hypot(r.x, r.y);
  if (m === 0) return r;
  const k = Math.pow(m, exp) / m;
  return { x: r.x * k, y: r.y * k };
}

/** A trigger's analog value (older pads report it as a button only). */
export const trigger = (b: { pressed: boolean; value: number } | undefined, dead = 0.05) => {
  if (!b) return 0;
  const v = b.value > 0 ? b.value : b.pressed ? 1 : 0;
  return v <= dead ? 0 : clamp((v - dead) / (1 - dead), 0, 1);
};

export type PadTune = { moveDead?: number; lookDead?: number; moveExp?: number; lookExp?: number };

export function readPad(s: PadSnapshot, tune: PadTune = {}): PadFrame {
  const ax = (i: number) => s.axes[i] ?? 0;
  const mv = stick(ax(0), ax(1), tune.moveDead ?? 0.18, tune.moveExp ?? 1.3);
  const lk = stick(ax(2), ax(3), tune.lookDead ?? 0.14, tune.lookExp ?? 2);
  const held = {} as PadHeld;
  PAD_BUTTONS.forEach((n, i) => (held[n] = !!s.buttons[i]?.pressed));
  const l2 = trigger(s.buttons[6]), r2 = trigger(s.buttons[7]);
  // Triggers count as buttons too (a pad that reports only the analog value).
  held.l2 = l2 > 0.35;
  held.r2 = r2 > 0.35;
  // Screen y grows down: flip so up is +1.
  return { move: { x: mv.x, y: -mv.y }, look: { x: lk.x, y: -lk.y }, l2, r2, held };
}

/** Buttons that went down between two frames (each press fires once). */
export function pressed(prev: PadHeld | null, cur: PadHeld): PadButton[] {
  return PAD_BUTTONS.filter((b) => cur[b] && !prev?.[b]);
}

/** Any sign of use (so a resting, drifting stick doesn't take the controls from the keyboard)? */
export const padActive = (f: PadFrame) => f.move.x !== 0 || f.move.y !== 0 || f.look.x !== 0 || f.look.y !== 0 || f.l2 > 0 || f.r2 > 0 || PAD_BUTTONS.some((b) => f.held[b]);

/** Look speed in radians per second at full stick (before the player's sensitivity, 0.5…2). */
export const PAD_LOOK_RAD_S = 3.2;
