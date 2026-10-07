// Tower defense + field armies on the real map. Pure — safe on client and server.
// Towers shoot hostile commanders and raider waves; squads march between real
// points (positions are interpolated from the march, no ticking needed); waves are
// generated from a seed and fought by a deterministic simulation, so the server's
// result and every client's animation agree.
import { hashStr, offset, rng, type LatLng } from "./geo";
import type { ArmorClass } from "./hero";
import { UNIT_BY_KEY, type Army, type UnitKey } from "./rts";

// ---------------------------------------------------------------- towers
export type TowerKey = "mg" | "cannon" | "sam" | "sniper" | "tesla";
export type TowerDef = {
  key: TowerKey;
  name: string;
  emoji: string;
  blurb: string;
  cost: number;
  scrap: number;
  minutes: number;
  hqLevel: number;
  range: number; // metres
  dps: number;
  hp: number;
  vs: Record<ArmorClass, number>;
  vsPlayer: number; // damage multiplier against commanders on foot
};

export const TOWERS: TowerDef[] = [
  { key: "mg", name: "MG Nest", emoji: "🔫", blurb: "Cheap rapid fire. Shreds raiders on foot and careless passers-by.", cost: 250, scrap: 0, minutes: 1, hqLevel: 1, range: 45, dps: 4, hp: 600, vs: { infantry: 1.4, vehicle: 0.5, air: 0.6 }, vsPlayer: 0.7 },
  { key: "sniper", name: "Sniper Tower", emoji: "🎯", blurb: "Huge range, punishing against commanders. Weak vs armor.", cost: 400, scrap: 3, minutes: 2, hqLevel: 1, range: 120, dps: 2.5, hp: 400, vs: { infantry: 1.3, vehicle: 0.4, air: 0.3 }, vsPlayer: 1.4 },
  { key: "cannon", name: "Cannon", emoji: "💣", blurb: "Heavy shells. Cracks technicals and tanks.", cost: 450, scrap: 5, minutes: 3, hqLevel: 2, range: 60, dps: 6, hp: 900, vs: { infantry: 0.8, vehicle: 1.6, air: 0.1 }, vsPlayer: 0.4 },
  { key: "sam", name: "SAM Site", emoji: "🚀", blurb: "Long-range anti-air. Drones and jets fall from the sky.", cost: 550, scrap: 8, minutes: 3, hqLevel: 2, range: 90, dps: 5, hp: 500, vs: { infantry: 0.3, vehicle: 0.6, air: 2.2 }, vsPlayer: 0.2 },
  { key: "tesla", name: "Tesla Coil", emoji: "⚡", blurb: "Short range, brutal damage against everything.", cost: 800, scrap: 12, minutes: 5, hqLevel: 3, range: 35, dps: 11, hp: 750, vs: { infantry: 1.2, vehicle: 1.2, air: 0.9 }, vsPlayer: 0.9 },
];
export const TOWER_BY_KEY = Object.fromEntries(TOWERS.map((t) => [t.key, t])) as Record<TowerKey, TowerDef>;
export const TOWER_MAX_LEVEL = 3;
export const TOWER_TERRITORY_M = 1500; // towers go up within this distance of your base
export const TOWER_SPACING_M = 25;
export const maxTowers = (hq: number) => 2 + 2 * hq;

export function towerStats(t: { type: string; level: number }) {
  const d = TOWER_BY_KEY[t.type as TowerKey] ?? TOWERS[0];
  const l = Math.max(1, t.level) - 1;
  return { def: d, range: Math.round(d.range * (1 + 0.1 * l)), dps: d.dps * (1 + 0.5 * l), maxHp: Math.round(d.hp * (1 + 0.6 * l)) };
}
export const towerCost = (key: TowerKey, level: number) => {
  const d = TOWER_BY_KEY[key];
  return { coins: Math.round(d.cost * level ** 1.6), scrap: d.scrap * level, seconds: d.minutes * 60 * level };
};

// ---------------------------------------------------------------- commanders on foot
export const PLAYER_MAX_HP = 100;
export const HP_REGEN_S = 6; // +1 HP every 6 s
export const DOWNED_MS = 3 * 60_000;
export const RESPAWN_IMMUNE_MS = 5 * 60_000;
export const ROOKIE_LEVEL = 3; // towers ignore rookies below this level
export const DOWNED_COIN_LOSS = 0.05;
export const SABOTAGE_COOLDOWN_MS = 30_000;
export const SABOTAGE_DMG = [0, 160, 320, 520];

export function currentHp(hp: number, hpAt: Date | string | number, maxHp: number, now = Date.now()) {
  return Math.min(maxHp, hp + Math.floor((now - new Date(hpAt).getTime()) / 1000 / HP_REGEN_S));
}

// ---------------------------------------------------------------- squads
export const MAX_SQUADS = 4;
export const GUARD_RANGE_M = 55;
/** Marching speed in m/s by class — a squad moves at its slowest unit. */
export const MARCH_SPEED: Record<ArmorClass, number> = { infantry: 3, vehicle: 8, air: 25 };

