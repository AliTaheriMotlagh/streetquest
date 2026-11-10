// The 3D city's graphics systems that don't need a GPU: device tiers, the adaptive
// frame-rate controller, the sun and sky for the time of day, the tone-mapping inverse the
// HDR pipeline relies on, and the procedural surface textures.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Adaptive, detectTier, effective, MAX_LEVEL, PROFILES, TIERS, withCaps, type Caps } from "@/components/drive/graphics/quality";
import { aces, acesInverse } from "@/components/drive/graphics/shaders";
import { asphaltData, fbm, heightToNormal, noiseData, pavingData, prng } from "@/components/drive/graphics/surfaces";
import { mixHex, mixRecord, skyAt, skyFor, sunPosition, sunVector, WEATHER_LOOK } from "@/lib/daylight";

const desk: Caps = { gpu: "", mobile: false, maxTexture: 16384, floatTargets: true, memoryGB: 8, cores: 8, screenPx: 2560 * 1440, saveData: false, lite: false };
const phone: Caps = { ...desk, mobile: true, maxTexture: 8192, screenPx: 1170 * 2532 };
const gpu = (c: Caps, name: string): Caps => ({ ...c, gpu: name.toLowerCase() });

describe("device tiers", () => {
  it("places desktop GPUs by class", () => {
    assert.equal(detectTier(gpu(desk, "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)")), "ultra");
    assert.equal(detectTier(gpu(desk, "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)")), "ultra");
    assert.equal(detectTier(gpu(desk, "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)")), "high");
    assert.equal(detectTier(gpu(desk, "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)")), "medium");
    assert.equal(detectTier(gpu(desk, "")), "high", "an unknown GPU starts high and adapts");
  });

  it("places phones by GPU and memory", () => {
    assert.equal(detectTier(gpu(phone, "Apple GPU")), "high");
    assert.equal(detectTier(gpu(phone, "Adreno (TM) 740")), "high");
    assert.equal(detectTier(gpu(phone, "Mali-G57 MC2")), "low");
    assert.equal(detectTier(gpu(phone, "Adreno (TM) 610")), "low");
    assert.equal(detectTier({ ...gpu(phone, "Adreno (TM) 740"), memoryGB: 3 }), "low");
    assert.equal(detectTier(gpu(phone, "Some new GPU")), "medium");
  });

  it("software rendering, lite mode and weak limits stay low; missing float targets cap at medium", () => {
    assert.equal(detectTier(gpu(desk, "Google SwiftShader")), "low");
    assert.equal(detectTier({ ...gpu(desk, "NVIDIA GeForce RTX 4090"), lite: true }), "low");
    assert.equal(detectTier({ ...gpu(desk, "NVIDIA GeForce RTX 4090"), maxTexture: 2048 }), "low");
    assert.equal(detectTier({ ...gpu(desk, "NVIDIA GeForce RTX 4090"), floatTargets: false }), "medium");
    assert.equal(detectTier({ ...gpu(desk, "NVIDIA GeForce RTX 4090"), saveData: true }), "high");
  });

  it("a 4K screen on an integrated GPU drops a step; learned demotions drop more, never below low", () => {
    assert.equal(detectTier({ ...gpu(desk, "Apple M1"), screenPx: 3840 * 2160 }), "medium");
    assert.equal(detectTier({ ...gpu(desk, "NVIDIA GeForce RTX 4090"), screenPx: 3840 * 2160 }), "ultra");
    assert.equal(detectTier(gpu(desk, "NVIDIA GeForce RTX 4090"), 2), "medium");
    assert.equal(detectTier(gpu(desk, "Intel UHD Graphics"), 5), "low");
  });
});

