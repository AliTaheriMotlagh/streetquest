# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 325 files · ~337,677 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3049 nodes · 10257 edges · 131 communities (109 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ead05a3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- db.ts
- server/localData.ts
- idle.ts
- .shoot
- pwaClient.ts
- world3d.ts
- Panels.tsx
- StoreInfo.tsx
- app/page.tsx
- VectorSource
- server/drive.ts
- Call.tsx
- Game.tsx
- vectorTile.ts
- server/shops.ts
- DrivePad.tsx
- Rewards.tsx
- distanceM
- GameMap.tsx
- server/arena.ts
- others.ts
- i18n/index.ts
- msg
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- PlayerLayer.tsx
- http.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- tiles.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- rides/route.ts
- sfx.ts
- getT
- Drive.tsx
- geom.ts
- i18n-check.ts
- CollisionWorld
- drive/traffic.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- react
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
- lib/city.ts
- NearbyStore
- Remotes
- server/empire.ts
- server/landmarks.ts
- gunsound.ts
- AdminPanel.tsx
- allowScripts
- pins.ts
- mapStyles.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- DriveGarage.tsx
- vercel.json
- gltf.ts
- useLocation.ts
- geo.ts
- i18n.ts
- server/traffic.ts
- randomSpot
- t
- CLAUDE.md
- Player
- sound.spec.ts
- HttpError
- locationTracker
- overrides
- AdminLandmarks.tsx
- @playwright/test
- call.spec.ts
- server/steps.ts
- city/route.ts
- arena/combat.ts
- StreetQuest — real-world GPS war game
- Viewmodel
- .onMsg
- alerts.ts
- .tick
- sim.ts
- Drive
- play/page.tsx
- Empire.tsx
- fa/arena.ts
- call.ts
- vfx.ts
- common.ts
- Player
- RtClient
- data.ts
- game.ts
- next
- DriveParty.tsx
- fa/lottery.ts
- joinParty
- course.ts
- report
- fa/settings.ts
- filter.ts
- health/route.ts
- market.ts
- panels.ts
- fa/world.ts

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

## Communities (131 total, 22 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.08
Nodes (75): cells, keys, [out = "art-preview.html", only], sym, artHtml(), artSvg(), EMOJI_RE, hasEmoji() (+67 more)

### Community 1 - "helpers.ts"
Cohesion: 0.15
Nodes (10): Lottery, MyRides, Ride, META, Traffic, fakeIp(), Me, octet() (+2 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.14
Nodes (22): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+14 more)

### Community 3 - "db.ts"
Cohesion: 0.07
Nodes (46): GET, POST, Schema, GET, POST, Send, GET, GET (+38 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (54): divarLink(), FILLER, FOOD, isFoodCat(), LINK_CHECKS, Menu, MenuItem, MenuSection (+46 more)

### Community 5 - "idle.ts"
Cohesion: 0.14
Nodes (23): ALL_AT, BASE_OFFLINE_H, BizDef, bizMult(), cycleRevenue(), cycleSecs(), FAME_BONUS, fameMult() (+15 more)

### Community 6 - ".shoot"
Cohesion: 0.27
Nodes (3): FootBody, aimDir(), eyeHeight()

### Community 7 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 8 - "world3d.ts"
Cohesion: 0.09
Nodes (39): artFor(), nameLines(), artImage(), artImages, at(), Board, canvas(), curtain() (+31 more)

### Community 9 - "Panels.tsx"
Cohesion: 0.07
Nodes (50): ApiError, fmtTime(), GpsView, LatLng, ShopDeal, World, WorldDelivery, WorldEvent (+42 more)

### Community 10 - "StoreInfo.tsx"
Cohesion: 0.22
Nodes (23): InfoCard(), NearbyPanel(), NoteCard(), BizCard(), catOf(), GoThere(), PlaceCard(), Directions() (+15 more)

### Community 11 - "app/page.tsx"
Cohesion: 0.17
Nodes (12): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+4 more)

