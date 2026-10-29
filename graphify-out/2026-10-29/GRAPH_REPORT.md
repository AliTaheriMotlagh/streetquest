# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 326 files · ~344,740 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3096 nodes · 10437 edges · 124 communities (102 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 229 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7a2d18e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- jobs.spec.ts
- city-pack.ts
- calls/route.ts
- server/localData.ts
- idle.ts
- .shoot
- Panels.tsx
- world3d.ts
- client.ts
- fmtNum
- app/page.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- db.ts
- Drive.tsx
- Rewards.tsx
- distanceM
- GameMap.tsx
- server/arena.ts
- goals.ts
- server/quests.ts
- gpsgames.ts
- t
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminDropMap.tsx
- http.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- music.ts
- i18n/index.ts
- Combat
- avatar.ts
- rides/route.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
- i18n-check.ts
- Landmarks
- drive/traffic.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- HttpError
- osm-pbf.ts
- protocol.ts
- city/route.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Match
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- helpers.ts
- LocationReporter
- lib/city.ts
- NearbyStore
- Remotes
- server/empire.ts
- AdminLandmarks.tsx
- gunsound.ts
- AdminPanel.tsx
- allowScripts
- three
- mapStyles.ts
- ref_node_child_process
- render.mjs
- Lottery.tsx
- gpsgame/route.ts
- vercel.json
- others.ts
- useLocation.ts
- lib/places.ts
- push.ts
- server/traffic.ts
- Player
- Market.tsx
- CLAUDE.md
- money.spec.ts
- DriveNet
- business/route.ts
- locationTracker
- overrides
- footprint.ts
- @playwright/test
- randomSpot
- server/steps.ts
- LanguageSwitch.tsx
- arena/combat.ts
- StreetQuest — real-world GPS war game
- Viewmodel
- .onMsg
- alerts.ts
- landmarks.spec.ts
- sim.ts
- Drive
- offset
- fa/arena.ts
- call.ts
- vfx.ts
- common.ts
- Player
- RtClient
- data.ts
- game.ts
- msg
- fa/lottery.ts
- fa/settings.ts
- market.ts
- panels.ts
- fa/world.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 391 edges
2. `HttpError` - 157 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 130 edges
5. `Button()` - 110 edges
6. `distanceM()` - 106 edges
7. `body()` - 87 edges
8. `fmtNum()` - 86 edges
9. `prisma` - 85 edges
10. `api()` - 82 edges

## Surprising Connections (you probably didn't know these)
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts

## Import Cycles
- None detected.

## Communities (124 total, 22 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (78): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artFor(), artHtml(), artSvg() (+70 more)

### Community 1 - "jobs.spec.ts"
Cohesion: 0.40
Nodes (3): Lottery, MyRides, Ride

### Community 2 - "city-pack.ts"
Cohesion: 0.12
Nodes (24): Production checklist, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+16 more)

