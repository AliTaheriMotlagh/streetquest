// The traffic on Iran's streets (pure — the 3D models are in components/drive/fleet3d.ts):
// which cars, pickups, buses and motorbikes drive around the 3D city, how often you see
// each (Prides and Peugeots everywhere, the yellow taxi, the blue Zamyad pickup, delivery
// bikes with their box, the Khavar light truck, a red city bus and the white minibus on
// the main roads), their usual paint, and how big they are — for following distances and
// for what you bump into.

export type FleetKey = "pride" | "peykan" | "p206" | "p207" | "pars" | "samand" | "tiba" | "shahin" | "l90" | "xantia" | "suv" | "taxi" | "vanet" | "vanetLoad" | "bus" | "khavar" | "minibus" | "bike" | "bikeBox";

export type FleetDef = {
  key: FleetKey;
  /** Length, width and height (m). */
  len: number;
  wid: number;
  hgt: number;
  /** How often it turns up in traffic (relative). */
  share: number;
  /** Paints it's usually seen in (repeats make a colour more common). */
  paints: string[];
  /** Only on the main roads (buses, minibuses). */
  majorOnly?: boolean;
  /** Two wheels: rides near the kerb. */
  bike?: boolean;
};

const WHITE = "#f2f2ee", SILVER = "#c0c2c6", GRAY = "#8f9296", DARK = "#4a4d52", BLACK = "#1f2023", DARKRED = "#7a2b25", NAVY = "#2f3f63", BEIGE = "#cbbd9a";
/** The yellow of an Iranian city taxi. */
export const TAXI_YELLOW = "#f3c623";

export const FLEET: Record<FleetKey, FleetDef> = {
  pride: { key: "pride", len: 3.94, wid: 1.6, hgt: 1.43, share: 22, paints: [WHITE, WHITE, WHITE, WHITE, SILVER, SILVER, DARK, BEIGE, DARKRED, NAVY] },
  peykan: { key: "peykan", len: 4.28, wid: 1.61, hgt: 1.41, share: 5, paints: [WHITE, WHITE, BEIGE, BEIGE, "#7fa6c4", DARKRED, "#d9d2b8", NAVY] },
  p206: { key: "p206", len: 3.83, wid: 1.65, hgt: 1.43, share: 10, paints: [WHITE, WHITE, WHITE, SILVER, BLACK, DARK, "#b3262b", "#7fa6c4"] },
  p207: { key: "p207", len: 4.03, wid: 1.72, hgt: 1.47, share: 6, paints: [WHITE, WHITE, WHITE, SILVER, BLACK, DARK, "#a8172a"] },
  pars: { key: "pars", len: 4.45, wid: 1.71, hgt: 1.42, share: 12, paints: [WHITE, WHITE, WHITE, SILVER, SILVER, BLACK, DARK, NAVY] },
  samand: { key: "samand", len: 4.5, wid: 1.74, hgt: 1.46, share: 8, paints: [WHITE, WHITE, WHITE, SILVER, SILVER, BLACK, NAVY, DARKRED] },
  tiba: { key: "tiba", len: 4.18, wid: 1.66, hgt: 1.5, share: 9, paints: [WHITE, WHITE, WHITE, WHITE, SILVER, SILVER, DARK, BEIGE] },
  shahin: { key: "shahin", len: 4.51, wid: 1.73, hgt: 1.5, share: 6, paints: [WHITE, WHITE, WHITE, SILVER, SILVER, BLACK, DARK, "#8c1d2c"] },
  l90: { key: "l90", len: 4.29, wid: 1.74, hgt: 1.53, share: 6, paints: [WHITE, WHITE, WHITE, SILVER, SILVER, BLACK, DARK, BEIGE] },
  xantia: { key: "xantia", len: 4.44, wid: 1.75, hgt: 1.4, share: 2, paints: [WHITE, SILVER, SILVER, BLACK, DARK, NAVY, "#2f5a4e"] },
  suv: { key: "suv", len: 4.5, wid: 1.84, hgt: 1.67, share: 5, paints: [WHITE, WHITE, BLACK, BLACK, SILVER, DARK, NAVY, "#6d3a2e"] },
  taxi: { key: "taxi", len: 4.5, wid: 1.74, hgt: 1.66, share: 9, paints: [TAXI_YELLOW] },
  vanet: { key: "vanet", len: 4.9, wid: 1.69, hgt: 1.66, share: 4, paints: ["#2f63c8", "#2f63c8", "#2f63c8", WHITE] },
  vanetLoad: { key: "vanetLoad", len: 4.9, wid: 1.69, hgt: 1.66, share: 2, paints: ["#2f63c8", "#2f63c8", WHITE] },
  bus: { key: "bus", len: 12, wid: 2.55, hgt: 3.35, share: 2, paints: ["#c8102e", "#c8102e", "#c8102e", "#2e8b57"], majorOnly: true },
  khavar: { key: "khavar", len: 5.9, wid: 2.05, hgt: 2.4, share: 2, paints: ["#2f63c8", "#2f63c8", WHITE, WHITE, "#e9e4d4", "#c23b22"] },
  minibus: { key: "minibus", len: 7.2, wid: 2.15, hgt: 2.75, share: 1.5, paints: [WHITE, WHITE, WHITE, "#e9e4d4"], majorOnly: true },
  bike: { key: "bike", len: 2.0, wid: 0.7, hgt: 1.75, share: 3, paints: [BLACK, "#b3262b", BLACK, GRAY], bike: true },
  bikeBox: { key: "bikeBox", len: 2.1, wid: 0.7, hgt: 1.75, share: 5, paints: ["#e8384f", "#ff6a13", "#2bb24c", "#1f6feb", TAXI_YELLOW, "#d21f3c", WHITE], bike: true },
};
export const FLEET_KEYS = Object.keys(FLEET) as FleetKey[];

/** A model for a new car in traffic, by how common each is (buses and minibuses only on main roads). */
export function pickFleet(rand: () => number, major: boolean): FleetKey {
  const keys = FLEET_KEYS.filter((k) => major || !FLEET[k].majorOnly);
  const total = keys.reduce((n, k) => n + FLEET[k].share, 0);
  let r = rand() * total;
  for (const k of keys) if ((r -= FLEET[k].share) < 0) return k;
  return keys[keys.length - 1];
}

/** One of the paints that model is usually seen in. */
export const pickPaint = (key: FleetKey, rand: () => number) => {
  const p = FLEET[key].paints;
  return p[Math.min(p.length - 1, Math.floor(rand() * p.length))];
};

/**
 * Free road between two vehicles in a line (bumper to bumper), from how far apart their
 * middles are: what a driver keeps a gap to.
 */
/** Big and slow to get going: buses, minibuses and trucks. */
export const heavy = (key: FleetKey) => FLEET[key].len > 5.5;

export const roomBetween = (centres: number, a: FleetKey, b: FleetKey | number) => centres - FLEET[a].len / 2 - (typeof b === "number" ? b : FLEET[b].len) / 2;