### Community 12 - "VectorSource"
Cohesion: 0.12
Nodes (10): db(), idbGet(), idbPut(), idbRead(), remember(), TileSource, trim(), VectorSource (+2 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.13
Nodes (26): CHECKPOINT_M, checkPoints(), COIN_M, COUNTDOWN_MS, gridSpot(), isPartyCode(), newPartyCode(), PARTY_GAMES (+18 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "Game.tsx"
Cohesion: 0.06
Nodes (69): AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd, W, Drive (+61 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.09
Nodes (27): centre(), FootBuilding, footprintAt(), FootRoad, round(), AREA, clipLine(), clipRing() (+19 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.09
Nodes (36): GET, GET, GET, POST, Schema, Fields, Schema, Details (+28 more)

### Community 18 - "DrivePad.tsx"
Cohesion: 0.25
Nodes (16): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+8 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.12
Nodes (23): bump(), calm(), Celebration, CelebrationLayer(), compact(), confetti(), CountUp(), DIGITS (+15 more)

### Community 20 - "distanceM"
Cohesion: 0.10
Nodes (48): GET, POST, Schema, POST, Schema, POST, POST, Schema (+40 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.17
Nodes (23): Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS, useMapView() (+15 more)

### Community 22 - "server/arena.ts"
Cohesion: 0.09
Nodes (29): Sample, FireMsg, Space, weaponOf(), POST, Schema, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S (+21 more)

### Community 23 - "others.ts"
Cohesion: 0.10
Nodes (17): angle(), Driver, Others, Snap, tagColor(), Walker, Cockpit, makeCockpit() (+9 more)

### Community 24 - "i18n/index.ts"
Cohesion: 0.12
Nodes (27): POST, GET, POST, Schema, GET, PATCH, catalogs, compiled (+19 more)

### Community 25 - "msg"
Cohesion: 0.12
Nodes (34): GET, here(), POST, Schema, GET(), offset(), msg(), FIND_RADIUS_M (+26 more)

### Community 26 - "Button"
Cohesion: 0.25
Nodes (15): Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm() (+7 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+27 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.06
Nodes (66): Action, GET, layDrops(), POST, POST, Schema, GET, ITEM_BY_KEY (+58 more)

### Community 30 - "PlayerLayer.tsx"
Cohesion: 0.16
Nodes (14): leaflet, react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap, iconCache (+6 more)

### Community 31 - "http.ts"
Cohesion: 0.07
Nodes (45): bcryptjs, GET, POST, POST, Schema, POST, POST, Schema (+37 more)

### Community 32 - "social/route.ts"
Cohesion: 0.15
Nodes (24): GET, num(), Schema, levelForXp(), authorSelect, AutoBody, BIO_MAX, COMMENT_MAX (+16 more)

### Community 33 - "layout.tsx"
Cohesion: 0.14
Nodes (12): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+4 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "tiles.ts"
Cohesion: 0.09
Nodes (18): Job, Cut, TileArrays, transferables(), BuildPool, Cached, Job, memory (+10 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.12
Nodes (25): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+17 more)

### Community 38 - "avatar.ts"
Cohesion: 0.13
Nodes (14): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+6 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.08
Nodes (36): days(), dynamic, GET, GET, GET, POST, Schema, ACTIVE (+28 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.20
Nodes (15): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+7 more)

### Community 42 - "Drive.tsx"
Cohesion: 0.10
Nodes (24): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+16 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (18): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+10 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "CollisionWorld"
Cohesion: 0.38
Nodes (3): cellOf(), CollisionWorld, Footprint

### Community 46 - "drive/traffic.ts"
Cohesion: 0.16
Nodes (12): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+4 more)

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

### Community 51 - "react"
Cohesion: 0.08
Nodes (36): react, isThenable(), Props, CashoutView, HeroView, Me, HELP, HelpCard() (+28 more)

### Community 52 - "requireUser"
Cohesion: 0.08
Nodes (60): zod, POST, Schema, GET, Point, POST, pub, Schema (+52 more)

### Community 53 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 54 - "protocol.ts"
Cohesion: 0.08
Nodes (40): Identity, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY, server (+32 more)

### Community 55 - "server/city.ts"
Cohesion: 0.17
Nodes (28): GET, overpassQuery(), parseTileKey(), tileKey, tileOf(), packPlaces(), cellKey(), backoffMs() (+20 more)

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (37): BOT_NAMES, Brain, SKILL, Bomb, Body, POST, Row, ARENA_REWARDS_PER_DAY (+29 more)

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
Cohesion: 0.24
Nodes (12): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+4 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.15
Nodes (9): D, shops, StubShop, StubVendor, vendors, ADMIN_KEY, E2E_DB, PORT (+1 more)

### Community 66 - "world.spec.ts"
Cohesion: 0.20
Nodes (9): Loc, Near, World, WorldP, LatLng, octet(), returningPlayer(), test (+1 more)

### Community 68 - "lib/city.ts"
Cohesion: 0.16
Nodes (20): centroid(), fromOverpass(), heightOf(), isNamedPlace(), makeFrame(), NAMED_COLOURS, osmColour(), OsmEl (+12 more)

### Community 70 - "Remotes"
Cohesion: 0.23
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 71 - "server/empire.ts"
Cohesion: 0.14
Nodes (24): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, BUSINESSES, buyCost() (+16 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (23): Entry, BUDGET, BUDGET_LABEL, glbProblem(), HULL_MAX_POINTS, LANDMARK_DROP_M, LANDMARK_LIMITS, LANDMARK_LIST_M (+15 more)

### Community 73 - "gunsound.ts"
Cohesion: 0.24
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.07
Nodes (38): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+30 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "pins.ts"
Cohesion: 0.16
Nodes (9): Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade, tradeOf() (+1 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (8): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, tileHosts(), Tiles

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "DriveGarage.tsx"
Cohesion: 0.16
Nodes (15): CTL, DriveGarage(), NAMES, Props, askTilt(), SteerMode, IconName, PATHS (+7 more)

### Community 83 - "gltf.ts"
Cohesion: 0.27
Nodes (9): loadWeapons(), gltfLoader(), isReference(), loadModel(), measure(), prepare(), convexHull(), ModelStats (+1 more)

### Community 84 - "useLocation.ts"
Cohesion: 0.16
Nodes (13): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+5 more)

### Community 85 - "geo.ts"
Cohesion: 0.08
Nodes (37): Rarity, villageTile(), bearingTo(), CELL_DEG, cellOf(), hashStr(), LatLng, rng() (+29 more)

### Community 86 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 87 - "server/traffic.ts"
Cohesion: 0.15
Nodes (23): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+15 more)

### Community 88 - "randomSpot"
Cohesion: 0.22
Nodes (12): Dash, store(), World, Mission, setup(), World, Feed, Post (+4 more)

### Community 89 - "t"
Cohesion: 0.09
Nodes (72): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), askConfirm(), paintGauge(), DriveParty() (+64 more)

### Community 91 - "Player"
Cohesion: 0.24
Nodes (4): gps(), Money, World, Player

### Community 93 - "HttpError"
Cohesion: 0.09
Nodes (45): Details, GET, mine(), POST, Schema, GET, POST, Schema (+37 more)

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "AdminLandmarks.tsx"
Cohesion: 0.20
Nodes (15): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+7 more)

### Community 97 - "@playwright/test"
Cohesion: 0.20
Nodes (6): crew(), Empire, octet(), phone(), phoneSetup(), @playwright/test

### Community 98 - "call.spec.ts"
Cohesion: 0.83
Nodes (3): json(), octet(), open()

### Community 99 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 100 - "city/route.ts"
Cohesion: 0.17
Nodes (14): Action, Fields, GET, Meta, POST, PUT, Colour, Points (+6 more)

### Community 101 - "arena/combat.ts"
Cohesion: 0.06
Nodes (41): DIFF, DIFF_LABEL, SIZE_LABEL, camFwd, CombatHost, CombatHud, CombatInput, FeedLine (+33 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (9): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+1 more)

### Community 105 - "alerts.ts"
Cohesion: 0.16
Nodes (12): lat, lng, prisma, start, @prisma/client, DIVIDEND_H, dividendCoins(), rankOf() (+4 more)

### Community 106 - ".tick"
Cohesion: 0.18
Nodes (6): Avatar, Collide, FOOT_R, FootInput, newFoot(), stepFoot()

### Community 107 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "Drive"
Cohesion: 0.12
Nodes (5): Drive(), Landmarks, Markers, DriveNet, DetailSource

### Community 109 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 110 - "Empire.tsx"
Cohesion: 0.14
Nodes (21): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+13 more)

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 115 - "Player"
Cohesion: 0.11
Nodes (5): Hub, Player, Sock, World, LL

### Community 119 - "next"
Cohesion: 0.24
Nodes (5): BUILD_ID, config, next, dynamic, SITE

### Community 120 - "DriveParty.tsx"
Cohesion: 0.17
Nodes (10): HttpMe, Friend, GAMES, Invite, MEDAL, Props, Resp, NetState (+2 more)

### Community 122 - "joinParty"
Cohesion: 0.38
Nodes (10): POST, assertCanParty(), createParty(), inviteToParty(), joinParty(), leaveParty(), loadParty(), myParty() (+2 more)

### Community 123 - "course.ts"
Cohesion: 0.29
Nodes (7): layCourse(), P, Roads, samples(), COIN_POINTS, PartyGame, RACE_POINTS

### Community 124 - "report"
Cohesion: 0.29
Nodes (8): isPaint(), arenaMe(), footFlags(), isDead(), friendsOf(), isVirtual(), othersAround(), report()

### Community 126 - "filter.ts"
Cohesion: 0.31
Nodes (8): Axis, dist(), Fix, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 127 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 799 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `db.ts`, `server/localData.ts`, `pwaClient.ts`, `Panels.tsx`, `StoreInfo.tsx`, `app/page.tsx`, `server/drive.ts`, `Call.tsx`, `Game.tsx`, `server/shops.ts`, `DrivePad.tsx`, `Rewards.tsx`, `distanceM`, `GameMap.tsx`, `server/arena.ts`, `i18n/index.ts`, `msg`, `Button`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `layout.tsx`, `I18nProvider.tsx`, `Combat`, `rides/route.ts`, `Drive.tsx`, `react`, `requireUser`, `server/city.ts`, `perf.ts`, `server/empire.ts`, `server/landmarks.ts`, `gunsound.ts`, `AdminPanel.tsx`, `DriveGarage.tsx`, `geo.ts`, `server/traffic.ts`, `HttpError`, `AdminLandmarks.tsx`, `city/route.ts`, `arena/combat.ts`, `.onMsg`, `alerts.ts`, `.tick`, `Drive`, `Empire.tsx`, `DriveParty.tsx`, `joinParty`, `report`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07584269662921349 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `server/localData.ts`, `Panels.tsx`, `StoreInfo.tsx`, `server/drive.ts`, `Game.tsx`, `server/shops.ts`, `server/arena.ts`, `msg`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `rides/route.ts`, `Drive.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `Match`, `LocationReporter`, `useLocation.ts`, `geo.ts`, `server/traffic.ts`, `HttpError`, `Drive`, `Player`, `report`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14705882352941177 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `world3d.ts`, `StoreInfo.tsx`, `VectorSource`, `Game.tsx`, `DrivePad.tsx`, `distanceM`, `GameMap.tsx`, `others.ts`, `Button`, `skyline.ts`, `tiles.ts`, `Combat`, `Drive.tsx`, `CollisionWorld`, `drive/traffic.ts`, `server/city.ts`, `lib/city.ts`, `Remotes`, `gunsound.ts`, `pins.ts`, `DriveGarage.tsx`, `geo.ts`, `t`, `arena/combat.ts`, `Viewmodel`, `.tick`, `Empire.tsx`, `course.ts`, `report`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._