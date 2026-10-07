"use client";
// Raider waves as the client sees them: rebuilt from the seed and simulated locally,
// so the map can animate creeps and tracers without any extra network traffic.
import { useMemo } from "react";
import { distanceM } from "@/lib/geo";
import { baseDefender, buildWave, GUARD_RANGE_M, simulateWave, squadDps, towerStats, type Defender, type Strike, type WaveDef, type WaveOutcome } from "@/lib/td";
import type { World, WorldWave } from "./client";

/** The defenders a client can see for a wave — mirrors the server's pick closely enough to animate. */
export function clientDefenders(world: World, w: WorldWave): Defender[] {
  const base = world.bases.find((b) => b.id === w.baseId);
  const allied = (x: { ownerId: string; mine: boolean; friend: boolean }) => x.ownerId === w.ownerId || (base?.mine && x.friend) || (base?.friend && x.mine);
  const home = base ? baseDefender({ id: base.id, ownerId: w.ownerId, lat: base.lat, lng: base.lng }, base.turrets, base.hq) : null;
  const near = (p: { lat: number; lng: number }) => distanceM(p, { lat: w.baseLat, lng: w.baseLng }) <= 700;
  const now = Date.now();
  return [
    ...(home ? [home] : []),
    ...world.towers
      .filter((t) => t.readyAt <= now && t.hp > 0 && allied(t) && near(t))
      .map((t) => {
        const s = towerStats(t);
        return { id: t.id, ownerId: t.ownerId, lat: t.lat, lng: t.lng, range: s.range, dps: s.dps, vs: s.def.vs };
      }),
    ...world.squads
      .filter((q) => q.status === "HOLD" && q.order === "guard" && allied(q) && near({ lat: q.toLat, lng: q.toLng }))
      .map((q) => ({ id: q.id, ownerId: q.ownerId, lat: q.toLat, lng: q.toLng, range: GUARD_RANGE_M, dps: q.units ? squadDps(q.units) : q.size * 0.8, vs: { infantry: 1, vehicle: 1, air: 0.7 } })),
  ];
}

export type LiveWave = { w: WorldWave; def: WaveDef; out: WaveOutcome; defenders: Defender[] };

/** Build + simulate the waves currently in view (memoized on what changes the fight). */
export function useLiveWaves(world: World | null) {
  return useMemo<LiveWave[]>(() => {
    if (!world) return [];
    return world.waves.map((w) => {
      const def = buildWave({ id: w.id, seed: w.seed, startAt: w.startAt, hq: w.hq, boost: w.boost, base: { lat: w.baseLat, lng: w.baseLng } });
      const defenders = clientDefenders(world, w);
      return { w, def, defenders, out: simulateWave(def, defenders, (w.strikes as Strike[]) ?? []) };
    });
  }, [world]);
}
