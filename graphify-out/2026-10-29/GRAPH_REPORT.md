# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 325 files · ~337,039 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3043 nodes · 10235 edges · 119 communities (97 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6fbdfab0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- lib/city.ts
- db.ts
- server/localData.ts
- idle.ts
- .shoot
- Button.tsx
- Drive.tsx
- Rewards.tsx
- fmtNum
- server/empire.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- server/shops.ts
- DrivePad.tsx
- Game.tsx
- geo.ts
- GameMap.tsx
- arena/combat.ts
- Drive
- me/route.ts
- gpsgames.ts
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminDropMap.tsx
- http.ts
- distanceM
- layout.tsx
- fa/index.ts
- goals.ts
- translate
- Combat
- avatar.ts
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- physics.ts
- server/steps.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- client.ts
- requireUser
- osm-pbf.ts
- protocol.ts
- server/city.ts
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
- world.spec.ts
- LocationReporter
- Panels.tsx
- NearbyStore
- Remotes
- server/arena.ts
- AdminLandmarks.tsx
- .onMsg
- AdminPanel.tsx
- allowScripts
- lotteries/route.ts
- mapStyles.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- filter.ts
- server/quests.ts
- footprint.ts
- i18n/index.ts
- LatLng
- randomSpot
- t
- CLAUDE.md
- Player
- sound.spec.ts
- HttpError
- useLocation.ts
- overrides
- game.ts
- @playwright/test
- call.spec.ts
- fa/arena.ts
- locationTracker
- remotes.ts
- call.ts
- Viewmodel
- data.ts
- play/page.tsx
- common.ts
- I18nProvider.tsx
- sim.ts
- fa/lottery.ts
- fa/world.ts
- fa/settings.ts
- market.ts
- vfx.ts
- panels.ts
- Player
- RtClient
- @prisma/client
- next.config.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 385 edges
2. `HttpError` - 155 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 128 edges
5. `Button()` - 108 edges
6. `distanceM()` - 97 edges
7. `body()` - 87 edges
8. `prisma` - 85 edges
9. `fmtNum()` - 84 edges
10. `api()` - 81 edges

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

## Communities (119 total, 22 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.06
Nodes (86): cells, keys, [out = "art-preview.html", only], sym, ART, dynamic, FAQ, FEATURES (+78 more)

### Community 1 - "helpers.ts"
Cohesion: 0.15
Nodes (10): Lottery, MyRides, Ride, META, Traffic, fakeIp(), Me, octet() (+2 more)

### Community 2 - "lib/city.ts"
Cohesion: 0.09
Nodes (39): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+31 more)

### Community 3 - "db.ts"
Cohesion: 0.08
Nodes (41): GET, POST, Schema, GET, POST, Send, dynamic, GET() (+33 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (54): divarLink(), FILLER, FOOD, isFoodCat(), LINK_CHECKS, Menu, MenuItem, MenuSection (+46 more)

### Community 5 - "idle.ts"
Cohesion: 0.13
Nodes (24): ALL_AT, BASE_OFFLINE_H, BizDef, bizMult(), cycleRevenue(), cycleSecs(), FAME_BONUS, fameMult() (+16 more)

### Community 6 - ".shoot"
Cohesion: 0.24
Nodes (4): FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 7 - "Button.tsx"
Cohesion: 0.25
Nodes (7): isThenable(), Props, installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), ShareButton()

### Community 8 - "Drive.tsx"
Cohesion: 0.06
Nodes (61): three, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked (+53 more)

### Community 9 - "Rewards.tsx"
Cohesion: 0.12
Nodes (23): bump(), calm(), Celebration, CelebrationLayer(), compact(), confetti(), CountUp(), DIGITS (+15 more)

### Community 10 - "fmtNum"
Cohesion: 0.16
Nodes (31): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), PartyHud(), InfoCard() (+23 more)

