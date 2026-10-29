# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 334 files · ~361,929 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3225 nodes · 10824 edges · 110 communities (102 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 236 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `524b5164`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- fmtNum
- city-pack.ts
- db.ts
- server/localData.ts
- idle.ts
- StoreInfo.tsx
- pwaClient.ts
- world3d.ts
- goals.ts
- Call.tsx
- msg
- tiles.ts
- server/drive.ts
- Empire.tsx
- Play.tsx
- drive/landmarks.ts
- server/shops.ts
- DriveGarage.tsx
- Rewards.tsx
- arena/combat.ts
- GameMap.tsx
- protocol.ts
- HttpError
- lib/city.ts
- gpsgames.ts
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- Drive.tsx
- http.ts
- distanceM
- layout.tsx
- fa/index.ts
- local/route.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- i18n/index.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
- i18n-check.ts
- Landmarks
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
- expectOk
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- randomSpot
- locationTracker
- vectorTile.ts
- NearbyStore
- geo.ts
- me/route.ts
- pins.ts
- useLocation.ts
- AdminPanel.tsx
- allowScripts
- AdminLandmarks.tsx
- mapStyles.ts
- ref_node_child_process
- report
- Panels.tsx
- tracker.ts
- vercel.json
- drive/traffic.ts
- server/places.ts
- lib/places.ts
- ads.txt/route.ts
- server/traffic.ts
- Player
- t
- city/route.ts
- money.spec.ts
- DrivePad.tsx
- lib/business.ts
- @prisma/client
- physics.ts
- matchVendor
- @playwright/test
- server/landmarks.ts
- localData.test.ts
- city.test.ts
- osm-pbf.ts
- StreetQuest — real-world GPS war game
- course.ts
- DriveNet
- storeData
- jobs.spec.ts
- next.config.ts
- Drive
- Player

## God Nodes (most connected - your core abstractions)
1. `t()` - 405 edges
2. `HttpError` - 157 edges
3. `Drive()` - 137 edges
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
- `Where things are (read these instead of exploring)` --references--> `msg()`  [INFERRED]
  CLAUDE.md → src/lib/i18n/index.ts
- `Where things are (read these instead of exploring)` --references--> `t()`  [INFERRED]
  CLAUDE.md → src/lib/i18n/index.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts

## Import Cycles
- None detected.

## Communities (110 total, 8 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (79): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtSprite(), ArtUse(), artFor() (+71 more)

### Community 1 - "fmtNum"
Cohesion: 0.10
Nodes (46): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), WorldPlace, WorldSpot (+38 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.13
Nodes (22): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+14 more)

### Community 3 - "db.ts"
Cohesion: 0.07
Nodes (46): GET, POST, Schema, GET, POST, Send, pub, Schema (+38 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.09
Nodes (31): normName(), vendorKind, buildTorobMap(), collectTorobPlaces(), DivarPlace, freshTorobMap(), getJson(), inflight (+23 more)

### Community 5 - "idle.ts"
Cohesion: 0.05
Nodes (62): Commands, Done means, Fast, low-token tools (installed), graphify, StreetQuest — working notes for Claude, Where things are (read these instead of exploring), GET, ALL_AT (+54 more)

### Community 6 - "StoreInfo.tsx"
Cohesion: 0.09
Nodes (38): clock(), DivarList(), HoursTable(), InfoProps, LINK_ICON, Links, OpenBadge(), spanText() (+30 more)

### Community 7 - "pwaClient.ts"
Cohesion: 0.16
Nodes (24): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+16 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (39): PropKind, nameLines(), oneLine(), artImage(), artImages, at(), canvas(), curtain() (+31 more)

### Community 9 - "goals.ts"
Cohesion: 0.22
Nodes (19): GoalDef, GoalReward, MilestoneDef, announce(), bump(), claimGoal(), factionGoal(), fmtReward() (+11 more)

### Community 10 - "Call.tsx"
Cohesion: 0.08
Nodes (37): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+29 more)

