// Inside a store (pure; tests/interior.test.ts): the room you walk into from the 3D city, laid out for its trade —
// a chelow-kababi's tables and food counter, a bakery's bread racks and tanoor, a supermarket's aisles and fridges,
// a chemist's wall of boxes behind the counter, a phone shop's lit panels, a boutique's rails. Every fixture is a
// box on the floor plan (it also blocks walking) with the spots where goods stand on it; the store's real menu or
// catalogue (Snappfood, Torob, a player's shop) is put on those spots one item each — drinks in the fridge first —
// and what's left is stocked with plain goods so no shelf stands empty. Drawn by components/drive/interior3d.ts.
//
// Plan coordinates (m): x across the room (−w/2 … w/2), z from the back wall (0) to the street wall (d), where the
// door is, at x = 0. A fixture's `rot` turns its front: 0 faces the door (+z), π/2 faces +x, −π/2 faces −x, π the back.
import { storeKind, type StoreKind } from "./storeKinds";
import { WINDOW_SCENE } from "./storeReveal";

export type FixtureType =
  | "counter" // the till; the keeper stands behind it
  | "case" // a glass display counter (food, cakes, meat, phones) — goods inside, on top of the base
  | "shelf" // wall shelving, four levels
  | "gondola" // a free-standing double-sided aisle shelf
  | "fridge" // upright glass-door fridge (drinks, dairy)
  | "table" // a café/restaurant table (chairs are drawn round it, not blocking)
  | "breadRack" // slanted wooden rack of loaves
  | "oven" // a bakery's tanoor: a glowing arch in the back wall
  | "crates" // tilted fruit crates on a stand
  | "hooks" // a butcher's rail of hanging meat
  | "rail" // a clothes rail
  | "panel" // a lit wall display with phones on it
  | "island" // a low display table in the middle
  | "mirror"
  | "plant"
  | "board"; // the menu board over the counter (not on the floor)

export type Shape = "loaf" | "cake" | "fruit" | "box" | "bottle" | "can" | "plate" | "cup" | "phone" | "shirt" | "pill" | "meat";

export type Fixture = { type: FixtureType; x: number; z: number; w: number; d: number; h: number; rot: number; /** Walls and furniture block; chairs, the board and the oven don't. */ solid: boolean };
/** A spot on a fixture where one thing stands: `item` is the index into the store's list, −1 = plain stock. */
export type Slot = { x: number; y: number; z: number; rot: number; shape: Shape; item: number; color: string; /** Its price tag is drawn (a listed item). */ tag: boolean; /** What it stands on (a shirt on a rail hangs). */ fix: FixtureType; /** How far in front of it the fixture's front edge is (m): where its shelf label goes. */ edge: number };

export type Room = {
  kind: StoreKind;
  w: number;
  d: number;
  h: number;
  wall: string;
  floor: "tiles" | "wood" | "stone" | "dark";
  floorColor: string;
  lamps: "pendant" | "strip" | "spot";
  fixtures: Fixture[];
  slots: Slot[];
  /** Where the keeper stands (behind the counter, facing the door). */
  keeper: { x: number; z: number };
  /** Where you stand when you come in, looking into the room (yaw 0 = towards the back wall). */
  spawn: { x: number; z: number; yaw: number };
  /** The door, in the street wall (tapping it, or walking into it, leaves). */
  door: { x: number; w: number };
  /** How many of the store's items have a spot (the rest are only in the list). */
  placed: number;
};

export type RoomItem = { title: string; section?: string };

/** Body radius when walking (m), and how close to the street wall counts as "out of the door". */
export const WALK_R = 0.3;
export const DOOR_W = 1.4;

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;

