// Party games in the 3D city: friends drive together and play a round. Pure — client
// and server. The server referees every round from the positions players stream to
// /api/drive (server/drive.ts); the host's client only proposes where checkpoints and
// coins go, because it's the one holding the street map.
import { msg } from "./i18n";
import { distanceM, type LatLng } from "./geo";

export type PartyGame = "race" | "tag" | "coins";

export const PARTY_GAMES: Record<PartyGame, { name: string; emoji: string; blurb: string; seconds: number; groundOnly: boolean; min: number }> = {
  race: { name: msg("Checkpoint Race"), emoji: "🏁", blurb: msg("Race through every checkpoint on real streets. First across the line wins."), seconds: 300, groundOnly: true, min: 1 },
  tag: { name: msg("Tag"), emoji: "🫵", blurb: msg("Whoever is IT chases the rest — touch someone to pass it on. Least time as IT wins."), seconds: 180, groundOnly: true, min: 2 },
  coins: { name: msg("Coin Rush"), emoji: "🪙", blurb: msg("Coins are scattered around the block. Grab more than anyone before time runs out."), seconds: 180, groundOnly: false, min: 1 },
};
export const isPartyGame = (k: unknown): k is PartyGame => typeof k === "string" && k in PARTY_GAMES;

export const PARTY_MAX = 8;
export const COUNTDOWN_MS = 4000;
export const CHECKPOINT_M = 22;
export const COIN_M = 9;
export const TAG_M = 7;
/** After a tag the new IT can't tag straight back. */
export const TAG_COOLDOWN_MS = 3000;
/** Points the host proposes: limits the server enforces. */
export const RACE_POINTS = { min: 3, max: 10, maxLegM: 900, maxFromStartM: 2000 };
export const COIN_POINTS = { min: 8, max: 30, maxFromStartM: 600 };
/** Members who stop reporting this long drop out of the party. */
export const PARTY_IDLE_MS = 120_000;
/** A party's paid rounds per player per day (no farming with an alt). */
export const PARTY_REWARDS_PER_DAY = 10;

export type PartyState = {
  game: PartyGame;
  /** Bumped every round start: clients warp to the start line once per id. */
  round: number;
  start: LatLng & { yaw: number };
  /** Who's playing this round (members who join mid-round watch until the next one). */
  ids: string[];
  cps?: LatLng[];
  coins?: LatLng[];
  /** Race: checkpoints passed. Coins: coins grabbed. */
  progress: Record<string, number>;
  /** Race: finish time (ms after the start). */
  finished: Record<string, number>;
  /** Coins: who took each coin. */
  taken?: Record<string, string>;
  it?: string | null;
  itSince?: number;
  itMs?: Record<string, number>;
  lastTagAt?: number;
};

export type PartyMemberView = { userId: string; name: string; avatar: string; vehicle: string | null; score: number; place: number | null; reward: string | null; online: boolean };

export type PartyView = {
  id: string;
  code: string;
  hostId: string;
  game: PartyGame;
  status: "LOBBY" | "LIVE" | "ENDED";
  startsAt: number | null;
  endsAt: number | null;
  members: PartyMemberView[];
  state: PartyState | null;
  /** Where *I* line up for this round (set while the round is fresh). */
  warp: (LatLng & { yaw: number; round: number }) | null;
};

/** Spread players on the start line: one behind the other, well out of tagging reach. */
export function gridSpot(start: LatLng & { yaw: number }, i: number): LatLng & { yaw: number } {
  // yaw is the three.js heading: forward is (−sin yaw, −cos yaw) in x (east) / z (south).
  const back = 12 * i;
  const east = Math.sin(start.yaw) * back, north = -Math.cos(start.yaw) * back;
  return { lat: start.lat + north / 110_540, lng: start.lng + east / (111_320 * Math.cos((start.lat * Math.PI) / 180)), yaw: start.yaw };
}

/** Is a host's proposed course fair? Returns an error message key, or null. */
export function checkPoints(game: PartyGame, start: LatLng, pts: LatLng[] | undefined): string | null {
  if (game === "tag") return null;
  const lim = game === "race" ? RACE_POINTS : COIN_POINTS;
  if (!pts || pts.length < lim.min || pts.length > lim.max) return msg("That course doesn't fit — drive somewhere with more streets");
  let prev = start;
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return msg("That course doesn't fit — drive somewhere with more streets");
    if (distanceM(start, p) > lim.maxFromStartM) return msg("That course doesn't fit — drive somewhere with more streets");
    if (game === "race" && distanceM(prev, p) > RACE_POINTS.maxLegM) return msg("That course doesn't fit — drive somewhere with more streets");
    prev = p;
  }
  return null;
}

/** Final standings: [userId, score, place] best first. */
export function standings(s: PartyState, members: string[], startsAt: number): { userId: string; score: number; place: number }[] {
  const rows = members.map((id) => {
    if (s.game === "race") {
      const fin = s.finished[id];
      // Finished: by time. Not finished: by checkpoints passed.
      return { userId: id, score: s.progress[id] ?? 0, key: fin != null ? -1e9 + fin : -(s.progress[id] ?? 0) };
    }
    if (s.game === "tag") {
      const ms = (s.itMs?.[id] ?? 0) + (s.it === id && s.itSince ? Math.max(0, Date.now() - Math.max(s.itSince, startsAt)) : 0);
      return { userId: id, score: Math.round(ms / 1000), key: ms };
    }
    return { userId: id, score: s.progress[id] ?? 0, key: -(s.progress[id] ?? 0) };
  });
  rows.sort((a, b) => a.key - b.key);
  let place = 0, last = NaN;
  return rows.map((r, i) => {
    if (r.key !== last) place = i + 1;
    last = r.key;
    return { userId: r.userId, score: r.score, place };
  });
}

/** Coins and XP for a place in a round with `n` players. Solo rounds pay a token. */
export function partyPrize(game: PartyGame, place: number, n: number, score: number) {
  if (n < 2) return { coins: 10, xp: 10 };
  const podium = place === 1 ? 1 : place === 2 ? 0.6 : place === 3 ? 0.4 : 0.25;
  const base = game === "coins" ? 40 + score * 4 : 100;
  return { coins: Math.round(base * podium), xp: Math.round(60 * podium) };
}

const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newPartyCode = (r = Math.random) => Array.from({ length: 6 }, () => CODE_ABC[Math.floor(r() * CODE_ABC.length)]).join("");
export const isPartyCode = (s: string) => /^[A-Z2-9]{6}$/.test(s);
