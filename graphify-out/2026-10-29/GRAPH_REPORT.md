# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 316 files · ~324,431 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2923 nodes · 9851 edges · 106 communities (92 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 224 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c19ddf2e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- db.ts
- HttpError
- idle.ts
- drive/landmarks.ts
- http.ts
- world3d.ts
- server/places.ts
- Rewards.tsx
- pwaClient.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- fmtNum
- lib/city.ts
- server/shops.ts
- bots.ts
- Game.tsx
- AdminSettings.tsx
- GameMap.tsx
- drive/traffic.ts
- Drive
- t
- gpsgames.ts
- server/money.ts
- tileMesh.ts
- requireUser
- lib/settings.ts
- .onMsg
- server/city.ts
- social.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- i18n/index.ts
- Combat
- server/traffic.ts
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- Drive.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- client.ts
- distanceM
- AdminLandmarks.tsx
- protocol.ts
- Landmarks
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Player
- lotteries/route.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- server/arena.ts
- LocationReporter
- Panels.tsx
- NearbyStore
- DriveNet
- app/page.tsx
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- pins.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.ts
- catalog.ts
- vercel.json
- vfx.ts
- me/route.ts
- goals.ts
- i18n.ts
- LanguageSwitch.tsx
- .tick
- Button
- CLAUDE.md
- .shoot
- @prisma/client
- social/route.ts
- osm-pbf.ts
- Vfx
- footprint.ts
- World
- Dialogs.tsx
- locationTracker
- avatar.ts
- Viewmodel
- sim.ts
- filter.ts
- RtClient

## God Nodes (most connected - your core abstractions)
1. `t()` - 371 edges
2. `HttpError` - 151 edges
3. `Drive()` - 132 edges
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
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts

## Import Cycles
- None detected.

## Communities (106 total, 14 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (78): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artFor(), artHtml(), artSvg() (+70 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.15
Nodes (21): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+13 more)

### Community 3 - "db.ts"
Cohesion: 0.08
Nodes (41): GET, POST, Schema, POST, Send, dynamic, GET(), short() (+33 more)

