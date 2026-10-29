// Game balance, as rules that must keep holding when numbers are tuned:
//  - Street Arena: every primary is the fastest killer in its own band of range, the
//    pistol is a sidearm, and the numbers stay in a sane window;
//  - match prizes reward winning and fighting people, never farming bots, within caps;
//  - medals fire for the right runs;
//  - the economy's defaults keep their order (harder → more, from home ≤ on foot).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { damageAt, MAX_HP, PRIMARIES, shotGap, WEAPONS, type WeaponDef, type WeaponKey } from "@/lib/arena/weapons";
import { ARENA_REWARDS_PER_DAY, matchPrize } from "@/lib/arena/modes";
import { medalFor, MULTI_KILL_MS, nextRun, NO_RUN } from "@/lib/arena/medals";
import { settingDefault as D } from "@/lib/settings";

/** A torso seen head-on (m²): what a well-aimed shot's cone has to land on. */
const TORSO_M2 = 0.45 * 0.75;
/**
 * Seconds to down a full-health player aiming at the body, or Infinity out of range: each
 * bullet (pellet) lands with the chance its aimed cone covers the torso, so a shotgun's
 * spread and a rifle's drift at long range count.
 */
function ttk(w: WeaponDef, dist: number) {
  if (dist > w.range) return Infinity;
  const cone = Math.PI * (w.ads * dist) ** 2;
  const lands = Math.min(1, TORSO_M2 / Math.max(cone, 1e-9));
  const perShot = damageAt(w, dist, "body") * w.pellets * lands;
  const shots = Math.ceil(MAX_HP / perShot);
  if (shots > w.mag) return Infinity;
  return (shots - 1) * shotGap(w);
}
const fastest = (dist: number, keys: WeaponKey[] = PRIMARIES) => keys.map((k) => ({ k, t: ttk(WEAPONS[k], dist) })).sort((a, b) => a.t - b.t)[0].k;

describe("Street Arena guns", () => {
  it("each primary owns its band of range", () => {
    assert.equal(fastest(4), "shotgun", "point-blank");
    assert.equal(fastest(9), "smg", "up close");
    for (const d of [30, 45, 60]) assert.equal(fastest(d, ["rifle", "smg", "shotgun"]), "rifle", `${d} m`);
    // Far out only the sniper still reaches, and a headshot drops anyone it can reach.
    assert.equal(fastest(250), "sniper");
    assert.ok(damageAt(WEAPONS.sniper, WEAPONS.sniper.range, "head") >= MAX_HP);
  });

  it("the shotgun one-shots point-blank but not across a street", () => {
    assert.equal(ttk(WEAPONS.shotgun, 4), 0);
    assert.ok(ttk(WEAPONS.shotgun, 18) > 0);
  });

  it("the pistol is a sidearm: never the best, never useless", () => {
    for (const d of [4, 9, 30]) assert.ok(ttk(WEAPONS.pistol, d) > ttk(WEAPONS[fastest(d)], d), `${d} m`);
    assert.ok(ttk(WEAPONS.pistol, 10) < 1, "four shots in under a second");
  });

  it("keeps the numbers sane", () => {
    for (const w of Object.values(WEAPONS)) {
      assert.ok(w.minDamage <= w.damage && w.near < w.far && w.far <= w.range, w.key);
      assert.ok(w.mobility >= 0.8 && w.mobility <= 1.1, w.key);
      assert.ok(w.ads <= w.hip, `${w.key}: aiming is steadier than the hip`);
    }
    // Close-range time to kill for the automatic guns: quick, but you can react.
    for (const k of ["smg", "rifle"] as const) assert.ok(ttk(WEAPONS[k], 8) >= 0.15 && ttk(WEAPONS[k], 8) <= 0.45, k);
    assert.ok(WEAPONS.sniper.range > WEAPONS.rifle.range && WEAPONS.rifle.range > WEAPONS.smg.range && WEAPONS.smg.range > WEAPONS.shotgun.range);
  });
});

describe("match prizes", () => {
  const base = { mode: "tdm" as const, won: false, place: 2, players: 6, kills: 8, botKills: 0, deaths: 5 };
  it("pay more for winning and for fighting people", () => {
    assert.ok(matchPrize({ ...base, won: true }).coins > matchPrize(base).coins);
    assert.ok(matchPrize({ ...base, won: true }).xp > matchPrize(base).xp);
    assert.ok(matchPrize({ ...base, kills: 12 }).coins >= matchPrize(base).coins);
  });

  it("never make farming bots pay like beating people", () => {
    const people = matchPrize({ ...base, won: true, kills: 20, botKills: 0 });
    const bots = matchPrize({ ...base, won: true, kills: 20, botKills: 20 });
    assert.ok(bots.coins < people.coins && bots.xp < people.xp);
  });

  it("stay within their caps, and a day of matches stays bounded", () => {
    const huge = matchPrize({ mode: "ffa", won: true, place: 1, players: 16, kills: 300, botKills: 0, deaths: 0 });
    assert.deepEqual(huge, { xp: 400, coins: 300 });
    assert.ok(ARENA_REWARDS_PER_DAY * huge.coins <= 4000);
  });
});

describe("medals", () => {
  it("chains kills into multi-kills and runs", () => {
    let r = NO_RUN;
    r = nextRun(r, 1000);
    assert.equal(medalFor({ multi: r.multi, streak: r.streak, head: false, firstBlood: false }), null);
    r = nextRun(r, 1000 + MULTI_KILL_MS - 1);
    assert.equal(medalFor({ multi: r.multi, streak: r.streak, head: false, firstBlood: false })?.key, "double");
    r = nextRun(r, 1000 + MULTI_KILL_MS * 2 - 2);
    assert.equal(medalFor({ multi: r.multi, streak: r.streak, head: true, firstBlood: false })?.key, "triple", "a triple beats the headshot");
    // A pause breaks the chain but not the run.
    r = nextRun(r, 60_000);
    assert.equal(r.multi, 1);
    r = nextRun(r, 120_000);
    assert.equal(medalFor({ multi: r.multi, streak: r.streak, head: false, firstBlood: false })?.key, "spree");
  });

  it("names first blood and headshots when nothing bigger happened", () => {
    assert.equal(medalFor({ multi: 1, streak: 1, head: true, firstBlood: true })?.key, "first");
    assert.equal(medalFor({ multi: 1, streak: 1, head: true, firstBlood: false })?.key, "head");
    assert.equal(medalFor({ multi: 1, streak: 15, head: false, firstBlood: false })?.key, "unstoppable");
  });
});

describe("the economy's defaults", () => {
  it("pay more for harder GPS games", () => {
    assert.ok(D("rallyCoins") >= D("huntCoins") && D("huntCoins") >= D("sprintCoins"));
    assert.ok(D("rallyXp") >= D("huntXp") && D("huntXp") >= D("sprintXp"));
  });

  it("never pay more from home than on foot", () => {
    assert.ok(D("remoteRewardMult") > 0 && D("remoteRewardMult") <= 1);
  });

  it("price coin packs so bigger is a better deal, never a worse one", () => {
    const per = D("gemOffers").map((o) => o.coins / o.gems);
    for (let i = 1; i < per.length; i++) assert.ok(per[i] >= per[i - 1], `offer ${i}`);
  });
});