/** A small seeded number generator (the same store gets the same room). */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DRINK = /نوشیدنی|نوشابه|دوغ|آب ?معدنی|آبمیوه|آب میوه|دلستر|ماء ?الشعیر|انرژی ?زا|شیر |لیموناد|drink|soda|cola|water|juice|lemonade|beverage|ayran|içecek/i;
const HOT = /قهوه|چای|اسپرسو|لاته|کاپوچینو|ماسالا|هات ?چاکلت|coffee|tea|espresso|latte|cappuccino|mocha|çay|kahve/i;
const CAKE = /کیک|شیرینی|دسر|بستنی|تارت|چیزکیک|cake|dessert|pastry|ice ?cream|tart|baklava|tatlı/i;
const BREAD = /نان|سنگک|بربری|لواش|تافتون|باگت|bread|loaf|baguette|simit|ekmek/i;
const FRUIT = /میوه|سیب|پرتقال|موز|انار|خیار|گوجه|سبزی|fruit|apple|orange|banana|vegetable/i;
const MEAT = /گوشت|مرغ|جوجه|ران|سینه|قیمه|کباب ?لقمه|meat|chicken|beef|lamb|steak/i;
const PHONE = /گوشی|موبایل|تبلت|ساعت هوشمند|phone|mobile|tablet|galaxy|iphone|xiaomi|redmi/i;
const CLOTH = /پیراهن|شلوار|مانتو|کت|تیشرت|تی ?شرت|کفش|کیف|روسری|shirt|dress|jacket|coat|shoe|bag|scarf|jeans/i;

/** Is this listed thing a drink (it goes in the fridge, as a bottle or a can)? */
export const isDrink = (it: RoomItem) => DRINK.test(it.title) || (!!it.section && DRINK.test(it.section));

/** What a listed thing looks like on the shelf, by its words first, else by what the store sells. */
export function shapeOf(kind: StoreKind, it: RoomItem): Shape {
  const t = `${it.section ?? ""} ${it.title}`;
  if (isDrink(it)) return /دوغ|ayran|شیر |milk/i.test(t) ? "bottle" : /نوشابه|cola|soda|انرژی|can/i.test(t) ? "can" : "bottle";
  if (HOT.test(t)) return "cup";
  if (PHONE.test(t)) return "phone";
  if (CLOTH.test(t)) return "shirt";
  if (BREAD.test(it.title)) return "loaf";
  if (CAKE.test(t)) return "cake";
  if (MEAT.test(it.title) && (kind === "butcher" || kind === "market")) return "meat";
  if (FRUIT.test(it.title) && (kind === "produce" || kind === "market")) return "fruit";
  return GOODS[kind];
}

/** What a store of this kind has on its shelves when nothing else says. */
const GOODS: Record<StoreKind, Shape> = {
  restaurant: "plate", fastfood: "plate", cafe: "cup", bakery: "loaf", sweets: "cake", market: "box", produce: "fruit",
  butcher: "meat", pharmacy: "pill", fashion: "shirt", tech: "phone", general: "box",
};
/** Plain stock filling the rest of the shelves, by fixture. */
const FILL: Partial<Record<FixtureType, Shape>> = { fridge: "bottle", breadRack: "loaf", crates: "fruit", hooks: "meat", rail: "shirt", panel: "phone" };

/** Room size and look by kind (food places roomier; a bakery or a chemist a narrow shop). */
const SIZE: Record<StoreKind, [number, number, number]> = {
  restaurant: [9, 10, 3.3], fastfood: [8, 9, 3.1], cafe: [7, 8, 3.2], bakery: [6, 7, 3.4], sweets: [6.5, 7.5, 3.1], market: [10, 11, 3.3],
  produce: [7, 8, 3.2], butcher: [6, 7, 3.1], pharmacy: [6.5, 7.5, 3.1], fashion: [8, 9, 3.4], tech: [7, 8, 3.2], general: [7, 8, 3.1],
};
const FLOOR: Record<StoreKind, Room["floor"]> = {
  restaurant: "stone", fastfood: "tiles", cafe: "wood", bakery: "stone", sweets: "tiles", market: "tiles", produce: "stone",
  butcher: "tiles", pharmacy: "tiles", fashion: "dark", tech: "dark", general: "tiles",
};

