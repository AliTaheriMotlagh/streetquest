// The catalog of every object in the game (Admin → Objects), read from the registries the
// game itself uses — fleet.ts + carModels.ts (cars), peopleModels.ts, propModels.ts, the arena's
// weapons, catalog.ts (loot), places.ts (store kinds), landmarks from the database — never a
// second list. File sizes, triangle counts and bounds of the built-in .glb files come from
// objectCatalog.generated.json (`npm run assets:catalog` measures them). Pure.
import { msg } from "./i18n";
import { CAR_MODELS } from "./carModels";
import { FLEET } from "./fleet";
import { ARENA_FILES } from "./modelCheck";
import { PEOPLE_MODELS } from "./peopleModels";
import { PROP_MODELS } from "./propModels";
import { WEAPONS, WEAPON_KEYS } from "./arena/weapons";
import { ITEMS } from "./catalog";
import { PLACE_CATS } from "./places";
import credits from "../../assets/credits.json";
import measured from "./objectCatalog.generated.json";

export type ObjectKind = "car" | "person" | "soldier" | "weapon" | "prop" | "loot" | "marker" | "store" | "landmark";
export const OBJECT_KINDS: ObjectKind[] = ["car", "person", "soldier", "weapon", "prop", "loot", "marker", "store", "landmark"];
export type Credit = { title: string; author: string; url: string; license: string };

/** What the build measured for one .glb. */
export type FileInfo = { bytes: number; tris: number; joints: string[]; clips: string[]; materials: number; textures: number; bbox: { min: number[]; max: number[] } | null };
const MEASURED = measured as unknown as Record<string, FileInfo>;

export type CatalogObject = {
  id: string;
  kind: ObjectKind;
  /** English name (translate with t() for loot/markers/stores, which carry msg() keys). */
  name: string;
  emoji?: string;
  /** The replaceable model file this object comes from (see allSlots in modelCheck.ts), null for drawn-from-code objects. */
  slot: string | null;
  /** Built-in file under /public (null: nothing to download). */
  file: string | null;
  bytes: number | null;
  tris: number | null;
  /** Width, height, depth in metres. */
  size: [number, number, number] | null;
  credits: Credit[];
  /** Where it appears in the game (msg() keys). */
  usedIn: string[];
  /** Model objects whose file holds several (weapons, props): their share of the triangles. */
  note?: string;
};

const sizeOf = (f: FileInfo | undefined): [number, number, number] | null => (f?.bbox ? ([0, 1, 2].map((a) => +(f.bbox!.max[a] - f.bbox!.min[a]).toFixed(2)) as [number, number, number]) : null);
const round = (n: number) => +n.toFixed(2);

const ARENA = ARENA_FILES;
const OWN: Credit = { title: "Original art (Blender script in assets/blender)", author: "StreetQuest", url: "", license: "Original" };
const dl = (suffix: string): Credit[] =>
  (credits as { title: string; author: string; url: string; license: string; file: string }[]).filter((c) => c.file.endsWith(suffix)).map(({ title, author, url, license }) => ({ title, author, url, license }));

/** Every built-in model file (public path), from the registries. */
export function builtinFiles(): string[] {
  return [...Object.values(CAR_MODELS).map((c) => c!.file), ...PEOPLE_MODELS.map((p) => p.url), PROP_MODELS.url, ...Object.values(ARENA)];
}

export type LandmarkRow = { id: string; name: string; url: string | null; height: number; stats?: { triangles: number; bytes: number } | null };

const U = {
  traffic: msg("Traffic and the player's car in the 3D city"),
  garage: msg("Garage and Car lab"),
  pavement: msg("People on the pavements"),
  arena: msg("Street Arena and the 3D city on foot"),
  police: msg("Police in the 3D city"),
  weapon: msg("Street Arena guns"),
  props: msg("Street furniture along the roads"),
  loot: msg("Pickups on the map and in the 3D city"),
  shop: msg("Store missions, store cards and shop signs"),
  marker: msg("Beacons and signs in the 3D city"),
  landmark: msg("A paying store's own building in the 3D city"),
};

/** The street kit drawn from code: key, name, width x height x depth (m). */
export const STREET_KIT: [string, string, [number, number, number]][] = [
  ["dumpster", msg("Waste container"), [1.58, 1.42, 1.22]],
  ["bags", msg("Rubbish bags"), [1.3, 0.5, 1.1]],
  ["postbox", msg("Post box"), [0.62, 1.65, 0.48]],
  ["power", msg("Electricity cabinet"), [1.47, 1.64, 0.72]],
  ["telecom", msg("Telecom cabinet"), [0.98, 1.33, 0.54]],
  ["phone", msg("Payphone"), [0.84, 2.14, 0.5]],
  ["saqa", msg("Saqakhaneh"), [1.32, 2.32, 0.78]],
  ["rail", msg("Median railing"), [2.4, 1.15, 0.55]],
  ["bridge", msg("Footbridge"), [3, 8.5, 3.1]],
  ["direction", msg("Direction sign"), [3, 3.6, 0.1]],
  ["gantry", msg("Motorway sign"), [12, 7.3, 0.4]],
];