describe("profiles", () => {
  it("every higher tier is at least as good as the one below", () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lo = PROFILES[TIERS[i - 1]], hi = PROFILES[TIERS[i]];
      for (const k of ["maxDpr", "shadowMap", "shadowRange", "detailM", "fogFar", "rainDrops", "anisotropy", "ssr"] as const) assert.ok(hi[k] >= lo[k], `${TIERS[i]}.${k}`);
      for (const k of ["post", "bloom", "ao", "cinematic", "shadows", "surfaces", "clouds", "clearcoat", "lampPools", "wind"] as const) assert.ok(!lo[k] || hi[k], `${TIERS[i]}.${k}`);
    }
  });

  it("only tiers with the HDR pipeline ask for MSAA targets, bloom or AO", () => {
    for (const t of TIERS) {
      const p = PROFILES[t];
      if (!p.post) assert.ok(!p.bloom && !p.ao && !p.cinematic && !p.fxaa && !p.haze && p.ssr === 0 && p.msaa === 0, t);
      // The film look reads the scene's depth through the MSAA target; FXAA is for the pipeline without one.
      if (p.cinematic) assert.ok(p.msaa > 0, t);
      if (p.fxaa) assert.equal(p.msaa, 0, t);
    }
  });

  it("medium gets the light pipeline: no MSAA target, FXAA, bloom from a quarter size; low stays straight to the screen", () => {
    const m = PROFILES.medium;
    assert.deepEqual([m.post, m.msaa, m.fxaa, m.bloom, m.bloomDiv, m.ao, m.cinematic], [true, 0, true, true, 4, false, false]);
    assert.equal(PROFILES.low.post, false);
    assert.equal(PROFILES.high.bloomDiv, 2);
  });

  it("a device without float render targets gets no pipeline at all, whatever the tier", () => {
    for (const t of TIERS) {
      const p = withCaps(PROFILES[t], { floatTargets: false });
      assert.deepEqual([p.post, p.bloom, p.ao, p.cinematic, p.fxaa, p.msaa], [false, false, false, false, false, 0], t);
      assert.equal(p.shadows, PROFILES[t].shadows);
      assert.deepEqual(withCaps(PROFILES[t], { floatTargets: true }), PROFILES[t]);
    }
  });

  it("adaptive levels strip AO, then the film look, then bloom and clouds, then shadow detail, then shadows", () => {
    assert.deepEqual(effective("ultra", 0), PROFILES.ultra);
    assert.equal(effective("ultra", 1).ao, false);
    assert.equal(effective("ultra", 1).cinematic, true);
    assert.deepEqual([PROFILES.ultra.ssr, PROFILES.high.ssr, PROFILES.medium.ssr, PROFILES.low.ssr], [2, 1, 0, 0], "full, half, then the environment map only");
    assert.deepEqual([PROFILES.ultra.nightLights, PROFILES.high.nightLights, PROFILES.medium.nightLights, PROFILES.low.nightLights], [8, 4, 0, 0]);
    assert.deepEqual([PROFILES.ultra.headlightShadow, PROFILES.high.headlightShadow], [true, false], "my headlights cast shadows on ultra only");
    assert.equal(effective("ultra", 1).headlightShadow, false);
    assert.equal(effective("ultra", 3).nightLights, 4);
    assert.equal(effective("ultra", 4).nightLights, 0, "the pooled lights go with shadow detail, before shadows themselves");
    assert.equal(effective("ultra", 4).shadows, true);
    assert.deepEqual([PROFILES.ultra.haze, PROFILES.high.haze, PROFILES.medium.haze, PROFILES.low.haze], [true, true, false, false]);
    assert.deepEqual([effective("ultra", 1).haze, effective("ultra", 2).haze], [true, false], "stripped with the film look");
    assert.deepEqual([effective("ultra", 1).ssr, effective("ultra", 2).ssr, effective("high", 1).ssr], [1, 0, 1]);
    assert.equal(effective("ultra", 2).cinematic, false);
    assert.equal(effective("ultra", 2).bloom, true);
    assert.equal(effective("ultra", 3).bloom, false);
    assert.equal(effective("ultra", 3).clouds, false);
    assert.equal(effective("ultra", 3).shadowMap, PROFILES.ultra.shadowMap, "every screen-space extra goes before any shadow does");
    assert.ok(effective("ultra", 4).shadowMap <= 1024);
    assert.equal(effective("ultra", 4).shadows, true);
    assert.equal(effective("medium", MAX_LEVEL - 1).fxaa, true);
    assert.equal(effective("medium", MAX_LEVEL).fxaa, false);
    assert.equal(effective("ultra", MAX_LEVEL).shadows, false);
    assert.equal(effective("ultra", MAX_LEVEL).post, true, "the pipeline itself stays (the renderer was made for it)");
  });
});

