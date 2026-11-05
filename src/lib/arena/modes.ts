// Street Arena match rules. Pure — the realtime server referees with them, the client
// shows them. A match is played on the real streets inside a circle around where the
// host stood; the server lays spawns and bomb sites on those streets.
//
//  - Deathmatch: everyone for themselves, respawns, first to the kill limit.
//  - Team Deathmatch: two teams, respawns, first team to the kill limit.
//  - Bomb: attackers plant at site A or B, defenders stop them; no respawns within a
//    round, first to ROUNDS_TO_WIN rounds. Sides swap at half time.
//  - Gun Game: everyone for themselves; every GUN_KILLS_PER_STEP kills move you to the
//    next gun on GUN_LADDER, first through the whole ladder wins.
//  - Hardpoint: two teams fight over a zone on the streets that moves every HILL_MOVE_S;
//    every second only one team stands in it scores a point, first to the limit wins.
// Every mode: a UAV for UAV_STREAK kills without dying — enemies show through
// walls for UAV_S (to your whole team in team modes).
import { msg } from "../i18n";
import type { WeaponKey } from "./weapons";

export type ModeKey = "ffa" | "tdm" | "bomb" | "gun" | "hill";
export type Phase = "lobby" | "warmup" | "live" | "roundEnd" | "ended";
/** Team 0 = none (deathmatch); 1 = Red / attackers first; 2 = Blue / defenders first. */
export type Team = 0 | 1 | 2;
export type Difficulty = "easy" | "normal" | "hard";

export type ModeDef = {
  key: ModeKey;
  name: string;
  blurb: string;
  emoji: string;
  teams: boolean;
  respawn: boolean;
  killLimit: number;
  timeLimitS: number;
  minPlayers: number;
};

export const MODES: Record<ModeKey, ModeDef> = {
  ffa: { key: "ffa", name: msg("Deathmatch"), blurb: msg("Every player for themselves. First to {n} kills wins."), emoji: "💀", teams: false, respawn: true, killLimit: 20, timeLimitS: 480, minPlayers: 2 },
  tdm: { key: "tdm", name: msg("Team Deathmatch"), blurb: msg("Red against Blue. First team to {n} kills wins."), emoji: "⚔️", teams: true, respawn: true, killLimit: 40, timeLimitS: 600, minPlayers: 2 },
  bomb: { key: "bomb", name: msg("Bomb Defusal"), blurb: msg("Attackers plant the bomb at site A or B, defenders stop them. No respawns until the next round."), emoji: "💣", teams: true, respawn: false, killLimit: 0, timeLimitS: 0, minPlayers: 2 },
  gun: { key: "gun", name: msg("Gun Game"), blurb: msg("Every 2 kills hand you the next gun. First through all {n} kills wins."), emoji: "🔫", teams: false, respawn: true, killLimit: 10, timeLimitS: 600, minPlayers: 2 },
  hill: { key: "hill", name: msg("Hardpoint"), blurb: msg("Hold the glowing zone with your team — it moves every minute. First team to {n} points wins."), emoji: "🚩", teams: true, respawn: true, killLimit: 120, timeLimitS: 600, minPlayers: 2 },
};
export const MODE_KEYS = Object.keys(MODES) as ModeKey[];
export const isMode = (k: unknown): k is ModeKey => typeof k === "string" && k in MODES;

export const TEAM_NAMES: Record<Team, string> = { 0: "", 1: msg("Red"), 2: msg("Blue") };
export const TEAM_COLORS: Record<Team, string> = { 0: "#f0c05a", 1: "#e5484d", 2: "#3e8ef7" };

// ---- arena
export const RADII = [150, 250, 400] as const;
export type Radius = (typeof RADII)[number];
export const MAX_PLAYERS = 16;
export const MAX_BOTS = 10;
/** You join a match by driving to it: within its circle plus this much. */
export const JOIN_MARGIN_M = 250;
/** Lobbies are listed for players this close. */
export const LOBBY_SEE_M = 3000;
/** Outside the circle: a warning, then this much damage a second. */
export const OUTSIDE_GRACE_S = 4;
export const OUTSIDE_DPS = 12;

// ---- timing
export const WARMUP_S = 6;
export const RESPAWN_S = 3;
export const SPAWN_SHIELD_S = 2;
export const RESULTS_S = 12;

// ---- bomb
export const ROUNDS_TO_WIN = 4;
export const HALF_ROUNDS = 3;
export const ROUND_S = 100;
export const FREEZE_S = 6;
export const BOMB_TIMER_S = 40;
export const PLANT_S = 3.2;
export const DEFUSE_S = 6;
export const SITE_R = 7;
/** Reach of the dropped bomb and of the planted bomb for defusing. */
export const BOMB_REACH_M = 2.2;
export const ROUND_END_S = 6;