export function buildCatalog(opts: { landmarks?: LandmarkRow[] } = {}): CatalogObject[] {
  const out: CatalogObject[] = [];
  for (const car of Object.values(CAR_MODELS)) {
    const f = FLEET[car!.key];
    out.push({
      id: `car:${car!.key}`, kind: "car", name: car!.key, slot: `car:${car!.key}`, file: car!.file, bytes: car!.bytes, tris: car!.tris[0] + car!.tris[1],
      size: [f.wid, f.hgt, f.len], credits: [car!.credit], usedIn: [U.traffic, U.garage], note: `${car!.tris[0]} near / ${car!.tris[1]} far`,
    });
  }
  // Fleet kinds drawn from code (no model file yet) or sharing a model.
  for (const f of Object.values(FLEET)) {
    if (CAR_MODELS[f.key]) continue;
    out.push({ id: `car:${f.key}`, kind: "car", name: f.key, slot: null, file: null, bytes: null, tris: null, size: [f.wid, f.hgt, f.len], credits: [OWN], usedIn: [U.traffic], note: "drawn from code (fleet3d.ts)" });
  }
  for (const p of PEOPLE_MODELS) {
    out.push({ id: `person:${p.key}`, kind: "person", name: p.key, slot: `person:${p.key}`, file: p.url, bytes: p.bytes, tris: p.tris, size: [round(p.height * 0.35), p.height, round(p.height * 0.2)], credits: p.credit ? [p.credit] : [], usedIn: [U.pavement], note: p.clips.join(", ") });
  }
  const casualCredit = PEOPLE_MODELS.find((p) => p.key === "casual")?.credit;
  for (const key of ["soldier", "police", "civilian"] as const) {
    const f = MEASURED[ARENA[key]];
    out.push({
      id: `soldier:${key}`, kind: "soldier", name: key, slot: `arena:${key}`, file: ARENA[key], bytes: f?.bytes ?? null, tris: f?.tris ?? null, size: sizeOf(f),
      credits: key === "police" ? dl("/police.glb") : key === "civilian" ? (casualCredit ? [casualCredit] : []) : [OWN],
      usedIn: key === "police" ? [U.police] : [U.arena],
      note: f ? `${f.joints.length} bones, ${f.clips.length} clips` : undefined,
    });
  }
  const wf = MEASURED[ARENA.weapons];
  for (const k of WEAPON_KEYS) {
    out.push({ id: `weapon:${k}`, kind: "weapon", name: WEAPONS[k].name, slot: "arena:weapons", file: ARENA.weapons, bytes: null, tris: null, size: null, credits: dl(`/${k}.glb`), usedIn: [U.weapon], note: wf ? `in a ${(wf.bytes / 1024).toFixed(0)} KB file with the other guns` : undefined });
  }
  for (const [kind, k] of Object.entries(PROP_MODELS.kinds)) {
    out.push({ id: `prop:${kind}`, kind: "prop", name: kind, slot: "props:street", file: PROP_MODELS.url, bytes: null, tris: k.tris, size: [0, k.height, 0].map(round) as [number, number, number], credits: [], usedIn: [U.props], note: "credits: see the props file" });
  }
  // Iran's street kit, drawn in code (drive/streetKit3d.ts): nothing to download.
  for (const [key, name, size] of STREET_KIT) out.push({ id: `prop:${key}`, kind: "prop", name, slot: null, file: null, bytes: null, tris: null, size, credits: [OWN], usedIn: [U.props], note: "drawn from code (streetKit3d.ts)" });
  for (const it of ITEMS) out.push({ id: `loot:${it.key}`, kind: "loot", name: it.name, emoji: it.emoji, slot: null, file: null, bytes: null, tris: null, size: null, credits: [], usedIn: [U.loot], note: it.rarity });
  for (const [m, name] of [["store", msg("Store sign")], ["job", msg("Job beacon")], ["loot", msg("Loot beacon")], ["player", msg("Player pin")]] as const) {
    out.push({ id: `marker:${m}`, kind: "marker", name, slot: null, file: null, bytes: null, tris: null, size: null, credits: [OWN], usedIn: [U.marker] });
  }
  for (const [cat, c] of Object.entries(PLACE_CATS)) out.push({ id: `store:${cat}`, kind: "store", name: c.label, emoji: c.emoji, slot: null, file: null, bytes: null, tris: null, size: null, credits: [], usedIn: [U.shop], note: c.color });
  for (const l of opts.landmarks ?? []) {
    out.push({ id: `landmark:${l.id}`, kind: "landmark", name: l.name, slot: null, file: l.url, bytes: l.stats?.bytes ?? null, tris: l.stats?.triangles ?? null, size: [0, l.height, 0], credits: [], usedIn: [U.landmark], note: "edited in 3D stores" });
  }
  // Measured files win over what the registries say about themselves (they are the real bytes).
  for (const o of out) {
    const f = o.file ? MEASURED[o.file] : undefined;
    if (f && o.slot && !o.slot.startsWith("props:") && !o.slot.startsWith("arena:weapons")) (o.bytes = f.bytes), (o.size ??= sizeOf(f));
  }
  return out;
}

export type SlotInfo = { slot: string; kind: ObjectKind; label: string; file: string; bytes: number | null; tris: number | null; objects: string[] };
/** The replaceable files, one per slot, and the objects each holds. */
export function buildSlots(objects: CatalogObject[]): SlotInfo[] {
  const map = new Map<string, SlotInfo>();
  for (const o of objects) {
    if (!o.slot || !o.file) continue;
    const s = map.get(o.slot) ?? { slot: o.slot, kind: o.kind, label: o.slot.startsWith("arena:weapons") ? "weapons" : o.slot.startsWith("props:") ? "street props" : o.name, file: o.file, bytes: MEASURED[o.file]?.bytes ?? o.bytes, tris: MEASURED[o.file]?.tris ?? o.tris, objects: [] };
    s.objects.push(o.id);
    map.set(o.slot, s);
  }
  return [...map.values()];
}

export const measuredFile = (url: string): FileInfo | undefined => MEASURED[url];
