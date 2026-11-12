# StreetQuest — real-world GPS war game

Three games stacked on one real-world map:

- **Strategy (Generals: Zero Hour style)** — pick a faction, plant a base where you stand, build power /
  supply / barracks / factory / airfield / turrets on real timers, train an army, capture oil derricks
  and siege rival bases. Battles are auto-resolved.
- **Life sim (The Sims style)** — your commander has Hunger, Energy, Social and Fun that drain in real time.
  Eat food you find, sleep at your base, hang out with nearby players or check in at real cafés, bars and parks.
  Time alone never drags a need below a floor, and a long break counts as a night's sleep, so coming back
  never means a miserable commander. Mood scales XP, combat HP and Street Empire income (all tunable in
  Admin → Game settings → Life sim).
- **FPS (Counter-Strike / CoD style)** — walk within 200 m of an enemy base while other players are online and
  you can *breach* it: a live first-person match (capture the zone or wipe the defenders + garrison bots,
  no respawns). World **bosses** roam the map with shared HP — raid them in first person or bombard them.

- **RPG** — your commander is a hero: pick a class (Vanguard, Marksman, Engineer, Quartermaster, Warlord),
  spend attribute points (STR/AGI/INT/CHA) each level, and loot gear (weapon/armor/gadget, 4 rarities, random
  affixes). The equipped weapon is your FPS gun (rifle, SMG, marksman rifle, LMG). Salvage gear for 🔩 scrap,
  forge it higher. A 13-chapter campaign plus 3 daily quests guide you through every system.
- **Deeper RTS** — unit counters (infantry / vehicle / air), Generals-style veterancy (Veteran → Elite →
  Heroic), a research tree paid in coins + scrap, General's Powers bought with Command Points (Supply Drop,
  Spy Drone, Paradrop, Artillery Barrage, Battle Cry…), and permanent **outposts** on the real map:
  capture them, garrison troops, collect tribute, fight the faction war.
- **Clash of Clans rules** — sieges score ★★★ by destruction %, loot scales with destruction, trophies and
  leagues (Bronze → Legend, league bonus loot), Army Camps cap housing space, Builder's Huts add
  concurrent builders, the Vault protects coins, Walls add HP, 💎 gems rush any timer, attacking breaks
  your shield, and you can take revenge from your battle reports.

