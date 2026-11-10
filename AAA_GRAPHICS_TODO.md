# AAA graphics plan — where it stopped (2026-11-11)

Branch `aaa-graphics`. Steps 1–5 are done, tested (`npm test` 308 pass, i18n 0/0) and committed; see README "Realistic graphics".

## Done
1. Film look: motion blur (car stays sharp), sun shafts + flare, chromatic aberration, grain, split tone, 3D LUT hook (`NEXT_PUBLIC_DRIVE_LUT`) — `graphics/post.ts`, `lib/filmLook.ts`, `lib/lut.ts`
2. Medium tier light pipeline (no MSAA, FXAA, ¼-res bloom, grade)
3. Screen-space reflections (ultra full, high half; wet asphalt, puddles, car paint, glass)
4. Night lighting: pooled real lights (`lib/lightBudget.ts`, `drive/nightLights.ts`), neon-bright signs, ultra headlight shadows
5. Atmosphere: depth height-haze + sun in-scattering, heat shimmer, lamp cones, tyre smoke, crash dust (`lib/atmosphere.ts`)

## NOT done
6. **City detail** (tileMesh.ts / world3d.ts). Already existed: balconies, rooftop coolers/tanks, minarets, zebras, asphalt cracks, wall grime, raised kerbs, shopfronts. Still to do:
   - shopfront awnings (hook: the `shopsBelow && facesStreet` wall loop, ~tileMesh.ts:808)
   - AC units on façades, satellite dishes + antennas on ordinary roofs (rooftop kit ~tileMesh.ts:946)
   - manhole covers, oil stains, tyre marks at junctions (marks layer, near the zebra code ~:1029)
   - lane-marking wear (add a wear option to `weathered()` in world3d.ts for the `marks` material)
   - interior-mapped / parallax window glass; kerb bevels
   - better CC props/cars via `assets:find` / `assets:get` / `assets:props`, gltf-transform (draco/meshopt + KTX2) + LODs, licences in the credits file (not started — needs the Sketchfab token and licence vetting)
7. **Car look** (vehicles3d.ts, fleet3d.ts, carDamage.ts): metallic flakes in clearcoat, tinted/reflective glass tweaks, chrome, tyre sidewall detail, dirt/wet layers, scratches on top of dents. (Paint + glass already feed SSR.)

## Caveats
- fps numbers come from headless Chrome capped at ~30–60 fps: ultra ≈ 57, high ≈ 59, medium ≈ 30 (cap). Not measured on a real phone — still ask which device/tier the user plays on.
- Night lights are never toggled (`visible`) on purpose: a changing light count recompiles every material.
- Sound/FOV work from the earlier session is in the first commit on this branch (not listened to on a real phone / 5.1 system).
