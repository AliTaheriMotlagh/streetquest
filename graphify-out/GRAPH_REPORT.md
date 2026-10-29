# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 348 files · ~378,793 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3374 nodes · 11215 edges · 111 communities (102 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 245 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2b60f139`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- formatDistance
- city-pack.ts
- server/hub.ts
- server/localData.ts
- idle.ts
- StoreInfo.tsx
- fleet3d.ts
- world3d.ts
- goals.ts
- Call.tsx
- Button
- tiles.ts
- server/drive.ts
- client.ts
- Play.tsx
- AdminLandmarks.tsx
- db.ts
- music.ts
- t
- gunsound.ts
- GameMap.tsx
- arena/combat.ts
- Rewards.tsx
- me/route.ts
- gpsgames.ts
- Panels.tsx
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- vehicles.ts
- http.ts
- server/places.ts
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
- Drive.tsx
- i18n-check.ts
- people.ts
- randomSpot
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- HttpError
- i18n.ts
- realtime/server.ts
- server/city.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- helpers.ts
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- lib/city.ts
- locationTracker
- vectorTile.ts
- NearbyStore
- useLocation.ts
- world/route.ts
- relay.test.ts
- LocationReporter
- react
- allowScripts
- AdminDropMap.tsx
- mapStyles.ts
- health/route.ts
- lib/money.ts
- pwaClient.ts
- filter.ts
- vercel.json
- others.ts
- server/money.ts
- vfx.ts
- business/route.ts
- geo.ts
- Player
- Market.tsx
- visits.ts
- money.spec.ts
- DriveGarage.tsx
- LanguageSwitch.tsx
- BuildPool
- install.sh
- storeData
- @playwright/test
- CombatPad.tsx
- localData.test.ts
- landmarks.spec.ts
- next.config.ts
- StreetQuest — real-world GPS war game
- Drive
- Player
- msg
- geom.ts
- relay.mjs
- admin/landmarks/route.ts
- StreetQuest — working notes for Claude
- ads.txt/route.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 411 edges
2. `HttpError` - 157 edges
3. `Drive()` - 140 edges
4. `requireUser()` - 132 edges
5. `Button()` - 115 edges
6. `distanceM()` - 110 edges
7. `fmtNum()` - 99 edges
8. `body()` - 87 edges
9. `prisma` - 86 edges
10. `api()` - 84 edges

## Surprising Connections (you probably didn't know these)
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts

## Import Cycles
- None detected.

## Communities (111 total, 9 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (77): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), ArtUse(), artHtml(), artSvg() (+69 more)

