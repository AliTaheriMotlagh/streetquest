# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 348 files · ~378,793 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3372 nodes · 11219 edges · 123 communities (107 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 244 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `660af172`
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
- site.ts
- tiles.ts
- server/drive.ts
- client.ts
- Play.tsx
- AdminLandmarks.tsx
- i18n/index.ts
- music.ts
- fmtNum
- arena/combat.ts
- GameMap.tsx
- protocol.ts
- Match
- server/empire.ts
- msg
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- vehicles.ts
- http.ts
- distanceM
- layout.tsx
- fa/index.ts
- local/route.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- db.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
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
- RtClient
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
- OthersLayer.tsx
- social/route.ts
- pins.ts
- useLocation.ts
- AdminPanel.tsx
- allowScripts
- AdminDropMap.tsx
- mapStyles.ts
- health/route.ts
- lib/money.ts
- Panels.tsx
- tracker.ts
- vercel.json
- Drive.tsx
- PlayerLayer.tsx
- lib/places.ts
- store.ts
- LatLng
- Player
- Market.tsx
- render.mjs
- money.spec.ts
- DriveGarage.tsx
- overrides
- @prisma/client
- install.sh
- storeData
- call.spec.ts
- fa/arena.ts
- localData.test.ts
- call.ts
- common.ts
- StreetQuest — real-world GPS war game
- data.ts
- game.ts
- fa/lottery.ts
- t
- market.ts
- Drive
- panels.ts
- fa/settings.ts
- fa/world.ts
- osm-pbf.ts
- Empire.tsx
- EmojiArt.tsx
- Player
- server/steps.ts
- app/page.tsx
- FootprintIndex
- relay.mjs
- admin/landmarks/route.ts
- StreetQuest — working notes for Claude
- ads.txt/route.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 411 edges
2. `HttpError` - 157 edges
3. `Drive()` - 143 edges
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
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts

## Import Cycles
- None detected.

## Communities (123 total, 16 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.10
Nodes (63): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), ArtUse(), combat, flag() (+55 more)