- **Tower defense on the real map** — build towers where you stand inside your territory (🔫 MG Nest, 🎯 Sniper,
  💣 Cannon, 🚀 SAM, ⚡ Tesla). Their range rings are on everyone's map and they **shoot rival commanders** who walk in:
  you have street HP, get downed (lose some coins to the tower owner, 3 min recovery), and rookies below level 3
  are spared. Fight back by running in and planting C4 (hold to plant — closer means a bigger blast) or by marching a squad at it.
  **Raider waves** march on bases (HQ 2+) every hour or two — or provoke one for ×1.5 bounties. Towers, guard squads
  and base turrets (yours and your crew's) shoot them live on the map; commanders near the base call in ✈️ airstrikes;
  leakers steal coins.
- **Real-time strategy on the map** — deploy squads from your base. They march at unit speed (everyone sees them,
  enemy composition is fogged without Radar), guard a spot (shoot rival commanders, defend against raiders,
  reinforce nearby bases/outposts), or attack an enemy tower, squad, base or outpost. Redirect or recall them
  mid-march. Base buildings are drawn around every base so you can scout rivals.
- **Street Empire (idle tycoon)** — an AdVenture Capitalist-style idle game in 🎮 Play: 11 street businesses (hot dog cart →
  spaceport), tap to run a cycle or hire a manager to automate it, count milestones (speed ×2), cash upgrades, offline
  earnings (vault upgrades), fame stars (prestige, +2% each), empire ranks that pay coins and gems in the main game, and
  dividends every 4 h. 🔋 Power cells on the map double income for 30 min (stack to 4 h).
- **Every step counts** — a phone pedometer (accelerometer peaks gated by a walking rhythm, so shaking doesn't count)
  reports steps while the game is open; GPS distance on foot fills in when the sensor can't. Steps today boost empire
  income up to ×2 at 10,000; banked steps buy instant Step Rushes; step quests, milestones and a weekly world goal.
  The server caps every report by a believable cadence. (A web page can't count while it's closed — a native wrapper
  with HealthKit / Health Connect would be needed for that.)
- **Chests open on the spot** (with a celebration) and **C4** is planted by holding a button — the closer you dare to
  stand to the tower, the bigger the blast (decided by the server from your position).
- **Squad runs** — start a run solo, as a 🏎️ race (podium pays +50% / +25%) or a 🤝 co-op run (+20% per teammate);
  squadmates' live positions show on the map. Crew **pings** (⚔️ attack / 🆘 help / 🚩 rally / 💰 loot) coordinate it all.

- **Street combat** — shoot rival commanders, enemy towers and squads within 60 m (headshots, cooldown, hero
  damage bonus). Downing someone takes coins and trophies. Rookies (< level 3) can't fight or be shot.
- **Superweapons** (Generals: Zero Hour) — Dragon ☢️ Nuclear Missile, Coalition 🔆 Particle Cannon, Insurgency 🚀
  SCUD Storm. Built at HQ 4, charge for hours, hit anywhere within 5 km. Everyone near the target sees a public
  countdown and can run; SAM sites intercept missiles; the blast hits towers, squads, bases, garrisons and
  commanders; nukes and SCUDs leave radiation/toxins that keep hurting anyone who walks in.
- **King of the hill flags** — plant a flag on a real spot; it pays while you hold it. Rivals capture it by
  standing on it for 60 s while none of your crew is there.
- **Bounties** — put coins on a rival's head; whoever downs them (gun, tower, superweapon) collects.
- **Photo & text posts** pinned to places — only visible to players who walk there; likes pay XP, reports hide abuse.
- **3D art kit** — every emoji in the game (UI, server messages, translations, map markers) is drawn as a glossy,
  outlined, top-lit vector icon with idle animations (`src/components/art`); preview them all with
  `npx tsx scripts/art-preview.ts art.html`.
- **Polish** — synthesized sound effects (Web Audio; mute button) that real recordings replace slot by slot (see
  *Recorded sounds* below), 3D game-feel animations, in-app
  dialogs instead of browser pop-ups, iPhone (notch/landscape) and iPad (side panels) layouts, achievements
  for every system.

- **Story missions** — an 8-chapter campaign played on real streets: waypoints are placed around wherever you
  are, with *go* (reach a marker), *find* (hidden spot, hot/cold detector only) and *hold* (stay in a zone) steps.
- **GPS games** — 🧭 Treasure Hunt (hot/cold, the spot never leaves the server), 🏃 Street Sprint (distance on
  foot; driving doesn't count) and 🏁 Checkpoint Rally.
- **Goals** — a weekly 🌍 world operation everyone works on together, a weekly faction goal (with a live faction
  race) and permanent personal milestones with tiers. Everyone who contributed claims the shared rewards.
- **Store & sponsor spots** — gem packs via Stripe Checkout, coin offers / instant heal / energy drink / base
  shield paid in gems, and rewarded sponsor spots (timed server-side, daily cap, views and clicks per sponsor).
- **Live game settings** — Admin → Game settings edits every tunable (reach radius, rewards, multipliers, timers,
  ranges, goals, gem packs, ads…) and Admin → Game data edits unit/building/tower/item/research stats. Changes go
  live within ~15 s, no redeploy.
- **Car lab** — Admin → Car lab (`/admin?tab=cars&car=xantia`) shows every vehicle exactly as players get it (the
  real 3D models once loaded): orbit, front/side/rear/top/wheel views, all cars side by side, paint, dirt, rain on the
  paint, night with headlights, clear coat, driver and cabin, wireframe, steering — and 📸 Screenshot. Its check
  (`drive/carCheck.ts`) flags parts exported inside out (drawn see-through — the game turns them round on load),
  the cabin poking out of the glass, floating or sunk wheels and too many triangles. Scripts drive it through
  `window.__carLab` (`pick`, `set`, `view`, `lineup`, `shot` → PNG, `check`, `real`; `e2e/ui/carlab.spec.ts`).
- **Admin → Objects** — a searchable, filterable grid of every object in the game: cars, people, the soldier and
  police, guns, street props, loot, markers, store kinds and stores' own 3D buildings, each with its file, size,
  triangles, licence/credit and where it is used, and a lazy turntable (`drive/turntable.ts`: one shared WebGL
  renderer for all cards, models freed when scrolled out). The catalog is generated from the game's own registries
  (`lib/objectCatalog.ts` reads `fleet`/`carModels`/`peopleModels`/`propModels`/`arena/weapons`/`catalog`/`places`
  and the landmarks table — no second list). File sizes, triangles, bones and bounds of the shipped `.glb` files come
  from `npm run assets:catalog` (`scripts/object-catalog.ts` → `src/lib/objectCatalog.generated.json`; run it after
  `assets:cars`/`assets:people`/`assets:props`/`assets:arena`).
- **Admin → Model update** — replace a built-in model without a deploy. Upload a `.glb` for a slot (`car:<key>`,
  `person:<key>`, `arena:soldier`, `arena:police`, `arena:weapons`, `props:street`); `lib/modelCheck.ts` checks it in
  the browser and again on the server (4 MB, triangle budget per kind, the parts/bones/clips the game looks up —
  a car's `paint`/`kit`/`head`/`tail`/`wheel` (+`_far`) and wheel positions in the scene extras, a rig with `spine` and
  the `Idle`/`Walk`/`Run`/`Death` clips for soldiers, `fp_<gun>` nodes for guns — and a believable scale). The new
  model is shown next to the live one; **Publish now** (or **Save as draft**, then Publish) makes it the slot's
  active `ModelOverride` version; **Roll back to this** activates any earlier version, **Use the built-in model**
  drops the override; every version keeps who uploaded and published it, and when. Players get it from the cached
  public manifest `GET /api/models` (30 s server cache, ~1 min at the CDN): the loaders (`drive/gltf.ts`,
  `arena/avatar.ts`) ask `drive/modelOverride.ts` for a built-in file's replacement first and fall back to the
  built-in file on any failure. Storage: Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise
  `public/uploads/models/` (development only — a production server needs the token). Props: the per-kind `top`
  heights in `propModels.ts` stay the built-in ones.
- **Admin → Graphics** — every parameter of the 3D city's quality tiers (`graphics/quality.ts` `Profile`: resolution,
  MSAA, bloom, AO, SSR, shadows, night lights, draw distance, surfaces, clouds, rain…) plus exposure and
  multipliers on the film look and haze (motion blur, shafts, flare, fringing, grain, split toning, haze, heat
  shimmer, saturation, contrast, vignette, sharpening, LUT strength), for all tiers or one tier, with per-field reset.
  Stored in the `gfx` setting (`lib/gfxConfig.ts`, validated in `sanitizeSettings`) so it reaches players with
  `/api/me` like every other setting; merged as built-in tier ← admin `all` ← admin per-tier ← the player's own pin.
  The player's own quality pick (Auto/Ultra/High/Medium/Low) still chooses the tier and "auto" still adapts: the
  adaptive controller strips effects from the admin's profile. Applied when the 3D city starts; to preview, save and
  open the city in another tab or on a phone.

Every layer feeds the others: hero bonuses change battle maths, build times, income and FPS stats;
mood scales XP; loot funds research; territory funds the army.

- **Real places** — restaurants, cafés, shops, pharmacies, gyms and parks come from OpenStreetMap, with their real
  names. Jobs happen *at* them: a 🍔 burger delivery starts at a real burger joint and ends at another real place, a ☕
  check-in is at a real café, and food spawns sit on real restaurants instead of random street corners.
- **3D city & play from home** — tap 🚗 DRIVE to drive a cartoon car through your real streets in 3D (real building
  footprints and heights, roads, parks, water and store signs, storybook toon style with day/night). From home or in
  test mode the car *is* your commander: where you drive is where you are, missions are beacons of light, loot is collected by
  driving through it — the only things drawn as game markers. Stores look like stores: their own signs (a board on the
  wall, or a lit sign on a pole at the kerb for the game's businesses — `markers.ts`, `lib/storefront.ts`), small
  square blips on the minimap, and as you slow down or walk past one its card slides in under the street name
  (name, trade, distance; tap it for the store's card) (money and beacons whose map spot is inside a building move to the nearest street, so they're never
  hidden by walls or out of the car's reach). Walking with GPS, the car follows you. Cells without map data yet are drawn
  as a fantasy village. In the realistic style every building wears a material — the map's `building:material` (or the
  colour OpenMapTiles gives that material), else a guess for its kind and region: Tehran's travertine stone and brick
  blocks, plaster, concrete panels, metal-clad sheds — with its paint colour from the map when it has one. Blocks of flats
  get balconies on their street side and shop windows on the ground floor, flat roofs get a parapet and (in the Middle
  East) evaporative coolers and water tanks, pitched roofs are gabled, hipped (with a real ridge) or skillion, and places
  of worship in the region are mosques with a tiled onion dome and two minarets. Balconies and rooftop kit are drawn only
  within 320 m and never on lite phones (`src/components/drive/tileMesh.ts`, `world3d.ts`).
- **3D sound** — everything that happens somewhere in the 3D city is heard from there: a shot, a blast, a crash, a
  horn, a siren, a voice. One set of rules (`src/lib/audio/spatial.ts`, pure) decides what reaches the player's ears:
  full volume inside a reference distance, then −6 dB each time the distance doubles, fading to exact silence at the
  sound's own range (a gunshot carries 420 m, a voice 48 m — nothing pops in or out); the air dulls far sounds; sound
  takes its time (a blast 340 m off is seen a second before it's heard); a far sound is mostly its echo; a siren's pitch
  bends as the patrol car closes in or pulls away; and when too many sounds play at once the near, loud ones keep their
  voices. Distance is measured from the player and direction from the camera. **Settings → Sound → Sound output**:
  *Headphones (3D)* (binaural HRTF — also behind and above you; what "Auto" picks except on weak phones), *Speakers*
  (stereo), or *5.1* when the audio device has six channels (front pair, subwoofer, and a rear pair for what's behind
  you). A browser can't encode Dolby itself — over HDMI the 5.1 mix reaches the receiver as multichannel PCM, and on
  headphones the 3D mode is the same idea as Dolby's headphone rendering (`src/components/game/spatial.ts`).
- **The film look** (High and Ultra, realistic style) — camera motion blur: each pixel is traced back to where it was
  a frame ago from its depth and the two cameras, and smeared along the way; whatever is nearer than the player's car
  stays sharp (the car never smears), a change of camera never blurs, and behind the wheel there's a third of it.
  The sun's shafts pour through the gaps in the skyline (the open sky near the sun, smeared outwards at ¼ size), with a
  soft lens flare that fades as a building hides the sun — none at night or under a closed sky. The corners fringe a
  little (more at speed), fine grain (more at night), and split toning: shadows lean teal, highlights warm
  (`src/lib/filmLook.ts` — pure — sets all of it per frame from speed, camera, time of day and weather;
  `graphics/post.ts` draws it). **3D LUT:** set `NEXT_PUBLIC_DRIVE_LUT` to the URL of a `.cube` file (any size up to
  64³, e.g. `/luts/night.cube` in `public/`) and the finished picture goes through it (`src/lib/lut.ts`).
- **Reflections** — in the rain the street mirrors what's on it: the lit windows, the tail lamps ahead, the car
  itself; car paint and glass show the street too. Screen-space reflections (Ultra: traced at full size, High: at half
  size): surfaces say how mirror-like they are (wet asphalt a sheen, puddles — from the same noise that places them —
  nearly a mirror, lacquer, glass), a ray is marched along the reflection through the depth buffer, and what it hits
  is laid over the surface, stronger at a glancing angle. Window glass and glass towers mirror the street and the
  buildings across it the same way. The rays' dither is fixed per pixel (no frame-to-frame jitter, so reflections'
  edges don't crawl). Where the ray finds nothing on screen, and on Medium and Low, the surface reflects the sky's
  environment map as before. Stripped by the adaptive controller with AO.
- **Night lighting** (realistic style) — at night the city is lit by real lights, from one fixed pool handed to the
  most useful candidates around the player (`src/lib/lightBudget.ts`, pure: nearest first, ahead of behind, a lit one
  keeps its light so nothing flickers between two equals): street lamps that pour a cone of light down onto the
  pavement and road under them (spot lights aimed down, so the walls above a lamp and the sky stay dark), a dipped beam
  down the lane ahead of every moving car, a red glow behind every braking one. Lights fade in and out, never pop.
  Within the real lights' reach the painted glow under each lamp gives way to them (both would light the ground twice),
  and further off it fades into the fog. Ultra spends 8, High 4, Medium and Low none (the glow textures and light pools as before); the adaptive
  controller halves the pool, then drops it, before it touches a shadow. Ultra's own headlights also cast shadows
  (a lamp post throws its across the road). Shop signs run past white at night, so under the HDR pipeline they bloom
  like neon, as the lit windows and lamp heads do. The pool is built whole at dusk and its lights never leave the
  scene, so many spot lights and so many points (`poolKinds`) — three.js recompiles every material when the number
  of lights of a type changes, which would stall the frame (`src/components/drive/nightLights.ts`).
- **Atmosphere** (High and Ultra) — height fog computed from each pixel's depth: thicker near the ground, clear above
  the rooftops, glowing towards the sun (haze in line with a low sun lights up), thicker in rain and cloud
  (`src/lib/atmosphere.ts`, pure; `graphics/post.ts` draws it). At a hot, clear, dry midday the far tarmac shimmers with
  heat. Under each lit street lamp at night a soft cone of lit air (more of it in rain), dust motes drift brighter in the
  low sun's light, a car that slides or stands on its brakes smokes from both rear tyres (and squeals), and a hard crash
  throws up a cloud of tan dust. Ambient occlusion goes on under the haze, not over it (a far wall's fog isn't
  darkened). Stripped by the adaptive controller together with the film look.
- **City detail** (realistic style, close up; not on lite phones) — every window has a room behind it: the view goes
  on through the glass into a room a bay wide, a storey high and 4 m deep (interior mapping — no geometry), so rooms
  shift with the camera: their own wall paint, a wood or stone floor, the ceiling, a sofa or cupboard along the back
  wall, often curtains drawn to the sides, darker further in; lit at night, the ceiling glows most and furniture
  stands in silhouette (Medium and up). Split air-conditioners hang beside the windows (some blocks bristle with them),
  striped awnings shade two shops in five, satellite dishes turned to the southern sky and the odd TV aerial stand on
  the flat roofs. The asphalt has cast-iron manhole covers, oil dripped in the lanes and pooled where cars wait at a
  junction, black tyre marks swinging round the corners, and trenches patched with fresh tarmac; road paint is worn
  through in patches; kerbstones have a bevelled lip that catches the light (`tileMesh.ts`; soft stains are their own
  `decals` layer, laid over the street without touching how wet it mirrors; `world3d.ts` `INTERIOR`).
- **Car finish** (realistic style) — most cars are metallic: flakes under the lacquer glint as the light moves over
  them and fade to a sheen further off (never to noise); the rest are solid colours. Road dust cakes the sills and
  wheel arches and films the bonnet — each car in traffic its own amount, yours building up as you drive (filthy after
  ~40 km) and washed off by the rain; raindrops bead on the paint. Dents are scraped to bare metal, and a battered car
  is scratched all over. Glass is dark tinted: clear looking straight in (the driver shows), a mirror at a glancing
  angle. Chrome bumpers and grilles are polished mirrors, black trim satin plastic; tyres have a tread (grooves and
  sipes) and a sidewall with a rim lip and raised lettering, and the drawn wheels are five-spoke alloys with the brake
  disc behind (`src/components/drive/carLook.ts`).
- **A calmer HUD and pause menu** — the 3D city's screen UI is flat, dark and quiet (one accent, 11/13/15/20 type,
  1.75 px line icons from `src/lib/iconPaths.ts`, no gradients, glows or emoji; `src/app/hud.css`). Camera / get out /
  menu are one tool rail with active and disabled states and tooltips on a mouse; the bottom prompt is a key glyph plus
  the verb (Enter on a keyboard, a touch glyph on a phone). **Menu** opens a pause menu (`DriveMenu.tsx`): full screen
  on a phone, a column at the start edge on a desktop, with a tab rail — Map, Missions, Garage, Party, Settings
  (Garage is the cars and paint; Settings is steering, graphics, time, weather, names). Arrow keys / D-pad change tab,
  Esc / B go back. Markers share the HUD's icon language: ONE canvas icon atlas (`markerKit.ts`), ground-projected
  pulsing rings and a soft light pillar that fade with distance and thin when you are close (`src/lib/hudMarkers.ts`),
  pickups that bob and turn with a common / rare / epic rim and a burst when taken, and HUD waypoints
  (`waypoints.ts`) — the destination and the nearest jobs show an icon with their distance, or a screen-edge arrow
  when off screen. The lite tier drops the light pillar and the second ring and shows fewer waypoints.
- **Any screen shape** — the 3D city fills whatever screen it gets. Wide screens (landscape phones, 16:9, ultrawide)
  keep the camera's field of view and simply show more to the sides; a phone held upright used to see a 31° slit, so
  there the view opens up to what a 2:3 screen would show (`src/lib/view.ts`). Garage → **Wide view → Full screen**
  goes full screen and, where the browser allows (Android), turns to landscape like a console game; on an iPhone, turn
  the phone. The finished frame is sharpened — lightly at the screen's own resolution, more when dynamic resolution
  draws it smaller — never past a pixel's neighbours, so edges get crisper without halos (High/Ultra).
- **Realistic graphics that scale to the device** — the 3D city picks a quality tier for the device it runs on (GPU
  name, texture limits, float render targets, memory, cores, screen size, lite mode): **Ultra** (big shadow maps,
  screen-space ambient occlusion, clear-coated car paint on all traffic), **High** (an HDR pipeline with 4× MSAA, bloom
  and colour grading, a drifting cloud layer, and the film look below), **Medium** (a light version of that pipeline:
  no MSAA target, FXAA on the finished frame, bloom from a quarter of the picture, grading and vignette — and shadows;
  a phone without float render targets draws straight to the screen instead) or **Low** (the old lite look, straight
  to the screen). On **Auto** it keeps the frame rate up by lowering the resolution first, then stripping AO, then the
  film look, then bloom and clouds, and only then shadow detail and shadows; if that's still not enough for 20 s, or the GPU context is lost, the next
  visit starts a tier lower (picking Auto again forgets that). It also spots a browser that caps the frame rate (iOS Low
  Power Mode) and stops lowering things that won't help. Real-world geometry is untouched: what changes is how it's
  drawn — façades get relief (recessed windows, sills, mortar), windows reflect the sky, walls weather toward the
  pavement; asphalt gets aggregate, cracks and patches, pavements 50 cm slabs; trees sway; the sun's shadow box follows
  where the camera looks and snaps to whole texels so it doesn't shimmer. Garage → **Time of day**: Day (default),
  **Real time** (the sun where it really is over your streets now, from the date and GPS — golden hour, blue hour and
  night as they happen), Sunset or Night, with lit windows, light pools under every street lamp, glowing head and tail
  lamps (brake lamps bloom). **Weather**: clear, cloudy (overcast sky and soft light) or rain (streaks around the
  camera, streets that turn wet and glossy over a few seconds with puddles that mirror the sky). The cartoon style
  keeps its flat look (never through the HDR pipeline). All procedural — no texture downloads
  (`src/components/drive/graphics/`, `src/lib/daylight.ts`).
- **Iran's streets in 3D** — the traffic is what you see in Tehran: Prides everywhere, Peugeot 206 / 207 / Pars,
  Samands, Tibas, old Peykans, crossovers, yellow taxis with their roof sign and yellow plate, the blue Zamyad pickup
  (empty or stacked with fruit crates), the Khavar light truck under its tarp, red city buses and white minibuses on
  the main roads and motorbikes — commuters and delivery bikes
  with their box — riding by the kerb and leaning into corners (`src/lib/fleet.ts`: the mix, paints and sizes). Each
  model is built once from its side profile (wheel arches cut in) with its own lamps, grille, bumpers, mirrors and the
  Iranian number plate, and traffic draws every copy of a model instanced — a handful of draw calls for the whole
  street (`src/components/drive/fleet3d.ts`). Cars keep a bumper-to-bumper gap sized to what's ahead, stop at red
  lights and brake for you. Every car that's driving has someone at the wheel (on the left), seen through tinted
  glass with a dark cabin behind it — seats, dashboard, steering wheel — worked out from each model's own windows
  (`crew.ts`; four instanced meshes draw every driver in the city, the cabin rides in the traffic copy of the trim, so
  it costs no draw calls; parked cars are empty). About a third of drivers are women in a headscarf and manteau;
  patrol cars have an officer in uniform at the wheel. Traffic never appears in front of you: a car joins the street
  behind the camera, beyond 170 m or out of sight behind buildings, and the parked cars drawn favour the street you're
  looking down, so a row is there before you reach it. Posts, lights, bins and shop signs mapped on the asphalt stand
  on the pavement — at a junction on the corner, not in the cross street (`tileMesh.ts` `pavement`).
- **Real 3D car models** — the Pars (Peugeot 405), Samand (and the Samand taxi), Shahin, Tondar 90 (Dacia Logan),
  Xantia, the Zamyad pickup and the crossover are real models, built from CC BY 4.0 Sketchfab models
  by `npm run assets:cars` (`scripts/cars.ts`; the sources are big and not in git — put them in `assets/models/`).
  To find more: `npm run assets:find -- "assault rifle"` lists downloadable **CC BY / CC0** Sketchfab models (never
  NonCommercial, and nothing that names another game or calls itself a rip — `src/lib/assetLicense.ts`);
  `npm run assets:get -- <uid> --kind=weapon|character|car|prop|building|fx` downloads one into
  `assets/models/<kind>/` and credits it in `assets/credits.json` (needs your own `SKETCHFAB_TOKEN` in `.env`).
  `npm run assets:arena` (Blender) turns `assets/models/weapon/<key>.glb` into the soldier's and the first-person
  guns (`assets/blender/guns.py`: joined, turned barrel-forward, scaled to the real gun, grip at the hand, colours
  baked into vertex colours so each gun is two draw calls, thinned to 3,500 triangles) and writes each gun's sight
  line and muzzle to `src/lib/arena/gunFit.ts`; a gun without its source falls back to a procedural one.
- **Real street furniture** — where OpenStreetMap maps them (trees, street lamps, bus stops, benches, bins,
  hydrants) and where the city fills them in along the real streets (rows of trees, lamps every 34 m, and a
  municipal dumpster every block or two at the kerb, solid to cars), the 3D city draws real CC BY models: a
  full broadleaf and a pine (a street's trees spread over both, the same tree on the same spot every time), a
  street lamp whose arm and glow reach out over the road, a bus shelter, a bench, a bin and a hydrant. `npm run assets:props` (`scripts/props.ts`) builds them from `assets/models/prop/*.glb`: colours
  and textures baked into vertex colours, each stood on its foot, turned to the street, scaled to its real
  height and simplified (≤ 760 triangles), all in one ~80 KB file (`public/models/props`, manifest
  `src/lib/propModels.ts`, credits on /credits). Every kind stays one instanced draw call per tile; tiles show
  the drawn ones until the file arrives and then swap over. The storybook style keeps its drawn furniture;
  Iran's own (the green kiosk, the blue charity box, the water-cooler fountain, and the street kit below) stays drawn too.
- **Iran's street kit** — what every Iranian street has and no map records, drawn in code from photos of Tehran
  (`src/components/drive/streetKit3d.ts`) and placed per tile from its seeded random (`streetKit.ts`, the same tile
  always looks the same): the municipality's **galvanised waste container** on castors with its no-parking plate (now
  the only dumpster; rubbish bags lie beside about half of them), the yellow-and-red **Iran Post box**, cream
  **electricity cabinets** and grey **telecom cabinets (کافو)** at the back of the pavement, the odd yellow
  **payphone** hood on a main road and, in Iran, a turquoise-tiled **saqakhaneh (سقاخانه)** on a named side street.
  Two-way main roads (14–20 m wide) get **green-and-yellow median railings** down the middle, with a gap at every
  junction (solid: a U-turn across them is a crash), and one wide main road per tile may get a **pedestrian bridge
  (پل عابر پیاده)** — a canopied truss deck high over the traffic (solid only up where it is) and a stair tower on
  each pavement. At the crossings: **street-name plates** are Tehran's charcoal ones in Iran (Persian over English
  under a white rule, a wrought-iron scroll under the plate), **white arrow signs** stand on the right-hand pavement
  ~30 m before a main road's junction naming the cross street to each side, and motorways get a **green overhead
  sign** ~110 m before a junction (the road itself straight on, the exit with a slanted arrow). All of it is skipped on
  lite phones except a few signs; caps per tile in `KIT_CAPS`. Admin → Objects lists the kit (`STREET_KIT` in
  `src/lib/objectCatalog.ts`). Tests `tests/streetKit.test.ts`.
  `scripts/lib/meshSoup.ts` is the reading / baking / welding / preview code the car and furniture builds share.
  The build bakes each texture into vertex colours, removes everything you can't see from outside (the cabin,
  engine and underside: it draws the car from 60 directions with the glass opaque), levels the car, scales it to the
  real car's length, finds its four wheels, sorts the rest into the parts traffic instances (paint, trim, glass,
  head lamps, tail lamps, wheel) and simplifies them to a near and a far version (~16–23k / ~3–7k triangles,
  120–260 KB each, meshopt-compressed). Files are named by their hash (`public/models/cars/<car>.<hash>.glb`, listed
  in `src/lib/carModels.ts`) and served `immutable`; the service worker keeps them cache-first and drops a car's
  older build. In drive mode they download in the background while traffic shows the drawn models, then swap in
  (`src/components/drive/carModels.ts`) — full detail within 30 m, the far version beyond (and everywhere on lite
  phones). `--report` lists a source's materials and draws each one highlighted, `--preview` draws the result;
  new cars go in the `CARS` list with rules for their material names. Credits are on `/credits`, linked from drive
  mode. Only CC BY models are used: NonCommercial ones (e.g. CC BY-NC-SA) aren't allowed in a game with paid features. People walk the pavements — men in shirts and jackets, women in a manteau and headscarf or
  a chador — turning back at walls or carrying on round the corner (`people.ts`). The men nearest you (14, 6 on lite
  phones, within 60 m) are **real rigged, animated people** — three CC BY Sketchfab models with walk, run, idle and
  fall clips, in a few clothing shades (`src/components/drive/peopleModels.ts`); everyone else is drawn instanced.
  `npm run assets:people` (`scripts/people.ts`) builds them from `assets/models/character/*.glb`: only the street's
  clips kept (fingers and face channels dropped, long clips cut to 4 s), textures 512 px WebP, meshopt-compressed —
  ~200 KB each (`public/models/people/<key>.<hash>.glb`, manifest `src/lib/peopleModels.ts`, credits on /credits);
  the game measures each skinned figure with three.js itself (these rigs' stored rest pose lies flat) to set its
  height, feet and facing. No CC BY animated woman in a hijab or chador exists on Sketchfab yet, so the women stay
  drawn. The pavements also have blue-and-yellow charity boxes every block or two and green newspaper kiosks on the
  main roads.
- **Street life — crashes, crime and the police** (outside matches; `src/components/drive/street.ts`, numbers in
  `src/lib/street/{damage,wanted}.ts`) — the open city plays like a crime game:
  - *Crashes are real*: your car takes damage by how hard it hit (a scrape is free, ~18 at 36 km/h, ~70 at 72 km/h, a
    wreck at 90), dents where it hit (`carDamage.ts` folds the body in; the shared model is copied first), loses pull,
    smokes grey then black, catches fire at zero and explodes ~6 s later — inside it you're thrown out hurt and it's a
    charred shell (take another car off the street with F, or pick one in the garage). The car you hit is shoved off
    its lane and slides to a stop with its hazards flashing, damaged the same way — every street car and patrol car
    shows its dent where it was hit, scuffed to bare metal, and gets more battered all over as it loses health
    (`fleetDamage.ts`: one dent per instanced copy, folded in by the shader with the same shape as your car's;
    `dentCar`/`localHit` in `damage.ts`); bullets leave holes where they went in — a dark hole ringed with bare
    metal on the paint, a star of cracks in the glass — drawn by the same shader on the real curved body (the last four
    per car; on your own car they're decals laid on the model where the ray met it, `carDamage.ts`). A parked car you
    hit or shoot sets off its alarm; traffic behind honks and pulls round the wreck. A health bar shows while your car is hurt.
  - *Pile-ups are physical*: every car is a box with a mass (from its size: a Pride ≈ 1 t, a bus ≈ 11 t) and a spin,
    and a car knocked loose crashes into whatever it slides into — driving cars, parked cars, wrecks, patrol cars and
    yours — passing its momentum on (`lib/street/carPhysics.ts`: separating-axis contact, impulse with restitution,
    friction and spin from where the hit lands). Hit hard enough, that car comes loose too and hits the next one, so a
    crash runs down the line; a bus hardly notices a Pride. Hard hits throw glass and bits of bumper that bounce and
    lie on the road, kick up dust, spark, shake the camera and screech. A parked car knocked off the kerb leaves it
    at once and becomes exactly one loose car, whoever hits it and through whichever of the frame's footprints
    (`traffic.ts` `unpark`/`offKerb`, held by `tests/trafficCars.test.ts`), and a row keeps its cars where they were
    when a crossing street loads later (`parkedRow` rolls the same dice for a spot whether or not it's free).
  - *Explosions* are 3D (`blast3d.ts`, plan in `lib/street/blast.ts`): a boiling fireball that cools from white-hot
    through orange and red into a column of black smoke, the car's bonnet, boot lid, doors, bumper and a wheel
    thrown up in its own paint, trailing smoke, bouncing and lying on the road, burning fuel round the wreck, a
    scorch mark and a flash on the ground; burning cars and wrecks carry 3D flames. They throw cars (some onto their
    roofs) and people, and set the cars beside them burning — chain reactions; your grenades do the same in the open
    city. A thrown car turns about the middle of its body and is
    held up by its lowest corner (`tumbleOrigin`), so a burnt-out wreck on its roof lies on the road where it landed.
  - *People react*: gunfire, crashes and blasts send everyone near running (off the pavement if need be, back to it
    when they calm down); a speeding car makes them dive aside; a car hits them hard enough and they're thrown (fast,
    they don't get up); bullets hit them; drivers near trouble floor it through red lights.
  - *Crime and the wanted level* (1–5 ★): what a passer-by or an officer sees raises it — shooting, hitting or killing
    someone, pulling a driver out of their car, blowing a car up, ramming or shooting the police (one crime per
    victim, a burst of fire is one report). The police send patrol cars — white Samands in the Iranian police livery
    (a green band sweeping up from behind the front wheel to the boot, «پلیس» on it, a gold roundel on the front door,
    POLICE across the bonnet: `livery.ts` draws it in the shader), a roof light bar whose red lenses flash in a
    chase, an officer at the wheel, and a siren — up the streets with a clear run at you; from 2 ★ they ram your car, officers get out
    (a real officer model — green uniform and cap — on the arena soldier's skeleton, so it has
    every soldier animation: `assets/blender/police.py` fits a downloaded T-pose mesh to it, re-skins it and recolours
    the uniform; `ARENA_ONLY=police npm run assets:arena` rebuilds `public/models/arena/police.glb`) and shoot at you on foot, from 3 ★ at your car too. Out of every
    officer's sight long enough (6 s + 4 s per star), they lose you; stopped beside an officer (on foot, or in a
    stopped car with one at the door), you're arrested. Their shots hurt only in the open city and apart from the
    referee's health (`Combat.streetHurt`): at zero you're knocked out and up again 5 s later.
  - *Street jobs* (`src/lib/street/jobs.ts`), little GTA-style stories that start from what's already happening: a
    bag snatched within 45 m of you is yours to chase — **Stop the thief** shows under the stars with its 45 s clock
    and how far ahead they are; they keep looking back and running on; reach them on foot (2 m) or cut them off with
    the car (4 m) and they give up — run 140 m behind, or out of time, and they're gone. Shake off a chase of 2 ★ or
    more and it's a **Clean getaway**, paid by the stars. The server pays both (`POST /api/drive/street`, XP and
    coins with the admin's multipliers, less from home) but can't see the chase, so it limits them: one of a kind
    per 3 minutes (a unique `Claim` per window) and 12 a day.
  - *Story scenarios* (`src/lib/scenarios/*`, `src/components/drive/{scenarios.ts,ScenarioHud.tsx}`), GTA-style missions
    described as data. **Mission givers** stand on the streets around you as amber beacons (the same beacons jobs
    use; they are put again when you drive 1.8 km away); drive or walk into one for the briefing card, **Accept**, and
    the steps play in order. A step is one of: *go to a place* (radius, optional clock), *get a car* (any, or given
    models — taking one off the street, **F**), *pick up a person / package* and *deliver*, *chase and ram* (a moving
    car ahead flees, kept in the traffic by `TrafficCars.pin`; wrecked wins, 220 m away or gone fails), *lose the
    police* (raises the wanted level — they come by themselves — and wins when they give up), *survive* N seconds,
    *take out N gunmen* (the armed officers `Police` sends at 3 ★; counted by `StreetLife.kills`), *photograph a
    landmark* (close, facing it, still for 1.2 s — a flash) and *drift* N metres (a held slide; there is no slow-mo
    in the game, so the drift is the distance slid sideways above 7 m/s). Steps can carry a checkpoint (a retry
    resumes after it, with the clock it had), their own objective text, a clock and dialogue (subtitles in the
    player's language, plus a recorded street line by id when one exists, `voices.ts`). Fail rules: the whole clock,
    a step clock, car wrecked, knocked out or arrested, target escaped. The HUD shows the objective, clock, distance,
    progress, a waypoint arrow, a pass / fail card with retry; nothing runs during an arena match (a run in progress
    is called off). Places are **anchors** (`fixed` lat/lng, `start`, nearest `junction`, `store` of a kind,
    `landmark`, a point `along` the roads — each within a ring, measured from the start or the previous place), resolved
    when you accept, so every scenario plays in any city. The pure state machine (`machine.ts`) is unit-tested
    (`tests/scenarios.test.ts`); the six starters (`starters.ts`: *Midnight Getaway*, *Bazaar Run*, *Davoud's Debt*,
    *Cold Trail*, *City Postcard*, *Hold the Tea House*) are data like any other. Server (`/api/scenarios`,
    `src/server/scenarios.ts`, models `ScenarioDef` / `ScenarioRun`): `start` takes the places the client resolved and
    refuses ones that don't fit the scenario or where you are; `finish` can't see the chase, so it checks the run could
    have happened (`plausibility.ts`: the claimed time ≤ the real clock and ≥ the legs at the fastest vehicle's speed
    + the other steps' minimums; the distance driven ≥ the legs and ≤ speed × time; for a run that ends at a place,
    the last position `/api/loc` accepted is there), then pays the reward through `grant` (the admin's multipliers) —
    **one reward per scenario per 6 h window** (a unique `(user, scenario, window)`), at most 12 paid a day; replays
    pay nothing. Runs are kept (`ScenarioRun`: status, time, distance, reason). **Admin → Scenarios**
    (`AdminScenarios.tsx`, `/api/admin/scenarios`): list with on/off switches and won/failed counts, create,
    duplicate, edit (a starter is edited by saving over it; *Reset* deletes the row), a form per step type, anchor
    pickers with a map pin picker (`AdminDropMap`), dialogue editor, and the validator's problems shown beside each
    field. **Test it** opens `/play?drive=1&scenario=<id>` — the 3D city with that briefing open, even if the scenario
    is switched off (admins only). E2E: `e2e/api/scenarios.spec.ts`.
  - All of it is local to your phone, like the traffic: nobody else sees your wanted level, and it never touches a
    match (a match is a clean shooter: no traffic, no people, no police).
- **Small phones** — on screens ≤ 380 px wide or ≤ 680 px tall (iPhone SE, 360×640 Androids) the HUD is a size
  smaller everywhere (`src/app/compact.css`): map chips, toasts (two at most, long text clamped), pop-ups, the 3D top
  bar (buttons beside the minimap), the driving and on-foot pads and the crime HUD.
- **The street's edge** — up close (within 320 m, not on lite phones) every street has a kerb and a raised pavement,
  with Tehran's *jube* — the open gutter — between them in Iran, all cut short where they meet the next street
  (`tileMesh.ts` `streetSide`). About half of Iran's streets are lined on each side with plane trees growing out of
  the jube. Cars are parked nose to tail along the kerbs — one side of a two-lane side street, both sides of wider
  ones, none on expressways or roundabouts — with gaps at driveways and traffic lights and every junction kept clear
  5 m past the crossing street's kerb (measured to that street's segments, so a crossing with no shared map point
  still stays clear, while the same street carrying on as another line leaves no gap), none piled into the inside of
  a bend, and about half the kerb taken on side streets, a third on avenues; the same cars are there each time
  you come back, they're solid, and traffic keeps to the lanes they leave (`src/lib/parking.ts`; the nearest 60 are
  drawn, 20 on lite phones). Leaves close to the camera aren't drawn, so the chase camera never looks out from inside
  a tree.
- **The garage** — the same street cars are yours to drive (Pride, Peykan, 206, 207, Pars, Samand, the taxi, the
  Zamyad pickup, the city bus, a delivery bike with its box) next to the hatchback, sports car, pickup, motorbike,
  drone and helicopter. Every vehicle — the drone and the helicopter too — is free from level 1 (admin: *Every vehicle
  free from the start*; turn it off to unlock them by level). A bus gets collision circles down its length and a
  camera further back; bikes lean and steer by the bars (`src/lib/vehicles.ts`). Flyers count as low enough for
  pick-ups under 12 m and stay so up to 15 m, so the job card at the bottom doesn't flicker while you hover over
  uneven roofs. The touch controls let go of any finger the browser loses (a system swipe, the screen's edge, the app
  going to the background) and a new touch always takes the wheel or stick, so a control never sticks or freezes;
  keys let go when the window loses focus. **The pedals are analog**, like a sim racer's: the higher up the pedal your
  thumb is, the deeper it's pushed (45 % at its foot, full at its top — feather the throttle round a corner, brake
  lightly in traffic), with a meter on each pedal's edge; the horn sounds as long as it's held. **Drone and
  helicopter fly on two sticks** laid out like a real radio ("mode 2"): the left stick turns and climbs or sinks,
  the right stick (a vertical slot) tips the nose — up flies forward, down backs off — as far as you push it. **The
  minimap is the way back to the map**: tap it (a map tag on its corner says so). Your driver sits at the wheel —
  seen through the glass from the chase camera — in the same cabin the traffic's drivers have.
- **Play together** — one tab in the 3D city's menu (☰ → 👥 Play together) for everything with other people: start
  a party (or join one by its code or an invite), invite friends or players online near you (each is pinged once),
  and 🚀 go to the host — your car lines up right behind theirs, so you see each other drive. Then the host picks the
  game for everyone: a party round (🏁 checkpoint race, 🫵 tag, 🪙 coin rush — the server referees it from the
  position stream and warps everyone to the start line) or a Street Arena match (below), and starts it. Members in
  the 3D city are pulled into the host's match on their own; the others get a notification. Games with others are
  played from home (players on real GPS can watch, and switch with one tap). Members see how far each other is, and
  a deliberate jump of the car (start line, going to the host) is announced to the referee so it isn't taken for a
  speed hack (`warp`). `src/components/drive/PlayTogether.tsx`, `src/server/drive.ts`, `src/app/api/party`.
- **Vasatyab (وسط‌یاب) — where should the party meet?** A group finds the point in the middle of all its members,
  from where each was last seen (the 3D city position while driving, else the last GPS report; positions older than
  10 minutes are marked stale, older than 6 hours ignored). Three ways to pick it: **Balanced** (the geometric median,
  the default — least travel for everyone put together; robust to one far-away friend), **Fairest** (the minimax point —
  the farthest friend travels the least) and **Plain centre** (the average on the globe). It shows each member's distance,
  up to six places to meet near it (cafés, restaurants, bakeries, parks… from the real-places data and Snappfood's
  cached vendors, ranked by the farthest member's trip; places with 3+ Siktir marks are left out), **Set as gather
  point** (the party remembers it and everyone is notified; in the 3D city 🚀 *Gather here* puts your car there) and
  **Share** (a maps link). In the 3D city it is a section of the Play together tab; on the 2D map a party button
  (only while you're in a party) opens the panel and draws the middle, each member and a dashed line to the middle. It
  refreshes as members move (4 s while open). **In the 3D city** the point (the gather point once one is set) is a
  violet beacon with a light column, a dot on the minimap (on its rim when further away) and a HUD waypoint, polled
  every 20 s while you're in a party. Not done: snapping the point to the nearest street (there is no cheap
  server-side street helper). Maths `src/lib/midpoint.ts` (tests
  `tests/midpoint.test.ts`), server `src/server/midpoint.ts`, `GET/POST /api/party/midpoint` (`?method=`, `?lite=1`),
  UI `src/components/game/Vasatyab.tsx`, `DriveParty.meetLat/meetLng/meetName`.
- **Siktir (سیکتیر) — "never again" for a place** — mark a place you didn't like, with a reason (dirty, rude staff,
  overpriced, unsafe, scam, too noisy, bad quality, something else) and an optional note of up to 280 characters.
  Every store card (Snappfood vendor, Torob store, real place, business, Market shop) has a **Siktir** button and
  shows "N people said Siktir — top reasons"; a **long press anywhere on the 2D map** (right-click on a desktop) opens
  the reason sheet for that spot, and the **Siktir spots** map layer (⋯ → On the map → Around you) shows the marked
  places (tap one for the reasons). One mark per player per place (the store id, or the spot rounded to ~11 m);
  marking again changes it, "Take it back" removes it; 8 new marks an hour and 25 a day. Players only ever see counts
  and reasons, never who. Admin → Community → **Siktir** lists every mark with the player, hides one (it stops
  counting and the author can't bring it back by editing) or deletes it. Rules and counts `src/lib/siktir.ts`
  (tests `tests/siktir.test.ts`), server `src/server/siktir.ts`, `GET/POST/DELETE /api/siktir` (box or `placeKey`),
  `/api/admin/siktir`, UI `src/components/game/{Siktir,SiktirLayer}.tsx`, `src/components/AdminSiktir.tsx`, model `PlaceDislike`.
- **Street Arena (GTA Online meets Counter-Strike, on your real streets)** — in the 3D city, everyone driving or walking
  nearby shows up live (20 updates a second over WebSockets, or a few a second over HTTP without the realtime
  server). Press **F** / 🚶 to get out of the car and walk as a 3D
  soldier (third-person over the shoulder, or first-person with the gun in hand). On foot, **F** / the car button next to
  any car on the street — parked at the kerb, or stopped at a light or in a jam — takes it: you drive it in its own paint
  (a Tiba, a Shahin, a Khavar truck, the city bus…, each with its own handling; the street-only ones never show in the
  garage), the car you got out of stays parked at the kerb, and a new pick in the garage puts you back in your own
  (`TrafficCars.take/leave`, `carToTake` in `src/lib/vehicles.ts`; the server accepts any street car in a report). In the open city fighting is opt-in:
  everyone starts in 🕊️ passive mode, fighting unlocks at level 3, and you can't drop back to passive mid-fight. Or start a
  **match** on the streets around you (Menu → Street Arena): 💀 Deathmatch, ⚔️ Team Deathmatch, 💣 Bomb Defusal (plant at
  site A or B, defuse, rounds, side swap), 🔫 Gun Game (every 2 kills hand you the next gun — SMG, shotgun, rifle, sniper,
  pistol; first through all 10 wins) or 🚩 Hardpoint (a glowing zone on a street, coloured by who holds it, moves every
  minute; a point a second for the team alone in it, first to 120), small / medium / large arena, with up to 10 bots (easy / normal / hard) so it's
  fun with one friend or none. Nine guns built from real low-poly models (CC BY, credited on /credits): pick a primary —
  AR-7 rifle, KR-47 battle rifle (three heavy rounds, kicks harder; best just past SMG range), Vex SMG, Breacher shotgun,
  Bulldog LMG (a 100-round belt, slow to move and reload), Marksman DMR (semi-auto, owns 100–200 m) or the Longshot
  sniper with a scope — and a sidearm (P9 pistol or the Hammer .50, whose headshot drops anyone up close); every
  primary but the LMG is the fastest kill in its own band of range (`tests/balance.test.ts`). Aim down sights, recoil,
  headshots, kill feed, scoreboard. **Grenades and C4** (`src/lib/arena/throwables.ts`): every life carries a 💣 frag,
  two ⚡ flashbangs, a 💨 smoke, a 🔥 molotov and a 🧨 C4 (none in Gun Game). Hold **G** (or the touch grenade button)
  to see the throw's dotted arc, let go to throw; **4** / ⟳ switches which one. They bounce off walls and roll; a frag
  or C4 hurts everyone its blast can see (walls shelter you, your own grenade hurts you too), a flashbang whites out
  the screen of whoever looks at it (longer the closer and more squarely), smoke is a cloud nobody — bots and aim assist
  included — sees through for 16 s, a molotov breaks into a pool of fire that burns whoever stands in it for 7 s, and C4
  sticks where it lands until you press G again. The referee flies each throw with the same code the clients draw it
  with (`fly()`), so a grenade lands where everyone saw it land. **Battle damage**: bullets leave holes in walls and
  the street, hits throw blood onto the wall behind and the pavement, whoever falls leaves a pool, blasts and fires leave
  scorch marks (all pooled, `src/components/arena/decals.ts`); a hit flinches your aim and splashes blood on your
  screen. Phones get a shooter layout (floating stick, drag to aim, fire buttons on both sides,
  aim assist and optional auto-fire); desktop uses mouse look and WASD. Matches pay XP and coins (12 paid matches a day;
  beating people pays more than farming bots). Medals pop up for double / triple kills, rampages, killing sprees (5 and
  every 5 after 10 without dying), first blood and headshots, with a 🔥 run counter (`src/lib/arena/medals.ts`). Every
  3 kills without dying call in a 📡 UAV: for 12 s enemies' name tags show from 400 m, through walls — to your whole
  team in team modes (`earnsUav`, `UAV_S`). `npm run rt:sim -- gun|hill` plays a whole bot match of either. Matches
  work between real players with or without the realtime server: without it the match runs in its host's browser
  (the same referee code) and the others link to it through the game server — everyone's moves go straight to
  everyone (one hop), the referee's messages and bots go through the host, and soldiers are drawn as far behind as
  their news arrives (adaptive, ~0.5–1.5 s on phones), with lag compensation to match. A match is open to its host's
  party from anywhere and to players within its circle + 250 m (Matches nearby); one with two or more people pays
  like the realtime server's. The host keeps the game open until it's over; if the host vanishes for 25 s, the
  others are sent back to the city (`src/lib/arena/relay.ts`, `src/components/arena/relay.ts`,
  `src/server/arenaRelay.ts`, `/api/arena`). Every
  primary is the fastest killer in its own band of range — shotgun point-blank, SMG up close, rifle mid, sniper far — and
  `tests/balance.test.ts` keeps it that way when the numbers are tuned.
- **Fantasy map** — the 2D map is an illustrated parchment map (paper grain, drifting cloud shadows, compass rose, colours
  of the hour). ⋯ → Map style picks any of 17 looks: fantasy, street, night ops, satellite (with or without place names),
  terrain, topographic, light, midnight, voyager, city streets, humanitarian, cycling, retro, noir, blueprint and neon
  (`src/components/game/mapStyles.ts`; every provider there works without a key — `tests/mapStyles.test.ts` keeps keyed
  providers out, since CARTO began drawing "API KEY REQUIRED" on every tile — and the service worker keeps their tiles
  for offline). Styles whose provider is blocked in your country (Esri, on and off in Iran) switch to a keyless look-alike.
- **Social network** — 🌐 Social: a feed (following / nearby / trending), posts with photos, check-ins at real places,
  follows, likes, comments, reports, profiles; deliveries and store visits post themselves. Mutual followers can DM
  and call. Crew chat lives inside Social.
- **Business center** — real store owners claim their place from inside the store, post missions (check-in for coins)
  and coupons (a code the cashier redeems at the till), and see visits, redemptions and repeat customers. Plans:
  Free / Starter / Pro / Chain (Stripe), with a free trial. See `marketing/BUSINESS_PLAN.md` for the monetisation plan.
- **Real menus & prices** — every store card (real places, businesses, Market shops) shows the store's real menu or
  catalog from Snappfood (restaurants, cafés, bakeries, supermarkets — matched by name within ~150 m, or up to
  400 m when every word of the name matches, from the area's whole vendor list or else Snappfood's own search) and,
  for non-food stores, its own Torob shop (found by exact name or the owner's torob.com/shop link) with that shop's
  catalog and a search inside it — only the store's own products, never other stores' (a store that isn't on Torob
  has no Torob tab; a catalog row shows Torob's lowest price and says so). On top: a picture (Snappfood cover, an OSM photo), a logo
  (Snappfood, Torob, or the store website's icon), the address and opening hours, and links to call, its website and
  Instagram — contacts come from the map (OSM `phone`, `website`, `contact:instagram`, `opening_hours`, `addr:*`,
  `image` / `wikimedia_commons`, stored with each place by the city pack). **Phone numbers are the store's own:**
  Snappfood answers every vendor with its own call centre (021-96612), which is never shown. **Every card shows all
  the numbers anyone has**, each once (`+98 21…` and `021…` are one number) with where it was read — the map, the
  store's own Torob page (both its numbers), Snappfood, **Google**, Balad: one number is a **Call** button, several
  open a list to pick from, and Info lists them all (at most 6). **Google Places is asked first** (the official Text
  Search API, only when `GOOGLE_PLACES_KEY` is set: matched by name and distance like Balad below, at most
  `GOOGLE_PLACES_PER_DAY` paid lookups a day, default 300, cached a month); when it has no number, Balad is asked by name where the store stands — the
  name without Snappfood's "(Area)", then without "Restaurant" / "Pizza"… (Balad answers those with the whole category,
  so "پیتزا پرپروک" is asked again as "پرپروک") — and the place is matched by name and distance: 120 m for a similar
  name, 300 m for the same one, 700 m word for word, one name however it is spaced ("برگرلند" / "برگر لند"), never
  another kind of place ("بیمه ایران" is not "ایران برگر"). Every number on its page is kept, cached a month; a miss
  (Balad's 404 too) is retried after a week (`BALAD_URL` / `BALAD_POI_URL`, `off` disables). Balad lists about half of Snappfood's
  vendors with a number (delivery-only kitchens are often not on any map), so a card that came back without one asks
  again on its own (`/api/local?phone=1`, waiting up to 12 s for Balad and Google), and with no number anywhere it
  offers **Find the number** — a Google search for the store (and a Balad search beside it in Info) — so every store has a way to call.
  Neshan's API has no phone numbers. Owners can paste their Snappfood / Torob /
  Divar links in the Business center or their Market shop, which beat the automatic match. Names match however Persian
  words are spaced ("چلوکباب" / "چلو کباب"). The card is built for phones: a compact head with the rating and 🟢 open
  now / 🔴 closed (in the store's own time zone), the actions in one row, and tabs that stick while you scroll — Menu,
  ⭐ Reviews (Snappfood customers' reviews, ten at a time, with the star split, what they ordered and the store's
  replies) and ℹ️ Info (the week's hours with today marked, the address, the phone, minimum order and delivery fee).
  Tap a menu item to open it: its full-size picture, whole description, price and discount, and Order on Snappfood.
  Prices are toman, as Snappfood quotes them; its links go to `snappfood.ir/restaurant/menu/<code>/` (the vendor's
  own `menuUrl` redirects to a 404).
  Hours come from the map's `opening_hours` when it reads as a week, else from Snappfood's schedule.
- **Torob walk-in stores** (the map's filter → 🏷️): every store Torob's own map of sellers knows, at its real spot
  — built once a day from the walk-in sellers of a few everyday products (kept per ~2 km cell), plus Torob's own
  in-person search around you (the "buy in person" pages: products ranked by what stores near a point stock), run
  once a day per ~5 km square the first time a player looks there. Tap one for what it was seen selling *at its own
  price* (with its own note and when it last changed the price), then the rest of its Torob catalog (searchable inside
  the store only), its photos, hours, full address and phone. Torob's calls are spaced out (`TOROB_GAP_MS`, 450 ms) and
  stop for half an hour when Torob answers "are you a robot?" (490) or 429.
- **On the map** (the map's filter button, or ⋯ → 🗺️ *On the map*; everything on by default): the game's own 💵 money,
  📦 store jobs, 👥 players and 🏪 businesses, 📍 every real place within 1.2 km (restaurants,
  cafés, shops, parks — with or without a job; tap for its menu and contacts), Snappfood vendors by kind with their
  logo up close (one sign per store: an OSM place that is a vendor shows as the vendor), 🏷️ Torob's walk-in stores, 🎬 cinemas from
  [cinematicket.org](https://cinematicket.org) (each with its name; its card has every film today and tomorrow with its
  poster and sessions — time, hall, price in toman, VIP halls marked — and buys the tickets there; `src/lib/cinema.ts`,
  `src/server/cinema.ts`, `/api/cinema`, read from cinematicket's own JSON API, which answers from abroad: no relay;
  the list cached a day, a cinema's sessions ten minutes; `CINEMATICKET_URL`; like every place it shrinks as you zoom
  out and names itself only where there's room), 🏷️ **Deals (Takhfifan)** — stores within 2.5 km with a discount or
  cashback on [takhfifan.com](https://takhfifan.com), each a price tag on the map ("−15%" red, "5%↺" cashback green,
  a dot where crowded); its card is laid out like a Snappfood one — a photo strip, logo, rating, open now, then tabs:
  **Deals** (photo, price in toman, the usual price, % off, until when, how many sold; tap one for its page with what
  you get and the terms), **Reviews** (stars, text, the store's reply, ten more at a time) and **Info** (the week's
  hours, address, phones, how to pay for the cashback and which bank cards earn it, features, categories, website) —
  plus Call, the way there and "Open on Takhfifan". The layer is the list behind takhfifan.com/nearby (one call with
  the box round you, ~1 km cells, 6 h cache); if that fails, its search by the nearest five neighbourhoods' names (Divar's
  list) fills in. A store's page and deals are read when its card opens (`?dealInfo=<id>`, 2 h cache), its comments by
  page (`?dealReviews=<id>&page=`). `TAKHFIFAN_URL`, `off` disables; `?deals=1`. **The prod relay must be redeployed
  (`relay/install.sh`; relay v2 forwards any path, so this was the last time)**, 📢 Divar — each nearby
  neighbourhood pinned on its centre with its latest ads, by category (homes, vehicles, electronics…). **Every ad and
  product opens its own page in the game first** — photos you swipe, the price, and for a Divar ad the whole ad: its
  description, its facts (area, rooms, year, price per metre…), what it has, when it was posted and roughly how far
  (`?divarPost=<token>`, Divar's own post page, 30 min cache); Torob products and Takhfifan deals the same — and only
  its button goes on to divar.ir / torob.com / takhfifan.com. And 🚦 live
  traffic — each chip with how many there are around, and real places narrowed by kind (cafés, pharmacies, banks…).
  Every layer groups what would overlap into bubbles (game items, then places and vendors, each spaced to
  its sign size); nothing groups from zoom 18, plain places name themselves only there, and places, vendors and ads
  are left out at city zoom. With everything on, one pass over all layers in screen space (`declutter.ts`) keeps it
  readable and light: a place that would sit on a game marker — or beyond 120 full markers (60 on lite phones) —
  becomes a small dot on the map's canvas (still tappable), names show only where they don't collide, and place
  bubbles are smaller than the game's. The game's own few (money and jobs, `mapMaxItems`) are ranked from an anchor
  that moves only after a 250 m walk, so they don't reshuffle on every refresh.
- **Visits** — the home page counts its visits (once per browser session, once per network per half hour) and shows
  the total and today's next to the player count (`src/server/visits.ts`, `/api/visits`).
- **Visit analytics** — Admin → *Visits* shows, per Iran-time (Asia/Tehran) day, page visits (home + `/play` game opens),
  unique visitors, unique signed-in players and new players: today's cards, a 30/90/365-day bars-and-lines chart and a
  day-by-day table (`src/components/AdminVisits.tsx`, admin-only `GET /api/admin/visits?days=30|90|365`). Unique visitors
  are rows in `VisitorSeen`, keyed by (day, HMAC of the signed-in user id or of the first-party `sq_vid` cookie under a
  server secret) — no IPs or raw ids are stored and the hash changes daily; rows and counters older than 400 days are
  pruned. `POST /api/visits` takes an optional `{ "path": "home" | "play" }`. Pure rules: `src/lib/visits.ts`.
- **Who's online** — the HUD's 🟢 chip counts everyone online right now; tap it for your online friends (anywhere,
  with their distance) and players within 5 km (`/api/online`). Strangers' distances are measured to their fuzzed spot
  and rounded to 250 m, so moving around can't pin anyone down; no position is ever sent in the list. Each online
  friend has 👀 *Visit* (the map flies to their street in explore mode) and, playing from home, 🚀 *Travel* — you land
  12 m beside them, once every *Travel to a friend* minutes (Admin → Game settings, default 10; `/api/explore`).
- **Walking together** — players within 250 m of you on real GPS (a fix of 150 m or better) are exact and live on both
  maps (every report, ~1 s apart while someone is near), and the slower world list agrees with them, so a friend or a
  stranger walking beside you never jumps to a made-up spot. Further away strangers stay 60–150 m off
  (`src/server/presence.ts`).
- **Explore the map** — ⋯ → 🧭 *Explore the map*, or *Just explore the map* when there's no GPS: the map moves freely and
  Snappfood, Torob, Divar, the real places and players load around the middle of the map instead of around you, with
  quick jumps to big cities and the north (Sari, Babol, Babolsar, Amol, Royan, Nur, Chalus, Nowshahr, Ramsar, Rasht,
  Gorgan). Picking things up still needs you there; ◎ goes back to you (`src/lib/explore.ts`, `/api/explore`).
- **The north (shomal)** — city packs for Sari, Babol & Babolsar, Amol, Qaemshahr, Royan / Nur / Izadshahr, Chalus &
  Nowshahr, Ramsar & Tonekabon, Rasht & Anzali and Gorgan (`npm run city:pack -- sari babol amol qaemshahr royan chalus
  ramsar rasht gorgan`). In small towns Snappfood's vendors deliver only a short way, so the map reads the cells around
  you too and reaches 5 km; Divar's small towns (no neighbourhoods) show the nearest three together, even when Divar
  puts a town's centre kilometres off.
- **Navigation** — 🧭 *Route* on any place card more than 150 m away draws a live driving route (Neshan, with
  today's traffic) to it: a blue line, the minutes and distance left and the next turn in Persian; it re-routes when
  you're 70 m off the line, refreshes every 2 minutes, and ends on arrival. Each route also feeds the traffic layer.
  Without Neshan routing, `/api/route` answers 503 and the card keeps its Directions links.
- **Navigate with…** — 🧭 *Directions* on every place, store, cinema, shop and GPS-game target (also in test mode)
  opens a chooser of real navigation apps (`lib/navApps.ts`, `NavigateWith.tsx`): Android first offers *Any map app*
  (the `geo:` link — Neshan, Balad, Google Maps, Waze on the phone), iPhone Apple Maps, desktop Google Maps; then
  Neshan and Balad (open the place on their map), Google Maps by car or on foot, Waze, Apple Maps and OpenStreetMap
  (route straight away). The app you used last goes to the top; *Copy coordinates* and *Share* are there too.

Plus the original layer: Pokémon-GO-style spawns, GTA-style timed runs, real package deliveries,
location messages, friends/chat/events, an admin panel and SEO/marketing tooling.

## Controls

The 3D city plays with a keyboard (and mouse on foot), a game controller or touch. A controller works on foot, driving
and in arena matches; it writes into the same input state the keyboard and touch controls use (`src/components/drive/gamepad.ts`,
mapping rules in `src/lib/input/gamepad.ts`: radial deadzones, response curves, Xbox / PlayStation / Switch labels
from the pad's id). Plug it in or pair it and press a button; a toast names it and its buttons. It rumbles on crashes,
shots and hits where the browser supports it (Chrome / Edge; Safari has no rumble).

| | Keyboard | Controller | Touch |
|---|---|---|---|
| **Drive** | W/↑ gas · S/↓ brake · A D steer · Space handbrake | left stick steer · R2 gas (analog) · L2 brake / reverse · B/○ handbrake | wheel, buttons or tilt on the left, analog pedals on the right |
| Horn / camera | H · C | D-pad up (hold) · Y/△ or D-pad left/right | horn and camera buttons |
| Get out / in | F | A/✕ out · Y/△ in (near a car) | HUD button, or the car button in the action arc |
| Menu | on-screen ☰ | Start | on-screen ☰ |
| **Focus** (slow motion) | hold Z, or Q + E together | hold L2 + R2 | FOCUS button (hold) |
| **Nitro** | hold Shift | hold R1 | NITRO button (hold) |
| **On foot** | WASD move · mouse look · Shift sprint · Space jump · C crouch · R reload · Q switch gun · V view · G throw | left stick move · right stick look · R2 fire · L2 aim · A/✕ jump · X/□ reload · B/○ crouch · L3 sprint · L1 dead-eye · R1 throw · D-pad left switch gun, right switch throwable, up view, down plant/defuse | floating stick (under your thumb, push to the edge to sprint) · drag the right half to look · fire and an arc of aim / jump / crouch / reload / switch gun (and "car" only near one) |
| **Dead-eye** (aim in slow motion) | hold Z while aiming | hold L1 while aiming | dead-eye button while aiming |

**Slow motion and nitro** (`src/lib/abilities.ts`): focus eases the world's clock to 0.3x (0.35x for dead-eye) for as
long as its meter lasts (about 6 s, recharging over about 25 s once you let go; an empty meter stays off until it has
recovered a quarter). Steering stays in real time and the tyres grip harder while it's on, the engine pitch drops and
the picture desaturates and vignettes. Nitro has its own meter (4 s, refills in 14 s): more thrust and a 22 % higher top
speed, well inside what the server's position check allows. Positions sent to the server are always real; slow motion
only makes you move less. Both are **off in arena matches and live party games**, where everyone's clock has to agree.

**Touch layout.** The on-foot sticks are tracked by pointer id, so three fingers (stick, look, a button) never steal
each other's events. Drag-to-look speeds up with the flick (up to about 2.2x); with the sights up a quick tap on the
look area fires a shot; holding **Aim** aims while held and a quick tap locks it on. Phones with vibration buzz on
sprint, jump and shots. In the garage (☰ → garage, touch only) there's a **Look sensitivity** slider and a
**Left-handed layout** switch that mirrors the stick, look area and action arc. Colours and sizes of all of it are CSS
variables at the top of `src/app/controls.css` (`--cp-*`, `--ab-*`).

## Run locally

```bash
npm install
docker compose up -d        # local Postgres
cp .env.example .env        # defaults match docker-compose
npx prisma db push          # create tables
npm run db:seed             # demo data (SEED_LAT=.. SEED_LNG=.. to seed near you)
npm run city:pack -- iran   # street detail and real places for the whole country (optional, ~4 min; or one city: tehran)
npm run dev                 # http://localhost:3000
```

**No login:** opening `/play` creates a guest commander automatically (saved in a 1-year cookie);
players can rename their callsign in Profile. To become admin, set `ADMIN_KEY` and open
`/admin?key=<ADMIN_KEY>` once in a browser that has played.

**Test mode (no walking needed):** anyone can tap 🕹️ (or "Test mode — no GPS" when location is off).
Then tap the map to move, and every "Get closer" button becomes **Teleport here**. It's remembered in the
browser until you switch it off. Set `TEST_MODE=off` in production to limit it to admins once the game is live.

**Faster timers for testing:** `GAME_SPEED=600 npm run dev` makes construction and training 600× faster
(ignored in production). Jump straight into a live fight with `/play?match=<id>`.

**Street Arena (live multiplayer):** run the realtime server next to the app and point the app at it:

```bash
npm run rt                                          # ws://localhost:8787 (uses AUTH_SECRET from .env)
NEXT_PUBLIC_RT_URL=ws://localhost:8787 npm run dev  # or put NEXT_PUBLIC_RT_URL in .env
npm run rt:smoke                                    # two scripted players: open-city fight, then a match with bots
npm run rt:sim -- bomb                              # a whole match of bots in simulated time (tdm | ffa | bomb)
```

Without `NEXT_PUBLIC_RT_URL` everything still works over HTTP: other drivers and soldiers through `/api/drive`,
fights in the open city through `/api/drive/arena`, and matches with other players hosted in a player's browser and
relayed through `/api/arena` (slower than the realtime server's 20 Hz, but real multiplayer). On phones far from the
server (Iran ↔ Vercel) each poll is one database round trip (a single SQL statement of CTEs), two polls overlap, and
other players' late corrections are eased in rather than snapped. For the least lag, run the functions and the
database in the region nearest your players: Frankfurt (Vercel `fra1`, Neon `aws-eu-central-1`) is about half the
round trip of the US east coast from Iran. `ARENA_PAID_MIN_S`
(default 60) is how long such a match must run before it pays. The soldier and gun models are generated in Blender from `assets/blender/arena.py`: `npm run assets:arena`
rebuilds `public/models/arena/*.glb` (add `-- preview.png` to render a preview).

**Fast checks:** `npm test` runs the unit tests, the typecheck and the translation check in about a minute.
`npm run test:unit` alone runs `tests/*.test.ts` with Node's own test runner (no browser, no database): opening hours
and name matching (`localData`), map styles (no keyed providers), the 3D city's buildings (materials, balconies,
mosques, a triangle budget) and game balance (guns by range, match prizes, medals, economy defaults).

**End-to-end tests (Playwright):** `npm run test:e2e` starts its own dev server on port 3200 against a separate
`streetquest_e2e` database (create it once: `docker compose exec db createdb -U postgres streetquest_e2e`; override with
`E2E_DATABASE_URL`) and runs two suites:
- `npm run test:e2e:api` — server behaviour: accounts, bans, referrals, admin access, the economy (daily, store, ads,
  selling), base building, claims, lobbies, runs, play-from-home travel, SEO/health/security headers, store data from
  Snappfood / Torob / Divar (served by a stub: menus, hours, reviews, walk-in stores and their catalogs), who's online —
  including double-tap races (two identical requests at once must never charge or pay twice).
- `npm run test:e2e:ui` — the game in a phone-sized Chrome: first visit, GPS on/off, bottom nav, store, double-tap on
  buttons, the marker following GPS. Uses your installed Google Chrome (`PW_CHANNEL=chromium` for Playwright's own).

Older smoke scripts (need the dev server running, ideally with `GAME_SPEED=600`): `npm run test:smoke`,
`npm run test:features` (settings, army delivery, bag multi-sell, goals, store, ads, GPS games, story) and
`npm run test:mp` (lobbies, squad runs, towers shooting players, C4, squads, skirmishes, raider waves, pings).

**Deployed and the store layers are empty?** Open `/api/health?ext=1`: it says whether the server can reach Snappfood,
Torob and Divar. Iranian sites often refuse servers abroad (Snappfood answers Vercel with 403) — run the relay in Iran
(*Deploy → Snappfood from abroad*) and point `SNAPPFOOD_URL` (or `TOROB_URL` / `DIVAR_URL`) at it, or host in Iran.

**Recorded sounds:** the game ships recorded street sounds built from free sources (CC0, public domain and CC BY,
and [fara-download.ir](https://fara-download.ir)'s sound effects — no licence stated, the site allows copying with a
link to the source, so each is credited with its page — all listed in `assets/sound-sources.json` and on `/credits`):
`npm run assets:sounds -- --fetch` downloads them and mixes each take (a crash is several hits layered: metal,
crumple, glass; a honk is cut from a longer recording; the engine starting is the starter cranking and then a rev).
To use your own recordings instead, read on — every street sound is synthesized until it has a recording. The slots
(`src/lib/soundSlots.ts`): `siren` (looped), `crashLight`, `crashHeavy`, `glass`, `horn`, `explosion`, `fire` (looped),
`skid`, `thud`, `city` (street ambience, stereo loop), `carAlarm` (a parked car you hit or shoot), `carLock` (the
remote's chirp as you walk away from your car), `doorOpen` / `doorClose` (getting in and out) and `engineStart`. Put recordings you're licensed to ship — e.g. downloaded with
a [soundsnap.ir](https://soundsnap.ir) subscription (its free previews are watermarked; don't use those) — in
`assets/sounds/<slot>/` (any of wav / mp3 / ogg / flac / aiff / m4a; several files = random variations) and run
`npm run assets:sounds` (needs `ffmpeg`): it trims leading silence, cuts one-shots short, loudness-matches everything
(EBU R128), and writes `public/sounds/<slot>-<n>.mp3` plus `public/sounds/manifest.json` — commit those. `--check`
lists which slots have files and the words to search for. Sources stay out of git (`assets/sounds/` is ignored); a slot
without a file keeps its synth, so nothing goes silent.

**On your phone:** GPS only works on `https://` or `localhost`. Run `npm run tunnel` and open the
`https://….trycloudflare.com` link it prints.

**What people say (Persian and English voices):** the lines are in `src/lib/street/barks.ts` (Tehrani Persian with English
subtitles; women have their own wording of most lines — «وا! یعنی چی؟ نوبت منه!», «سلام عزیزم!»: running from gunfire, the driver whose car you hit, a pedestrian you nearly ran over, a hello in passing, the
police megaphone and orders). They're recorded once, free, and shipped as small files (players download nothing extra). The easy way: with
`npm run dev` running, open `/dev/voices` and press *Make all the voices* — [Piper](https://github.com/rhasspy/piper)
runs in your browser as WebAssembly and saves each line into `assets/voices/raw/` (its runtime and the Persian
models, ~150 MB, come from the dev server — it downloads them once into `assets/voices/lib/`, since the CDNs often cut a
big download off from Iran); then `npm run assets:voices -- --from=assets/voices/raw`. Or record them yourself (or with any
TTS): `assets/voice-lines.tsv` lists every line with its file name, and `npm run assets:voices -- --import=<folder>`
takes those files. Or with the Piper command line: `npm run assets:voices -- --download` (`PIPER=/path/to/piper`), in Piper's Persian
voices — amir (men) and gyro through a megaphone (police) — and, for women, Mycroft Mimic 3's Persian woman's voice
«haaniye» (CC0; Piper has none), run on the same engine at `/dev/voices` (`src/app/dev/voices/haaniye.ts`)
— into `public/sounds/voice/` plus its `manifest.json`; commit those. The models (60 MB each) are downloaded once into
`assets/voices/` (ignored). Without recordings, the server speaks the lines: set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` (Azure's Persian
neural voices, Farid for men and the police, Dilara for women; the free tier covers every line many times) or
`OPENAI_API_KEY` (gpt-4o-mini-tts told to speak Tehrani Persian). `/api/tts` speaks only the game's own lines, each at
an address with its own hash, and answers with a year-long immutable cache header — Vercel's CDN and every phone keep
it, so each line is made once per voice, ever (`src/server/tts.ts`). With neither, people still talk — a speech
bubble over their head — and a device with its own Persian voice (some Android phones) reads the line aloud.
**English voices** (for players not in Persian; `src/lib/street/voiceLang.ts`): the same lines in their English wording, recorded into
`public/sounds/voice/en/<id>-<voice>.mp3` (the manifest lists both languages; `voices.ts` picks by the player's locale; else the device's English
voice — a woman's for a woman, a man's for men and police, where its name tells —; else the bubble). Persian is unchanged. Exact steps for you
(Claude can't run Piper; you press the button):
1. `npm run assets:voices -- --models` — downloads the models (~60 MB each) and Piper's runtime into `assets/voices/lib/` (ignored), so the dev
   server serves them locally. Optional: the page fetches anything missing itself on first use.
2. `npm run dev`, open `http://localhost:3000/dev/voices`, choose the **English · en** tab, press **Generate all missing** (a progress bar shows;
   ⟳ redoes one line, ▶ plays the raw take, ▶▶ the shipped file to compare). Takes are saved in `assets/voices/raw/en/`.
3. `npm run assets:voices -- --from=assets/voices/raw --lang=en` (needs `ffmpeg`) — trims, levels and, for the police, puts a radio's band on them;
   it rewrites `public/sounds/voice/manifest.json`. Commit `public/sounds/voice/`.

Voices (every MODEL_CARD checked: public domain, CC0 or CC BY only, no NC): men *John* and *Norman* (public domain, LibriVox), women *LJ Speech*
(public domain) and *Alba* (CC BY 4.0, CSTR, University of Edinburgh — credit written into the manifest), police *Bryce* (public domain) through a
radio filter; each line's voice is fixed by its id. Piper itself is MIT. `assets/voice-lines.tsv` also lists the English file names.
**Street scenes:** every half a minute or so, when it's calm, something happens near you (`src/lib/street/scenes.ts`):
two strangers argue over who was first, two friends meet and go for tea, someone talks on the phone, a vendor calls
out (Hafez fortunes, cold water, ice cream), a shared taxi calls its route (Azadi! Vanak, one more!), a bag is
snatched and its owner shouts after the thief — the people stop, turn to each other and say their lines.

## How it works

| Area | Where |
|---|---|
| Strategy rules: factions, buildings, power, units, auto-resolved battles (pure, shared client/server) | `src/lib/rts.ts`, `src/app/api/{base,battle}` |
| RPG: classes/attributes/bonus folding, gear rolls, quests, General's Powers (pure) | `src/lib/{hero,gear,quests,powers}.ts`, `src/server/{hero,quests}.ts`, `src/app/api/{hero,powers}` |
| Territory: deterministic outposts per ~900 m cell, only ownership + garrison stored | `src/lib/outposts.ts`, `src/app/api/outposts` |
| Life sim: needs decay computed from a stored snapshot + timestamp, so no background jobs; mood multiplies XP in `grant()` | `src/lib/sims.ts`, `src/server/needs.ts`, `src/app/api/sims` |
| World bosses: deterministic per ~1.3 km region and 2 h window like spawns; only damage is stored. The killing hit pays every contributor | `src/lib/bosses.ts`, `src/server/boss.ts` |
| FPS: the arena is generated from the match seed on every client. Clients POST position + hits ~7×/s; the server owns HP, kills, capture and the result. The first live human is the *host* and runs bot/boss AI; if it goes quiet the next player takes over | `src/lib/arena.ts`, `src/server/match.ts`, `src/components/fps/Fps.tsx` |
| Squad-run lobbies (race / co-op): one lobby per run spawn, state advances whenever a member polls (~1×/s) | `src/lib/lobbies.ts`, `src/server/lobby.ts`, `src/app/api/lobby` |
| Street Empire: pure economy rules shared by client and server; the server settles the stored snapshot to "now" on every request (no background jobs), the client runs the same maths between syncs | `src/lib/idle.ts`, `src/server/empire.ts`, `src/app/api/empire`, `src/components/game/Empire.tsx` |
| Steps: accelerometer pedometer in the browser, batched reports capped by cadence per day, GPS-distance fallback in `/api/loc` | `src/components/game/steps.ts`, `src/lib/steps.ts`, `src/server/steps.ts`, `src/app/api/steps` |
| Art kit: icons as vector shapes + shared gradient materials, one lazily-filled SVG sprite; a MutationObserver swaps emoji text for art without touching React's text nodes | `src/components/art` |
| Tower defense: towers fire when a commander reports their position (`/api/loc` → `takeFire`), HP regenerates from a stored snapshot; raider waves are generated from a seed and fought by a deterministic simulation the server resolves once and clients animate | `src/lib/td.ts`, `src/server/td.ts`, `src/app/api/{towers,waves}` |
| Field armies: squad positions are interpolated from the march (from/to/depart/arrive), arrivals are settled lazily by whoever looks at the map; battles reuse the siege/outpost code with the squad as the attacking force | `src/server/{td,warfare}.ts`, `src/app/api/squads`, `src/components/game/LiveLayer.tsx` |
| Real places & 3D city: OpenStreetMap (Overpass) per ~450 m cell, cached in `CityTile` for a month, never waited on for long (the client draws a generated village meanwhile). `OVERPASS_URL` lists endpoints (`off` disables; admins can upload tiles with `POST /api/city`). Place jobs are deterministic per place and 30-min window, rebuilt from their id to verify | `src/lib/{city,places}.ts`, `src/server/{city,places}.ts`, `/api/{city,places}` |
| Store menus, prices & ads: Snappfood (a cell's whole vendor list — every vendor delivering there, read 400 a page — per ~1 km cell, 12 h; name search 12 h, top 3 hits checked by position; menus 6 h), Torob (search, shop by name / id, a shop's catalog via `shop_id`, 12 h), Divar (cities and neighbourhoods a week, each neighbourhood's latest ads per category 15 min, one ad in full 30 min) and Takhfifan (the nearby map per ~1 km cell 6 h, a store's page + deals and its comments 2 h; neighbourhood-name search as a fallback) cached in `ExtCache`, one fetch per key at a time, stale copy on failure. None has an official API — `SNAPPFOOD_URL` / `TOROB_URL` / `DIVAR_URL` / `TAKHFIFAN_URL` (`off` disables), admin switch *Menus, prices and ads from Snappfood, Torob and Divar*; *Places on the map* range / most at once | `src/lib/localData.ts`, `src/server/localData.ts`, `/api/local`, `/api/route`, `src/components/game/StoreInfo.tsx`, `GameMap.tsx` |
| 3D drive: three.js, one merged mesh set per tile (toon walls with lit windows, roofs, roads, parks, instanced trees), arcade car physics with building collisions, tiles streamed around the car; the car's position feeds play-from-home travel (server cap `driveSpeedKmh`). Traffic and pedestrians are instanced per model / body part (`fleet3d.ts`, `people.ts`) | `src/components/drive`, `src/lib/{fleet,vehicles}.ts` |
| 3D graphics: `GraphicsEngine` owns the WebGL renderer — tier from `detectTier(caps)` (or the player's pick, `sq_gfx_quality`), dynamic resolution and effect stripping by `Adaptive` (median/p90 frame time per 60 frames, holds when steps don't help), context-loss recovery. High/Ultra render into a half-float 4× MSAA target, then SSAO from the resolved depth (normals rebuilt from depth, no second scene pass, bilateral blur), a 5-mip dual-filter bloom and one final pass (clamped sharpening by render scale — `lib/view.ts` `sharpenFor` —, chromatic aberration, sun shafts and flare, ACES as three.js does it, white balance, saturation, contrast, split toning, optional 3D LUT, vignette, grain). Before it, on `ssr` tiers: screen-space reflections (materials write 1 − mirror into the HDR target's alpha via `shaders.ts` `mirrored`; a 22-step growing ray march with 4 refinement steps, premultiplied by confidence × Fresnel, then a 3×3 tent composite). On `cinematic` tiers: depth-reprojected camera motion blur (8 taps, near pixels masked out) and ¼-size sun shafts (sky mask + two radial blurs); after it, on the light pipeline (medium), FXAA. Colours meant for the screen as-is (fog, night gradient sky, horizon mountains) go through the exact ACES inverse so both paths look alike. Materials are patched per tier (`patchShader`): façade relief/roughness/metal arrays and interior-mapped rooms behind the glass, world-planar asphalt and slabs with wetness and puddles, worn road paint, stain decals that leave the HDR alpha (mirror) alone, wind, lamp pools that fade near the real lights; car paint/glass/trim/wheels (`carLook.ts`, applied inside fleetDamage's `withDents` wrapper); time of day from the solar position (`daylight.ts`), the sky's environment map re-rendered only when it visibly changes. Shaders never stall a frame: `warmup.ts` ShaderGate looks over the scene right before it's drawn (with the HDR target bound) and builds a new material's program in the background (KHR_parallel_shader_compile), holding that mesh back (layer mask 0) for the frame or two it takes; your own car's new model is readied off screen before it's swapped in. Tile bounding spheres are measured in the build worker, the horizon mountains retry failed elevation tiles once a minute (not every frame), and traffic/people re-read the streets only between tile batches, on separate frames | `src/components/drive/graphics/{engine,quality,caps,post,shaders,surfaces,weather}.ts`, `src/lib/daylight.ts` |
| Storefronts & cinema billboards in the 3D city: every store gets a lit sign — all signs in ONE texture atlas drawn by ONE instanced mesh (a per-instance atlas window and lamp level via `patchShader`; the real name in the Persian font, shaped right-to-left by the canvas; text only within ~80 m, farther signs are a coloured bar), tinted by one of 12 kinds (`storeKind` folds OSM classes, place categories, Snappfood kinds and the Persian name into restaurant/fast food/café/bakery/sweets/market/produce/butcher/pharmacy/fashion/tech/general). The nearest fronts are dressed (striped awning, display window that glows at night or a rolled shutter when shut by the store's real hours — else the kind's typical hours —, crates, menu board, neon cup, clothes rail, screen) with steam over food places, stuttering neon and the pharmacy's turning cross; counts capped per tier (`storefrontCap`; lite/low have no or few steam puffs). Slow down by one and the chip under the street name reads its Snappfood/Torob/Takhfifan data (one `/api/local` request, shared with the sheet via `useLocal`'s 60 s cache; only after 0.7 s by a store), a floating panel pops up by its door (rating, open now, deal, first menu lines; reduced-motion aware) and its sign gets the logo and a deal tag; tap the sign or chip for the sheet (photo carousel, hours, deals, full menu/reviews/info with toman prices, order links). Cinemas get a roadside billboard (truss, catwalk, flood lamps; chasing marquee bulbs; posters cross-fading every ~6 s with that film's next sessions — time, hall, toman — beside them; lit at night with a pool of light on the pavement); tapping it opens the cinema card with the tickets link | `src/components/drive/{storefronts,StoreCard,cinemaBoards}.ts(x)`, `src/lib/{storeKinds,cinemaBoard}.ts`, `src/app/storefront.css` |
| Street Arena without the realtime server: the host's browser runs the hub; players poll `/api/arena` (two requests in flight, a poll every 150 ms; each poll one SQL statement): their trail (last ~0.7 s of samples, lat/lng on the host's clock) is written to `ArenaPeer` and read by everyone, the referee's messages wait in `ArenaMsg` until acknowledged, the host's snapshots (bots, health, teams) sit on `ArenaRoom`. Party members see each other on the realtime server too (a pair counts when both list each other) | `src/lib/arena/relay.ts`, `src/components/arena/{relay,rt}.ts`, `src/server/arenaRelay.ts` |
| Street Arena: a separate Node WebSocket server (`realtime/`) holds everyone in memory — no database. The app signs a 10-min ticket (`/api/rt/ticket`: who you are, friends, virtual or real GPS); results come back HMAC-signed (`/api/rt/result`, paid once per match, daily cap). Binary state 20×/s each way, positions in each client's own local metres, interest management (600 m, same privacy rules as the HTTP presence). Hits: the client draws them at once, the server referees with lag compensation (targets rewound ≤ 350 ms), fire-rate/ammo/range checks and, in matches, line of sight through the real buildings (the host's client sends the arena's streets and footprints). Bots walk a street graph built from the same map | `realtime/`, `src/lib/arena`, `src/components/arena`, `/api/rt` |
| Social: posts/follows/likes/comments; game-made posts store a translatable template so each reader sees their language; photos at `/post-img/<id>` | `src/server/social.ts`, `/api/social`, `src/components/game/Social.tsx` |
| Businesses: claim on the spot (≤150 m), campaigns limited by plan, check-in ≤80 m, 6-char coupon codes redeemed once by the owner; plans paid through the same Stripe Checkout + webhook as gems (`biz:<plan>:<id>` purchases) | `src/lib/business.ts`, `src/server/business.ts`, `/api/business`, `src/components/game/Business.tsx` |
| Spawns: deterministic per ~450 m cell and 20-min window, so everyone sees the same world with zero storage; the server rebuilds a spawn from its id to verify claims | `src/lib/spawns.ts` |
| Time of day: local *solar* time decides night/dawn/day/dusk items and golden-hour 2× XP anywhere on Earth; daily streaks reset at the player's own midnight | `src/lib/geo.ts`, `src/lib/progression.ts` |
| Anti-cheat: claims use the server's trusted position, GPS jumps faster than 250 km/h are rejected | `src/app/api/loc`, `src/server/rewards.ts` |
| Live layer (serverless-friendly): position + presence via `/api/loc`, notifications + unread via `/api/sync` (polled every 4 s), chat polled every 3 s. "Online" = pinged in the last 90 s | `src/server/hub.ts`, `src/app/api/{loc,sync,chat}` |
| Deliveries: coins in escrow → courier accepts → GPS check-in at pickup → handover code at drop-off | `src/app/api/deliveries` |
| Live settings: every tunable has a default in `lib/settings.ts`; admin overrides are stored in `GameConfig`, loaded per server instance (15 s cache) and sent to clients with `/api/me`; `applyConfig()` updates the rule constants and catalog stats in place on both sides | `src/lib/{settings,config}.ts`, `src/server/settings.ts` |
| Goals: game events (every `questEvent`) feed per-user, per-faction and world counters per week | `src/server/goals.ts`, `/api/goals` |
| GPS games & story: targets generated server-side around the trusted position; hidden spots never sent to the client | `src/lib/story.ts`, `src/server/gpsgames.ts`, `/api/gpsgame` |
| Store, sponsor spots: Stripe Checkout over REST (no SDK), credited once per session by webhook or on return | `src/server/{store,ads}.ts`, `/api/{store,ads}` |
| Admin: KPIs, 7-day funnel, players (ban/role/gift), sponsored mission drops, banners, live push, moderation, UTM link builder | `/admin` |
| SEO: SSR landing with VideoGame + FAQ JSON-LD, public event pages with Event JSON-LD, sitemap, robots, OG image, PWA manifest | `src/app` |
| Marketing: `?ref=` referrals (+150 coins each), UTM attribution stored when the guest account is created, first-party page-view/share tracking | `src/middleware.ts`, `/api/track` |

## Deploy

### Vercel
1. Push this repo to GitHub, then on vercel.com: **Add New → Project → import the repo**.
2. In the project: **Storage → Create Database → Neon (Postgres)** and connect it. That sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET` (`openssl rand -base64 32`),
   `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-app.vercel.app`) and `ADMIN_KEY` (any long secret).
4. **Deployments → Redeploy**. Every build runs `scripts/db-sync.mjs`, which creates/updates the tables
   (and fails the build with a clear message if no database is connected).
5. Open `https://your-app.vercel.app/api/health` — it says exactly what's missing if anything is wrong.

### Render
1. Push to GitHub, then on render.com: **New → Blueprint** and pick the repo. `render.yaml` creates
   the web service + Postgres and generates `AUTH_SECRET`.
2. Set `NEXT_PUBLIC_SITE_URL` to your `https://….onrender.com` URL when prompted.
3. The blueprint also creates `streetquest-realtime` (Street Arena). Set its `APP_URL` to the web app's URL and
   `RT_ORIGINS` to the same origin, and set the web app's `NEXT_PUBLIC_RT_URL` to `wss://<realtime-service>.onrender.com`,
   then redeploy the web app (NEXT_PUBLIC_ values are baked in at build time). It shares the web app's `AUTH_SECRET`.
4. Note: free web services sleep after 15 min idle (slow first load) — use a paid instance for the realtime server, or
   players wait for it to wake — and free Postgres expires after 30 days.

**On Vercel**, the app can't hold WebSockets: run `npm run rt` anywhere that can (Render, Fly.io, Railway, a VPS) with
`AUTH_SECRET` (same as the app), `APP_URL` and `RT_ORIGINS`, and set `NEXT_PUBLIC_RT_URL` on Vercel.

After the first deploy, play once, then open `/admin?key=<ADMIN_KEY>` to make yourself admin.
Don't run the demo seed in production.

### Iranian sites from abroad: the relay (ArvanCloud)
Snappfood refuses servers outside Iran: on Vercel the map shows no restaurants and no menus, and `/api/health?ext=1`
says `snappfood (403)`. Browsers can't read it either (it only allows its own sites). `relay/relay.mjs` is a small
relay with no dependencies (any Node 18+) that runs on a server in Iran; the app reads Snappfood through it.
1. In the ArvanCloud panel, create a **Cloud Server** in an Iranian region with **Ubuntu 24.04** (the smallest size is
   plenty) and make sure port 80 is open in its security group.
2. From the repo: `scp relay/relay.mjs relay/install.sh <user>@<server-ip>:` then
   `ssh -t <user>@<server-ip> sudo bash install.sh`. It installs Node from Ubuntu's mirror, runs the relay as a service
   on port 80 with a random key (kept in `/etc/streetquest-relay.env`), checks that Snappfood answers the server
   (`200 = good`) and prints the `RELAY_URL` to use. Run it again to update the relay; the key stays. Or, once
   `ssh-copy-id <user>@<server-ip>` has put your key on the server, `npm run relay:deploy` does all of it
   (`RELAY_SSH=<user>@<server-ip>` in `.env`, `scripts/relay-deploy.sh`).
3. HTTPS (recommended — the key is part of the URL): put a (sub)domain on **ArvanCloud CDN** with an A record to the
   server, going through the CDN with HTTPS on. The relay marks every answer `no-store`, so the CDN doesn't cache them.
4. On Vercel: `vercel env add RELAY_URL production` = `https://<domain>/<key>` (or the `http://<ip>/<key>` the script
   printed), then redeploy. `/api/health?ext=1` should say `snappfood` `200`. (An older `SNAPPFOOD_URL=…/<key>/snappfood`
   keeps working and wins over `RELAY_URL` for Snappfood.)

Since **relay v2** it is generic, so new features never need it redeployed: `/<key>/https/<host>/<path>` reaches any
public HTTPS site (the app builds these from `RELAY_URL`, `src/lib/relayUrl.ts`), and the named addresses
(`/<key>/snappfood`, `/torob`, `/divar`, `/takhfifan`, `/balad`, `/baladpoi`, `/cinematicket`) forward any path. Which
sites go through it is `RELAY_FOR` on the app (default `snappfood`; e.g. `snappfood,torob,divar`, or `all`) — a site
that starts refusing Vercel is one env change. It is still not an open proxy: a wrong key is a 404; it never connects to
a private, loopback or link-local address (checked after DNS and pinned, so the other services on the server stay out of
reach); `RELAY_HOSTS` on the server can narrow the generic route to a list of domains; it passes the app's User-Agent,
Accept*, Content-Type and Referer/Origin and nothing about the player (no cookies, authorization or forwarded-for — a
header a site needs is sent as `x-relay-<name>` and passed on as `<name>`); bodies up to 1 MB; cookies are dropped,
answers are `no-store`, redirects aren't followed, and no query string (positions) is logged. `GET /health` says its
`version`. Tests `tests/relay.test.ts`, `tests/relayUrl.test.ts`.

## Production checklist

- **Installable app & offline:** `/sw.js` (service worker) caches the app, map tiles you've seen and your last game
  state, so the game opens offline. It also keeps the heavy files on the phone so a launch never downloads them again:
  fonts, the arena's 3D models and the 3D decoder (fetched in the background on install and every launch), and the
  3D city's street maps you've driven through (vector tiles a week, city-pack detail a day). The app asks the browser
  for persistent storage so Android doesn't clear it when space runs low. Every deploy gets a new version id, and
  players see "New version ready → Update". *Later* keeps the bar away for 6 hours (across reloads), and an update
  that couldn't take over (the old version kept the page busy) isn't offered again in a loop: it waits 30 min, then
  longer each time, and the new version takes over by itself the next time the app is opened (`lib/updatePrompt.ts`). Offline, every message is in the player's language: the worker's
  "offline" answer is shown as the app's own translation (`x-offline`), and picking another language re-fetches the
  offline page and the game shell it keeps.
  A long-press on the installed icon offers shortcuts: Play, Story missions (`/play?panel=play`) and Drive the 3D city
  (`/play?drive=1`, straight into the car once there's a position to start from).
- **Push notifications:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
  (`npx web-push generate-vapid-keys`). Every in-game notification is also pushed to the phone when the player isn't
  in the app; Admin → Campaigns → live push can send to everyone. iPhone needs the app added to the Home Screen
  (iOS 16.4+).

- **Real ads (Google AdSense):** sign up at adsense.google.com with your production domain, then apply for
  **H5 Games Ads** (AdSense → Ads → By site → H5 games). Set `ADSENSE_CLIENT="ca-pub-…"` and redeploy: `/ads.txt`
  is served automatically and the store's *Free gems* button plays a Google rewarded video first. Where Google has no
  ad (Iran and other sanctioned countries, ad blockers, frequency caps) players get your sponsor spot instead, so the
  button always works. `ADSENSE_TEST=on` shows Google's test ads while you try it. Admin → Game settings → Store & ads
  → *Google video ads on* switches it live; views are counted as "Google video ads" in Admin → Revenue.

- **City packs (3D street detail and real places):** `npm run city:pack:prod -- iran` (the whole country — every town
  and the roads between them, ~118k places in ~35k cells, ~4 min to read; or single cities: `tehran karaj mashhad
  isfahan shiraz tabriz`) reads production settings from `.env.prod` (a copy of `.env` with the production
  `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; git-ignored — keep `.env` on your local database; its values win over
  `.env`, and the first line printed is the database it writes to) and Geofabrik's daily Iran extract and stores every mapped tree, traffic
  light, crossing, bus stop, bench, fountain and sports pitch per cell (`CityDetail`), and every named restaurant, café,
  shop and park (`CityTile.pois`) — without it, places only arrive with an Overpass tile, which is often busy. `--top 3` builds the three places with the most
  active players (any country — the right extract is found automatically), `--list` shows what's built and where
  players are. Re-run weekly to pick up map edits.
- **Live traffic:** comes from players' real GPS (shown only where 2+ players drove in the last 15 min) and, with
  `NESHAN_API_KEY`, from Neshan's live routing where players are looking and from every 🧭 route. The key needs the
  **Direction** service enabled in the Neshan panel — `/api/traffic` reports `"neshan": "no-access"` until it is.
  The 2D map draws it as short dashes per direction (green → dark red by speed), refreshed every minute.
  AI cars drive the real streets at those speeds and stop at the traffic lights, which run one 40 s cycle on the
  clock (north–south first) so every player sees the same lights.
- **Mountain skyline:** `/api/dem` proxies Terrarium elevation tiles (AWS open terrain data, cached for a month;
  `DEM_TILE_URL` to use another source) for the real mountains on the horizon — Alborz, Tochal and Damavand from
  Tehran. The streets themselves are still flat.
- `/api/health` must say `"ok": true`.
- Set `CRON_SECRET` on Vercel — `vercel.json` schedules `/api/cron/cleanup` daily (prunes old notifications,
  lobbies, pings, waves, matches and superweapon launches; refunds expired bounties).
- Use a **pooled** database URL for `DATABASE_URL` when you have one; on Vercel the app also caps each
  instance at 1 connection (`DB_CONNECTION_LIMIT`) so a direct URL doesn't run out of connections.
- `NEXT_PUBLIC_SITE_URL` falls back to Vercel's production domain, but set it if you use a custom domain.
- Security headers (HSTS, nosniff, frame, referrer, permissions) and `no-store` on the API are set in
  `next.config.ts`. Client crashes show a recover screen and are recorded as `client_error` metrics.

## Before going big

- Real places / 3D city: public Overpass servers are slow and rate-limited. Tiles are cached a month per cell, but at
  scale run your own Overpass and point `OVERPASS_URL` at it. City packs cover places in the packed cities meanwhile.
- Store menus and ads: Snappfood, Torob and Divar are read through their unofficial web APIs, which can change or
  block servers outside Iran without notice — store cards then simply show no menu, and the map no vendors or ads.
  Check `/api/local?near=1&lat=35.7&lng=51.4` and `/api/local?divar=1&lat=35.7&lng=51.4` from the production server
  after deploying. Re-run the city packs (`npm run city:pack:prod -- iran`)
  so production places carry their contacts.
- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia. It replaces the
  default street tiles (fantasy, street, night ops and the filtered looks); the satellite, terrain and CARTO styles
  use the free public servers of Esri, OpenTopoMap, CARTO and OSM France — fine for light use, check their terms
  before heavy traffic.
- Chat/notifications poll every few seconds. For instant delivery at scale, plug in a hosted
  realtime service (Ably, Pusher, Supabase Realtime) behind `notify()` and the chat route.
- Street Arena runs in one realtime process (in memory). One instance handles a few thousand players; past that,
  shard by region (each instance owns an area; route players with the ticket). Anti-cheat is server-refereed but
  movement is client-reported (speed-capped, no walking through buildings in matches), so it's casual-grade, not
  competitive: aim itself can't be verified. In the open city the server doesn't know the buildings, so shots
  there aren't checked for walls.
- Switch `prisma db push` in the build to `prisma migrate deploy` once you have real data.
