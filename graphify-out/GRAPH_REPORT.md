# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 307 files · ~313,911 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2821 nodes · 9540 edges · 99 communities (87 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 212 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8684f1e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- t
- server/hub.ts
- HttpError
- idle.ts
- AdminLandmarks.tsx
- http.ts
- world3d.ts
- server/places.ts
- Rewards.tsx
- Panels.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- me/route.ts
- lib/city.ts
- db.ts
- Match
- client.ts
- AdminPanel.tsx
- GameMap.tsx
- others.ts
- Landmarks
- Market.tsx
- gpsgames.ts
- server/money.ts
- tileMesh.ts
- Play.tsx
- lib/settings.ts
- gunsound.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- i18n/index.ts
- Combat
- Drive.tsx
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- Drive
- i18n-check.ts
- DrivePad.tsx
- LatLng
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- world/route.ts
- server/empire.ts
- Game.tsx
- protocol.ts
- i18n.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Player
- geom.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- server/arena.ts
- LocationReporter
- pins.ts
- NearbyStore
- DriveNet
- physics.ts
- alerts.ts
- arena/combat.ts
- AdminDropMap.tsx
- allowScripts
- msg
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- ads.ts
- vercel.json
- vfx.ts
- rng
- avatar.ts
- server/steps.ts
- markers.ts
- rooms.ts
- Button
- CLAUDE.md
- geo.ts
- locationTracker
- .shoot
- Viewmodel
- sim.ts
- .onMsg
- filter.ts
- smoke.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 367 edges
2. `HttpError` - 147 edges
3. `requireUser()` - 124 edges
4. `Drive()` - 118 edges
5. `Button()` - 105 edges
6. `distanceM()` - 90 edges
7. `body()` - 87 edges
8. `prisma` - 81 edges
9. `fmtNum()` - 78 edges
10. `api()` - 77 edges

## Surprising Connections (you probably didn't know these)
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts

## Import Cycles
- None detected.

## Communities (99 total, 12 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (79): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), ArtUse(), artFor(), artHtml() (+71 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (60): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+52 more)

### Community 2 - "t"
Cohesion: 0.21
Nodes (21): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+13 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.12
Nodes (31): GET, POST, Schema, POST, Send, dynamic, GET(), short() (+23 more)