### Community 11 - "msg"
Cohesion: 0.14
Nodes (12): GET(), ART, dynamic, FAQ, FEATURES, metadata, PILLARS, STEPS (+4 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (24): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+16 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.13
Nodes (25): CHECKPOINT_M, checkPoints(), COIN_M, COUNTDOWN_MS, isPartyCode(), newPartyCode(), PARTY_GAMES, PARTY_IDLE_MS (+17 more)

### Community 14 - "Empire.tsx"
Cohesion: 0.10
Nodes (27): react, Art(), ArtAnim, isThenable(), Props, Opts, queue, Req (+19 more)

### Community 15 - "Play.tsx"
Cohesion: 0.09
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 16 - "drive/landmarks.ts"
Cohesion: 0.19
Nodes (16): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+8 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.09
Nodes (37): GET, GET, GET, POST, Schema, Fields, Schema, Details (+29 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.15
Nodes (17): CTL, DriveGarage(), NAMES, Props, askTilt(), SteerMode, IconName, PATHS (+9 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.07
Nodes (39): Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp, Me (+31 more)

### Community 20 - "arena/combat.ts"
Cohesion: 0.05
Nodes (64): BOT_NAMES, Brain, SKILL, FireMsg, camFwd, CombatHost, CombatInput, FeedLine (+56 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.10
Nodes (38): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameItem, GameMap() (+30 more)

### Community 22 - "protocol.ts"
Cohesion: 0.07
Nodes (49): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+41 more)

### Community 23 - "HttpError"
Cohesion: 0.09
Nodes (47): POST, Schema, Details, GET, mine(), POST, Schema, GET (+39 more)

### Community 24 - "lib/city.ts"
Cohesion: 0.11
Nodes (25): Production checklist, centroid(), CityDetail, CityPitch, fromOverpass(), heightOf(), httpUrl(), infoOfTags() (+17 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (32): GET, here(), POST, Schema, offset(), FIND_RADIUS_M, GPS_GAMES, GpsGameKind (+24 more)

### Community 26 - "Button"
Cohesion: 0.12
Nodes (48): Button(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+40 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.08
Nodes (46): AREA_Y, Builder, buildTileArrays(), color(), COOLER, cornerSigns(), cuboid(), dashes() (+38 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.09
Nodes (38): Action, GET, layDrops(), POST, ItemDef, ITEMS, Rarity, RARITY_COLOR (+30 more)

### Community 30 - "Drive.tsx"
Cohesion: 0.09
Nodes (22): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+14 more)

### Community 31 - "http.ts"
Cohesion: 0.08
Nodes (40): bcryptjs, next, AdminPage(), keyMatches(), GET, POST, POST, Schema (+32 more)

### Community 32 - "distanceM"
Cohesion: 0.09
Nodes (45): POST, Schema, GET, num(), Schema, GET, bbox(), dayPhase (+37 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.06
Nodes (23): admin, app, arena, call, common, data, drive, empire (+15 more)

### Community 35 - "local/route.ts"
Cohesion: 0.15
Nodes (21): empty, GET, num, Query, DIVAR_CAT_KEYS, rialToToman(), StoreData, cached() (+13 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.13
Nodes (24): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+16 more)

### Community 37 - "Combat"
Cohesion: 0.05
Nodes (21): Avatar, loadSoldier(), Combat, FootBody, beepSound(), blip(), boomSound(), emptySound() (+13 more)

### Community 38 - "avatar.ts"
Cohesion: 0.06
Nodes (25): three, axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp (+17 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.09
Nodes (28): days(), dynamic, GET, GET, ACTIVE, GET, live(), Point (+20 more)

### Community 40 - "sfx.ts"
Cohesion: 0.08
Nodes (42): duckMusic(), graph(), listeners, midi(), Mood, pluck(), PROGS, refresh() (+34 more)

### Community 41 - "getT"
Cohesion: 0.18
Nodes (16): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+8 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS (+10 more)

### Community 43 - "geom.ts"
Cohesion: 0.11
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.09
Nodes (16): dir, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "Landmarks"
Cohesion: 0.27
Nodes (3): disposeModel(), Landmarks, LandmarkView

### Community 46 - "helpers.ts"
Cohesion: 0.22
Nodes (9): Loc, Near, World, WorldP, fakeIp(), LatLng, Me, octet() (+1 more)

### Community 47 - "package.json"
Cohesion: 0.09
Nodes (22): engines, node, name, overrides, deepmerge-ts, postcss, private, type (+14 more)

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
Nodes (50): LatLng, World, ALL_LAYERS, Drive, Game(), GameMap, LAYERS_BEFORE_TOROB, MAP_LAYERS (+42 more)

### Community 52 - "requireUser"
Cohesion: 0.07
Nodes (64): zod, POST, Schema, GET, Point, POST, pub, Schema (+56 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 55 - "server/city.ts"
Cohesion: 0.17
Nodes (28): GET, overpassQuery(), parseTileKey(), tileKey, tileOf(), villageTile(), packPlaces(), cellKey() (+20 more)

### Community 56 - "match.ts"
Cohesion: 0.06
Nodes (51): Bomb, MatchResult, buildings, F, host, log, m, mode (+43 more)

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+15 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "expectOk"
Cohesion: 0.18
Nodes (13): Dash, store(), World, Mission, setup(), World, Feed, Post (+5 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.27
Nodes (9): ArenaMe, befriend(), drive(), DriveRes, driveTo(), Other, Party, PartyState (+1 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.12
Nodes (14): A, ads, D, districts, pairAt(), shops, SMALLTOWN, StubShop (+6 more)

### Community 66 - "randomSpot"
Cohesion: 0.20
Nodes (7): META, Online, randomSpot(), octet(), returningPlayer(), test, withGps()

### Community 68 - "vectorTile.ts"
Cohesion: 0.07
Nodes (32): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+24 more)

### Community 70 - "geo.ts"
Cohesion: 0.19
Nodes (10): Listener, nearby, NearPlayer, NearReport, Sample, Sent, bearingTo(), LatLng (+2 more)

### Community 71 - "me/route.ts"
Cohesion: 0.11
Nodes (33): POST, GET, POST, Schema, GET, POST, Schema, GET (+25 more)

### Community 72 - "pins.ts"
Cohesion: 0.17
Nodes (8): Cloud, Pin, pinTexture(), StorePins, OTHER, Trade, tradeOf(), TRADES

### Community 73 - "useLocation.ts"
Cohesion: 0.25
Nodes (5): FireReport, LocationReporter, LocationSnapshot, serverSnapshot, useLocation()

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.08
Nodes (35): ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt() (+27 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "AdminLandmarks.tsx"
Cohesion: 0.18
Nodes (17): AdminDropMap(), Clicks(), P, Recenter(), AdminLandmarks(), Biz, download(), Draft (+9 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.15
Nodes (9): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, OPEN_TOPO, tileHosts() (+1 more)

### Community 79 - "report"
Cohesion: 0.20
Nodes (19): POST, gridSpot(), footFlags(), assertCanParty(), createParty(), inviteToParty(), isVirtual(), joinParty() (+11 more)

### Community 80 - "Panels.tsx"
Cohesion: 0.06
Nodes (55): ApiError, CashoutView, ensureGuest(), fmtTime(), GpsView, ShopDeal, WorldDelivery, WorldEvent (+47 more)

### Community 81 - "tracker.ts"
Cohesion: 0.25
Nodes (10): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+2 more)

### Community 83 - "drive/traffic.ts"
Cohesion: 0.10
Nodes (20): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+12 more)

### Community 84 - "server/places.ts"
Cohesion: 0.12
Nodes (35): GET, POST, Schema, POST, Schema, POST, POST, Schema (+27 more)

### Community 85 - "lib/places.ts"
Cohesion: 0.07
Nodes (32): CELL_DEG, cellOf(), hashStr(), DROP_PREFIX, MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell() (+24 more)

### Community 86 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 87 - "server/traffic.ts"
Cohesion: 0.13
Nodes (27): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+19 more)

### Community 88 - "Player"
Cohesion: 0.23
Nodes (5): crew(), homePlayer(), Player, openGame(), SfxHook

### Community 89 - "t"
Cohesion: 0.13
Nodes (38): askConfirm(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS, GoToShop() (+30 more)

### Community 90 - "city/route.ts"
Cohesion: 0.16
Nodes (15): Action, Fields, GET, Meta, POST, PUT, Colour, Info (+7 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.22
Nodes (7): gps(), Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 92 - "DrivePad.tsx"
Cohesion: 0.25
Nodes (16): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+8 more)

### Community 93 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 94 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 95 - "physics.ts"
Cohesion: 0.22
Nodes (9): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+1 more)

### Community 96 - "matchVendor"
Cohesion: 0.21
Nodes (14): dynamic, GET(), short(), turnConfigured(), base(), cellOf(), extHealth(), matchScore() (+6 more)

### Community 97 - "@playwright/test"
Cohesion: 0.22
Nodes (6): Empire, Traffic, json(), octet(), open(), @playwright/test

### Community 98 - "server/landmarks.ts"
Cohesion: 0.21
Nodes (14): BUDGET, glbProblem(), HULL_MAX_POINTS, LANDMARK_MAX_BYTES, modelUrl(), adminLandmarks(), LandmarkInput, landmarksAround() (+6 more)

### Community 99 - "localData.test.ts"
Cohesion: 0.24
Nodes (14): done(), emptyWeek(), latinDigits(), minutes(), nameScore(), sameLetters(), sameName(), sameStore() (+6 more)

### Community 100 - "city.test.ts"
Cohesion: 0.15
Nodes (11): buildingLook(), FACADES, Layer, middleEast(), CityBuilding, cx, cy, origin (+3 more)

### Community 101 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, How it works, Render, Run locally (+2 more)

### Community 103 - "course.ts"
Cohesion: 0.25
Nodes (8): layCourse(), P, Roads, samples(), RoadKind, COIN_POINTS, PartyGame, RACE_POINTS

### Community 105 - "storeData"
Cohesion: 0.25
Nodes (9): divarLink(), isFoodCat(), onHost(), sellsOnSnappfood(), snappfoodCode(), torobLink(), torobShopId(), siteIcon() (+1 more)

### Community 106 - "jobs.spec.ts"
Cohesion: 0.40
Nodes (3): Lottery, MyRides, Ride

### Community 108 - "Drive"
Cohesion: 0.13
Nodes (7): Drive(), Markers, angle(), Others, tagColor(), DetailSource, TileSource

### Community 115 - "Player"
Cohesion: 0.06
Nodes (15): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, Space (+7 more)

## Knowledge Gaps
- **13 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 859 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `fmtNum`, `db.ts`, `server/localData.ts`, `idle.ts`, `StoreInfo.tsx`, `pwaClient.ts`, `goals.ts`, `Call.tsx`, `server/drive.ts`, `Empire.tsx`, `Play.tsx`, `server/shops.ts`, `DriveGarage.tsx`, `Rewards.tsx`, `arena/combat.ts`, `GameMap.tsx`, `HttpError`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `Drive.tsx`, `http.ts`, `distanceM`, `layout.tsx`, `local/route.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `lotteries/route.ts`, `Game.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `perf.ts`, `geo.ts`, `me/route.ts`, `AdminPanel.tsx`, `AdminLandmarks.tsx`, `report`, `Panels.tsx`, `server/places.ts`, `server/traffic.ts`, `city/route.ts`, `DrivePad.tsx`, `server/landmarks.ts`, `storeData`, `Drive`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07092198581560284 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `@playwright/test` to `local.spec.ts`, `randomSpot`, `StreetQuest — real-world GPS war game`, `jobs.spec.ts`, `i18n-check.ts`, `helpers.ts`, `package.json`, `Player`, `money.spec.ts`, `expectOk`, `drive.spec.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `fmtNum` be split into smaller, more focused modules?**
  _Cohesion score 0.09877551020408164 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `fmtNum`, `server/localData.ts`, `StoreInfo.tsx`, `server/drive.ts`, `Play.tsx`, `server/shops.ts`, `arena/combat.ts`, `GameMap.tsx`, `HttpError`, `gpsgames.ts`, `lib/settings.ts`, `Drive.tsx`, `http.ts`, `local/route.ts`, `i18n/index.ts`, `lotteries/route.ts`, `Game.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `geo.ts`, `useLocation.ts`, `report`, `Panels.tsx`, `server/places.ts`, `lib/places.ts`, `server/traffic.ts`, `matchVendor`, `Drive`, `Player`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._