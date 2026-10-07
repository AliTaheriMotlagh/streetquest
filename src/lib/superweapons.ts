// Faction superweapons, Generals: Zero Hour style. Pure — safe on client and server.
import type { FactionKey } from "./rts";

export type SuperKey = "nuke" | "particle" | "scud";
export type SuperDef = {
  key: SuperKey;
  faction: FactionKey;
  name: string;
  emoji: string;
  blurb: string;
  radius: number; // metres
  power: number; // damage scalar at ground zero
  chargeH: number; // hours between shots at level 1
  warnS: number; // public countdown before impact
  hazard: { minutes: number; dps: number; label: string } | null;
  interceptable: boolean; // missiles can be shot down by SAM sites
};

export const SUPERWEAPONS: Record<SuperKey, SuperDef> = {
  nuke: { key: "nuke", faction: "dragon", name: "Nuclear Missile", emoji: "☢️", blurb: "Huge blast that leaves the ground radioactive for 10 minutes.", radius: 150, power: 1, chargeH: 8, warnS: 45, hazard: { minutes: 10, dps: 2.5, label: "radiation" }, interceptable: true },
  particle: { key: "particle", faction: "coalition", name: "Particle Cannon", emoji: "🔆", blurb: "An orbital beam: tighter, hits hardest, can't be intercepted.", radius: 90, power: 1.35, chargeH: 6, warnS: 30, hazard: null, interceptable: false },
  scud: { key: "scud", faction: "insurgency", name: "SCUD Storm", emoji: "🚀", blurb: "A salvo of missiles over a wide area, then a toxin cloud for 5 minutes.", radius: 200, power: 0.8, chargeH: 7, warnS: 45, hazard: { minutes: 5, dps: 2, label: "toxins" }, interceptable: true },
};
export const SUPER_BY_FACTION: Record<FactionKey, SuperDef> = { dragon: SUPERWEAPONS.nuke, coalition: SUPERWEAPONS.particle, insurgency: SUPERWEAPONS.scud };

export const SUPER_RANGE_M = 5000; // from your base
export const SUPER_MAX_LEVEL = 3;
export const INTERCEPT_RANGE_M = 300; // SAM sites this close to ground zero shoot at missiles
export const INTERCEPT_PER_SAM = 0.15;
export const INTERCEPT_MAX = 0.6;

/** Higher levels charge faster and hit harder. */
export const chargeMs = (d: SuperDef, level: number) => d.chargeH * 3_600_000 * (1 - 0.15 * (Math.max(1, level) - 1));
export const levelPower = (level: number) => 1 + 0.25 * (Math.max(1, level) - 1);
/** Damage falls off from 100% at ground zero to 40% at the edge. */
export const falloff = (dist: number, radius: number) => (dist > radius ? 0 : 1 - 0.6 * (dist / radius));