### Community 11 - "server/empire.ts"
Cohesion: 0.14
Nodes (22): GET, BIZ_BY_KEY, BizState, BOOST_MAX_H, BOOST_MINUTES, BUSINESSES, dividendCoins(), EmpireState (+14 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (23): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+15 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (55): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+47 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "Play.tsx"
Cohesion: 0.06
Nodes (49): react, Art(), ArtAnim, AutoVideo(), Props, DialogHost(), Opts, queue (+41 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.09
Nodes (20): Job, transferables(), AREA, clipLine(), flatRoofRegion(), Geom, HouseNumber, NameMode (+12 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.09
Nodes (38): GET, GET, GET, POST, Schema, Fields, POST, Schema (+30 more)

### Community 18 - "DrivePad.tsx"
Cohesion: 0.20
Nodes (18): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+10 more)

### Community 19 - "Game.tsx"
Cohesion: 0.06
Nodes (59): load(), requestRewarded(), LatLng, Me, World, Drive, Game(), GameMap (+51 more)

### Community 20 - "geo.ts"
Cohesion: 0.16
Nodes (20): clipRing(), sliceVectorTile(), fillFrontage(), pack(), villageTile(), bearingTo(), cellOf(), hashStr() (+12 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.12
Nodes (32): leaflet, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props (+24 more)

### Community 22 - "arena/combat.ts"
Cohesion: 0.09
Nodes (27): camFwd, CombatHost, CombatHud, CombatInput, FeedLine, SENS_TOUCH, store, v3 (+19 more)

### Community 23 - "Drive"
Cohesion: 0.09
Nodes (10): Drive(), Markers, DriveNet, angle(), Others, tagColor(), StorePins, DetailSource (+2 more)

### Community 24 - "me/route.ts"
Cohesion: 0.17
Nodes (19): GET, GET, DIVIDEND_H, rankOf(), ACHIEVEMENT_BY_KEY, AchievementDef, ACHIEVEMENTS, DAILY_REWARD() (+11 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "Button"
Cohesion: 0.13
Nodes (51): Button(), askConfirm(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data (+43 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (36): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes() (+28 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.08
Nodes (44): Action, GET, layDrops(), POST, empty, GET, num, Query (+36 more)

### Community 30 - "AdminDropMap.tsx"
Cohesion: 0.38
Nodes (6): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 31 - "http.ts"
Cohesion: 0.07
Nodes (46): bcryptjs, jose, next, AdminPage(), keyMatches(), GET, POST, POST (+38 more)

### Community 32 - "distanceM"
Cohesion: 0.07
Nodes (57): GET, Schema, POST, Schema, POST, Schema, POST, GET (+49 more)

### Community 33 - "layout.tsx"
Cohesion: 0.11
Nodes (12): react-dom, cinzel, fredoka, generateMetadata(), inter, VAZIRMATN, viewport, GET() (+4 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "goals.ts"
Cohesion: 0.16
Nodes (25): POST, Schema, adStatus(), claimAd(), clickAd(), dayStart(), HOUSE_AD, network() (+17 more)

### Community 36 - "translate"
Cohesion: 0.17
Nodes (13): GlobalError(), I18nProvider(), LOCALE_META, Messages, parse(), pluralOf(), render(), translate() (+5 more)

### Community 38 - "avatar.ts"
Cohesion: 0.14
Nodes (12): Avatar, axisL, Clip, NATURAL, Pose, qa, qp, right (+4 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.12
Nodes (22): days(), dynamic, GET, Schema, ACTIVE, GET, live(), Point (+14 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.24
Nodes (13): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+5 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (9): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+1 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "physics.ts"
Cohesion: 0.12
Nodes (13): disposeModel(), Landmarks, Body, cellOf(), CollisionWorld, Controls, forward(), stepAir() (+5 more)

### Community 46 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

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
Cohesion: 0.09
Nodes (21): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, ShopDeal, WorldDelivery, WorldEvent (+13 more)

### Community 52 - "requireUser"
Cohesion: 0.07
Nodes (68): zod, POST, POST, POST, Schema, GET, Point, POST (+60 more)

### Community 53 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (49): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+41 more)

### Community 55 - "server/city.ts"
Cohesion: 0.15
Nodes (29): GET, Colour, GET, Points, POST, Upload, parseTileKey(), TILE_V (+21 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (45): BOT_NAMES, Brain, SKILL, Bomb, POST, DIFF, DIFF_LABEL, SIZE_LABEL (+37 more)

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
Nodes (6): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide()

### Community 62 - "drive.spec.ts"
Cohesion: 0.24
Nodes (12): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+4 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.15
Nodes (9): D, shops, StubShop, StubVendor, vendors, ADMIN_KEY, E2E_DB, PORT (+1 more)

### Community 66 - "world.spec.ts"
Cohesion: 0.20
Nodes (9): Loc, Near, World, WorldP, LatLng, octet(), returningPlayer(), test (+1 more)

### Community 68 - "Panels.tsx"
Cohesion: 0.07
Nodes (58): ModeCards(), duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume() (+50 more)

### Community 70 - "Remotes"
Cohesion: 0.18
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 71 - "server/arena.ts"
Cohesion: 0.10
Nodes (24): FireMsg, Space, weaponOf(), POST, Schema, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL (+16 more)

### Community 72 - "AdminLandmarks.tsx"
Cohesion: 0.06
Nodes (59): Action, Fields, GET, Meta, POST, AdminLandmarks(), Biz, download() (+51 more)

### Community 73 - ".onMsg"
Cohesion: 0.18
Nodes (14): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+6 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lotteries/route.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS (+10 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (8): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, tileHosts(), Tiles

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.12
Nodes (31): msg(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place (+23 more)

### Community 83 - "filter.ts"
Cohesion: 0.29
Nodes (9): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+1 more)

### Community 84 - "server/quests.ts"
Cohesion: 0.18
Nodes (15): ItemDef, ITEMS, Rarity, RARITY_COLOR, RARITY_WEIGHT, CAMPAIGN, campaignKey(), DAILY_POOL (+7 more)

### Community 85 - "footprint.ts"
Cohesion: 0.27
Nodes (8): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), VT_ZOOM, insidePacked()

### Community 86 - "i18n/index.ts"
Cohesion: 0.11
Nodes (26): RootLayout(), manifest(), catalogs, compiled, dateFmt, DEFAULT_LOCALE, dirOf(), isLocale() (+18 more)

### Community 87 - "LatLng"
Cohesion: 0.07
Nodes (45): GET, Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+37 more)

### Community 88 - "randomSpot"
Cohesion: 0.22
Nodes (12): Dash, store(), World, Mission, setup(), World, Feed, Post (+4 more)

### Community 89 - "t"
Cohesion: 0.13
Nodes (39): fmtCountdown(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS, GoToShop() (+31 more)

### Community 91 - "Player"
Cohesion: 0.24
Nodes (4): gps(), Money, World, Player

### Community 93 - "HttpError"
Cohesion: 0.11
Nodes (36): PUT, Details, GET, mine(), POST, Schema, GET, GET (+28 more)

### Community 94 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): FireReport, Sent, GeoError, Listener, LocationSnapshot, Anim, Guide, guideKey() (+4 more)

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 97 - "@playwright/test"
Cohesion: 0.20
Nodes (6): crew(), Empire, octet(), phone(), phoneSetup(), @playwright/test

### Community 98 - "call.spec.ts"
Cohesion: 0.83
Nodes (3): json(), octet(), open()

### Community 101 - "remotes.ts"
Cohesion: 0.07
Nodes (34): HttpMe, Ent, HTTP_DELAY_MS, RT_DELAY_MS, Sign, Snap, Target, CTL (+26 more)

### Community 103 - "Viewmodel"
Cohesion: 0.12
Nodes (4): loadWeapons(), ADS, HIP, Viewmodel

### Community 105 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 107 - "I18nProvider.tsx"
Cohesion: 0.36
Nodes (8): PlayError(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALES

### Community 108 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 115 - "Player"
Cohesion: 0.13
Nodes (4): Hub, Player, World, LL

### Community 117 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 798 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `db.ts`, `server/localData.ts`, `Button.tsx`, `Drive.tsx`, `Rewards.tsx`, `fmtNum`, `server/empire.ts`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `server/shops.ts`, `DrivePad.tsx`, `Game.tsx`, `geo.ts`, `GameMap.tsx`, `arena/combat.ts`, `Drive`, `me/route.ts`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `http.ts`, `distanceM`, `layout.tsx`, `goals.ts`, `translate`, `Combat`, `avatar.ts`, `rides/route.ts`, `client.ts`, `requireUser`, `server/city.ts`, `match.ts`, `perf.ts`, `Panels.tsx`, `Remotes`, `server/arena.ts`, `AdminLandmarks.tsx`, `.onMsg`, `AdminPanel.tsx`, `lotteries/route.ts`, `server/places.ts`, `server/quests.ts`, `i18n/index.ts`, `LatLng`, `HttpError`, `remotes.ts`, `I18nProvider.tsx`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06129830573005901 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `server/localData.ts`, `Drive.tsx`, `fmtNum`, `server/drive.ts`, `Play.tsx`, `server/shops.ts`, `Game.tsx`, `geo.ts`, `Drive`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `rides/route.ts`, `requireUser`, `server/city.ts`, `match.ts`, `Match`, `LocationReporter`, `Panels.tsx`, `server/arena.ts`, `lotteries/route.ts`, `server/places.ts`, `LatLng`, `HttpError`, `useLocation.ts`, `Player`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14705882352941177 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `avatar.ts`, `Remotes`, `.shoot`, `Viewmodel`, `.onMsg`, `server/arena.ts`, `Drive.tsx`, `RtClient`, `Drive`, `arena/combat.ts`, `protocol.ts`, `match.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._