### Community 1 - "formatDistance"
Cohesion: 0.14
Nodes (34): WorldPlace, WorldSpot, InfoCard(), NearbyPanel(), NoteCard(), BizCard(), catOf(), GoThere() (+26 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.08
Nodes (32): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+24 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.09
Nodes (38): GET, POST, Schema, POST, Send, GET, POST, Schema (+30 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (31): mergeTorobPlace(), stockOf(), AREA_SEEDS, areaPlaces(), buildTorobMap(), collectTorobPlaces(), DivarPlace, exploring (+23 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (61): lat, lng, prisma, start, @prisma/client, GET, ALL_AT, BASE_OFFLINE_H (+53 more)

### Community 6 - "StoreInfo.tsx"
Cohesion: 0.08
Nodes (40): clock(), DivarList(), HoursTable(), InfoProps, LINK_ICON, Links, OpenBadge(), spanText() (+32 more)

### Community 7 - "fleet3d.ts"
Cohesion: 0.13
Nodes (31): bike(), BLOB, BRAKE_OFF, BRAKE_ON, Build, bus(), cache, car() (+23 more)

### Community 8 - "world3d.ts"
Cohesion: 0.06
Nodes (47): artFor(), parts(), Cloud, Pin, pinTexture(), StorePins, nameLines(), OTHER (+39 more)

### Community 9 - "goals.ts"
Cohesion: 0.15
Nodes (26): POST, Schema, AdCreative, adStatus(), claimAd(), clickAd(), dayStart(), HOUSE_AD (+18 more)

### Community 10 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 11 - "Button"
Cohesion: 0.16
Nodes (29): Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm() (+21 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (27): Production checklist, Job, transferables(), Cached, db(), idbGet(), idbPut(), idbRead() (+19 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (54): POST, layCourse(), P, Roads, samples(), Payload, RoadKind, CHECKPOINT_M (+46 more)

### Community 14 - "client.ts"
Cohesion: 0.11
Nodes (16): ApiError, CashoutView, ensureGuest(), GpsView, Selected, ShopDeal, WorldDelivery, WorldEvent (+8 more)

### Community 15 - "Play.tsx"
Cohesion: 0.07
Nodes (46): Art(), ArtAnim, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+38 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.05
Nodes (55): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+47 more)

### Community 17 - "db.ts"
Cohesion: 0.06
Nodes (44): GET, GET, GET, POST, Schema, Fields, Schema, Details (+36 more)

### Community 18 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 19 - "t"
Cohesion: 0.08
Nodes (48): Home(), ArenaMenu(), AutoVideo(), Props, paintGauge(), DriveParty(), Friend, GAMES (+40 more)

### Community 20 - "gunsound.ts"
Cohesion: 0.32
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (36): leaflet, Clicks(), FrameTarget(), GameItem, GameMap(), guidesFor(), Layers(), MARKER_BUDGET (+28 more)

### Community 22 - "arena/combat.ts"
Cohesion: 0.06
Nodes (72): BOT_NAMES, Brain, SKILL, Sample, FireMsg, POST, Schema, camFwd (+64 more)

### Community 23 - "Rewards.tsx"
Cohesion: 0.10
Nodes (28): Me, News, ReadyItem, Wallet(), bump(), calm(), Celebration, CelebrationLayer() (+20 more)

### Community 24 - "me/route.ts"
Cohesion: 0.10
Nodes (33): POST, GET, POST, Schema, GET, POST, Schema, GET (+25 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.12
Nodes (30): GET, here(), POST, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf(), HOLD_RADIUS_M (+22 more)

### Community 26 - "Panels.tsx"
Cohesion: 0.10
Nodes (49): askConfirm(), fmtTime(), fmtCountdown(), LotteryCard(), LotteryTab(), toLocalInput(), useNow(), BuyerOrder() (+41 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.05
Nodes (60): AREA_Y, Builder, buildingLook(), buildTileArrays(), color(), COOLER, cornerSigns(), cuboid() (+52 more)

### Community 28 - "skyline.ts"
Cohesion: 0.16
Nodes (9): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+1 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (35): Action, GET, ITEMS, Rarity, RARITY_WEIGHT, applyConfig(), catalogOriginals(), CATALOGS (+27 more)

### Community 30 - "vehicles.ts"
Cohesion: 0.10
Nodes (19): FleetInstances, box(), TrafficCars, FLEET, FLEET_KEYS, FleetDef, FleetKey, pickFleet() (+11 more)

### Community 31 - "http.ts"
Cohesion: 0.06
Nodes (54): bcryptjs, next, zod, AdminPage(), keyMatches(), GET, POST, POST (+46 more)

### Community 32 - "server/places.ts"
Cohesion: 0.12
Nodes (28): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), PLACE_BUCKET_MS, PLACE_CAT_KEYS (+20 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.06
Nodes (23): admin, app, arena, call, common, data, drive, empire (+15 more)

### Community 35 - "local/route.ts"
Cohesion: 0.13
Nodes (28): empty, GET, num, Query, rialToToman(), vendorKind, base(), cached() (+20 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.14
Nodes (19): GlobalError(), I18nProvider(), LocaleCtx, DEFAULT_LOCALE, Locale, LOCALE_META, Messages, parse() (+11 more)

### Community 37 - "Combat"
Cohesion: 0.05
Nodes (12): Avatar, loadSoldier(), Combat, FootBody, lerpAngle(), Remotes, Vfx, Viewmodel (+4 more)

### Community 38 - "avatar.ts"
Cohesion: 0.13
Nodes (14): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+6 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.08
Nodes (31): days(), dynamic, GET, GET, pub, Schema, ACTIVE, GET (+23 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.18
Nodes (16): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+8 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.21
Nodes (15): GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS, LOTTERY_MIN_PRICE (+7 more)

### Community 43 - "Drive.tsx"
Cohesion: 0.09
Nodes (24): three, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked (+16 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.09
Nodes (16): dir, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "people.ts"
Cohesion: 0.11
Nodes (14): CHADOR, Crowd, HAIR, Look, MANTEAU, PartKey, pick(), Road (+6 more)

### Community 46 - "randomSpot"
Cohesion: 0.18
Nodes (11): Traffic, Loc, Near, World, WorldP, LatLng, randomSpot(), octet() (+3 more)

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
Nodes (49): LatLng, World, ALL_LAYERS, Drive, Game(), GameMap, LAYER_GROUPS, LAYERS_BEFORE_TOROB (+41 more)

### Community 52 - "HttpError"
Cohesion: 0.08
Nodes (71): How it works, layDrops(), POST, GET, GET, POST, POST, Schema (+63 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 54 - "realtime/server.ts"
Cohesion: 0.07
Nodes (32): Identity, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY, server (+24 more)

### Community 55 - "server/city.ts"
Cohesion: 0.19
Nodes (26): overpassQuery(), tileKey, tileOf(), villageTile(), packPlaces(), cellKey(), backoffMs(), due() (+18 more)

### Community 56 - "match.ts"
Cohesion: 0.05
Nodes (62): Bomb, MatchResult, Sock, buildings, F, host, log, m (+54 more)

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+15 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "helpers.ts"
Cohesion: 0.17
Nodes (14): Empire, Online, Mission, World, Feed, Post, expectOk(), fakeIp() (+6 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.23
Nodes (11): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+3 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.12
Nodes (14): A, ads, D, districts, pairAt(), shops, SMALLTOWN, Stock (+6 more)

### Community 66 - "lib/city.ts"
Cohesion: 0.09
Nodes (33): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), VT_ZOOM, centroid() (+25 more)

### Community 68 - "vectorTile.ts"
Cohesion: 0.11
Nodes (22): AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber, NAME_MODES, OPEN (+14 more)

### Community 70 - "useLocation.ts"
Cohesion: 0.15
Nodes (14): Fix, Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent (+6 more)

### Community 71 - "world/route.ts"
Cohesion: 0.08
Nodes (48): GET, GET, GET, Point, Schema, GET, GET, num() (+40 more)

### Community 72 - "relay.test.ts"
Cohesion: 0.13
Nodes (10): env, Box, clamp(), declutter(), labelPx(), Mark, listen(), Seen (+2 more)

### Community 74 - "react"
Cohesion: 0.07
Nodes (41): react, ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt() (+33 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "AdminDropMap.tsx"
Cohesion: 0.38
Nodes (6): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 77 - "mapStyles.ts"
Cohesion: 0.18
Nodes (9): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, OPEN_TOPO, tileHosts() (+1 more)

### Community 78 - "health/route.ts"
Cohesion: 0.53
Nodes (5): dynamic, GET(), short(), turnConfigured(), extHealth()

### Community 79 - "lib/money.ts"
Cohesion: 0.23
Nodes (15): CELL_DEG, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell() (+7 more)

### Community 80 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 81 - "filter.ts"
Cohesion: 0.33
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 83 - "others.ts"
Cohesion: 0.14
Nodes (18): blobTexture(), fleetParts, kitMaterial(), wheelMaterial(), Driver, Snap, Walker, Style (+10 more)

### Community 84 - "server/money.ts"
Cohesion: 0.24
Nodes (12): GET, POST, Schema, POST, afterMoney(), buyMoneyTier(), cleanAccount(), earnedToday() (+4 more)

### Community 85 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 86 - "business/route.ts"
Cohesion: 0.13
Nodes (30): Details, GET, mine(), POST, Schema, GET, POST, Schema (+22 more)

### Community 87 - "geo.ts"
Cohesion: 0.08
Nodes (41): GET, point(), GET, Car, degOf(), lineColors(), Road, TrafficFeed (+33 more)

### Community 88 - "Player"
Cohesion: 0.16
Nodes (9): Dash, store(), World, crew(), setup(), adminPlayer(), Player, openGame() (+1 more)

### Community 89 - "Market.tsx"
Cohesion: 0.12
Nodes (26): Browse(), DEAL_STEPS, endLabel(), ENDS, img(), localInput(), MarketPanel(), Mine (+18 more)

### Community 90 - "visits.ts"
Cohesion: 0.50
Nodes (6): GET, POST, countVisit(), seen, today(), visitTotals()

### Community 91 - "money.spec.ts"
Cohesion: 0.22
Nodes (7): gps(), Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 92 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 93 - "LanguageSwitch.tsx"
Cohesion: 0.50
Nodes (6): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage()

### Community 96 - "storeData"
Cohesion: 0.13
Nodes (22): divarLink(), isFoodCat(), nameScore(), normName(), onHost(), sameLetters(), sameName(), sameStore() (+14 more)

### Community 97 - "@playwright/test"
Cohesion: 0.16
Nodes (8): Lottery, MyRides, Ride, Visits, json(), octet(), open(), @playwright/test

### Community 98 - "CombatPad.tsx"
Cohesion: 0.40
Nodes (5): CombatInput, SENS_TOUCH, CombatPad, Crosshair(), Props

### Community 99 - "localData.test.ts"
Cohesion: 0.29
Nodes (11): done(), emptyWeek(), latinDigits(), MAX_STOCK, minutes(), spanOf(), TorobPlace, weekFromOsm() (+3 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, Render, Run locally, Snappfood from abroad: the relay (ArvanCloud) (+2 more)

### Community 108 - "Drive"
Cohesion: 0.09
Nodes (12): Drive(), Markers, DriveNet, angle(), Others, tagColor(), DetailSource, oneLine() (+4 more)

### Community 115 - "Player"
Cohesion: 0.07
Nodes (13): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, Space (+5 more)

### Community 117 - "msg"
Cohesion: 0.17
Nodes (10): GET(), ART, dynamic, FAQ, FEATURES, metadata, PILLARS, STEPS (+2 more)

### Community 118 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 119 - "relay.mjs"
Cohesion: 0.26
Nodes (9): agents, allowed(), handle(), keyOk(), PORT, readBody(), send(), server (+1 more)

### Community 120 - "admin/landmarks/route.ts"
Cohesion: 0.22
Nodes (13): Action, Fields, GET, Meta, POST, PUT, requireAdmin(), adminLandmarks() (+5 more)

### Community 121 - "StreetQuest — working notes for Claude"
Cohesion: 0.29
Nodes (6): Commands, Done means, Fast, low-token tools (installed), graphify, StreetQuest — working notes for Claude, Where things are (read these instead of exploring)

### Community 122 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

## Knowledge Gaps
- **13 isolated node(s):** `TEHRAN`, `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 910 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `formatDistance`, `server/hub.ts`, `server/localData.ts`, `idle.ts`, `StoreInfo.tsx`, `goals.ts`, `Call.tsx`, `Button`, `server/drive.ts`, `client.ts`, `Play.tsx`, `AdminLandmarks.tsx`, `db.ts`, `music.ts`, `GameMap.tsx`, `arena/combat.ts`, `Rewards.tsx`, `me/route.ts`, `gpsgames.ts`, `Panels.tsx`, `lib/settings.ts`, `http.ts`, `server/places.ts`, `layout.tsx`, `local/route.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `lotteries/route.ts`, `Drive.tsx`, `Game.tsx`, `HttpError`, `match.ts`, `perf.ts`, `world/route.ts`, `react`, `lib/money.ts`, `pwaClient.ts`, `server/money.ts`, `business/route.ts`, `geo.ts`, `Market.tsx`, `DriveGarage.tsx`, `LanguageSwitch.tsx`, `storeData`, `CombatPad.tsx`, `Drive`, `admin/landmarks/route.ts`, `StreetQuest — working notes for Claude`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Are the 66 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 66 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TEHRAN`, `pgdata Volume`, `Render Web Service (streetquest)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07310081223124701 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `@playwright/test` to `local.spec.ts`, `landmarks.spec.ts`, `StreetQuest — real-world GPS war game`, `i18n-check.ts`, `randomSpot`, `package.json`, `Player`, `money.spec.ts`, `helpers.ts`, `drive.spec.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `formatDistance` be split into smaller, more focused modules?**
  _Cohesion score 0.13968253968253969 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `HttpError` to `formatDistance`, `server/localData.ts`, `StoreInfo.tsx`, `server/drive.ts`, `Play.tsx`, `db.ts`, `GameMap.tsx`, `arena/combat.ts`, `gpsgames.ts`, `Panels.tsx`, `lib/settings.ts`, `http.ts`, `server/places.ts`, `local/route.ts`, `i18n/index.ts`, `Drive.tsx`, `Game.tsx`, `server/city.ts`, `match.ts`, `useLocation.ts`, `world/route.ts`, `LocationReporter`, `lib/money.ts`, `server/money.ts`, `business/route.ts`, `geo.ts`, `storeData`, `Drive`, `Player`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._