### Community 4 - "HttpError"
Cohesion: 0.12
Nodes (44): How it works, POST, POST, POST, Schema, POST, POST, Schema (+36 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (56): GET, ALL_AT, BASE_OFFLINE_H, BIZ_BY_KEY, BizDef, bizMult(), BizState, BOOST_MAX_H (+48 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.20
Nodes (14): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+6 more)

### Community 7 - "http.ts"
Cohesion: 0.08
Nodes (43): bcryptjs, jose, GET, POST, POST, Schema, POST, POST (+35 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (34): Built, MarkerInfo, markersOf(), Label, PropKind, nameLines(), artImages, at() (+26 more)

### Community 9 - "server/places.ts"
Cohesion: 0.15
Nodes (24): msg(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), PLACE_BUCKET_MS (+16 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.08
Nodes (35): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+27 more)

### Community 11 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (24): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+16 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (61): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+53 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "fmtNum"
Cohesion: 0.06
Nodes (58): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), Art(), AutoVideo(), Props (+50 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.07
Nodes (40): Job, transferables(), AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber (+32 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.09
Nodes (38): GET, GET, GET, POST, Schema, Fields, POST, Schema (+30 more)

### Community 18 - "bots.ts"
Cohesion: 0.23
Nodes (10): BOT_NAMES, Brain, objective(), pickGoal(), SKILL, tickBot(), bombSide(), F_CROUCH (+2 more)

### Community 19 - "Game.tsx"
Cohesion: 0.06
Nodes (53): react, ArtAnim, isThenable(), Props, LatLng, Me, World, Drive (+45 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminConfig, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (35): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+27 more)

### Community 22 - "drive/traffic.ts"
Cohesion: 0.09
Nodes (21): box(), Style, Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+13 more)

### Community 23 - "Drive"
Cohesion: 0.12
Nodes (11): CombatPad, Crosshair(), Drive(), Markers, angle(), Others, tagColor(), DetailSource (+3 more)

### Community 24 - "t"
Cohesion: 0.13
Nodes (38): fmtCountdown(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS, GoToShop() (+30 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "server/money.ts"
Cohesion: 0.16
Nodes (24): GET, CELL_DEG, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket() (+16 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.12
Nodes (31): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+23 more)

### Community 28 - "requireUser"
Cohesion: 0.08
Nodes (31): zod, POST, Schema, GET, GET, Point, pub, Schema (+23 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.08
Nodes (44): Action, GET, POST, Schema, spendGems(), POST(), applyConfig(), catalogOriginals() (+36 more)

### Community 30 - ".onMsg"
Cohesion: 0.26
Nodes (12): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+4 more)

### Community 31 - "server/city.ts"
Cohesion: 0.15
Nodes (30): Colour, GET, Points, POST, Upload, parseTileKey(), TILE_V, tileKey (+22 more)

### Community 32 - "social.ts"
Cohesion: 0.13
Nodes (16): authorSelect, AutoBody, BIO_MAX, COMMENT_MAX, feed(), FEED_PAGE, FeedTab, HIDE_AT_REPORTS (+8 more)

### Community 33 - "layout.tsx"
Cohesion: 0.10
Nodes (18): BUILD_ID, config, next, react-dom, cinzel, fredoka, generateMetadata(), inter (+10 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.07
Nodes (22): admin, app, arena, call, common, data, drive, empire (+14 more)

### Community 35 - "server/business.ts"
Cohesion: 0.12
Nodes (30): Details, GET, mine(), POST, Schema, activePlan(), BIZ_CHECKIN_M, BIZ_LIMITS (+22 more)

### Community 36 - "i18n/index.ts"
Cohesion: 0.11
Nodes (28): GlobalError(), I18nProvider(), LocaleCtx, catalogs, compiled, dateFmt, DEFAULT_LOCALE, fmtDate() (+20 more)

### Community 38 - "server/traffic.ts"
Cohesion: 0.15
Nodes (24): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+16 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.15
Nodes (17): Schema, ACTIVE, GET, live(), Point, pub, Schema, driverXp() (+9 more)

### Community 40 - "sfx.ts"
Cohesion: 0.08
Nodes (42): duckMusic(), graph(), listeners, midi(), Mood, pluck(), PROGS, refresh() (+34 more)

### Community 41 - "getT"
Cohesion: 0.16
Nodes (18): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+10 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.20
Nodes (8): Before going big, Deploy, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel, CityDetail

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.12
Nodes (14): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+6 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.07
Nodes (49): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+41 more)

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
Cohesion: 0.10
Nodes (19): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, ShopDeal, WorldDelivery, WorldEvent (+11 more)

### Community 52 - "distanceM"
Cohesion: 0.19
Nodes (21): layDrops(), GET, bbox(), bearingTo(), dayPhase, distanceM(), LatLng, offset() (+13 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.22
Nodes (14): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+6 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (47): Identity, Sample, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY (+39 more)

### Community 55 - "Landmarks"
Cohesion: 0.16
Nodes (7): Landmarks, cellOf(), CollisionWorld, Footprint, Ray, LandmarkView, placeHull()

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (42): Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud, nil(), useCombat(), WEAPON_ICON (+34 more)

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
Cohesion: 0.10
Nodes (6): newBrain(), Match, Player, Team, LL, LocalFrame

### Community 62 - "lotteries/route.ts"
Cohesion: 0.14
Nodes (21): days(), dynamic, GET, POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED (+13 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "Remotes"
Cohesion: 0.22
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 66 - "server/arena.ts"
Cohesion: 0.12
Nodes (21): FireMsg, Space, weaponOf(), FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, damageAt(), isWeapon() (+13 more)

### Community 68 - "Panels.tsx"
Cohesion: 0.10
Nodes (38): ModeCards(), LotteryCard(), LotteryTab(), toLocalInput(), useNow(), musicOn(), musicVolume(), onMusicChange() (+30 more)

### Community 71 - "app/page.tsx"
Cohesion: 0.20
Nodes (9): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+1 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (25): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+17 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.09
Nodes (30): camFwd, CombatHost, CombatInput, FeedLine, HttpMe, SENS_TOUCH, store, v3 (+22 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "pins.ts"
Cohesion: 0.16
Nodes (10): Cloud, Pin, pinTexture(), StorePins, OTHER, Trade, tradeOf(), TRADES (+2 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.ts"
Cohesion: 0.19
Nodes (15): dynamic, GET(), POST, Schema, GET, AdCreative, adStatus(), adsTxt() (+7 more)

### Community 81 - "catalog.ts"
Cohesion: 0.14
Nodes (16): fillFrontage(), ItemDef, ITEMS, Rarity, RARITY_COLOR, RARITY_WEIGHT, villageTile(), hashStr() (+8 more)

### Community 83 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 84 - "me/route.ts"
Cohesion: 0.13
Nodes (26): GET, POST, Schema, GET, POST, Schema, GET, dividendCoins() (+18 more)

### Community 85 - "goals.ts"
Cohesion: 0.24
Nodes (18): GET, POST, Schema, announce(), bump(), claimGoal(), factionGoal(), fmtReward() (+10 more)

### Community 86 - "i18n.ts"
Cohesion: 0.22
Nodes (12): fa, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware() (+4 more)

### Community 87 - "LanguageSwitch.tsx"
Cohesion: 0.42
Nodes (7): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALES

### Community 88 - ".tick"
Cohesion: 0.20
Nodes (6): Avatar, Collide, FOOT_R, FootInput, newFoot(), stepFoot()

### Community 89 - "Button"
Cohesion: 0.15
Nodes (49): Button(), askConfirm(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+41 more)

### Community 91 - ".shoot"
Cohesion: 0.27
Nodes (3): FootBody, aimDir(), eyeHeight()

### Community 92 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 94 - "social/route.ts"
Cohesion: 0.26
Nodes (11): GET, pub, Schema, GET, GET, num(), Schema, levelForXp() (+3 more)

### Community 95 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 97 - "footprint.ts"
Cohesion: 0.29
Nodes (8): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), insidePacked(), makeFrame()

### Community 99 - "Dialogs.tsx"
Cohesion: 0.29
Nodes (4): DialogHost(), Opts, queue, Req

### Community 101 - "avatar.ts"
Cohesion: 0.13
Nodes (15): three, axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp (+7 more)

### Community 105 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "filter.ts"
Cohesion: 0.33
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 109 - "RtClient"
Cohesion: 0.22
Nodes (3): Hub, Sock, RtClient

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 762 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `db.ts`, `HttpError`, `idle.ts`, `http.ts`, `server/places.ts`, `Rewards.tsx`, `pwaClient.ts`, `server/drive.ts`, `Call.tsx`, `fmtNum`, `server/shops.ts`, `Game.tsx`, `AdminSettings.tsx`, `GameMap.tsx`, `Drive`, `gpsgames.ts`, `server/money.ts`, `requireUser`, `lib/settings.ts`, `.onMsg`, `server/city.ts`, `social.ts`, `layout.tsx`, `server/business.ts`, `i18n/index.ts`, `Combat`, `server/traffic.ts`, `rides/route.ts`, `Drive.tsx`, `client.ts`, `distanceM`, `AdminLandmarks.tsx`, `match.ts`, `lotteries/route.ts`, `perf.ts`, `server/arena.ts`, `Panels.tsx`, `app/page.tsx`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `ads.ts`, `me/route.ts`, `goals.ts`, `LanguageSwitch.tsx`, `.tick`, `Button`, `.dispose`, `social/route.ts`, `Dialogs.tsx`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07246376811594203 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `world3d.ts`, `Rewards.tsx`, `tiles.ts`, `server/drive.ts`, `fmtNum`, `lib/city.ts`, `GameMap.tsx`, `drive/traffic.ts`, `t`, `server/city.ts`, `Combat`, `sfx.ts`, `Drive.tsx`, `distanceM`, `Landmarks`, `match.ts`, `perf.ts`, `Remotes`, `Panels.tsx`, `DriveNet`, `pins.ts`, `catalog.ts`, `.tick`, `Button`, `.dispose`, `footprint.ts`, `Viewmodel`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `@prisma/client` to `helpers.ts`, `city-pack.ts`, `db.ts`, `server/arena.ts`, `idle.ts`, `server/traffic.ts`, `server/landmarks.ts`, `server/drive.ts`, `package.json`, `server/shops.ts`, `goals.ts`, `gpsgames.ts`, `server/money.ts`, `server/city.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._