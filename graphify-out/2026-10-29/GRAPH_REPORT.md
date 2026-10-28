# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~326,796 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2944 nodes · 9906 edges · 102 communities (92 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `85d34522`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- server/hub.ts
- t
- idle.ts
- .onMsg
- http.ts
- Drive.tsx
- msg
- Game.tsx
- server/arena.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- db.ts
- DriveGarage.tsx
- react
- lib/places.ts
- GameMap.tsx
- vehicles3d.ts
- Drive
- Market.tsx
- gpsgames.ts
- distanceM
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- lib/city.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- I18nProvider.tsx
- Combat
- LatLng
- i18n/index.ts
- sfx.ts
- getT
- DetailSource
- geom.ts
- i18n-check.ts
- realtime/hub.ts
- reporter.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- lib/business.ts
- AdminLandmarks.tsx
- protocol.ts
- drive/landmarks.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Match
- report
- perf.ts
- Local Postgres 16 Service (db)
- DriveParty.tsx
- AdminSettings.tsx
- useLocation.ts
- server/empire.ts
- NearbyStore
- FootprintIndex
- Remotes
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- StorePins
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- server/steps.ts
- osm-pbf.ts
- health/route.ts
- i18n.ts
- avatar.ts
- Viewmodel
- Button
- CLAUDE.md
- course.ts
- @prisma/client
- drive/route.ts
- next.config.ts
- CombatHud.tsx
- sim.ts
- Player
- locationTracker
- vfx.ts
- tracker.ts
- RtClient

## God Nodes (most connected - your core abstractions)
1. `t()` - 373 edges
2. `HttpError` - 153 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 126 edges
5. `Button()` - 105 edges
6. `distanceM()` - 92 edges
7. `body()` - 87 edges
8. `prisma` - 83 edges
9. `api()` - 79 edges
10. `fmtNum()` - 78 edges

## Surprising Connections (you probably didn't know these)
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts

## Import Cycles
- None detected.

## Communities (102 total, 10 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (76): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artHtml(), artSvg(), EMOJI_RE (+68 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.16
Nodes (18): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+10 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.09
Nodes (39): GET, POST, Schema, GET, Send, GET, POST, Schema (+31 more)