/** Where things stand on a fixture, in its own frame (x along its front, z out of its front, y up). */
function spotsOn(f: Fixture): { x: number; y: number; z: number; face: number }[] {
  const out: { x: number; y: number; z: number; face: number }[] = [];
  const cols = (w: number, step: number) => {
    const n = Math.max(1, Math.floor((w - 0.1) / step));
    return Array.from({ length: n }, (_, i) => -((n - 1) * step) / 2 + i * step);
  };
  const levels = (ys: number[], step: number, z: number, face = 0) => {
    for (const y of ys) for (const x of cols(f.w, step)) out.push({ x, y, z, face });
  };
  switch (f.type) {
    case "shelf":
      levels([0.42, 0.86, 1.3, 1.74], 0.36, 0.05);
      break;
    case "gondola":
      levels([0.38, 0.8, 1.22], 0.36, f.d / 4);
      levels([0.38, 0.8, 1.22], 0.36, -f.d / 4, Math.PI);
      break;
    case "fridge":
      levels([0.5, 0.95, 1.4, 1.82], 0.22, 0.02);
      break;
    case "case":
      levels([0.62, 0.9], 0.42, 0.04);
      break;
    case "counter":
      out.push({ x: f.w / 2 - 0.35, y: f.h + 0.02, z: 0.1, face: 0 }, { x: -f.w / 2 + 0.4, y: f.h + 0.02, z: 0.1, face: 0 });
      break;
    case "breadRack":
      levels([0.5, 0.95, 1.4], 0.48, 0.05);
      break;
    case "crates":
      levels([0.62, 0.95], 0.5, 0.05);
      break;
    case "hooks":
      levels([1.55], 0.4, 0);
      break;
    case "rail":
      for (const x of cols(f.w, 0.28)) out.push({ x, y: 1.25, z: 0, face: 0 });
      break;
    case "panel":
      levels([0.95, 1.35, 1.75], 0.4, 0.06);
      break;
    case "island":
      for (const x of cols(f.w, 0.45)) out.push({ x, y: f.h + 0.01, z: 0.15, face: 0 }, { x, y: f.h + 0.01, z: -0.15, face: Math.PI });
      break;
    case "table":
      out.push({ x: 0, y: f.h + 0.01, z: 0, face: 0 });
      break;
  }
  return out;
}

const put = (list: Fixture[], type: FixtureType, x: number, z: number, w: number, d: number, h: number, rot = 0, solid = true) => list.push({ type, x, z, w, d, h, rot, solid });

