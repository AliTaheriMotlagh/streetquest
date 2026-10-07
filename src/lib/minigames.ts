// Seeded mini-games. Everyone in a lobby gets the same seed, so they play the exact
// same round — the fair way to compete. The server uses the same generators to cap
// scores. Pure — safe on client and server.
import { rng } from "./geo";

// ---------------------------------------------------------------- Shooting Range (arcades)
// Targets pop up in the windows of a street facade. Shoot hostiles, spare civilians,
// reload when the magazine runs dry. Hits in a row build a combo.
export const RANGE_MS = 20_000;
export const RANGE_SLOTS = 9; // 3×3 windows
export const RANGE_MAG = 8;
export const RANGE_RELOAD_MS = 900;
export type RangeKind = "enemy" | "boss" | "civilian";
export type Popup = { id: number; t: number; dur: number; slot: number; kind: RangeKind; emoji: string };
export const RANGE_POINTS: Record<RangeKind, number> = { enemy: 10, boss: 30, civilian: -25 };
export const COMBO_STEP = 2;
export const COMBO_MAX = 10;

const ENEMY = ["🥷", "🪖", "🦹", "🧟"];
const CIVIL = ["🧑‍💼", "👵", "🧑‍🍳", "👷"];

export function rangeSchedule(seed: number): Popup[] {
  const rand = rng(seed);
  const out: Popup[] = [];
  let t = 600;
  let id = 0;
  while (t < RANGE_MS - 500) {
    const progress = t / RANGE_MS;
    const r = rand();
    const kind: RangeKind = r < 0.08 ? "boss" : r < 0.3 ? "civilian" : "enemy";
    const emoji = kind === "boss" ? "😈" : kind === "civilian" ? CIVIL[Math.floor(rand() * CIVIL.length)] : ENEMY[Math.floor(rand() * ENEMY.length)];
    const dur = Math.round((kind === "boss" ? 750 : 1150) - 450 * progress);
    // never two popups in the same window at once
    let slot = Math.floor(rand() * RANGE_SLOTS);
    for (let k = 0; k < RANGE_SLOTS && out.some((p) => p.slot === slot && p.t + p.dur > t); k++) slot = (slot + 1) % RANGE_SLOTS;
    out.push({ id: id++, t, dur, slot, kind, emoji });
    t += Math.round(560 - 260 * progress + rand() * 160);
  }
  return out;
}

/** Best possible score: every hostile hit, combo maxed. Used to reject forged scores. */
export function rangeMaxScore(seed: number) {
  return rangeSchedule(seed).filter((p) => p.kind !== "civilian").reduce((s, p) => s + RANGE_POINTS[p.kind] + COMBO_MAX, 0);
}

// ---------------------------------------------------------------- Bomb Defuse (chests, C4)
// A booby-trapped supply crate. The detonator flashes a wire sequence — cut the wires
// in that order. Three rounds, longer each time; two wrong cuts and it blows.
export const DEFUSE_MS = 35_000;
export const DEFUSE_STRIKES = 2;
export const WIRES = [
  { key: "red", color: "#ff4d4d" },
  { key: "blue", color: "#38bdf8" },
  { key: "yellow", color: "#ffd23f" },
  { key: "green", color: "#3dff8f" },
  { key: "white", color: "#f4f4fb" },
  { key: "purple", color: "#b26bff" },
];
export type DefuseRound = { wires: number[]; sequence: number[] }; // indexes into WIRES

export function defuseRounds(seed: number): DefuseRound[] {
  const rand = rng(seed ^ 0x5bd1e995);
  return [3, 4, 5].map((len, r) => {
    const count = 4 + Math.min(2, r);
    const pool = WIRES.map((_, i) => i);
    const wires: number[] = [];
    while (wires.length < count) wires.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const sequence: number[] = [];
    while (sequence.length < len) {
      const w = wires[Math.floor(rand() * wires.length)];
      if (sequence[sequence.length - 1] !== w) sequence.push(w);
    }
    return { wires, sequence };
  });
}

/** Score = 100 per round cleared, plus a speed bonus (<100) for clearing all three. */
export const defuseScore = (rounds: number, msLeft: number) => rounds * 100 + (rounds >= 3 ? Math.min(99, Math.round(msLeft / 300)) : 0);
export const defuseRoundsOf = (score: number) => Math.min(3, Math.floor(score / 100));
export const DEFUSE_MAX = 399;

// ---------------------------------------------------------------- lobbies
export type LobbyKind = "range" | "defuse" | "race" | "coop";
export const LOBBY_INFO: Record<LobbyKind, { name: string; emoji: string; blurb: string; openMs: number; playMs: number }> = {
  range: { name: "Shooting Range", emoji: "🎯", blurb: "Same targets for everyone. Highest score wins the pot.", openMs: 20_000, playMs: RANGE_MS },
  defuse: { name: "Bomb Defuse", emoji: "💣", blurb: "Same bomb for everyone. Fastest clean defuse wins.", openMs: 20_000, playMs: DEFUSE_MS },
  race: { name: "Street Race", emoji: "🏁", blurb: "Everyone races to the same finish. Podium pays +50% / +25%.", openMs: 45_000, playMs: 0 },
  coop: { name: "Co-op Run", emoji: "🤝", blurb: "Run it together: +20% reward per teammate who joins.", openMs: 45_000, playMs: 0 },
};
export const LOBBY_MAX_PLAYERS = 8;
export const COUNTDOWN_MS = 3500;