export function squadSpeed(units: Army) {
  let s = Infinity;
  for (const [k, q] of Object.entries(units)) if (q) s = Math.min(s, MARCH_SPEED[UNIT_BY_KEY[k as UnitKey]?.cls ?? "infantry"]);
  return Number.isFinite(s) ? s : MARCH_SPEED.infantry;
}
export const unitCount = (a: Army) => Object.values(a).reduce((s, q) => s + (q ?? 0), 0);

export type SquadPath = { fromLat: number; fromLng: number; toLat: number; toLng: number; departAt: string | number | Date; arriveAt: string | number | Date };
export function squadPos(s: SquadPath, now = Date.now()): LatLng {
  const a = new Date(s.departAt).getTime();
  const b = new Date(s.arriveAt).getTime();
  const f = b <= a ? 1 : Math.max(0, Math.min(1, (now - a) / (b - a)));
  return { lat: s.fromLat + (s.toLat - s.fromLat) * f, lng: s.fromLng + (s.toLng - s.fromLng) * f };
}
/** The main unit of a squad, for its map icon. */
export function squadIcon(units: Army) {
  const [k] = Object.entries(units).filter(([, q]) => q).sort((a, b) => (UNIT_BY_KEY[b[0] as UnitKey]?.housing ?? 0) * (b[1] ?? 0) - (UNIT_BY_KEY[a[0] as UnitKey]?.housing ?? 0) * (a[1] ?? 0))[0] ?? ["ranger"];
  return UNIT_BY_KEY[k as UnitKey]?.emoji ?? "🪖";
}
/** Damage per second a squad deals when guarding (vs waves and commanders). */
export function squadDps(units: Army) {
  let atk = 0;
  for (const [k, q] of Object.entries(units)) atk += (UNIT_BY_KEY[k as UnitKey]?.atk ?? 0) * (q ?? 0);
  return atk / 6;
}

// ---------------------------------------------------------------- raider waves
export const WAVE_SPAWN_M = 550;
export const WAVE_EVERY_MIN: [number, number] = [45, 150]; // automatic raids
export const PROVOKE_DELAY_MS = 60_000;
export const PROVOKE_COOLDOWN_MS = 10 * 60_000;
export const STRIKE_RADIUS_M = 40;
export const STRIKE_DMG = 320;
export const STRIKES_PER_WAVE = 3;
export const STRIKE_COOLDOWN_MS = 12_000;
export const STRIKE_RANGE_M = 400; // you have to be near the base to call them in

export type CreepKind = "bandit" | "technical" | "drone";
export const CREEPS: Record<CreepKind, { name: string; emoji: string; cls: ArmorClass; hp: number; speed: number; steal: number; bounty: number; dmg: number }> = {
  bandit: { name: "Bandit", emoji: "🥷", cls: "infantry", hp: 70, speed: 1.8, steal: 12, bounty: 5, dmg: 20 },
  technical: { name: "Technical", emoji: "🛻", cls: "vehicle", hp: 260, speed: 4.5, steal: 35, bounty: 14, dmg: 60 },
  drone: { name: "Drone", emoji: "🛸", cls: "air", hp: 130, speed: 7, steal: 20, bounty: 9, dmg: 35 },
};

export type Creep = { i: number; kind: CreepKind; hp: number; depart: number; speed: number; lane: number };
export type WaveParams = { id: string; seed: number; startAt: number; hq: number; boost: number; base: LatLng };
export type WaveDef = WaveParams & { from: LatLng; length: number; creeps: Creep[]; endAt: number };

export function buildWave(p: WaveParams): WaveDef {
  const rand = rng(p.seed);
  const bearing = rand() * 360;
  const from = offset(p.base, WAVE_SPAWN_M, bearing);
  const hq = Math.max(1, p.hq);
  const count = Math.round((4 + 2 * hq) * (p.boost > 1 ? 1.25 : 1));
  // Provoked waves pay ×boost but only get a little tougher.
  const scale = (1 + 0.25 * (hq - 1)) * (1 + (p.boost - 1) * 0.3);
  const creeps: Creep[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const r = rand();
    const kind: CreepKind = hq >= 3 && r < 0.18 ? "drone" : hq >= 2 && r < 0.42 ? "technical" : "bandit";
    const c = CREEPS[kind];
    creeps.push({ i, kind, hp: Math.round(c.hp * scale), depart: t, speed: c.speed, lane: (rand() - 0.5) * 24 });
    t += 1800 + Math.floor(rand() * 2400);
  }
  const endAt = p.startAt + Math.max(...creeps.map((c) => c.depart + (WAVE_SPAWN_M / c.speed) * 1000)) + 1000;
  return { ...p, from, length: WAVE_SPAWN_M, creeps, endAt };
}

