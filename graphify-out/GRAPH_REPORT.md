# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 334 files · ~361,929 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3223 nodes · 10829 edges · 111 communities (94 shown, 17 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 235 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `329e7ca0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- fmtNum
- city-pack.ts
- server/hub.ts
- server/localData.ts
- idle.ts
- StoreInfo.tsx
- Panels.tsx
- world3d.ts
- goals.ts
- Call.tsx
- msg
- tiles.ts
- server/drive.ts
- t
- Play.tsx
- AdminLandmarks.tsx
- server/shops.ts
- Drive.tsx
- Rewards.tsx
- server/arena.ts
- GameMap.tsx
- protocol.ts
- HttpError
- server/empire.ts
- gpsgames.ts
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- music.ts
- http.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/steps.ts
- I18nProvider.tsx
- Combat
- arena/combat.ts
- db.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
- i18n-check.ts
- Drive
- helpers.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- requireUser
- i18n.ts
- RtClient
- server/city.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- adminPlayer
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- randomSpot
- locationTracker
- lib/city.ts
- NearbyStore
- useLocation.ts
- i18n/index.ts
- pins.ts
- LocationReporter
- AdminPanel.tsx
- allowScripts
- PlayerLayer.tsx
- mapStyles.ts
- ref_node_child_process
- render.mjs
- client.ts
- filter.ts
- vercel.json
- vehicles3d.ts
- distanceM
- server/places.ts
- ads.txt/route.ts
- server/traffic.ts
- Player
- useGame
- StreetQuest — working notes for Claude
- money.spec.ts
- alerts.ts
- rewards.ts
- seed.ts
- overrides
- health/route.ts
- @playwright/test
- StreetQuest — real-world GPS war game
- Others
- fa/arena.ts
- call.ts
- common.ts
- Player
- data.ts
- game.ts
- fa/lottery.ts
- fa/settings.ts
- market.ts
- panels.ts
- fa/world.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 405 edges
2. `HttpError` - 157 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 132 edges
5. `Button()` - 113 edges
6. `distanceM()` - 109 edges
7. `fmtNum()` - 94 edges
8. `body()` - 87 edges
9. `prisma` - 85 edges
10. `api()` - 84 edges

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

## Communities (111 total, 17 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (80): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtAnim, ArtSprite(), ArtUse() (+72 more)