/** The fixtures of a room of this kind, `r` picking the small differences between two shops of a kind. */
function furnish(kind: StoreKind, W: number, D: number, H: number, r: () => number): { fx: Fixture[]; counter: Fixture } {
  const fx: Fixture[] = [];
  const hw = W / 2;
  const foodPlace = kind === "restaurant" || kind === "fastfood" || kind === "cafe";
  const glassCounter = foodPlace || kind === "sweets" || kind === "butcher" || kind === "tech";
  // The counter across the back, the keeper behind it, the menu board (or back shelves) behind them.
  const cw = Math.min(W - 2.4, kind === "market" ? 3 : 4.2);
  const cz = 1.55;
  put(fx, glassCounter ? "case" : "counter", kind === "market" ? -hw + 1.2 + cw / 2 : 0, cz, cw, 0.75, glassCounter ? 1.05 : 1.0);
  const counter = fx[0];
  if (foodPlace) put(fx, "board", 0, 0.04, Math.min(W - 2, 4.6), 0.05, 1.3, 0, false);
  else if (kind === "bakery") {
    put(fx, "oven", -hw + 1.3, 0.05, 1.4, 0.1, 1.5, 0, false);
    put(fx, "breadRack", hw - 1.4, 0.3, 2.2, 0.5, 1.7);
  } else if (kind === "butcher") put(fx, "hooks", 0, 0.35, W - 1.6, 0.3, 2.2, 0, false);
  else if (kind === "pharmacy" || kind === "general" || kind === "sweets" || kind === "tech" || kind === "fashion" || kind === "produce")
    put(fx, kind === "tech" ? "panel" : "shelf", 0, 0.25, W - 1.2, 0.4, 2.0);

  // The room itself.
  const front = D - 1.6; // keep the door area clear
  const sideLen = front - (cz + 0.9);
  const sideZ = cz + 0.9 + sideLen / 2;
  switch (kind) {
    case "restaurant":
    case "fastfood":
    case "cafe": {
      put(fx, "fridge", hw - 0.45, cz + 1.4, 1.2, 0.7, 2.0, -HALF);
      if (kind === "cafe") put(fx, "case", -hw + 0.45, cz + 1.6, 1.6, 0.6, 1.0, HALF);
      const cols = W >= 8.5 ? 3 : 2, rows = Math.max(1, Math.floor((front - cz - 2.4) / 2));
      const tw = kind === "cafe" ? 0.75 : 1.1;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = -hw + 1.6 + (i * (W - 3.2)) / Math.max(1, cols - 1);
          const z = cz + 2.6 + j * 2;
          if (Math.abs(x) < 1 && z > front - 1) continue;
          put(fx, "table", x, z, tw, kind === "cafe" ? 0.75 : 0.8, 0.76);
        }
      break;
    }
    case "bakery":
      put(fx, "breadRack", -hw + 0.3, sideZ, Math.min(3, sideLen), 0.5, 1.7, HALF);
      put(fx, "shelf", hw - 0.25, sideZ, Math.min(3, sideLen), 0.4, 2.0, -HALF);
      break;
    case "sweets":
      put(fx, "case", -hw + 0.45, sideZ, Math.min(3.4, sideLen), 0.7, 1.05, HALF);
      put(fx, "case", hw - 0.45, sideZ, Math.min(3.4, sideLen), 0.7, 1.05, -HALF);
      break;
    case "market":
    case "general": {
      put(fx, "shelf", -hw + 0.25, sideZ, sideLen, 0.45, 2.0, HALF);
      if (kind === "market") {
        const fw = Math.min(W - cw - 2.8, 4.2);
        put(fx, "fridge", hw - 0.6 - fw / 2, 0.4, fw, 0.75, 2.05);
        put(fx, "fridge", hw - 0.4, sideZ, Math.min(sideLen, 4), 0.75, 2.05, -HALF);
        const gl = Math.max(2, sideLen - 1.6);
        for (const x of [-1.6, 1.0]) put(fx, "gondola", x, sideZ + 0.2, gl, 0.9, 1.45, HALF);
      } else {
        put(fx, "shelf", hw - 0.25, sideZ, sideLen, 0.45, 2.0, -HALF);
        put(fx, "gondola", 0, sideZ + 0.2, Math.max(1.6, sideLen - 2), 0.9, 1.45, HALF);
      }
      break;
    }
    case "produce":
      put(fx, "crates", -hw + 0.5, sideZ, sideLen, 0.9, 1.0, HALF);
      put(fx, "crates", hw - 0.5, sideZ, sideLen, 0.9, 1.0, -HALF);
      put(fx, "island", 0, sideZ + 0.3, Math.max(1.4, sideLen - 2), 1.0, 0.85, HALF);
      break;
    case "butcher":
      put(fx, "fridge", -hw + 0.4, sideZ, Math.min(2.6, sideLen), 0.75, 2.0, HALF);
      put(fx, "shelf", hw - 0.25, sideZ, Math.min(2.6, sideLen), 0.4, 2.0, -HALF);
      break;
    case "pharmacy":
      put(fx, "shelf", -hw + 0.25, sideZ, sideLen, 0.4, 2.0, HALF);
      put(fx, "shelf", hw - 0.25, sideZ, sideLen, 0.4, 2.0, -HALF);
      put(fx, "island", 0, sideZ + 0.4, 1.6, 0.7, 0.9);
      break;
    case "fashion":
      put(fx, "shelf", -hw + 0.25, sideZ, sideLen, 0.45, 2.2, HALF);
      put(fx, "mirror", hw - 0.05, sideZ - 1, 1.0, 0.06, 2.0, -HALF, false);
      put(fx, "rail", -0.9, sideZ + 0.2, Math.max(1.6, sideLen - 1.8), 0.5, 1.6, HALF);
      put(fx, "rail", 1.3, sideZ + 0.2, Math.max(1.6, sideLen - 1.8), 0.5, 1.6, HALF);
      break;
    case "tech":
      put(fx, "panel", -hw + 0.12, sideZ, sideLen, 0.2, 2.2, HALF);
      put(fx, "panel", hw - 0.12, sideZ, sideLen, 0.2, 2.2, -HALF);
      put(fx, "island", 0, sideZ + 0.3, 1.6, 0.8, 0.9);
      break;
  }
  // A plant by the door, on one side or the other.
  put(fx, "plant", (r() < 0.5 ? -1 : 1) * (hw - 0.5), D - 0.6, 0.5, 0.5, 1.2);
  // The till on the counter's top is a spot too (a stand of gum, a tip jar): not stock, nothing to place there.
  return { fx: fx.map((f) => ({ ...f, h: f.h || H })), counter };
}