/** Where a creep is at time t (ms), or null before it sets off. Lanes fan out sideways near the start. */
export function creepPos(w: WaveDef, c: Creep, t: number): { pos: LatLng; f: number } | null {
  const dt = (t - w.startAt - c.depart) / 1000;
  if (dt < 0) return null;
  const f = Math.min(1, (dt * c.speed) / w.length);
  const side = c.lane * (1 - f) * 0.000009; // ~metres → degrees, shrinking to zero at the base
  const lat = w.from.lat + (w.base.lat - w.from.lat) * f + side;
  const lng = w.from.lng + (w.base.lng - w.from.lng) * f + side;
  return { pos: { lat, lng }, f };
}

/** The base itself fights back: Defense Turrets + Command Center guns. */
export function baseDefender(b: { id: string; ownerId: string; lat: number; lng: number }, turret: number, hq: number): Defender | null {
  const dps = turret * 5 + hq * 1.5;
  return dps > 0 ? { id: `base:${b.id}`, ownerId: b.ownerId, lat: b.lat, lng: b.lng, range: 70, dps, vs: { infantry: 1, vehicle: 1.2, air: 1.5 } } : null;
}
export const stealCap = (hq: number) => 200 + 100 * hq;

export type Defender = { id: string; ownerId: string; lat: number; lng: number; range: number; dps: number; vs: Record<ArmorClass, number> };
export type Strike = { by: string; name?: string; t: number; lat: number; lng: number };
export type WaveOutcome = {
  deathAt: (number | null)[];
  killer: (string | null)[]; // ownerId of the tower/squad, or the striker
  leaked: boolean[];
  shots: { t: number; d: number; c: number }[]; // one sample per defender per second, for tracers
  kills: Record<string, number>;
  bounty: Record<string, number>;
  stolen: number;
  baseDmg: number;
};

// Cheap planar distance — fine within a few km.
function metres(a: LatLng, b: LatLng) {
  const x = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  const y = (b.lat - a.lat) * 110540;
  return Math.hypot(x, y);
}

export function simulateWave(w: WaveDef, defenders: Defender[], strikes: Strike[]): WaveOutcome {
  const n = w.creeps.length;
  const hp = w.creeps.map((c) => c.hp);
  const deathAt: (number | null)[] = Array(n).fill(null);
  const killer: (string | null)[] = Array(n).fill(null);
  const leaked: boolean[] = Array(n).fill(false);
  const shots: WaveOutcome["shots"] = [];
  const pending = [...strikes].sort((a, b) => a.t - b.t);
  const STEP = 500;
  const kill = (i: number, t: number, by: string) => {
    if (hp[i] > 0) return;
    deathAt[i] = t;
    killer[i] = by;
  };
  for (let t = w.startAt; t <= w.endAt; t += STEP) {
    const pos = w.creeps.map((c, i) => (hp[i] > 0 && !leaked[i] ? creepPos(w, c, t) : null));
    for (let i = 0; i < n; i++) if (pos[i] && pos[i]!.f >= 1) {
      leaked[i] = true;
      pos[i] = null;
    }
    while (pending.length && pending[0].t < t + STEP) {
      const s = pending.shift()!;
      if (s.t < w.startAt) continue;
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        if (!p || hp[i] <= 0) continue;
        if (metres(p.pos, s) <= STRIKE_RADIUS_M) {
          hp[i] -= STRIKE_DMG * (w.creeps[i].kind === "drone" ? 0.6 : 1);
          kill(i, t, s.by);
        }
      }
    }
    const sample = (t - w.startAt) % 1000 === 0;
    defenders.forEach((d, di) => {
      let best = -1;
      let bestF = -1;
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        if (!p || hp[i] <= 0 || p.f <= bestF) continue;
        if (metres(p.pos, d) <= d.range) {
          best = i;
          bestF = p.f;
        }
      }
      if (best < 0) return;
      hp[best] -= d.dps * d.vs[CREEPS[w.creeps[best].kind].cls] * (STEP / 1000);
      kill(best, t, d.ownerId);
      if (sample) shots.push({ t, d: di, c: best });
    });
  }
  const kills: Record<string, number> = {};
  const bounty: Record<string, number> = {};
  let stolen = 0;
  let baseDmg = 0;
  w.creeps.forEach((c, i) => {
    const def = CREEPS[c.kind];
    if (killer[i]) {
      kills[killer[i]!] = (kills[killer[i]!] ?? 0) + 1;
      bounty[killer[i]!] = (bounty[killer[i]!] ?? 0) + Math.round(def.bounty * Math.max(1, w.hq * 0.6) * w.boost);
    } else if (leaked[i]) {
      stolen += Math.round(def.steal * w.hq);
      baseDmg += def.dmg;
    }
  });
  return { deathAt, killer, leaked, shots, kills, bounty, stolen, baseDmg };
}

export const waveSeed = (baseId: string, at: number) => hashStr(`${baseId}|${at}`) & 0x7fffffff; // fits a Postgres INT

// ---------------------------------------------------------------- pings
export const PINGS = {
  attack: { emoji: "⚔️", label: "Attack here" },
  help: { emoji: "🆘", label: "Need help" },
  rally: { emoji: "🚩", label: "Rally here" },
  loot: { emoji: "💰", label: "Loot here" },
} as const;
export type PingKind = keyof typeof PINGS;
export const PING_MS = 5 * 60_000;
