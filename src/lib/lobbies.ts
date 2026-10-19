// Squad-run lobbies at run spawns: a 🏁 race (podium pays +50% / +25%) or a 🤝 co-op run
// (+20% per teammate). Pure — safe on client and server.
import { msg } from "./i18n";

export type LobbyKind = "race" | "coop";
export const LOBBY_INFO: Record<LobbyKind, { name: string; emoji: string; blurb: string; openMs: number }> = {
  race: { name: msg("Street Race"), emoji: "🏁", blurb: msg("Everyone races to the same finish. Podium pays +50% / +25%."), openMs: 45_000 },
  coop: { name: msg("Co-op Run"), emoji: "🤝", blurb: msg("Run it together: +20% reward per teammate who joins."), openMs: 45_000 },
};
export const isLobbyKind = (k: string): k is LobbyKind => k === "race" || k === "coop";
export const LOBBY_MAX_PLAYERS = 8;
export const COUNTDOWN_MS = 3500;
