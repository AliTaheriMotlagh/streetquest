// The three ways to use StreetQuest (pure; tests/appView.test.ts):
//  - List: shopping only — every store and product around, searched and filtered, no map, no game;
//  - Map: the stores and places on the map, still no game (no money, jobs, wallet or quests);
//  - Game: everything — the money on the streets, jobs, the 3D city, matches.
// The bottom bar switches them; the choice stays on the device.
import { msg } from "./i18n";
import type { IconName } from "./iconPaths";

export type AppView = "list" | "map" | "game";
export const APP_VIEWS: { key: AppView; icon: IconName; label: string; hint: string }[] = [
  { key: "list", icon: "list", label: msg("List"), hint: msg("Stores and prices, no map") },
  { key: "map", icon: "map", label: msg("Map"), hint: msg("Stores and places on the map") },
  { key: "game", icon: "gamepad", label: msg("Game"), hint: msg("Money on the streets, missions, the 3D city") },
];
export const VIEW_KEY = "sq_view";

/** A saved view (anything else: the game, as before there were views). */
export const parseView = (v: string | null | undefined): AppView => (v === "list" || v === "map" || v === "game" ? v : "game");

/** The map's layers that belong to the game: off the map outside the game view. */
export const GAME_LAYERS = ["money", "jobs", "players", "biz"] as const;
export const layerShown = (view: AppView, layer: string) => view === "game" || !(GAME_LAYERS as readonly string[]).includes(layer);
