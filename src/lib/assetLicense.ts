// Which 3D models from Sketchfab the game may ship (scripts/sketchfab.ts). Pure.
//
//  - License: only CC BY and CC0. The game has paid features, so NonCommercial is out; NoDerivs
//    is out because every model is cut down and re-packed for phones; ShareAlike would bind the
//    game's own derived files, so it's left out too.
//  - Provenance: models ripped from other games (or "fan" copies of their weapons, cars and
//    characters) belong to those games' makers whatever the upload says, so anything that
//    names a well-known game or calls itself a rip is skipped.

/** Sketchfab license slugs we accept, and the SPDX id each credit is written with. */
export const OK_LICENSES: Record<string, string> = { by: "CC-BY-4.0", cc0: "CC0-1.0" };

/** Search results name a license only by its label; a model's own page gives the slug too. */
const LABELS: Record<string, string> = { "CC Attribution": "by", "CC0 Public Domain": "cc0" };
export const licenseSlug = (l: { slug?: string; label?: string } | null | undefined) => l?.slug ?? (l?.label ? LABELS[l.label] : undefined);

export const usableLicense = (l: { slug?: string; label?: string } | null | undefined) => {
  const slug = licenseSlug(l);
  return !!slug && slug in OK_LICENSES;
};

const RIP_WORDS = [
  "gta", "grand theft auto", "call of duty", "cod mw", "modern warfare", "warzone", "black ops",
  "counter-strike", "counter strike", "csgo", "cs:go", "cs2", "cs 1.6", "valorant", "pubg", "fortnite",
  "battlefield", "apex legends", "rainbow six", "escape from tarkov", "tarkov", "halo", "overwatch",
  "metro exodus", "stalker", "fallout", "resident evil", "the last of us", "far cry",
  "rip", "ripped", "game rip", "game asset from", "from the game", "extracted", "fan art", "fanart",
];

/** Does a model's name, tags or description say it comes from (or copies) another game? */
export function looksRipped(text: string) {
  const t = ` ${text.toLowerCase().replace(/[_\-]+/g, " ")} `;
  return RIP_WORDS.some((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&")}([^a-z0-9]|$)`).test(t));
}

/** A file-safe name for a model. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "model";

export type Credit = { uid: string; title: string; author: string; url: string; license: string; kind: string; file: string; faces: number; at: string };
