// Admin graphics overrides (lib/gfxConfig.ts): defaults ← admin ← user, validation, and that
// every tier parameter and look knob is exposed to the panel.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GFX_PARAMS, LOOK_DEFAULTS, overriddenKeys, resolveGfx, resolveLook, resolveProfile, sanitizeGfx, tierDefaults } from "@/lib/gfxConfig";
import { effective, PROFILES, TIERS } from "@/components/drive/graphics/quality";
import { applySettings, S } from "@/lib/settings";

describe("gfxConfig", () => {
  it("exposes every Profile field (but the tier name) and every look knob, once", () => {
    const keys = GFX_PARAMS.map((p) => p.key as string);
    assert.equal(new Set(keys).size, keys.length);
    const want = [...Object.keys(PROFILES.high).filter((k) => k !== "tier"), ...Object.keys(LOOK_DEFAULTS)];
    assert.deepEqual([...keys].sort(), want.sort());
  });
  it("no overrides = the built-in tier", () => {
    for (const t of TIERS) {
      assert.deepEqual(resolveProfile(t, {}), PROFILES[t]);
      assert.deepEqual(resolveProfile(t, undefined), PROFILES[t]);
      assert.deepEqual(overriddenKeys(t, {}), []);
    }
  });
  it("merges defaults ← all ← tier ← user", () => {
    const admin = { all: { fogFar: 800, shadowRange: 50 }, tiers: { high: { fogFar: 1500 } } };
    assert.equal(resolveGfx("high", admin).fogFar, 1500);
    assert.equal(resolveGfx("high", admin).shadowRange, 50);
    assert.equal(resolveGfx("low", admin).fogFar, 800);
    assert.equal(resolveGfx("low", admin).maxDpr, PROFILES.low.maxDpr);
    assert.equal(resolveGfx("high", admin, { fogFar: 400 }).fogFar, 400);
    assert.deepEqual(overriddenKeys("high", admin).sort(), ["fogFar", "shadowRange"]);
  });
  it("splits profile from look", () => {
    const admin = { tiers: { ultra: { grainMult: 2, exposure: 1.2, ao: false } } };
    assert.equal(resolveLook("ultra", admin).grainMult, 2);
    assert.equal(resolveLook("ultra", admin).exposure, 1.2);
    assert.equal(resolveLook("high", admin).grainMult, 1);
    assert.equal(resolveProfile("ultra", admin).ao, false);
    assert.ok(!("grainMult" in resolveProfile("ultra", admin)));
  });
  it("sanitizes: unknown keys, wrong types, ranges, choices, empty sets", () => {
    const s = sanitizeGfx({ all: { fogFar: 99999, nope: 1, bloom: "yes", msaa: 3, ssr: 2 }, tiers: { high: { shadowMap: 2048, rainDrops: -5 }, bogus: { fogFar: 500 }, low: {} } });
    assert.deepEqual(s, { all: { fogFar: 3000, ssr: 2 }, tiers: { high: { shadowMap: 2048, rainDrops: 0 } } });
    assert.deepEqual(sanitizeGfx(null), {});
    assert.deepEqual(sanitizeGfx([1]), {});
  });
  it("keeps the adaptive floor under the ceiling", () => {
    const p = resolveProfile("high", { all: { maxDpr: 1, minDpr: 1.5 } });
    assert.ok(p.minDpr <= p.maxDpr);
  });
  it("the adaptive controller strips from the admin's base profile", () => {
    const base = resolveProfile("ultra", { all: { shadowMap: 2048, nightLights: 12 } });
    assert.equal(effective("ultra", 0, base).shadowMap, 2048);
    assert.equal(effective("ultra", 3, base).nightLights, 6);
    assert.equal(effective("ultra", 4, base).shadowMap, 1024);
    assert.deepEqual(effective("ultra", 0), PROFILES.ultra);
  });
  it("travels with the settings and is validated there", () => {
    applySettings({ gfx: { tiers: { low: { fogFar: 100, junk: 1 } } } });
    assert.deepEqual(S.gfx, { tiers: { low: { fogFar: 200 } } });
    applySettings({});
    assert.deepEqual(S.gfx, {});
    assert.equal(tierDefaults("low").exposure, 1);
  });
});