### Community 4 - "t"
Cohesion: 0.07
Nodes (81): POST, Schema, Details, mine(), POST, Schema, POST, GET (+73 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (41): BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard(), View, ALL_AT (+33 more)

### Community 6 - ".onMsg"
Cohesion: 0.18
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 7 - "http.ts"
Cohesion: 0.07
Nodes (50): next, zod, AdminPage(), keyMatches(), POST, POST, POST, Schema (+42 more)

### Community 8 - "Drive.tsx"
Cohesion: 0.06
Nodes (65): three, artFor(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+57 more)

### Community 9 - "msg"
Cohesion: 0.14
Nodes (14): manifest(), GET(), ART, dynamic, FAQ, FEATURES, Home(), metadata (+6 more)

### Community 10 - "Game.tsx"
Cohesion: 0.06
Nodes (70): Art(), ArtAnim, load(), requestRewarded(), Drive, Game(), GameMap, MapLook (+62 more)

### Community 11 - "server/arena.ts"
Cohesion: 0.17
Nodes (18): FireMsg, weaponOf(), FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_AIM, F_FIRE, damageAt() (+10 more)

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (27): How it works, Style, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut() (+19 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.13
Nodes (25): CHECKPOINT_M, checkPoints(), COIN_M, COUNTDOWN_MS, isPartyCode(), newPartyCode(), PARTY_GAMES, PARTY_IDLE_MS (+17 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (22): AutoVideo(), Props, AdBreak, AdNetwork, Placement, RewardedAd, W, AdOffer (+14 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.07
Nodes (30): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+22 more)

### Community 17 - "db.ts"
Cohesion: 0.08
Nodes (30): GET, GET, GET, GET, POST, Schema, Details, GET (+22 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 19 - "react"
Cohesion: 0.09
Nodes (29): react, isThenable(), Props, Me, HELP, helpSeen(), markHelpSeen(), seenKey() (+21 more)

### Community 20 - "lib/places.ts"
Cohesion: 0.07
Nodes (35): Rarity, villageTile(), CELL_DEG, cellOf(), hashStr(), rng(), DROP_PREFIX, MONEY_BUCKET_MS (+27 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (36): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+28 more)

### Community 22 - "vehicles3d.ts"
Cohesion: 0.23
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 23 - "Drive"
Cohesion: 0.10
Nodes (10): ArenaMenu(), useCombat(), Drive(), Markers, DriveNet, angle(), Others, tagColor() (+2 more)

### Community 24 - "Market.tsx"
Cohesion: 0.08
Nodes (58): askConfirm(), Opts, queue, Req, Dashboard(), fmtTime(), fmtCountdown(), LotteryCard() (+50 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "distanceM"
Cohesion: 0.09
Nodes (47): Action, GET, layDrops(), POST, POST, Schema, POST, Schema (+39 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.11
Nodes (33): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+25 more)

### Community 28 - "skyline.ts"
Cohesion: 0.23
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.08
Nodes (46): GET, POST, Schema, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry (+38 more)

### Community 30 - "lib/city.ts"
Cohesion: 0.16
Nodes (18): centroid(), CityPitch, fromOverpass(), heightOf(), NAMED_COLOURS, osmColour(), OsmEl, OsmPt (+10 more)

### Community 31 - "server/city.ts"
Cohesion: 0.20
Nodes (24): overpassQuery(), tileKey, tileOf(), cellKey(), backoffMs(), due(), endpoints(), fetchTile() (+16 more)

### Community 32 - "social/route.ts"
Cohesion: 0.08
Nodes (42): GET, Schema, GET, GET, Point, Schema, GET, num() (+34 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (15): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+7 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.07
Nodes (22): admin, app, arena, call, common, data, drive, empire (+14 more)

### Community 35 - "server/business.ts"
Cohesion: 0.11
Nodes (30): POST, Schema, GET, GET, POST, Schema, spendGems(), POST() (+22 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.12
Nodes (25): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+17 more)

### Community 38 - "LatLng"
Cohesion: 0.09
Nodes (33): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+25 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.09
Nodes (27): days(), dynamic, GET, ACTIVE, GET, live(), Point, pub (+19 more)

### Community 40 - "sfx.ts"
Cohesion: 0.07
Nodes (49): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+41 more)

### Community 41 - "getT"
Cohesion: 0.17
Nodes (17): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+9 more)

### Community 42 - "DetailSource"
Cohesion: 0.14
Nodes (9): Before going big, Deploy, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel, DetailSource (+1 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (18): Avatar, FootBody, aimDir(), BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, eyeHeight() (+10 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "realtime/hub.ts"
Cohesion: 0.15
Nodes (8): Hub, MatchResult, Sock, encodeSnap(), LL, q16(), State, wrap()

### Community 46 - "reporter.ts"
Cohesion: 0.28
Nodes (7): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent

### Community 47 - "package.json"
Cohesion: 0.11
Nodes (18): engines, node, name, private, type, version, @mapbox/vector-tile, prisma (+10 more)

### Community 48 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "arena.py"
Cohesion: 0.08
Nodes (25): anim(), ball(), box(), clear_pose(), cyl(), death(), finish(), gait() (+17 more)

### Community 50 - "StreetQuest — how it makes money"
Cohesion: 0.22
Nodes (8): 1. What's already built and can charge today, 2. What to add next (in order of money per week of work), 3. Later: bigger, slower bets, 4. Getting the first 100 paying stores, 5. A rough model (illustrative only, not a forecast), 6. Costs and risks to plan for, Plan design (in `src/lib/business.ts`), StreetQuest — how it makes money

### Community 51 - "Panels.tsx"
Cohesion: 0.06
Nodes (47): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, WorldDelivery (+39 more)

### Community 52 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.15
Nodes (21): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+13 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (42): Identity, Sample, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY (+34 more)

### Community 55 - "drive/landmarks.ts"
Cohesion: 0.10
Nodes (18): disposeModel(), Entry, Landmarks, Body, cellOf(), CollisionWorld, Controls, forward() (+10 more)

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (41): BOT_NAMES, Brain, SKILL, Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, ARENA_REWARDS_PER_DAY (+33 more)

### Community 57 - "pedometer"
Cohesion: 0.20
Nodes (5): MotionPerm, pedometer, Snapshot, StepStatus, useSteps()

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, assets:arena, build, city:pack, db:push, db:seed, dev, i18n:check (+12 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "Match"
Cohesion: 0.15
Nodes (7): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView

### Community 62 - "report"
Cohesion: 0.20
Nodes (19): POST, gridSpot(), isPaint(), footFlags(), assertCanParty(), createParty(), isVirtual(), joinParty() (+11 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "DriveParty.tsx"
Cohesion: 0.18
Nodes (12): Friend, GAMES, Invite, MEDAL, Props, Resp, allowedVehicle(), isVehicle() (+4 more)

### Community 66 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminRevenue, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 67 - "useLocation.ts"
Cohesion: 0.25
Nodes (5): LocationReporter, LocationSnapshot, GeoState, serverSnapshot, useLocation()

### Community 68 - "server/empire.ts"
Cohesion: 0.15
Nodes (25): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, BUSINESSES, buyCost() (+17 more)

### Community 70 - "FootprintIndex"
Cohesion: 0.19
Nodes (4): Nav, Node, FootprintIndex, ArenaGeo

### Community 71 - "Remotes"
Cohesion: 0.21
Nodes (4): loadSoldier(), Remotes, RosterEntry, SnapEntity

### Community 72 - "server/landmarks.ts"
Cohesion: 0.13
Nodes (27): Action, Fields, GET, Meta, POST, PUT, BUDGET, BUDGET_LABEL (+19 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.07
Nodes (37): camFwd, CombatHost, CombatInput, FeedLine, HttpMe, SENS_TOUCH, store, v3 (+29 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "StorePins"
Cohesion: 0.25
Nodes (3): pinTexture(), StorePins, Trade

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.12
Nodes (35): GET, POST, Schema, POST, Schema, POST, POST, Schema (+27 more)

### Community 83 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 84 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 85 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 86 - "i18n.ts"
Cohesion: 0.22
Nodes (12): fa, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware() (+4 more)

### Community 87 - "avatar.ts"
Cohesion: 0.12
Nodes (14): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+6 more)

### Community 89 - "Button"
Cohesion: 0.11
Nodes (60): Button(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Data, Details, DetailsForm() (+52 more)

### Community 91 - "course.ts"
Cohesion: 0.25
Nodes (8): layCourse(), P, Roads, samples(), RoadKind, COIN_POINTS, PartyGame, RACE_POINTS

### Community 92 - "@prisma/client"
Cohesion: 0.25
Nodes (6): lat, lng, prisma, start, bcryptjs, @prisma/client

### Community 93 - "drive/route.ts"
Cohesion: 0.40
Nodes (5): DELETE, LatLng, POST, Schema, park()

### Community 95 - "CombatHud.tsx"
Cohesion: 0.25
Nodes (9): CombatHud, clock(), CombatHud(), MatchBar(), nil(), Scoreboard(), WEAPON_ICON, ActButton() (+1 more)

### Community 96 - "sim.ts"
Cohesion: 0.20
Nodes (9): buildings, F, host, log, m, mode, now, ORIGIN (+1 more)

### Community 98 - "Player"
Cohesion: 0.10
Nodes (5): Player, Space, World, isMode(), WeaponKey

### Community 101 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 108 - "tracker.ts"
Cohesion: 0.23
Nodes (11): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+3 more)

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 768 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `idle.ts`, `.onMsg`, `http.ts`, `Drive.tsx`, `msg`, `Game.tsx`, `server/arena.ts`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `db.ts`, `DriveGarage.tsx`, `react`, `GameMap.tsx`, `Drive`, `Market.tsx`, `gpsgames.ts`, `distanceM`, `lib/settings.ts`, `social/route.ts`, `layout.tsx`, `server/business.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `sfx.ts`, `getT`, `geom.ts`, `Panels.tsx`, `AdminLandmarks.tsx`, `match.ts`, `report`, `perf.ts`, `DriveParty.tsx`, `AdminSettings.tsx`, `server/empire.ts`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `server/places.ts`, `Button`, `CombatHud.tsx`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07448107448107448 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `t`, `Drive.tsx`, `Game.tsx`, `tiles.ts`, `DriveGarage.tsx`, `lib/places.ts`, `GameMap.tsx`, `vehicles3d.ts`, `Market.tsx`, `distanceM`, `skyline.ts`, `server/city.ts`, `Combat`, `LatLng`, `sfx.ts`, `DetailSource`, `geom.ts`, `drive/landmarks.ts`, `report`, `DriveParty.tsx`, `Remotes`, `arena/combat.ts`, `StorePins`, `Viewmodel`, `Button`, `course.ts`, `CombatHud.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `Player`, `.onMsg`, `Remotes`, `Drive.tsx`, `arena/combat.ts`, `geom.ts`, `RtClient`, `protocol.ts`, `Drive`, `match.ts`, `Viewmodel`, `Match`, `CombatHud.tsx`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._