/** A fixture's corners on the floor plan (an axis-aligned box: fixtures are only turned by quarter turns). */
export function footprint(f: Fixture): { x0: number; x1: number; z0: number; z1: number } {
  const q = Math.round(f.rot / HALF) & 1; // turned a quarter: width runs along z
  const hx = (q ? f.d : f.w) / 2, hz = (q ? f.w : f.d) / 2;
  return { x0: f.x - hx, x1: f.x + hx, z0: f.z - hz, z1: f.z + hz };
}

/** A local point on a fixture → the room plan. */
const toRoom = (f: Fixture, x: number, z: number) => ({ x: f.x + x * Math.cos(f.rot) + z * Math.sin(f.rot), z: f.z - x * Math.sin(f.rot) + z * Math.cos(f.rot) });

/**
 * The room for a store of `kind` with these listed things, the same each visit (`seed`: its id). Each listed thing
 * gets one spot (drinks in fridges first, the rest in fixture order), up to the room's room; then every spot left is
 * plain stock in the trade's colours.
 */
export function layoutRoom(kind: StoreKind, items: RoomItem[], seed = 1): Room {
  const r = rand(seed);
  const [W0, D0, H] = SIZE[kind];
  // A big catalogue gets a bigger shop (up to half as big again), so more of it is on show.
  const grow = Math.min(1.5, Math.max(1, Math.sqrt(items.length / 40)));
  const W = Math.round(W0 * grow * 10) / 10, D = Math.round(D0 * grow * 10) / 10;
  const scene = WINDOW_SCENE[kind];
  const { fx, counter } = furnish(kind, W, D, H, r);

  // Every spot, fridges' first (for the drinks), then by fixture.
  type Spot = { x: number; y: number; z: number; rot: number; fix: FixtureType; edge: number };
  const spots: Spot[] = [];
  for (const f of fx)
    for (const s of spotsOn(f)) {
      const p = toRoom(f, s.x, s.z);
      spots.push({ x: p.x, y: s.y, z: p.z, rot: f.rot + s.face, fix: f.type, edge: Math.max(0.05, f.d / 2 - (s.face ? -s.z : s.z)) });
    }
  const free = spots.map(() => true);
  const slots: Slot[] = [];
  const colorOf = (i: number) => scene.colors[i % scene.colors.length];
  let placed = 0;
  const take = (want: (s: Spot) => boolean): number => {
    for (let i = 0; i < spots.length; i++) if (free[i] && want(spots[i])) return (free[i] = false), i;
    return -1;
  };
  items.forEach((it, i) => {
    const drink = isDrink(it);
    // Drinks into the fridge; the rest anywhere but the fridge (else into it, when nothing else is left).
    let k = drink ? take((s) => s.fix === "fridge") : take((s) => s.fix !== "fridge" && s.fix !== "counter");
    if (k < 0) k = take((s) => s.fix !== "counter");
    if (k < 0) return;
    const s = spots[k];
    const shape = s.fix === "fridge" && !drink ? "box" : shapeOf(kind, it);
    slots.push({ x: s.x, y: s.y, z: s.z, rot: s.rot, shape, item: i, color: colorOf(hashText(it.title)), tag: true, fix: s.fix, edge: s.edge });
    placed++;
  });
  spots.forEach((s, i) => {
    if (!free[i] || s.fix === "counter" || s.fix === "table") return;
    // Not every spot is stocked: a real shelf has gaps.
    if (r() < 0.12) return;
    const shape = FILL[s.fix] ?? GOODS[kind];
    slots.push({ x: s.x, y: s.y, z: s.z, rot: s.rot, shape, item: -1, color: colorOf(Math.floor(r() * 97)), tag: false, fix: s.fix, edge: s.edge });
  });

  return {
    kind, w: W, d: D, h: H, wall: scene.wall, floor: FLOOR[kind], floorColor: scene.floor, lamps: scene.lamps, fixtures: fx, slots,
    keeper: { x: counter.x, z: counter.z - 0.85 },
    spawn: { x: 0, z: D - 0.9, yaw: 0 },
    door: { x: 0, w: DOOR_W },
    placed,
  };
}