// ---- gun game
/** The guns in order; the last one is the hardest to finish with. */
export const GUN_LADDER: WeaponKey[] = ["smg", "shotgun", "rifle", "sniper", "pistol"];
export const GUN_KILLS_PER_STEP = 2;
/** The gun a Gun Game player holds after this many kills. */
export const gunFor = (kills: number): WeaponKey => GUN_LADDER[Math.min(GUN_LADDER.length - 1, Math.floor(Math.max(0, kills) / GUN_KILLS_PER_STEP))];

// ---- hardpoint
/** The zone's radius (m), how long it stays put, and where on the circle it may sit (× radius). */
export const HILL_R = 9;
export const HILL_MOVE_S = 60;
export const HILL_MIN_OUT = 0.1;
export const HILL_MAX_OUT = 0.6;
/** Points a second for the team holding the zone alone (also each holder's score). */
export const HILL_PTS = 1;
export const HILL_PLAYER_SCORE = 10;
/** Who holds the zone: the only team standing in it, 0 when empty or contested. */
export function hillOwner(inside: { team: Team }[]): { owner: Team; contested: boolean } {
  const teams = new Set(inside.map((p) => p.team).filter((t) => t));
  if (teams.size === 1) return { owner: [...teams][0] as Team, contested: false };
  return { owner: 0, contested: teams.size > 1 };
}

// ---- killstreaks
/** Kills without dying for a UAV, and how long it shows the enemies (s). */
export const UAV_STREAK = 3;
export const UAV_S = 12;
/** Does this kill (the killer's run without dying, counting it) earn a UAV? Every UAV_STREAK kills. */
export const earnsUav = (streak: number) => streak > 0 && streak % UAV_STREAK === 0;

// ---- free roam
export const ROOKIE_LEVEL = 3;
export const FREE_RESPAWN_S = 5;
/** Shooting or being shot keeps you out of passive mode this long. */
export const PASSIVE_COOLDOWN_S = 12;

/** Which side a team plays this bomb round (sides swap after HALF_ROUNDS). */
export function bombSide(team: Team, round: number): "attack" | "defend" | null {
  if (!team) return null;
  const swapped = round > HALF_ROUNDS;
  return (team === 1) !== swapped ? "attack" : "defend";
}

/** Coins and XP for a finished match (before the player's multipliers). */
export function matchPrize(o: { mode: ModeKey; won: boolean; place: number; players: number; kills: number; botKills: number; deaths: number; rounds?: number }) {
  const humanKills = Math.max(0, o.kills - o.botKills);
  const xp = 40 + humanKills * 12 + o.botKills * 4 + (o.won ? 60 : 0) + (o.mode === "bomb" ? (o.rounds ?? 0) * 10 : 0);
  const podium = (o.mode === "ffa" || o.mode === "gun") && o.players >= 3 ? (o.place === 1 ? 60 : o.place === 2 ? 30 : o.place === 3 ? 15 : 0) : 0;
  const coins = 15 + humanKills * 4 + o.botKills + (o.won ? 50 : 0) + podium;
  return { xp: Math.min(400, xp), coins: Math.min(300, coins) };
}
export const ARENA_REWARDS_PER_DAY = 12;

// ---- what clients see
export type LobbyView = {
  id: string;
  mode: ModeKey;
  hostName: string;
  lat: number;
  lng: number;
  radius: number;
  players: number;
  bots: number;
  max: number;
  phase: Phase;
  dist: number;
};

export type MatchPlayerView = { sid: number; name: string; avatar: string; team: Team; kills: number; deaths: number; score: number; alive: boolean; bot: boolean; ping: number };

export type MatchView = {
  id: string;
  mode: ModeKey;
  hostSid: number;
  phase: Phase;
  center: { lat: number; lng: number };
  radius: number;
  /** Server time the current phase ends (0 = open-ended). */
  until: number;
  round: number;
  /** Rounds won, or kills, per team [_, red, blue]. */
  teamScore: [number, number, number];
  players: MatchPlayerView[];
  sites: { name: string; lat: number; lng: number }[];
  bomb: { state: "carried" | "dropped" | "planted" | "defused" | "exploded"; carrier: number; lat: number; lng: number; at: number; site: string } | null;
  /** Hardpoint: where the zone is, when it moves next (server time), and who holds it. */
  hill: { lat: number; lng: number; r: number; moves: number; owner: Team; contested: boolean } | null;
  bots: number;
  difficulty: Difficulty;
  winner: { team: Team; sid: number; reason: string } | null;
  killLimit: number;
};
