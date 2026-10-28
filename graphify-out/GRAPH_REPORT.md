# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 316 files · ~324,431 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2922 nodes · 9852 edges · 100 communities (87 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 223 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad1d24f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- server/hub.ts
- HttpError
- idle.ts
- drive/landmarks.ts
- http.ts
- world3d.ts
- server/places.ts
- fmtNum
- Panels.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- Empire.tsx
- lib/city.ts
- db.ts
- Match
- react
- AdminSettings.tsx
- GameMap.tsx
- others.ts
- Drive
- t
- gpsgames.ts
- lib/money.ts
- tileMesh.ts
- music.ts
- lib/settings.ts
- .onMsg
- server/city.ts
- distanceM
- msg
- fa/index.ts
- server/business.ts
- i18n/index.ts
- Combat
- drive/traffic.ts
- world/route.ts
- sfx.ts
- getT
- LatLng
- FootprintIndex
- i18n-check.ts
- Drive.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- client.ts
- server/empire.ts
- AdminLandmarks.tsx
- protocol.ts
- Landmarks
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
- Lottery.tsx
- NearbyStore
- DriveNet
- app/page.tsx
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- lib/business.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- Business.tsx
- vercel.json
- three
- me/route.ts
- goals.ts
- server/steps.ts
- LanguageSwitch.tsx
- health/route.ts
- Game.tsx
- CLAUDE.md
- .shoot
- @prisma/client
- locationTracker
- avatar.ts
- Viewmodel
- sim.ts
- filter.ts
- RtClient

## God Nodes (most connected - your core abstractions)
1. `t()` - 371 edges
2. `HttpError` - 151 edges
3. `Drive()` - 134 edges
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

## Communities (100 total, 13 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (77): cells, keys, [out = "art-preview.html", only], sym, artFor(), artHtml(), artSvg(), EMOJI_RE (+69 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.09
Nodes (30): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+22 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.08
Nodes (44): GET, POST, Schema, GET, POST, Send, GET, pub (+36 more)

### Community 4 - "HttpError"
Cohesion: 0.09
Nodes (64): POST, POST, POST, POST, POST, Schema, GET, Point (+56 more)

### Community 5 - "idle.ts"
Cohesion: 0.14
Nodes (23): ALL_AT, BASE_OFFLINE_H, BizDef, bizMult(), cycleRevenue(), cycleSecs(), FAME_BONUS, fameMult() (+15 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.17
Nodes (17): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET, BUDGET_LABEL (+9 more)

### Community 7 - "http.ts"
Cohesion: 0.07
Nodes (49): bcryptjs, zod, POST, POST, POST, Schema, DELETE, LatLng (+41 more)

### Community 8 - "world3d.ts"
Cohesion: 0.09
Nodes (40): Cloud, Pin, pinTexture(), nameLines(), oneLine(), OTHER, Trade, tradeOf() (+32 more)

### Community 9 - "server/places.ts"
Cohesion: 0.12
Nodes (29): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place, PLACE_BUCKET_MS (+21 more)

### Community 10 - "fmtNum"
Cohesion: 0.05
Nodes (64): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+56 more)

### Community 11 - "Panels.tsx"
Cohesion: 0.08
Nodes (44): AppSettings(), AVATARS, DeliveriesTab(), DeliveryRoute(), dropoffOf(), Friend, HeroTabId, JobsPanel() (+36 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (24): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+16 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (51): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+43 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Empire.tsx"
Cohesion: 0.14
Nodes (21): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+13 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.06
Nodes (51): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+43 more)

### Community 17 - "db.ts"
Cohesion: 0.06
Nodes (53): GET, Schema, GET, days(), dynamic, GET, GET, Schema (+45 more)

### Community 18 - "Match"
Cohesion: 0.15
Nodes (7): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView

### Community 19 - "react"
Cohesion: 0.08
Nodes (35): react, isThenable(), Props, HeroView, LatLng, World, HELP, HelpCard() (+27 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.14
Nodes (18): CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL, GameDataTab() (+10 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (35): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+27 more)

### Community 22 - "others.ts"
Cohesion: 0.11
Nodes (18): Built, MarkerInfo, markersOf(), Driver, Snap, Walker, Style, Cockpit (+10 more)

### Community 23 - "Drive"
Cohesion: 0.10
Nodes (10): CombatPad, Crosshair(), Drive(), Markers, angle(), Others, tagColor(), StorePins (+2 more)

### Community 24 - "t"
Cohesion: 0.09
Nodes (69): askConfirm(), paintGauge(), AdminTools(), CampaignForm(), Dashboard(), api(), fmtTime(), ModeCards() (+61 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "lib/money.ts"
Cohesion: 0.29
Nodes (13): cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell(), resolveMoney() (+5 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes() (+27 more)

### Community 28 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.08
Nodes (46): Action, GET, GET, Schema, POST, ITEMS, applyConfig(), catalogOriginals() (+38 more)

### Community 30 - ".onMsg"
Cohesion: 0.19
Nodes (14): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+6 more)

### Community 31 - "server/city.ts"
Cohesion: 0.15
Nodes (30): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), TILE_V (+22 more)

### Community 32 - "distanceM"
Cohesion: 0.11
Nodes (36): layDrops(), POST, Schema, GET, num(), Schema, bbox(), bearingTo() (+28 more)

### Community 33 - "msg"
Cohesion: 0.10
Nodes (19): BUILD_ID, config, next, react-dom, cinzel, fredoka, generateMetadata(), inter (+11 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.07
Nodes (22): admin, app, arena, call, common, data, drive, empire (+14 more)

### Community 35 - "server/business.ts"
Cohesion: 0.13
Nodes (27): Details, GET, mine(), POST, Schema, POST, Schema, spendGems() (+19 more)

### Community 36 - "i18n/index.ts"
Cohesion: 0.10
Nodes (36): GlobalError(), I18nProvider(), LocaleCtx, fa, catalogs, compiled, dateFmt, DEFAULT_LOCALE (+28 more)

### Community 38 - "drive/traffic.ts"
Cohesion: 0.09
Nodes (33): GET, Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+25 more)

### Community 39 - "world/route.ts"
Cohesion: 0.08
Nodes (37): GET, Schema, Schema, ACTIVE, GET, live(), Point, pub (+29 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.16
Nodes (18): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+10 more)

### Community 42 - "LatLng"
Cohesion: 0.11
Nodes (13): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+5 more)

### Community 43 - "FootprintIndex"
Cohesion: 0.19
Nodes (4): Nav, Node, FootprintIndex, ModeKey

### Community 44 - "i18n-check.ts"
Cohesion: 0.12
Nodes (14): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+6 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.08
Nodes (44): HttpMe, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked (+36 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): Fix, Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent (+4 more)

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

### Community 51 - "client.ts"
Cohesion: 0.12
Nodes (15): ApiError, CashoutView, ensureGuest(), GpsView, ShopDeal, WorldDelivery, WorldEvent, WorldLottery (+7 more)

### Community 52 - "server/empire.ts"
Cohesion: 0.14
Nodes (26): GET, POST, Schema, BIZ_BY_KEY, BizState, BOOST_MAX_H, BOOST_MINUTES, buyCost() (+18 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.19
Nodes (15): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+7 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (48): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+40 more)

### Community 55 - "Landmarks"
Cohesion: 0.26
Nodes (3): disposeModel(), Landmarks, LandmarkView

### Community 56 - "match.ts"
Cohesion: 0.10
Nodes (32): BOT_NAMES, Brain, SKILL, Bomb, ARENA_REWARDS_PER_DAY, BOMB_REACH_M, BOMB_TIMER_S, DEFUSE_S (+24 more)

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

### Community 61 - "Player"
Cohesion: 0.11
Nodes (5): Hub, Player, World, LL, LocalFrame

### Community 62 - "geom.ts"
Cohesion: 0.10
Nodes (23): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+15 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 66 - "server/arena.ts"
Cohesion: 0.09
Nodes (24): FireMsg, Space, weaponOf(), ADS, HIP, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL (+16 more)