### Community 1 - "formatDistance"
Cohesion: 0.17
Nodes (29): InfoCard(), BizCard(), catOf(), GoThere(), PlaceCard(), SpotCard(), DivarCard(), GoButtons() (+21 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.13
Nodes (22): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+14 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.09
Nodes (39): GET, POST, Schema, GET, POST, Send, GET, POST (+31 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (31): mergeTorobPlace(), stockOf(), AREA_SEEDS, areaPlaces(), buildTorobMap(), collectTorobPlaces(), DivarPlace, exploring (+23 more)

### Community 5 - "idle.ts"
Cohesion: 0.14
Nodes (23): ALL_AT, BASE_OFFLINE_H, BizDef, bizMult(), cycleRevenue(), cycleSecs(), FAME_BONUS, fameMult() (+15 more)

### Community 6 - "StoreInfo.tsx"
Cohesion: 0.08
Nodes (40): clock(), DivarList(), HoursTable(), InfoProps, LINK_ICON, Links, OpenBadge(), spanText() (+32 more)

### Community 7 - "fleet3d.ts"
Cohesion: 0.13
Nodes (31): bike(), BLOB, BRAKE_OFF, BRAKE_ON, Build, bus(), cache, car() (+23 more)

### Community 8 - "world3d.ts"
Cohesion: 0.08
Nodes (42): artFor(), parts(), Label, PropKind, nameLines(), artImage(), artImages, at() (+34 more)

### Community 9 - "goals.ts"
Cohesion: 0.22
Nodes (19): GoalDef, GoalReward, MilestoneDef, announce(), bump(), claimGoal(), factionGoal(), fmtReward() (+11 more)

### Community 10 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 11 - "site.ts"
Cohesion: 0.22
Nodes (6): manifest(), GET(), dynamic, dirOf(), Vars, SITE

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (27): Job, Cut, TileArrays, transferables(), BuildPool, Cached, db(), idbGet() (+19 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (51): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+43 more)

### Community 14 - "client.ts"
Cohesion: 0.06
Nodes (45): react, isThenable(), Props, ApiError, CashoutView, ensureGuest(), HeroView, LatLng (+37 more)

### Community 15 - "Play.tsx"
Cohesion: 0.08
Nodes (28): AutoVideo(), Props, Opts, queue, Req, AdBreak, AdNetwork, Placement (+20 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.05
Nodes (59): GET, AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng() (+51 more)

### Community 17 - "i18n/index.ts"
Cohesion: 0.08
Nodes (43): GET, GET, GET, POST, Schema, Fields, Schema, Details (+35 more)

### Community 18 - "music.ts"
Cohesion: 0.18
Nodes (22): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+14 more)

### Community 19 - "fmtNum"
Cohesion: 0.11
Nodes (23): Home(), ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), DriveParty() (+15 more)

### Community 20 - "arena/combat.ts"
Cohesion: 0.08
Nodes (42): camFwd, CombatHost, CombatInput, FeedLine, SENS_TOUCH, store, v3, v3b (+34 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.14
Nodes (22): GpsView, WorldSpot, Box, clamp(), declutter(), labelPx(), Mark, GameItem (+14 more)

### Community 22 - "protocol.ts"
Cohesion: 0.05
Nodes (75): BOT_NAMES, Brain, SKILL, Identity, Sample, Sock, APP_URL, hub (+67 more)

### Community 23 - "Match"
Cohesion: 0.13
Nodes (8): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView, Team

### Community 24 - "server/empire.ts"
Cohesion: 0.13
Nodes (27): GET, POST, BizState, BOOST_MAX_H, BOOST_MINUTES, buyCost(), DIVIDEND_H, dividendCoins() (+19 more)

### Community 25 - "msg"
Cohesion: 0.13
Nodes (32): GET, here(), POST, Schema, msg(), FIND_RADIUS_M, GPS_GAMES, GpsGameKind (+24 more)

### Community 26 - "Button"
Cohesion: 0.09
Nodes (70): Button(), askConfirm(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+62 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.06
Nodes (57): AREA_Y, Builder, buildingLook(), buildTileArrays(), color(), COOLER, cornerSigns(), cuboid() (+49 more)

### Community 28 - "skyline.ts"
Cohesion: 0.16
Nodes (9): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+1 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (33): Action, GET, ITEMS, Rarity, RARITY_WEIGHT, applyConfig(), catalogOriginals(), CATALOGS (+25 more)

### Community 30 - "vehicles.ts"
Cohesion: 0.11
Nodes (17): FleetInstances, TrafficCars, FLEET, FLEET_KEYS, FleetDef, FleetKey, pickFleet(), pickPaint() (+9 more)

### Community 31 - "http.ts"
Cohesion: 0.05
Nodes (66): BUILD_ID, config, bcryptjs, jose, next, zod, AdminPage(), keyMatches() (+58 more)

### Community 32 - "distanceM"
Cohesion: 0.07
Nodes (65): layDrops(), GET, Schema, POST, Schema, POST, GET, POST (+57 more)

### Community 33 - "layout.tsx"
Cohesion: 0.14
Nodes (11): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+3 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "local/route.ts"
Cohesion: 0.13
Nodes (28): empty, GET, num, Query, rialToToman(), vendorKind, base(), cached() (+20 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.13
Nodes (24): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+16 more)

### Community 37 - "Combat"
Cohesion: 0.05
Nodes (11): Avatar, loadSoldier(), Combat, FootBody, lerpAngle(), Remotes, Vfx, aimDir() (+3 more)

### Community 38 - "avatar.ts"
Cohesion: 0.06
Nodes (25): three, axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp (+17 more)

### Community 39 - "db.ts"
Cohesion: 0.08
Nodes (28): days(), dynamic, GET, GET, pub, Schema, Schema, ACTIVE (+20 more)

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
Cohesion: 0.10
Nodes (24): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+16 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "people.ts"
Cohesion: 0.11
Nodes (15): CHADOR, Crowd, HAIR, Look, MANTEAU, PartKey, pick(), Road (+7 more)

### Community 46 - "randomSpot"
Cohesion: 0.21
Nodes (10): Loc, Near, World, WorldP, LatLng, randomSpot(), octet(), returningPlayer() (+2 more)

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
Cohesion: 0.05
Nodes (65): load(), requestRewarded(), ALL_LAYERS, Drive, Game(), GameMap, LAYER_GROUPS, LAYERS_BEFORE_TOROB (+57 more)

### Community 52 - "HttpError"
Cohesion: 0.07
Nodes (78): POST, POST, Details, GET, mine(), POST, Schema, POST (+70 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 55 - "server/city.ts"
Cohesion: 0.17
Nodes (28): GET, parseTileKey(), TILE_V, tileKey, tileOf(), packPlaces(), cellKey(), backoffMs() (+20 more)

### Community 56 - "match.ts"
Cohesion: 0.06
Nodes (52): Bomb, MatchResult, buildings, F, host, log, m, mode (+44 more)

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

### Community 61 - "helpers.ts"
Cohesion: 0.16
Nodes (16): Dash, store(), World, crew(), Mission, setup(), World, Feed (+8 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.15
Nodes (16): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+8 more)

### Community 63 - "perf.ts"
Cohesion: 0.24
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isTouch(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.12
Nodes (15): A, ads, D, districts, pairAt(), shops, SMALLTOWN, Stock (+7 more)

### Community 66 - "lib/city.ts"
Cohesion: 0.12
Nodes (26): centroid(), CityPitch, fromOverpass(), heightOf(), httpUrl(), infoOfTags(), isNamedPlace(), makeFrame() (+18 more)

### Community 68 - "vectorTile.ts"
Cohesion: 0.08
Nodes (30): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+22 more)

### Community 70 - "OthersLayer.tsx"
Cohesion: 0.27
Nodes (9): Listener, nearby, NearPlayer, Sample, esc(), Entry, htmlOf(), OthersLayer() (+1 more)

### Community 71 - "social/route.ts"
Cohesion: 0.07
Nodes (50): GET, POST, Schema, GET, GET, GET, Point, Schema (+42 more)

### Community 72 - "pins.ts"
Cohesion: 0.17
Nodes (8): Cloud, Pin, pinTexture(), StorePins, OTHER, Trade, tradeOf(), TRADES

### Community 73 - "useLocation.ts"
Cohesion: 0.19
Nodes (8): NearReport, FireReport, LocationReporter, Sent, LocationSnapshot, GeoState, serverSnapshot, useLocation()

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "AdminDropMap.tsx"
Cohesion: 0.32
Nodes (7): leaflet, react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 77 - "mapStyles.ts"
Cohesion: 0.09
Nodes (15): env, dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, mapStyle (+7 more)

### Community 78 - "health/route.ts"
Cohesion: 0.53
Nodes (5): dynamic, GET(), short(), turnConfigured(), extHealth()

### Community 79 - "lib/money.ts"
Cohesion: 0.33
Nodes (8): CELL_DEG, DROP_PREFIX, MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell(), MoneyPickup, resolveMoney()

### Community 80 - "Panels.tsx"
Cohesion: 0.09
Nodes (40): AppSettings(), AVATARS, dropoffOf(), Friend, HeroTabId, Msg, MyDeliveries, MyRide (+32 more)

### Community 81 - "tracker.ts"
Cohesion: 0.23
Nodes (11): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+3 more)

### Community 83 - "Drive.tsx"
Cohesion: 0.08
Nodes (34): HttpMe, RT_DELAY_MS, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+26 more)

### Community 84 - "PlayerLayer.tsx"
Cohesion: 0.20
Nodes (12): Clicks(), FrameTarget(), GameMap(), guidesFor(), RouteLine(), meIcon, Anim, Guide (+4 more)

### Community 85 - "lib/places.ts"
Cohesion: 0.13
Nodes (13): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, PLACE_BUCKET_MS, PLACE_CAT_KEYS, placeBucket(), PlaceInfo (+5 more)

### Community 86 - "store.ts"
Cohesion: 0.14
Nodes (22): POST, Schema, GET, POST, Schema, spendGems(), POST(), adStatus() (+14 more)

### Community 87 - "LatLng"
Cohesion: 0.10
Nodes (36): GET, Car, degOf(), lineColors(), Road, TrafficFeed, TrafficLayer(), LatLng (+28 more)

### Community 88 - "Player"
Cohesion: 0.10
Nodes (9): Empire, META, Online, Traffic, Visits, Player, openGame(), SfxHook (+1 more)

### Community 89 - "Market.tsx"
Cohesion: 0.12
Nodes (31): fmtCountdown(), Browse(), DEAL_STEPS, endLabel(), ENDS, img(), localInput(), MarketPanel() (+23 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.25
Nodes (6): Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 92 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 93 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 94 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 96 - "storeData"
Cohesion: 0.13
Nodes (22): divarLink(), isFoodCat(), nameScore(), normName(), onHost(), sameLetters(), sameName(), sameStore() (+14 more)

### Community 97 - "call.spec.ts"
Cohesion: 0.83
Nodes (3): json(), octet(), open()

### Community 99 - "localData.test.ts"
Cohesion: 0.29
Nodes (11): done(), emptyWeek(), latinDigits(), MAX_STOCK, minutes(), spanOf(), TorobPlace, weekFromOsm() (+3 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.13
Nodes (13): octet(), phone(), phoneSetup(), Before going big, Deploy, How it works, Production checklist, Render (+5 more)

### Community 106 - "t"
Cohesion: 0.24
Nodes (20): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+12 more)

### Community 108 - "Drive"
Cohesion: 0.08
Nodes (16): Drive(), Built, MarkerInfo, Markers, markersOf(), DriveNet, angle(), Others (+8 more)

### Community 112 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 113 - "Empire.tsx"
Cohesion: 0.15
Nodes (19): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+11 more)

### Community 114 - "EmojiArt.tsx"
Cohesion: 0.19
Nodes (16): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+8 more)

### Community 115 - "Player"
Cohesion: 0.09
Nodes (7): Hub, Player, Space, weaponOf(), World, LL, WeaponKey

### Community 116 - "server/steps.ts"
Cohesion: 0.26
Nodes (15): GET, dayKey(), DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps() (+7 more)

### Community 117 - "app/page.tsx"
Cohesion: 0.18
Nodes (13): GET, POST, ART, dynamic, FAQ, FEATURES, metadata, PILLARS (+5 more)

### Community 118 - "FootprintIndex"
Cohesion: 0.21
Nodes (3): Nav, Node, FootprintIndex

### Community 119 - "relay.mjs"
Cohesion: 0.26
Nodes (9): agents, allowed(), handle(), keyOk(), PORT, readBody(), send(), server (+1 more)

### Community 120 - "admin/landmarks/route.ts"
Cohesion: 0.33
Nodes (8): Action, Fields, Meta, POST, PUT, requireAdmin(), deleteLandmark(), saveLandmark()

### Community 121 - "StreetQuest — working notes for Claude"
Cohesion: 0.29
Nodes (6): Commands, Done means, Fast, low-token tools (installed), graphify, StreetQuest — working notes for Claude, Where things are (read these instead of exploring)

### Community 122 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

## Knowledge Gaps
- **13 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 908 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `formatDistance`, `server/hub.ts`, `server/localData.ts`, `StoreInfo.tsx`, `goals.ts`, `Call.tsx`, `site.ts`, `server/drive.ts`, `client.ts`, `Play.tsx`, `AdminLandmarks.tsx`, `i18n/index.ts`, `music.ts`, `fmtNum`, `arena/combat.ts`, `GameMap.tsx`, `protocol.ts`, `Match`, `server/empire.ts`, `msg`, `Button`, `lib/settings.ts`, `http.ts`, `distanceM`, `layout.tsx`, `local/route.ts`, `I18nProvider.tsx`, `Combat`, `db.ts`, `lotteries/route.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `match.ts`, `perf.ts`, `social/route.ts`, `AdminPanel.tsx`, `Panels.tsx`, `Drive.tsx`, `store.ts`, `LatLng`, `Market.tsx`, `DriveGarage.tsx`, `storeData`, `Drive`, `Empire.tsx`, `admin/landmarks/route.ts`, `StreetQuest — working notes for Claude`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Are the 66 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 66 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0968421052631579 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `formatDistance`, `server/localData.ts`, `StoreInfo.tsx`, `server/drive.ts`, `Play.tsx`, `i18n/index.ts`, `GameMap.tsx`, `protocol.ts`, `Match`, `msg`, `Button`, `lib/settings.ts`, `http.ts`, `local/route.ts`, `db.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `match.ts`, `social/route.ts`, `useLocation.ts`, `Panels.tsx`, `Drive.tsx`, `lib/places.ts`, `LatLng`, `storeData`, `Drive`, `Player`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `city-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `Player` to `local.spec.ts`, `call.spec.ts`, `StreetQuest — real-world GPS war game`, `randomSpot`, `package.json`, `render.mjs`, `money.spec.ts`, `helpers.ts`, `drive.spec.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._