### Community 1 - "fmtNum"
Cohesion: 0.14
Nodes (40): ArenaMenu(), paintGauge(), InfoCard(), EventsPanel(), NearbyPanel(), NoteCard(), BizCard(), catOf() (+32 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.07
Nodes (35): Production checklist, pbf, args, build(), cityAt(), dry, extractFile(), hotspots() (+27 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.11
Nodes (32): GET, POST, Schema, GET, POST, Send, GET, POST (+24 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.06
Nodes (74): empty, GET, num, Query, divarLink(), isFoodCat(), nameScore(), normName() (+66 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (42): BUY_STEPS, clock(), EmpireTab(), fa(), money(), View, getLocale(), resolver() (+34 more)

### Community 6 - "StoreInfo.tsx"
Cohesion: 0.07
Nodes (49): clock(), DivarList(), HoursTable(), InfoProps, LINK_ICON, Links, OpenBadge(), spanText() (+41 more)

### Community 7 - "Panels.tsx"
Cohesion: 0.09
Nodes (42): AppSettings(), AVATARS, DeliveriesTab(), DeliveryRoute(), dropoffOf(), Friend, HeroTabId, JobsPanel() (+34 more)

### Community 8 - "world3d.ts"
Cohesion: 0.08
Nodes (43): Label, PropKind, nameLines(), oneLine(), artImage(), artImages, at(), Board (+35 more)

### Community 9 - "goals.ts"
Cohesion: 0.19
Nodes (21): GET, POST, Schema, GoalDef, GoalReward, MilestoneDef, announce(), bump() (+13 more)

### Community 10 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 11 - "msg"
Cohesion: 0.15
Nodes (12): manifest(), GET(), ART, dynamic, FAQ, FEATURES, metadata, PILLARS (+4 more)

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (24): TileArrays, BuildPool, Cached, db(), DetailSource, idbGet(), idbPut(), idbRead() (+16 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (53): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+45 more)

### Community 14 - "t"
Cohesion: 0.14
Nodes (29): HELP, HelpCard(), helpSeen(), markHelpSeen(), seenKey(), Tour, TOUR_KEY, TourStep (+21 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.06
Nodes (65): Action, Fields, GET, Meta, POST, PUT, AdminLandmarks(), Biz (+57 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.10
Nodes (32): Schema, GET, GET, GET, POST, Schema, POST, Details (+24 more)

### Community 18 - "Drive.tsx"
Cohesion: 0.07
Nodes (50): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+42 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.08
Nodes (35): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+27 more)

### Community 20 - "server/arena.ts"
Cohesion: 0.09
Nodes (27): FireMsg, Space, weaponOf(), KillRun, Medal, medalFor(), MULTI_KILL_MS, nextRun() (+19 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.12
Nodes (32): leaflet, GpsView, WorldSpot, Clicks(), FrameTarget(), GameItem, GameMap(), guidesFor() (+24 more)

### Community 22 - "protocol.ts"
Cohesion: 0.06
Nodes (53): BOT_NAMES, Brain, SKILL, Identity, Sample, Sock, APP_URL, hub (+45 more)

### Community 23 - "HttpError"
Cohesion: 0.13
Nodes (23): POST, Schema, GET, GET, GET, POST, Schema, spendGems() (+15 more)

### Community 24 - "server/empire.ts"
Cohesion: 0.16
Nodes (22): GET, POST, Schema, BIZ_BY_KEY, BizState, BOOST_MAX_H, BOOST_MINUTES, buyCost() (+14 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "Button"
Cohesion: 0.13
Nodes (38): Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm() (+30 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.06
Nodes (58): AREA_Y, Builder, buildingLook(), buildTileArrays(), color(), COOLER, cornerSigns(), cuboid() (+50 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.07
Nodes (46): Action, GET, POST, Fields, Schema, POST(), ITEMS, applyConfig() (+38 more)

### Community 30 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 31 - "http.ts"
Cohesion: 0.07
Nodes (44): BUILD_ID, config, jose, next, AdminPage(), keyMatches(), GET, POST (+36 more)

### Community 32 - "social/route.ts"
Cohesion: 0.11
Nodes (31): GET, GET, Point, Schema, GET, num(), POST, Schema (+23 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (12): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+4 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "server/steps.ts"
Cohesion: 0.23
Nodes (16): GET, POST, Schema, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M (+8 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.17
Nodes (19): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+11 more)

### Community 37 - "Combat"
Cohesion: 0.04
Nodes (24): Avatar, loadSoldier(), Combat, FootBody, beepSound(), blip(), boomSound(), emptySound() (+16 more)

### Community 38 - "arena/combat.ts"
Cohesion: 0.04
Nodes (55): three, axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp (+47 more)

### Community 39 - "db.ts"
Cohesion: 0.07
Nodes (32): days(), dynamic, GET, GET, pub, Schema, Schema, ACTIVE (+24 more)

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

### Community 45 - "Drive"
Cohesion: 0.10
Nodes (10): CombatPad, Crosshair(), Drive(), Landmarks, Markers, DriveNet, Driver, CollisionWorld (+2 more)

### Community 46 - "helpers.ts"
Cohesion: 0.18
Nodes (11): Empire, Lottery, MyRides, Ride, Online, expectOk(), fakeIp(), fund() (+3 more)

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
Nodes (50): react, Art(), isThenable(), Props, LatLng, Me, StepsCard(), ALL_LAYERS (+42 more)

### Community 52 - "requireUser"
Cohesion: 0.08
Nodes (49): zod, POST, Schema, GET, Point, POST, pub, Schema (+41 more)

### Community 53 - "i18n.ts"
Cohesion: 0.20
Nodes (13): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), setLocaleResolver(), Vars, config (+5 more)

### Community 55 - "server/city.ts"
Cohesion: 0.14
Nodes (33): Colour, GET, Info, Points, POST, Upload, CityTile, overpassQuery() (+25 more)

### Community 56 - "match.ts"
Cohesion: 0.06
Nodes (56): Bomb, MatchResult, buildings, F, host, log, m, mode (+48 more)

### Community 57 - "pedometer"
Cohesion: 0.20
Nodes (5): MotionPerm, pedometer, Snapshot, StepStatus, useSteps()

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+15 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "adminPlayer"
Cohesion: 0.17
Nodes (11): Dash, store(), World, Mission, setup(), World, Feed, Post (+3 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.27
Nodes (9): ArenaMe, befriend(), drive(), DriveRes, driveTo(), Other, Party, PartyState (+1 more)

### Community 63 - "perf.ts"
Cohesion: 0.24
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isTouch(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.12
Nodes (14): A, ads, D, districts, pairAt(), shops, SMALLTOWN, StubShop (+6 more)

### Community 66 - "randomSpot"
Cohesion: 0.21
Nodes (10): Loc, Near, World, WorldP, LatLng, randomSpot(), octet(), returningPlayer() (+2 more)

### Community 68 - "lib/city.ts"
Cohesion: 0.06
Nodes (44): Job, transferables(), AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber (+36 more)

### Community 70 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+4 more)

### Community 71 - "i18n/index.ts"
Cohesion: 0.09
Nodes (32): POST, GET, POST, Schema, GET, PATCH, ITEM_BY_KEY, ItemDef (+24 more)

### Community 72 - "pins.ts"
Cohesion: 0.17
Nodes (8): Cloud, Pin, pinTexture(), StorePins, OTHER, Trade, tradeOf(), TRADES

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "PlayerLayer.tsx"
Cohesion: 0.19
Nodes (11): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap, Anim, Guide (+3 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (10): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, mapStyle, OPEN_TOPO (+2 more)

### Community 80 - "client.ts"
Cohesion: 0.09
Nodes (21): Built, MarkerInfo, markersOf(), ApiError, CashoutView, ensureGuest(), HeroView, Selected (+13 more)

### Community 81 - "filter.ts"
Cohesion: 0.31
Nodes (8): Axis, dist(), Fix, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 83 - "vehicles3d.ts"
Cohesion: 0.21
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 84 - "distanceM"
Cohesion: 0.09
Nodes (49): layDrops(), GET, GET, bbox(), bearingTo(), CELL_DEG, cellOf(), dayPhase (+41 more)

### Community 85 - "server/places.ts"
Cohesion: 0.08
Nodes (41): Rarity, villageTile(), hashStr(), rng(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT (+33 more)

### Community 86 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 87 - "server/traffic.ts"
Cohesion: 0.08
Nodes (38): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+30 more)

### Community 88 - "Player"
Cohesion: 0.23
Nodes (5): crew(), homePlayer(), Player, openGame(), SfxHook

### Community 89 - "useGame"
Cohesion: 0.08
Nodes (56): askConfirm(), Opts, queue, Req, fmtTime(), fmtCountdown(), LotteryCard(), LotteryTab() (+48 more)

### Community 90 - "StreetQuest — working notes for Claude"
Cohesion: 0.29
Nodes (6): Commands, Done means, Fast, low-token tools (installed), graphify, StreetQuest — working notes for Claude, Where things are (read these instead of exploring)

### Community 91 - "money.spec.ts"
Cohesion: 0.22
Nodes (7): gps(), Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 92 - "alerts.ts"
Cohesion: 0.31
Nodes (8): @prisma/client, DIVIDEND_H, dividendCoins(), rankOf(), Alert, readyAlerts(), localeOf(), Notice

### Community 93 - "rewards.ts"
Cohesion: 0.09
Nodes (45): Details, GET, mine(), POST, Schema, POST, Schema, POST (+37 more)

### Community 94 - "seed.ts"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, bcryptjs

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 97 - "@playwright/test"
Cohesion: 0.20
Nodes (6): META, Traffic, json(), octet(), open(), @playwright/test

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, How it works, Render, Run locally (+2 more)

### Community 108 - "Others"
Cohesion: 0.21
Nodes (4): angle(), Others, tagColor(), WorldPlayer

### Community 115 - "Player"
Cohesion: 0.07
Nodes (12): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, World (+4 more)

## Knowledge Gaps
- **13 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 857 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `fmtNum`, `server/hub.ts`, `server/localData.ts`, `idle.ts`, `StoreInfo.tsx`, `Panels.tsx`, `goals.ts`, `Call.tsx`, `msg`, `server/drive.ts`, `Play.tsx`, `AdminLandmarks.tsx`, `server/shops.ts`, `Drive.tsx`, `Rewards.tsx`, `server/arena.ts`, `GameMap.tsx`, `HttpError`, `server/empire.ts`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `music.ts`, `http.ts`, `social/route.ts`, `layout.tsx`, `I18nProvider.tsx`, `Combat`, `arena/combat.ts`, `db.ts`, `lotteries/route.ts`, `Drive`, `Game.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `perf.ts`, `i18n/index.ts`, `AdminPanel.tsx`, `client.ts`, `distanceM`, `server/places.ts`, `server/traffic.ts`, `useGame`, `StreetQuest — working notes for Claude`, `alerts.ts`, `rewards.ts`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06864035087719299 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `fmtNum`, `server/localData.ts`, `StoreInfo.tsx`, `Panels.tsx`, `server/drive.ts`, `Play.tsx`, `server/shops.ts`, `Drive.tsx`, `server/arena.ts`, `GameMap.tsx`, `gpsgames.ts`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `db.ts`, `Drive`, `Game.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `useLocation.ts`, `LocationReporter`, `server/places.ts`, `server/traffic.ts`, `useGame`, `rewards.ts`, `Player`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `fmtNum` be split into smaller, more focused modules?**
  _Cohesion score 0.13821138211382114 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `alerts.ts` to `city-pack.ts`, `server/steps.ts`, `server/localData.ts`, `db.ts`, `goals.ts`, `server/drive.ts`, `package.json`, `AdminLandmarks.tsx`, `server/shops.ts`, `server/arena.ts`, `distanceM`, `server/traffic.ts`, `server/city.ts`, `server/empire.ts`, `gpsgames.ts`, `money.spec.ts`, `seed.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._