describe("adaptive frame rate", () => {
  /** Feed `n` windows of frames at `ms` each; returns the changes. */
  const run = (a: Adaptive, ms: number, windows: number, t0: { now: number }) => {
    const out = [];
    for (let w = 0; w < windows; w++)
      for (let i = 0; i < 60; i++) {
        t0.now += ms;
        const c = a.sample(ms + (i % 3) * 0.2, t0.now);
        if (c) out.push(c);
      }
    return out;
  };

  it("lowers the resolution first, then strips effects (on auto only)", () => {
    // A GPU-bound frame: cost grows with the pixels drawn and with each effect still on.
    const cost = (a: Adaptive) => 8 + 26 * (a.dpr / 2) ** 2 + 4 * (MAX_LEVEL - a.level);
    const drive = (a: Adaptive) => {
      let now = 0;
      for (let w = 0; w < 80; w++)
        for (let i = 0; i < 60; i++) {
          now += cost(a);
          a.sample(cost(a), now);
        }
    };
    const auto = new Adaptive({ maxDpr: 2, minDpr: 1.1 }, { features: true });
    drive(auto);
    assert.ok(auto.dpr <= 1.1 + 1e-9, `dpr ${auto.dpr}`);
    assert.ok(auto.level > 0, "effects stripped once at the floor");
    assert.ok(cost(auto) <= (1000 / 60) * 1.32, `settled at ${cost(auto)} ms`);

    const fixed = new Adaptive({ maxDpr: 2, minDpr: 1.1 }, { features: false });
    drive(fixed);
    assert.ok(fixed.dpr <= 1.1 + 1e-9);
    assert.equal(fixed.level, 0, "a chosen tier keeps its effects");
  });

  it("gives effects back first, then sharpness, once there's headroom for a while", () => {
    const t = { now: 0 };
    const a = new Adaptive({ maxDpr: 2, minDpr: 1 }, { features: true });
    a.dpr = 1;
    a.level = 2;
    const ups = run(a, 10, 30, t);
    assert.deepEqual(ups.slice(0, 2).map((c) => c.kind), ["level", "level"]);
    assert.equal(a.level, 0);
    assert.ok(a.dpr > 1);
  });

  it("holds when lowering doesn't help (a frame-rate cap), and gives the lost sharpness back", () => {
    const t = { now: 0 };
    const a = new Adaptive({ maxDpr: 2, minDpr: 0.8 }, { features: true });
    const changes = run(a, 33.4, 20, t);
    const lowest = Math.min(...changes.filter((c) => c.kind === "dpr").map((c) => (c as { dpr: number }).dpr));
    assert.ok(lowest >= 1.7 - 1e-9, `stopped after two futile steps (lowest ${lowest})`);
    assert.equal(a.dpr, 2, "restored");
    assert.equal(a.level, 0);
  });

  it("ignores hitches (tab switches, GC pauses)", () => {
    const a = new Adaptive({ maxDpr: 2, minDpr: 1 }, { features: true });
    for (let i = 0; i < 500; i++) assert.equal(a.sample(400, i * 400), null);
    assert.equal(a.dpr, 2);
  });
});

describe("sun and sky", () => {
  const TEHRAN = { lat: 35.6892, lng: 51.389 };

  it("puts the sun where it is over Tehran", () => {
    const noon = sunPosition(new Date("2026-06-21T08:36:00Z"), TEHRAN.lat, TEHRAN.lng);
    assert.ok(Math.abs(noon.elevation - 77.7) < 0.8, `solstice noon elevation ${noon.elevation}`);
    assert.ok(Math.abs(noon.azimuth - 180) < 10, `due south ${noon.azimuth}`);
    const midnight = sunPosition(new Date("2026-06-21T20:36:00Z"), TEHRAN.lat, TEHRAN.lng);
    assert.ok(midnight.elevation < -25, `midnight ${midnight.elevation}`);
    const morning = sunPosition(new Date("2026-06-21T02:00:00Z"), TEHRAN.lat, TEHRAN.lng);
    assert.ok(morning.elevation > 0 && morning.elevation < 15 && morning.azimuth > 50 && morning.azimuth < 90, `sunrise in the east-northeast ${JSON.stringify(morning)}`);
    const winter = sunPosition(new Date("2026-12-21T08:40:00Z"), TEHRAN.lat, TEHRAN.lng);
    assert.ok(Math.abs(winter.elevation - 30.9) < 0.8, `winter noon ${winter.elevation}`);
  });

  it("blends night → twilight → day by elevation, morning or evening by azimuth", () => {
    assert.deepEqual([skyAt(40, 180).b, skyAt(40, 180).t, skyAt(40, 180).night], ["day", 1, 0]);
    assert.equal(skyAt(-20, 0).night, 1);
    assert.equal(skyAt(-20, 0).t, 0);
    assert.equal(skyAt(5, 90).a, "dawn");
    assert.equal(skyAt(5, 270).a, "dusk");
    const dusk = skyAt(0, 270);
    assert.ok(dusk.night > 0.3 && dusk.night < 1);
    // Monotonic darkening as the sun goes down.
    let prev = -1;
    for (let e = 40; e >= -10; e -= 1) {
      const n = skyAt(e, 270).night;
      assert.ok(n >= prev - 1e-9, `night at ${e}°`);
      prev = n;
    }
  });

  it("presets ignore the clock; real time follows it", () => {
    const d = new Date("2026-06-21T20:36:00Z");
    assert.equal(skyFor("day", d, TEHRAN.lat, TEHRAN.lng).night, 0);
    assert.equal(skyFor("night", d, TEHRAN.lat, TEHRAN.lng).night, 1);
    assert.equal(skyFor("sunset", d, TEHRAN.lat, TEHRAN.lng).a, "dusk");
    assert.equal(skyFor("live", d, TEHRAN.lat, TEHRAN.lng).night, 1);
    assert.equal(skyFor("live", new Date("2026-06-21T08:36:00Z"), TEHRAN.lat, TEHRAN.lng).night, 0);
  });

  it("points the sun vector the drive's way (x east, z south)", () => {
    const east = sunVector(0, 90), south = sunVector(0, 180), up = sunVector(90, 0);
    assert.ok(east[0] > 0.99 && Math.abs(east[2]) < 1e-9);
    assert.ok(south[2] > 0.99);
    assert.ok(up[1] > 0.99);
  });

  it("blends colours and light tables", () => {
    assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mixHex("#102030", "#102030", 0.7), "#102030");
    const r = mixRecord({ c: "#000000", n: 0, s: "x" }, { c: "#ffffff", n: 10, s: "y" }, 0.25);
    assert.deepEqual(r, { c: "#404040", n: 2.5, s: "x" });
    assert.ok(WEATHER_LOOK.rain.wet === 1 && WEATHER_LOOK.clear.wet === 0);
  });
});