### Community 68 - "Lottery.tsx"
Cohesion: 0.18
Nodes (13): DialogHost(), Opts, queue, Req, fmtCountdown(), LotteryCard(), LotteryTab(), toLocalInput() (+5 more)

### Community 71 - "app/page.tsx"
Cohesion: 0.17
Nodes (12): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+4 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.16
Nodes (23): Action, Fields, GET, Meta, POST, PUT, glbProblem(), HULL_MAX_POINTS (+15 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.06
Nodes (47): DIFF, DIFF_LABEL, SIZE_LABEL, camFwd, CombatHost, CombatHud, CombatInput, FeedLine (+39 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.12
Nodes (21): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+13 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "Business.tsx"
Cohesion: 0.29
Nodes (10): BusinessPanel(), Data, Details, DetailsForm(), money(), Pitch(), Plans(), Setup() (+2 more)

### Community 83 - "three"
Cohesion: 0.15
Nodes (10): three, col, dir, m4, pos, Puff, q, scl (+2 more)

### Community 84 - "me/route.ts"
Cohesion: 0.10
Nodes (30): GET, POST, Schema, price(), Schema, GET, ITEM_BY_KEY, ItemDef (+22 more)

### Community 85 - "goals.ts"
Cohesion: 0.15
Nodes (26): POST, Schema, GET, AdCreative, adStatus(), claimAd(), clickAd(), dayStart() (+18 more)

### Community 86 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 87 - "LanguageSwitch.tsx"
Cohesion: 0.36
Nodes (8): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALE_META, LOCALES

### Community 88 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 89 - "Game.tsx"
Cohesion: 0.14
Nodes (34): ArenaMenu(), Button(), Me, Drive, Game(), GameMap, InfoCard(), MapLook (+26 more)

### Community 91 - ".shoot"
Cohesion: 0.21
Nodes (4): FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 92 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 101 - "avatar.ts"
Cohesion: 0.14
Nodes (13): Avatar, axisL, Clip, loadSoldier(), NATURAL, Pose, qa, qp (+5 more)

### Community 105 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "filter.ts"
Cohesion: 0.33
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 760 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `HttpError`, `http.ts`, `server/places.ts`, `fmtNum`, `Panels.tsx`, `server/drive.ts`, `Call.tsx`, `Empire.tsx`, `db.ts`, `react`, `AdminSettings.tsx`, `GameMap.tsx`, `Drive`, `gpsgames.ts`, `lib/money.ts`, `music.ts`, `lib/settings.ts`, `.onMsg`, `server/city.ts`, `distanceM`, `msg`, `server/business.ts`, `i18n/index.ts`, `Combat`, `drive/traffic.ts`, `world/route.ts`, `Drive.tsx`, `client.ts`, `server/empire.ts`, `AdminLandmarks.tsx`, `perf.ts`, `Remotes`, `server/arena.ts`, `Lottery.tsx`, `app/page.tsx`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `Business.tsx`, `me/route.ts`, `goals.ts`, `LanguageSwitch.tsx`, `Game.tsx`, `avatar.ts`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07374847374847375 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `kit.ts`, `fmtNum`, `Panels.tsx`, `Call.tsx`, `Empire.tsx`, `AdminSettings.tsx`, `GameMap.tsx`, `t`, `msg`, `i18n/index.ts`, `getT`, `Drive.tsx`, `useLocation.ts`, `package.json`, `AdminLandmarks.tsx`, `pedometer`, `Lottery.tsx`, `app/page.tsx`, `arena/combat.ts`, `AdminPanel.tsx`, `Business.tsx`, `LanguageSwitch.tsx`, `Game.tsx`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `world3d.ts`, `fmtNum`, `tiles.ts`, `server/drive.ts`, `Empire.tsx`, `lib/city.ts`, `GameMap.tsx`, `others.ts`, `t`, `music.ts`, `.onMsg`, `server/city.ts`, `distanceM`, `Combat`, `drive/traffic.ts`, `Drive.tsx`, `Landmarks`, `geom.ts`, `Remotes`, `DriveNet`, `arena/combat.ts`, `Game.tsx`, `.shoot`, `.dispose`, `Viewmodel`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._