/**
 * Walking: where you end up trying to go from (x, z) to (nx, nz) — kept inside the walls and out of every solid
 * fixture (slid along its side), and never behind the counter (that's the keeper's).
 */
export function blockedAt(room: Room, px: number, pz: number): boolean {
  if (Math.abs(px) > room.w / 2 - WALK_R || pz < WALK_R || pz > room.d - WALK_R) return true;
  for (let i = 0; i < room.fixtures.length; i++) {
    const f = room.fixtures[i];
    if (!f.solid) continue;
    const b = footprint(f);
    // The counter (always the first fixture) closes the whole strip behind it, wall to wall: that's the keeper's.
    if (i === 0) {
      if (pz < b.z1 + WALK_R) return true;
      continue;
    }
    // A table's chairs stand round it.
    const pad = WALK_R + (f.type === "table" ? 0.3 : 0);
    if (px > b.x0 - pad && px < b.x1 + pad && pz > b.z0 - pad && pz < b.z1 + pad) return true;
  }
  return false;
}

/**
 * Walking: where you end up trying to go from (x, z) to (nx, nz) — kept inside the walls and out of every solid
 * fixture (slid along its side), and never behind the counter (that's the keeper's).
 */
export function walk(room: Room, x: number, z: number, nx: number, nz: number): { x: number; z: number } {
  const hw = room.w / 2 - WALK_R;
  const tx = Math.max(-hw, Math.min(hw, nx)), tz = Math.max(WALK_R, Math.min(room.d - WALK_R, nz));
  if (!blockedAt(room, tx, tz)) return { x: tx, z: tz };
  // Slide along whichever way is free.
  if (!blockedAt(room, tx, z)) return { x: tx, z };
  if (!blockedAt(room, x, tz)) return { x, z: tz };
  return { x, z };
}

/** Out of the door: walking into the street wall within the door's width. */
export const atDoor = (room: Room, x: number, z: number) => z >= room.d - WALK_R - 0.05 && Math.abs(x - room.door.x) < room.door.w / 2;

/** The yaw (0 = towards the back wall, −z) that looks from (x, z) at (tx, tz). */
export const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

/** Where to stand to look at a slot: a step in front of it, kept walkable. */
export function standFor(room: Room, s: Slot): { x: number; z: number; yaw: number } {
  const fx = Math.sin(s.rot), fz = Math.cos(s.rot);
  let p = { x: room.spawn.x, z: room.spawn.z };
  for (const m of [1.1, 1.4, 1.8, 2.3, 0.8, 3])
    if (!blockedAt(room, s.x + fx * m, s.z + fz * m)) {
      p = { x: s.x + fx * m, z: s.z + fz * m };
      break;
    }
  return { ...p, yaw: yawTo(p.x, p.z, s.x, s.z) };
}

/** An angle folded into −π…π. */
export const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** A player's shop category (lib/shops.ts) → the room it gets; its name wins when it says more ("نانوایی …" is a bakery). */
const SHOP_ROOM: Record<string, StoreKind> = {
  food: "restaurant", fashion: "fashion", tech: "tech", beauty: "pharmacy", home: "general", books: "general", handmade: "general",
  kids: "general", sports: "general", services: "general", other: "general",
};
export function roomKindForShop(category: string, name: string): StoreKind {
  const k = storeKind("", name);
  return k !== "general" ? k : SHOP_ROOM[category] ?? "general";
}
