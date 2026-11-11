# AAA graphics plan — status (2026-11-11)

Steps 1–7 are done and tested (`npm test` 317 pass, i18n 0/0); see README "Realistic graphics", "Reflections",
"Night lighting", "Atmosphere", "City detail" and "Car finish". Checked in headless Chrome on every tier
(ultra/high/medium/low × day/rain/night): no shader errors, ~60 fps (capped) on this Mac, ultra night+rain ~50.

## Done
1. Film look: motion blur (car stays sharp), sun shafts + flare, chromatic aberration, grain, split tone, 3D LUT hook (`NEXT_PUBLIC_DRIVE_LUT`) — `graphics/post.ts`, `lib/filmLook.ts`, `lib/lut.ts`
2. Medium tier light pipeline (no MSAA, FXAA, ¼-res bloom, grade)
3. Screen-space reflections (ultra full, high half; wet asphalt, puddles, car paint and glass; now also window glass and glass towers)
4. Night lighting: pooled real lights (`lib/lightBudget.ts`, `drive/nightLights.ts`), neon-bright signs, ultra headlight shadows
5. Atmosphere: depth height-haze + sun in-scattering, heat shimmer, lamp cones, tyre smoke, crash dust (`lib/atmosphere.ts`)
6. City detail (`tileMesh.ts`, `world3d.ts`): interior-mapped rooms behind every window (day and lit at night), split
   AC units on walls, striped shop awnings, satellite dishes + TV aerials on flat roofs, manhole covers, oil stains
   (lanes and junction stop lines), tyre marks round junction corners, patched trenches (new `decals` layer: soft
   alpha in `fac`, blending that keeps the HDR alpha = mirror), worn lane paint (`weathered` `wear`), bevelled kerb lip
7. Car look (`drive/carLook.ts`): metallic flakes under a full clearcoat (fade by screen size, no sparkle noise),
   solid vs metallic per car, dirt up the sills (per car in traffic; yours grows with distance, rain washes it), rain
   beads, scratches over dents (fleet: `fleetDamage`; yours: per-vertex `aScuff` from `carDamage.dent`), tinted
   glass with Fresnel alpha, chrome/satin trim detection, tyre tread + sidewall, five-spoke alloys on drawn wheels

## Fixed while reviewing 3–5
- AO was multiplied in the final pass on top of the haze (far fog darkened): now applied in the haze pass, before the air.
- SSR jitter was re-seeded every frame without a temporal filter (reflection edges crawled): fixed per-pixel dither.
- Night lights were omni points: lamps lit the walls above their heads and "headlights" shone back onto their car.
  Now lamps are downward spots, headlights forward spots, brake glow points; slots are typed (`poolKinds`) so light
  counts per type never change (no recompiles).
- The old painted lamp-glow decals (24 m additive planes) doubled the real lamp light and flooded wet streets at night:
  they now give way within the real lights' reach (`POOLS.near`) and fade with the fog (`POOLS.far`).

## Still open
- Cars still drawn from code (Pride, Peykan, 206, 207, Tiba). CC BY candidates on Sketchfab (`npm run assets:find`):
  "Vehicle - Peugeot 206" by Thcyrax (uid 33657ac0e044493daf495d45424ead7a, ~3k tris), "Low Poly Coupe Car (Saipa 131)"
  by Dara_mehr (uid a55dcf2069c947179bf2cf27be2f32d7, ~4k tris). Both far lower detail than the real 405/Samand —
  an art call before running `assets:get` + the `assets:cars` report → rules → preview loop. Nothing usable for Paykan or Tiba.
- Props are already real CC BY models, meshopt-compressed with baked vertex colours (KTX2 doesn't apply). Iran's own
  kiosk, charity box and water fountain stay drawn; no LODs beyond the cars' near/far.

## Caveats
- fps numbers come from headless Chrome on a Mac (capped ~60). Not measured on a real phone — still ask which device/tier the user plays on.
- Night lights are never toggled (`visible`) on purpose: a changing light count recompiles every material. (Your own
  headlight `model.light` still toggles at dusk/rain: one recompile at that moment.)
- Car patches must be applied inside `withDents` (it wraps onBeforeCompile; a later `patchShader` would drop it) — `tests/carLook.test.ts` guards this.
