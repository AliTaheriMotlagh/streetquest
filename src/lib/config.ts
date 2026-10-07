// Applies admin settings everywhere: the scalar settings (S) plus per-entry stat
// overrides on the game catalogs. Catalog entries are mutated in place, so every
// module that already holds a reference (UNIT_BY_KEY, TOWERS…) sees the change.
// Shared by the server (per request, cached) and the client (from /api/me).
import { ITEMS } from "./catalog";
import { syncSettings as syncFlags } from "./flags";
import { syncSettings as syncOutposts } from "./outposts";
import { BUILDINGS, RESEARCH, UNITS, syncSettings as syncRts } from "./rts";
import { applySettings, S, type CatalogOverrides } from "./settings";
import { syncSettings as syncSpawns } from "./spawns";
import { TOWERS, syncSettings as syncTd } from "./td";

type Entry = { key: string } & Record<string, unknown>;
const CATALOGS = { units: UNITS, buildings: BUILDINGS, towers: TOWERS, items: ITEMS, research: RESEARCH } as unknown as Record<keyof CatalogOverrides, Entry[]>;

/** Numeric fields the admin may edit, per catalog. */
export const EDITABLE: Record<keyof CatalogOverrides, string[]> = {
  units: ["cost", "atk", "hp", "seconds", "housing", "buildingLevel"],
  buildings: ["cost", "minutes", "power", "hqLevel"],
  towers: ["cost", "scrap", "minutes", "hqLevel", "range", "dps", "hp", "vsPlayer"],
  items: ["value", "food"],
  research: ["coins", "scrap", "minutes", "level"],
};

// Originals, captured before the first override so "reset" always works.
let originals: Record<string, Record<string, Record<string, unknown>>> | null = null;
function snapshot() {
  if (originals) return originals;
  originals = {};
  for (const [cat, list] of Object.entries(CATALOGS)) {
    originals[cat] = {};
    for (const e of list) originals[cat][e.key] = Object.fromEntries(EDITABLE[cat as keyof CatalogOverrides].map((f) => [f, e[f]]));
  }
  return originals;
}

export const catalogOriginals = () => snapshot();

export function applyConfig(over: unknown) {
  const base = snapshot();
  applySettings(over);
  syncFlags();
  syncOutposts();
  syncRts();
  syncSpawns();
  syncTd();
  for (const [cat, list] of Object.entries(CATALOGS) as [keyof CatalogOverrides, Entry[]][]) {
    const ov = S.catalog?.[cat] ?? {};
    for (const e of list) {
      const orig = base[cat][e.key];
      for (const f of EDITABLE[cat]) {
        const v = ov[e.key]?.[f];
        if (typeof v === "number" && Number.isFinite(v) && (v >= 0 || f === "power")) e[f] = v;
        else if (orig[f] === undefined) delete e[f];
        else e[f] = orig[f];
      }
    }
  }
  return S;
}
