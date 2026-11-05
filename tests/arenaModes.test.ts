// Street Arena's newer rules: Gun Game's ladder, who holds a hardpoint, and UAV streaks.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earnsUav, GUN_KILLS_PER_STEP, GUN_LADDER, gunFor, hillOwner, matchPrize, MODES, UAV_STREAK } from "@/lib/arena/modes";
import { WEAPONS } from "@/lib/arena/weapons";

describe("gun game", () => {
  it("climbs the ladder every GUN_KILLS_PER_STEP kills and the limit is the whole ladder", () => {
    assert.equal(gunFor(0), GUN_LADDER[0]);
    assert.equal(gunFor(GUN_KILLS_PER_STEP - 1), GUN_LADDER[0]);
    assert.equal(gunFor(GUN_KILLS_PER_STEP), GUN_LADDER[1]);
    assert.equal(gunFor(999), GUN_LADDER[GUN_LADDER.length - 1]);
    assert.equal(gunFor(-3), GUN_LADDER[0]);
    assert.equal(MODES.gun.killLimit, GUN_LADDER.length * GUN_KILLS_PER_STEP);
    for (const w of GUN_LADDER) assert.ok(WEAPONS[w], w);
  });
  it("pays a podium like deathmatch", () => {
    const base = { won: false, players: 6, kills: 5, botKills: 0, deaths: 3 };
    assert.ok(matchPrize({ ...base, mode: "gun", place: 1 }).coins > matchPrize({ ...base, mode: "gun", place: 4 }).coins);
  });
});

describe("hardpoint", () => {
  it("belongs to the only team in it; two teams contest it; empty is nobody's", () => {
    assert.deepEqual(hillOwner([]), { owner: 0, contested: false });
    assert.deepEqual(hillOwner([{ team: 1 }, { team: 1 }]), { owner: 1, contested: false });
    assert.deepEqual(hillOwner([{ team: 2 }, { team: 1 }]), { owner: 0, contested: true });
  });
  it("is a team mode with respawns", () => {
    assert.equal(MODES.hill.teams, true);
    assert.equal(MODES.hill.respawn, true);
  });
});

describe("killstreaks", () => {
  it("a UAV every UAV_STREAK kills without dying", () => {
    assert.equal(earnsUav(0), false);
    assert.equal(earnsUav(UAV_STREAK - 1), false);
    assert.equal(earnsUav(UAV_STREAK), true);
    assert.equal(earnsUav(UAV_STREAK + 1), false);
    assert.equal(earnsUav(UAV_STREAK * 2), true);
  });
});