### Community 3 - "calls/route.ts"
Cohesion: 0.13
Nodes (24): BUILD_ID, config, dynamic, GET(), GET, POST, Schema, dynamic (+16 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.06
Nodes (71): GET, DIVAR_CAT_KEYS, DIVAR_CATS, DivarCat, divarLink(), DivarPost, FILLER, FOOD (+63 more)

### Community 5 - "idle.ts"
Cohesion: 0.08
Nodes (46): BUY_STEPS, clock(), EmpireTab(), fa(), money(), View, burst(), ALL_AT (+38 more)

### Community 6 - ".shoot"
Cohesion: 0.17
Nodes (5): Avatar, FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 7 - "Panels.tsx"
Cohesion: 0.09
Nodes (43): ModeCards(), AppSettings(), AVATARS, DeliveriesTab(), DeliveryRoute(), dropoffOf(), Friend, JobsPanel() (+35 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (35): nameLines(), artImages, at(), Board, canvas(), curtain(), DIM, drawIcon() (+27 more)

### Community 9 - "client.ts"
Cohesion: 0.09
Nodes (20): ApiError, GpsView, LatLng, ShopDeal, World, WorldDelivery, WorldEvent, WorldLottery (+12 more)

### Community 10 - "fmtNum"
Cohesion: 0.20
Nodes (28): paintGauge(), InfoCard(), GoToShop(), BizCard(), catOf(), GoThere(), PlaceCard(), SpotCard() (+20 more)

### Community 11 - "app/page.tsx"
Cohesion: 0.20
Nodes (9): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+1 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (25): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+17 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.05
Nodes (72): DELETE, LatLng, Schema, GET, Point, POST, Schema, HttpMe (+64 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.09
Nodes (19): Job, transferables(), AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber (+11 more)

### Community 17 - "db.ts"
Cohesion: 0.07
Nodes (44): GET, Send, GET, GET, GET, POST, Schema, Fields (+36 more)

### Community 18 - "Drive.tsx"
Cohesion: 0.07
Nodes (49): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+41 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.12
Nodes (24): Wallet(), bump(), calm(), Celebration, CelebrationLayer(), compact(), confetti(), CountUp() (+16 more)

### Community 20 - "distanceM"
Cohesion: 0.07
Nodes (70): GET, Schema, POST, Schema, empty, num, Query, POST (+62 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.10
Nodes (41): leaflet, react-leaflet, WorldPlayer, Clicks(), FrameTarget(), GameItem, GameMap(), guidesFor() (+33 more)

### Community 22 - "server/arena.ts"
Cohesion: 0.16
Nodes (18): FireMsg, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_AIM, F_FIRE, damageAt(), isWeapon() (+10 more)

### Community 23 - "goals.ts"
Cohesion: 0.14
Nodes (28): POST, Schema, GET, Schema, AdCreative, adStatus(), claimAd(), clickAd() (+20 more)

### Community 24 - "server/quests.ts"
Cohesion: 0.25
Nodes (12): GET, Schema, CAMPAIGN, campaignKey(), DAILY_POOL, dailyQuests(), QuestDef, QuestKind (+4 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.15
Nodes (17): FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf(), HOLD_RADIUS_M, MAX_REROUTES, StepKind, STORY (+9 more)

### Community 26 - "t"
Cohesion: 0.12
Nodes (54): ArenaMenu(), Button(), DriveParty(), PartyHud(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard() (+46 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (36): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+28 more)

### Community 28 - "skyline.ts"
Cohesion: 0.11
Nodes (14): Built, MarkerInfo, markersOf(), BROWN, Dem, heightAt(), loadTile(), ROCK (+6 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.07
Nodes (43): PUT, Action, GET, layDrops(), price(), Schema, ITEM_BY_KEY, ITEMS (+35 more)

### Community 30 - "AdminDropMap.tsx"
Cohesion: 0.47
Nodes (5): AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 31 - "http.ts"
Cohesion: 0.06
Nodes (54): bcryptjs, next, AdminPage(), keyMatches(), GET, POST, Schema, POST (+46 more)

### Community 32 - "social/route.ts"
Cohesion: 0.07
Nodes (46): GET, pub, Schema, GET, GET, GET, KEY, GET (+38 more)

### Community 33 - "layout.tsx"
Cohesion: 0.15
Nodes (9): react-dom, cinzel, fredoka, generateMetadata(), inter, VAZIRMATN, viewport, Analytics() (+1 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 36 - "i18n/index.ts"
Cohesion: 0.08
Nodes (39): GlobalError(), RootLayout(), manifest(), I18nProvider(), LocaleCtx, catalogs, compiled, dateFmt (+31 more)

### Community 38 - "avatar.ts"
Cohesion: 0.13
Nodes (13): axisL, Clip, NATURAL, Pose, qa, qp, right, Template (+5 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.13
Nodes (21): days(), dynamic, GET, Schema, ACTIVE, GET, live(), Point (+13 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.18
Nodes (16): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+8 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.21
Nodes (15): GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS, LOTTERY_MIN_PRICE (+7 more)

### Community 43 - "geom.ts"
Cohesion: 0.11
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "Landmarks"
Cohesion: 0.21
Nodes (3): Landmarks, CollisionWorld, Footprint

### Community 46 - "drive/traffic.ts"
Cohesion: 0.16
Nodes (10): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+2 more)

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

### Community 51 - "Game.tsx"
Cohesion: 0.07
Nodes (55): react, Art(), ArtAnim, isThenable(), Props, Me, ALL_LAYERS, Drive (+47 more)

### Community 52 - "HttpError"
Cohesion: 0.08
Nodes (65): zod, POST, POST, POST, POST, POST, POST, POST (+57 more)

### Community 53 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 54 - "protocol.ts"
Cohesion: 0.06
Nodes (58): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+50 more)

### Community 55 - "city/route.ts"
Cohesion: 0.13
Nodes (26): Colour, GET, Info, Points, Upload, sliceVectorTile(), fillFrontage(), pack() (+18 more)

### Community 56 - "match.ts"
Cohesion: 0.10
Nodes (31): BOT_NAMES, Brain, SKILL, Bomb, BOMB_REACH_M, BOMB_TIMER_S, DEFUSE_S, FREEZE_S (+23 more)

### Community 57 - "pedometer"
Cohesion: 0.20
Nodes (5): MotionPerm, pedometer, Snapshot, StepStatus, useSteps()

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+13 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "Match"
Cohesion: 0.13
Nodes (8): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView, Team

### Community 62 - "drive.spec.ts"
Cohesion: 0.17
Nodes (16): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+8 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.15
Nodes (10): A, ads, D, districts, pairAt(), shops, StubShop, StubVendor (+2 more)

### Community 66 - "helpers.ts"
Cohesion: 0.17
Nodes (12): Mission, World, Loc, Near, World, WorldP, fakeIp(), LatLng (+4 more)

### Community 68 - "lib/city.ts"
Cohesion: 0.15
Nodes (22): centroid(), fromOverpass(), heightOf(), httpUrl(), infoOfTags(), isNamedPlace(), NAMED_COLOURS, osmColour() (+14 more)

### Community 70 - "Remotes"
Cohesion: 0.22
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 71 - "server/empire.ts"
Cohesion: 0.22
Nodes (19): GET, POST, Schema, buyCost(), dividendCoins(), emptyEmpire(), fameFor(), maxAffordable() (+11 more)

### Community 72 - "AdminLandmarks.tsx"
Cohesion: 0.07
Nodes (54): Action, Fields, GET, Meta, POST, AdminLandmarks(), Biz, download() (+46 more)

### Community 73 - "gunsound.ts"
Cohesion: 0.27
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "three"
Cohesion: 0.15
Nodes (10): three, Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade (+2 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (8): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, tileHosts(), Tiles

### Community 80 - "Lottery.tsx"
Cohesion: 0.17
Nodes (14): DialogHost(), Opts, queue, Req, fmtCountdown(), LotteryCard(), LotteryTab(), toLocalInput() (+6 more)

### Community 81 - "gpsgame/route.ts"
Cohesion: 0.29
Nodes (14): GET, here(), POST, Schema, activeGame(), checkGame(), gameView(), rerouteGame() (+6 more)

### Community 83 - "others.ts"
Cohesion: 0.18
Nodes (13): Driver, Snap, Walker, Cockpit, makeCockpit(), makeVehicle(), materials(), Mats (+5 more)

### Community 84 - "useLocation.ts"
Cohesion: 0.17
Nodes (11): Listener, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError, Listener (+3 more)

### Community 85 - "lib/places.ts"
Cohesion: 0.12
Nodes (16): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, pick(), PLACE_BUCKET_MS, PLACE_CAT_KEYS, placeBucket() (+8 more)

### Community 86 - "push.ts"
Cohesion: 0.36
Nodes (8): GET, POST, Schema, ACTIVE_MS, PushPayload, pushPublicKey(), pushTo(), topicOf()

### Community 87 - "server/traffic.ts"
Cohesion: 0.14
Nodes (27): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+19 more)

### Community 88 - "Player"
Cohesion: 0.16
Nodes (9): Dash, store(), World, crew(), setup(), adminPlayer(), Player, openGame() (+1 more)

### Community 89 - "Market.tsx"
Cohesion: 0.11
Nodes (38): askConfirm(), CashoutView, fmtTime(), Browse(), BuyerOrder(), DEAL_STEPS, endLabel(), ENDS (+30 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.25
Nodes (6): Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 93 - "business/route.ts"
Cohesion: 0.09
Nodes (42): Details, GET, mine(), POST, Schema, GET, POST, Schema (+34 more)

### Community 94 - "locationTracker"
Cohesion: 0.15
Nodes (10): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+2 more)

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "footprint.ts"
Cohesion: 0.29
Nodes (8): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), insidePacked(), makeFrame()

### Community 97 - "@playwright/test"
Cohesion: 0.32
Nodes (5): Empire, json(), octet(), open(), @playwright/test

### Community 98 - "randomSpot"
Cohesion: 0.32
Nodes (6): Traffic, randomSpot(), octet(), returningPlayer(), test, withGps()

### Community 99 - "server/steps.ts"
Cohesion: 0.26
Nodes (15): GET, dayKey(), DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps() (+7 more)

### Community 100 - "LanguageSwitch.tsx"
Cohesion: 0.50
Nodes (6): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage()

### Community 101 - "arena/combat.ts"
Cohesion: 0.08
Nodes (34): DIFF, DIFF_LABEL, SIZE_LABEL, camFwd, CombatHost, CombatHud, CombatInput, FeedLine (+26 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, How it works, Render, Run locally (+2 more)

### Community 105 - "alerts.ts"
Cohesion: 0.15
Nodes (12): lat, lng, prisma, start, @prisma/client, GET, DIVIDEND_H, DAILY_REWARD() (+4 more)

### Community 107 - "sim.ts"
Cohesion: 0.12
Nodes (12): MatchResult, buildings, F, host, log, m, mode, now (+4 more)

### Community 108 - "Drive"
Cohesion: 0.14
Nodes (8): Drive(), Markers, angle(), Others, tagColor(), DetailSource, makeGate(), makeSign()

### Community 109 - "offset"
Cohesion: 0.67
Nodes (4): bearingTo(), offset(), toDeg(), toRad()

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 115 - "Player"
Cohesion: 0.09
Nodes (8): Hub, Player, Space, weaponOf(), World, LL, WeaponKey, Zone

### Community 119 - "msg"
Cohesion: 0.31
Nodes (4): GET(), dynamic, msg(), SITE

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 812 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `calls/route.ts`, `server/localData.ts`, `idle.ts`, `.shoot`, `Panels.tsx`, `client.ts`, `fmtNum`, `app/page.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `db.ts`, `Drive.tsx`, `Rewards.tsx`, `distanceM`, `GameMap.tsx`, `server/arena.ts`, `goals.ts`, `server/quests.ts`, `gpsgames.ts`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `layout.tsx`, `music.ts`, `i18n/index.ts`, `Combat`, `rides/route.ts`, `lotteries/route.ts`, `Game.tsx`, `HttpError`, `city/route.ts`, `perf.ts`, `server/empire.ts`, `AdminLandmarks.tsx`, `gunsound.ts`, `AdminPanel.tsx`, `Lottery.tsx`, `gpsgame/route.ts`, `push.ts`, `server/traffic.ts`, `Market.tsx`, `business/route.ts`, `LanguageSwitch.tsx`, `arena/combat.ts`, `.onMsg`, `alerts.ts`, `Drive`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07246376811594203 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `server/localData.ts`, `Panels.tsx`, `fmtNum`, `server/drive.ts`, `Play.tsx`, `db.ts`, `Drive.tsx`, `GameMap.tsx`, `server/arena.ts`, `gpsgames.ts`, `t`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `rides/route.ts`, `Game.tsx`, `HttpError`, `match.ts`, `Match`, `LocationReporter`, `Lottery.tsx`, `gpsgame/route.ts`, `useLocation.ts`, `lib/places.ts`, `server/traffic.ts`, `business/route.ts`, `Drive`, `offset`, `Player`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `city-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `.shoot`, `world3d.ts`, `fmtNum`, `tiles.ts`, `server/drive.ts`, `Play.tsx`, `Drive.tsx`, `distanceM`, `GameMap.tsx`, `t`, `skyline.ts`, `social/route.ts`, `music.ts`, `Combat`, `Landmarks`, `drive/traffic.ts`, `city/route.ts`, `lib/city.ts`, `Remotes`, `gunsound.ts`, `three`, `others.ts`, `DriveNet`, `footprint.ts`, `arena/combat.ts`, `Viewmodel`, `offset`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._