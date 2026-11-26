// What the 3D city carries on a device, beyond the picture's effects (those are graphics/quality.ts
// Profile + offEffects). Pure; tests/features.test.ts. Before this, the busy city (walkers, traffic,
// street kit, trailers, neural voices) only thinned out for the "lite" switch — a device the
// benchmark put on the "low" tier still got the full crowd. Now the lite city follows the tier too.
import type { Tier } from "@/components/drive/graphics/quality";

/** Things the lite city leaves out or thins, in the order Settings lists them. */
export type Cut = "crowds" | "streetKit" | "trailers" | "voices" | "signs";

/**
 * Each cut, and the lowest tier that keeps it in full. The constructors that read `lite` (Crowd,
 * TrafficCars, streetKit, cinemaBoards, setNeuralLite, Markers, Storefronts…) do the trimming.
 */
export const CUTS: { id: Cut; minTier: Tier; what: string }[] = [
  { id: "crowds", minTier: "medium", what: "16 walkers, fewer cars and parked rows, 12 job beacons (40 / 24 on medium+)" },
  { id: "streetKit", minTier: "medium", what: "post boxes, cabinets, railings, gantries — kept to signs and lamps" },
  { id: "trailers", minTier: "medium", what: "film trailers on cinema boards (a video decoder + texture upload a frame)" },
  { id: "voices", minTier: "medium", what: "neural voices (a speech model in a worker) → the phone's own voice" },
  { id: "signs", minTier: "medium", what: "90 shop signs instead of 220, fewer street and house numbers" },
];

const ORDER: Tier[] = ["low", "medium", "high", "ultra"];

/** The city is built lite: the player chose lite, or the device runs on the low tier. */
export const liteCity = (lite: boolean, tier: Tier) => lite || ORDER.indexOf(tier) < ORDER.indexOf("medium");

/** What this device's city leaves out (empty on the full city). */
export const offCuts = (lite: boolean, tier: Tier): Cut[] => (liteCity(lite, tier) ? CUTS.filter((c) => lite || ORDER.indexOf(tier) < ORDER.indexOf(c.minTier)).map((c) => c.id) : []);