### Community 4 - "HttpError"
Cohesion: 0.09
Nodes (67): POST, GET, POST, POST, Schema, GET, Point, POST (+59 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (40): BUY_STEPS, clock(), EmpireTab(), fa(), money(), View, burst(), ALL_AT (+32 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.07
Nodes (51): Action, Fields, GET, Meta, POST, AdminLandmarks(), Biz, download() (+43 more)

### Community 7 - "http.ts"
Cohesion: 0.06
Nodes (57): bcryptjs, jose, zod, GET, POST, POST, Schema, POST (+49 more)

### Community 8 - "world3d.ts"
Cohesion: 0.11
Nodes (32): nameLines(), artImages, at(), Board, canvas(), curtain(), facade(), gradientSky() (+24 more)

### Community 9 - "server/places.ts"
Cohesion: 0.14
Nodes (26): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place, PLACE_BUCKET_MS (+18 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.08
Nodes (35): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+27 more)

### Community 11 - "Panels.tsx"
Cohesion: 0.07
Nodes (60): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+52 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (25): Cut, Style, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut() (+17 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (57): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+49 more)

### Community 14 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 15 - "me/route.ts"
Cohesion: 0.19
Nodes (17): GET, POST, Schema, GET, ACHIEVEMENT_BY_KEY, AchievementDef, DAILY_REWARD(), dayKey() (+9 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.07
Nodes (39): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, Geom (+31 more)

### Community 17 - "db.ts"
Cohesion: 0.08
Nodes (39): GET, GET, GET, POST, Schema, Fields, Schema, Details (+31 more)

### Community 18 - "Match"
Cohesion: 0.13
Nodes (8): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView, Team

### Community 19 - "client.ts"
Cohesion: 0.11
Nodes (18): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, ShopDeal, WorldDelivery, WorldEvent (+10 more)

### Community 20 - "AdminPanel.tsx"
Cohesion: 0.08
Nodes (35): ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt() (+27 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.12
Nodes (32): leaflet, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS (+24 more)

### Community 22 - "others.ts"
Cohesion: 0.13
Nodes (16): three, ADS, HIP, Driver, Snap, Walker, Cockpit, makeCockpit() (+8 more)

### Community 23 - "Landmarks"
Cohesion: 0.27
Nodes (3): disposeModel(), Landmarks, LandmarkView

### Community 24 - "Market.tsx"
Cohesion: 0.10
Nodes (41): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), fmtCountdown(), Browse() (+33 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.07
Nodes (52): lat, lng, prisma, start, @prisma/client, GET, here(), POST (+44 more)

### Community 26 - "server/money.ts"
Cohesion: 0.19
Nodes (22): cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell(), MoneyPickup (+14 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.09
Nodes (32): Job, AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), dashes() (+24 more)

### Community 28 - "Play.tsx"
Cohesion: 0.08
Nodes (34): react, ArtAnim, AutoVideo(), Props, DialogHost(), Opts, queue, Req (+26 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.08
Nodes (43): PUT, Action, GET, layDrops(), POST, ITEM_BY_KEY, ItemDef, ITEMS (+35 more)

### Community 30 - "gunsound.ts"
Cohesion: 0.30
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 31 - "server/city.ts"
Cohesion: 0.14
Nodes (31): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), TILE_V (+23 more)

### Community 32 - "social/route.ts"
Cohesion: 0.11
Nodes (30): POST, Schema, GET, num(), Schema, levelForXp(), hit(), respawn() (+22 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (16): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+8 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.07
Nodes (22): admin, app, arena, call, common, data, drive, empire (+14 more)

### Community 35 - "server/business.ts"
Cohesion: 0.09
Nodes (40): Details, GET, mine(), POST, Schema, POST, Schema, spendGems() (+32 more)

### Community 36 - "i18n/index.ts"
Cohesion: 0.10
Nodes (35): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+27 more)

### Community 38 - "Drive.tsx"
Cohesion: 0.09
Nodes (32): HttpMe, RT_DELAY_MS, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+24 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.13
Nodes (18): GET, pub, Schema, ACTIVE, GET, live(), Point, pub (+10 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.15
Nodes (19): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+11 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.22
Nodes (8): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel

### Community 43 - "Drive"
Cohesion: 0.17
Nodes (6): Drive(), Markers, angle(), Others, tagColor(), WorldPlayer

### Community 44 - "i18n-check.ts"
Cohesion: 0.12
Nodes (14): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+6 more)

### Community 45 - "DrivePad.tsx"
Cohesion: 0.25
Nodes (16): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+8 more)

### Community 46 - "LatLng"
Cohesion: 0.18
Nodes (13): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+5 more)

### Community 47 - "package.json"
Cohesion: 0.10
Nodes (19): engines, node, name, private, type, version, @mapbox/vector-tile, pbf (+11 more)

### Community 48 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "arena.py"
Cohesion: 0.08
Nodes (25): anim(), ball(), box(), clear_pose(), cyl(), death(), finish(), gait() (+17 more)

### Community 50 - "StreetQuest — how it makes money"
Cohesion: 0.22
Nodes (8): 1. What's already built and can charge today, 2. What to add next (in order of money per week of work), 3. Later: bigger, slower bets, 4. Getting the first 100 paying stores, 5. A rough model (illustrative only, not a forecast), 6. Costs and risks to plan for, Plan design (in `src/lib/business.ts`), StreetQuest — how it makes money

### Community 51 - "world/route.ts"
Cohesion: 0.10
Nodes (32): days(), dynamic, GET, GET, Schema, GET, GET, bbox() (+24 more)

### Community 52 - "server/empire.ts"
Cohesion: 0.15
Nodes (23): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, BUSINESSES, buyCost() (+15 more)

### Community 53 - "Game.tsx"
Cohesion: 0.07
Nodes (47): Art(), isThenable(), Props, LatLng, Me, World, StepsCard(), Drive (+39 more)

### Community 54 - "protocol.ts"
Cohesion: 0.08
Nodes (43): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+35 more)

### Community 55 - "i18n.ts"
Cohesion: 0.22
Nodes (12): fa, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware() (+4 more)

### Community 56 - "match.ts"
Cohesion: 0.10
Nodes (30): BOT_NAMES, Brain, SKILL, Bomb, BOMB_REACH_M, BOMB_TIMER_S, DEFUSE_S, FREEZE_S (+22 more)

### Community 57 - "pedometer"
Cohesion: 0.20
Nodes (5): MotionPerm, pedometer, Snapshot, StepStatus, useSteps()

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, assets:arena, build, db:push, db:seed, dev, i18n:check, postinstall (+11 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "Player"
Cohesion: 0.12
Nodes (4): Hub, Player, World, LL

### Community 62 - "geom.ts"
Cohesion: 0.10
Nodes (18): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+10 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 66 - "server/arena.ts"
Cohesion: 0.12
Nodes (17): FireMsg, Space, weaponOf(), FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_AIM, F_FIRE (+9 more)

### Community 68 - "pins.ts"
Cohesion: 0.15
Nodes (11): Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade, tradeOf() (+3 more)

### Community 71 - "physics.ts"
Cohesion: 0.21
Nodes (10): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+2 more)

### Community 72 - "alerts.ts"
Cohesion: 0.24
Nodes (10): alertsAt, GET, DIVIDEND_H, dividendCoins(), rankOf(), Alert, readyAlerts(), RING_MS (+2 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.09
Nodes (28): DIFF, DIFF_LABEL, SIZE_LABEL, camFwd, CombatHost, CombatHud, CombatInput, FeedLine (+20 more)

### Community 74 - "AdminDropMap.tsx"
Cohesion: 0.47
Nodes (5): react-leaflet, AdminDropMap(), Clicks(), P, Recenter()

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "msg"
Cohesion: 0.13
Nodes (14): BUILD_ID, config, next, GET(), ART, dynamic, FAQ, FEATURES (+6 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "ads.ts"
Cohesion: 0.25
Nodes (12): POST, Schema, GET, AdCreative, adStatus(), claimAd(), clickAd(), dayStart() (+4 more)

### Community 83 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 84 - "rng"
Cohesion: 0.16
Nodes (17): clipLine(), clipRing(), flatRoofRegion(), sliceVectorTile(), fillFrontage(), Rarity, pack(), villageTile() (+9 more)

### Community 85 - "avatar.ts"
Cohesion: 0.17
Nodes (11): axisL, Clip, NATURAL, Pose, qa, qp, right, Template (+3 more)

### Community 86 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 87 - "markers.ts"
Cohesion: 0.22
Nodes (5): Built, MarkerInfo, markersOf(), Selected, Frame

### Community 88 - "rooms.ts"
Cohesion: 0.48
Nodes (5): regionKey(), areFriends(), canDm(), currentRegion(), roomAudience()

### Community 89 - "Button"
Cohesion: 0.11
Nodes (68): Button(), askConfirm(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+60 more)

### Community 99 - "geo.ts"
Cohesion: 0.48
Nodes (5): bearingTo(), CELL_DEG, offset(), toDeg(), toRad()

### Community 101 - ".shoot"
Cohesion: 0.11
Nodes (11): Avatar, Collide, FOOT_R, FootBody, FootInput, newFoot(), stepFoot(), lerpAngle() (+3 more)

### Community 105 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "filter.ts"
Cohesion: 0.29
Nodes (9): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+1 more)

### Community 109 - "smoke.ts"
Cohesion: 0.15
Nodes (13): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+5 more)

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 736 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `HttpError`, `idle.ts`, `AdminLandmarks.tsx`, `http.ts`, `server/places.ts`, `Rewards.tsx`, `Panels.tsx`, `server/drive.ts`, `Call.tsx`, `me/route.ts`, `db.ts`, `client.ts`, `AdminPanel.tsx`, `GameMap.tsx`, `Market.tsx`, `gpsgames.ts`, `server/money.ts`, `Play.tsx`, `lib/settings.ts`, `gunsound.ts`, `server/city.ts`, `social/route.ts`, `layout.tsx`, `server/business.ts`, `i18n/index.ts`, `Combat`, `Drive.tsx`, `rides/route.ts`, `getT`, `Drive`, `DrivePad.tsx`, `world/route.ts`, `server/empire.ts`, `Game.tsx`, `perf.ts`, `server/arena.ts`, `alerts.ts`, `arena/combat.ts`, `ads.ts`, `Button`, `geo.ts`, `.shoot`, `.onMsg`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.071150766415008 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `t`, `HttpError`, `world3d.ts`, `Rewards.tsx`, `Panels.tsx`, `tiles.ts`, `server/drive.ts`, `lib/city.ts`, `GameMap.tsx`, `others.ts`, `Landmarks`, `Market.tsx`, `Play.tsx`, `gunsound.ts`, `server/city.ts`, `Combat`, `Drive.tsx`, `DrivePad.tsx`, `perf.ts`, `Remotes`, `pins.ts`, `DriveNet`, `physics.ts`, `arena/combat.ts`, `rng`, `markers.ts`, `Button`, `geo.ts`, `.shoot`, `Viewmodel`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05136168179646441 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `helpers.ts` to `package.json`, `render.mjs`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._