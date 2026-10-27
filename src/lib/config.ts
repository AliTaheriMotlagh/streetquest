// Applies admin settings everywhere: the scalar settings (S) plus per-entry stat
// overrides on the item catalog. Catalog entries are mutated in place, so every
// module that already holds a reference (ITEM_BY_KEY…) sees the change.
// Shared by the server (per request, cached) and the client (from /api/me).
import { ITEMS } from "./catalog";
import { syncSettings as syncReach } from "./reach";
import { applySettings, S, type CatalogOverrides } from "./settings";

type Entry = { key: string } & Record<string, unknown>;
const CATALOGS = { items: ITEMS } as unknown as Record<keyof CatalogOverrides, Entry[]>;

/** Numeric fields the admin may edit, per catalog. */
export const EDITABLE: Record<keyof CatalogOverrides, string[]> = {
  items: ["value", "food"],
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
  syncReach();
  for (const [cat, list] of Object.entries(CATALOGS) as [keyof CatalogOverrides, Entry[]][]) {
    const ov = S.catalog?.[cat] ?? {};
    for (const e of list) {
      const orig = base[cat][e.key];
      for (const f of EDITABLE[cat]) {
        const v = ov[e.key]?.[f];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) e[f] = v;
        else if (orig[f] === undefined) delete e[f];
        else e[f] = orig[f];
      }
    }
  }
  return S;
}