describe("tone mapping inverse", () => {
  it("round-trips screen colours through ACES at any exposure", () => {
    const colours = [[0.5, 0.5, 0.5], [0.05, 0.1, 0.2], [0.8, 0.6, 0.3], [0.3, 0.45, 0.6], [0.01, 0.01, 0.01]];
    for (const exposure of [0.62, 0.72, 1.05, 1.3])
      for (const c of colours) {
        const back = aces(acesInverse(c, exposure), exposure);
        c.forEach((v, i) => assert.ok(Math.abs(back[i] - v) < 2e-3, `${c} @${exposure}: ${back}`));
      }
  });

  it("is monotonic and black stays black", () => {
    assert.deepEqual(aces([0, 0, 0], 1).map((v) => +v.toFixed(4)), [0, 0, 0]);
    let prev = -1;
    for (let v = 0; v <= 4; v += 0.1) {
      const y = aces([v, v, v], 1)[1];
      assert.ok(y >= prev);
      prev = y;
    }
  });
});

describe("procedural surfaces", () => {
  it("noise is deterministic, in range and tiles seamlessly", () => {
    const S = 64;
    const a = fbm(S, 4, 3, 9), b = fbm(S, 4, 3, 9);
    assert.deepEqual(a, b);
    let seam = 0, inner = 0;
    for (let y = 0; y < S; y++) {
      seam += Math.abs(a[y * S] - a[y * S + S - 1]);
      inner += Math.abs(a[y * S + 10] - a[y * S + 11]);
      for (let x = 0; x < S; x++) assert.ok(a[y * S + x] >= 0 && a[y * S + x] <= 1);
    }
    assert.ok(seam < inner * 2, `the wrap-around step (${seam}) is like any other (${inner})`);
    const r1 = prng(5), r2 = prng(5);
    assert.equal(r1(), r2());
  });

  it("flat height gives flat normals; slopes tilt away from the rise", () => {
    const S = 8;
    const flat = heightToNormal(new Float32Array(S * S).fill(0.5), S, 4);
    assert.ok(flat.every((v) => Math.abs(v) < 1e-9));
    const ramp = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) ramp[y * S + x] = Math.sin((x / S) * Math.PI * 2);
    const n = heightToNormal(ramp, S, 4);
    assert.ok(n[(2 * S + 0) * 2] < 0, "rising toward +x: the normal leans to −x");
  });

  it("packs asphalt, slabs and noise into RGBA8 with sensible roughness and albedo", () => {
    const asph = asphaltData(128, 7), pave = pavingData(64, 11), noise = noiseData(32, 3);
    assert.equal(asph.length, 128 * 128 * 4);
    assert.equal(pave.length, 64 * 64 * 4);
    assert.equal(noise.length, 32 * 32 * 4);
    const avg = (d: Uint8Array, ch: number) => d.reduce((s, v, i) => (i % 4 === ch ? s + v : s), 0) / (d.length / 4) / 255;
    const rough = avg(asph, 2), albedo = avg(asph, 3) * 2;
    assert.ok(rough > 0.7 && rough < 0.95, `asphalt roughness ${rough}`);
    assert.ok(albedo > 0.8 && albedo < 1.1, `asphalt albedo ×${albedo}`);
    // Normals centred on "flat" (128) on average.
    assert.ok(Math.abs(avg(asph, 0) - 0.5) < 0.05 && Math.abs(avg(pave, 1) - 0.5) < 0.05);
  });
});
