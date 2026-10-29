# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 325 files · ~337,420 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3047 nodes · 10254 edges · 126 communities (102 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c019b272`
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
- react
- world3d.ts
- Panels.tsx
- Button
- msg
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- lib/city.ts
- prisma
- DriveGarage.tsx
- Game.tsx
- server/money.ts
- GameMap.tsx
- weapons.ts
- Drive
- progression.ts
- gpsgames.ts
- api
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminDropMap.tsx
- http.ts
- world/route.ts
- layout.tsx
- fa/index.ts
- goals.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- i18n/index.ts
- sfx.ts
- getT
- Drive.tsx
- FootprintIndex
- i18n-check.ts
- Landmarks
- EmojiArt.tsx
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- client.ts
- HttpError
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
- music.ts
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
- server/places.ts
- vercel.json
- drive/landmarks.ts
- useLocation.ts
- geo.ts
- i18n.ts
- LatLng
- randomSpot
- t
- CLAUDE.md
- Player
- sound.spec.ts
- business/route.ts
- PlayerLayer.tsx
- overrides
- AdminLandmarks.tsx
- @playwright/test
- call.spec.ts
- server/steps.ts
- lotteries/route.ts
- arena/combat.ts
- CityTile
- Viewmodel
- .onMsg
- lib/business.ts
- Avatar
- LanguageSwitch.tsx
- DriveNet
- play/page.tsx
- getLocale
- fa/arena.ts
- call.ts
- vfx.ts
- common.ts
- Player
- smoke.ts
- data.ts
- game.ts
- next.config.ts
- location.ts
- fa/lottery.ts
- pages.ts
- play.ts
- fa/server.ts
- fa/settings.ts

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
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts

## Import Cycles
- None detected.

## Communities (126 total, 24 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.09
Nodes (66): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtAnim, ArtSprite(), ArtUse() (+58 more)

### Community 1 - "helpers.ts"
Cohesion: 0.15
Nodes (10): Lottery, MyRides, Ride, META, Traffic, fakeIp(), Me, octet() (+2 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.10
Nodes (27): lat, lng, prisma, start, @prisma/client, args, build(), cityAt() (+19 more)

### Community 3 - "db.ts"
Cohesion: 0.07
Nodes (47): GET, POST, Schema, GET, POST, Send, dynamic, GET() (+39 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (55): GET, divarLink(), FILLER, FOOD, isFoodCat(), LINK_CHECKS, Menu, MenuItem (+47 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (41): BUY_STEPS, clock(), EmpireTab(), money(), View, ALL_AT, BASE_OFFLINE_H, bigNum() (+33 more)

### Community 6 - ".shoot"
Cohesion: 0.15
Nodes (8): Collide, FOOT_R, FootBody, FootInput, stepFoot(), aimDir(), eyeHeight(), spreadDir()

### Community 7 - "react"
Cohesion: 0.12
Nodes (20): react, isThenable(), Props, ago(), dayOf(), Filter, FILTERS, InboxPanel() (+12 more)

### Community 8 - "world3d.ts"
Cohesion: 0.09
Nodes (37): nameLines(), artImage(), artImages, at(), Board, canvas(), curtain(), DIM (+29 more)

### Community 9 - "Panels.tsx"
Cohesion: 0.08
Nodes (48): askConfirm(), Opts, queue, Req, Dashboard(), fmtTime(), ModeCards(), fmtCountdown() (+40 more)

### Community 10 - "Button"
Cohesion: 0.17
Nodes (34): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), Button(), paintGauge(), StepsCard() (+26 more)

### Community 11 - "msg"
Cohesion: 0.15
Nodes (11): GET(), ART, dynamic, FAQ, FEATURES, metadata, PILLARS, STEPS (+3 more)

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (26): Cut, Style, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut() (+18 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (56): DELETE, LatLng, POST, Schema, POST, layCourse(), P, Roads (+48 more)

### Community 14 - "Call.tsx"
Cohesion: 0.05
Nodes (47): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+39 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.06
Nodes (48): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+40 more)

### Community 17 - "prisma"
Cohesion: 0.08
Nodes (38): GET, GET, GET, POST, Schema, Fields, Schema, Details (+30 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (26): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+18 more)

### Community 19 - "Game.tsx"
Cohesion: 0.06
Nodes (68): Art(), Me, Drive, Game(), GameMap, NAV, PHASE_ICON, PHASE_LABEL (+60 more)

### Community 20 - "server/money.ts"
Cohesion: 0.16
Nodes (25): GET, POST, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket() (+17 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.16
Nodes (25): leaflet, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS (+17 more)

### Community 22 - "weapons.ts"
Cohesion: 0.11
Nodes (21): FireMsg, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, HEAD_R, hitHeight() (+13 more)

### Community 23 - "Drive"
Cohesion: 0.12
Nodes (8): Drive(), Markers, angle(), Driver, Others, tagColor(), DetailSource, WorldPlayer

### Community 24 - "progression.ts"
Cohesion: 0.19
Nodes (16): POST, GET, POST, Schema, GET, ACHIEVEMENT_BY_KEY, AchievementDef, DAILY_REWARD() (+8 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "api"
Cohesion: 0.10
Nodes (43): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+35 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+27 more)

### Community 28 - "skyline.ts"
Cohesion: 0.23
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.09
Nodes (38): Action, GET, layDrops(), POST, price(), Schema, ITEM_BY_KEY, ItemDef (+30 more)

### Community 30 - "AdminDropMap.tsx"
Cohesion: 0.38
Nodes (6): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 31 - "http.ts"
Cohesion: 0.06
Nodes (57): bcryptjs, next, zod, AdminPage(), keyMatches(), GET, POST, POST (+49 more)

### Community 32 - "world/route.ts"
Cohesion: 0.09
Nodes (40): GET, GET, Point, Schema, GET, num(), Schema, GET (+32 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, drive, empire, help, landing, landmarks, local (+4 more)

### Community 35 - "goals.ts"
Cohesion: 0.11
Nodes (34): POST, Schema, GET, POST, Schema, AdCreative, GOAL_METRICS, GoalDef (+26 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.18
Nodes (15): GlobalError(), I18nProvider(), LocaleCtx, DEFAULT_LOCALE, Locale, LOCALE_META, Messages, registerMessages() (+7 more)

### Community 38 - "avatar.ts"
Cohesion: 0.17
Nodes (11): axisL, Clip, NATURAL, Pose, qa, qp, right, Template (+3 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.06
Nodes (37): days(), dynamic, GET, GET, pub, Schema, ACTIVE, GET (+29 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.24
Nodes (13): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+5 more)

### Community 42 - "Drive.tsx"
Cohesion: 0.07
Nodes (36): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+28 more)

### Community 43 - "FootprintIndex"
Cohesion: 0.18
Nodes (5): Nav, Node, FootprintIndex, pointInPoly(), rayFootprint()

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "Landmarks"
Cohesion: 0.20
Nodes (3): Landmarks, CollisionWorld, Footprint

### Community 46 - "EmojiArt.tsx"
Cohesion: 0.22
Nodes (14): artFor(), artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion (+6 more)

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
Cohesion: 0.07
Nodes (34): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, World (+26 more)

### Community 52 - "HttpError"
Cohesion: 0.08
Nodes (68): POST, POST, GET, POST, POST, Schema, GET, Point (+60 more)

### Community 53 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (43): Identity, MatchResult, Sample, APP_URL, hub, ORIGINS, PORT, report() (+35 more)

### Community 55 - "server/city.ts"
Cohesion: 0.18
Nodes (26): GET, overpassQuery(), parseTileKey(), tileKey, tileOf(), packPlaces(), cellKey(), backoffMs() (+18 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (47): BOT_NAMES, Brain, SKILL, Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud (+39 more)

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

### Community 61 - "Match"
Cohesion: 0.13
Nodes (8): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView, Team

### Community 62 - "drive.spec.ts"
Cohesion: 0.24
Nodes (12): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+4 more)

### Community 63 - "perf.ts"
Cohesion: 0.24
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isTouch(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.15
Nodes (9): D, shops, StubShop, StubVendor, vendors, ADMIN_KEY, E2E_DB, PORT (+1 more)

### Community 66 - "world.spec.ts"
Cohesion: 0.20
Nodes (9): Loc, Near, World, WorldP, LatLng, octet(), returningPlayer(), test (+1 more)

### Community 68 - "music.ts"
Cohesion: 0.18
Nodes (22): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+14 more)

### Community 70 - "Remotes"
Cohesion: 0.23
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 71 - "server/empire.ts"
Cohesion: 0.16
Nodes (23): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, DIVIDEND_H, dividendCoins() (+15 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (24): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+16 more)

### Community 73 - "gunsound.ts"
Cohesion: 0.27
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

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

### Community 81 - "server/places.ts"
Cohesion: 0.14
Nodes (25): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), PLACE_BUCKET_MS, PLACE_CAT_KEYS (+17 more)

### Community 83 - "drive/landmarks.ts"
Cohesion: 0.18
Nodes (16): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+8 more)

### Community 84 - "useLocation.ts"
Cohesion: 0.19
Nodes (10): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, LocationSnapshot (+2 more)

### Community 85 - "geo.ts"
Cohesion: 0.16
Nodes (16): Rarity, villageTile(), bearingTo(), CELL_DEG, hashStr(), offset(), rng(), toDeg() (+8 more)

### Community 86 - "i18n.ts"
Cohesion: 0.22
Nodes (12): fa, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware() (+4 more)

### Community 87 - "LatLng"
Cohesion: 0.09
Nodes (33): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+25 more)

### Community 88 - "randomSpot"
Cohesion: 0.22
Nodes (12): Dash, store(), World, Mission, setup(), World, Feed, Post (+4 more)

### Community 89 - "t"
Cohesion: 0.14
Nodes (31): Browse(), DEAL_STEPS, endLabel(), ENDS, img(), localInput(), MarketPanel(), Mine (+23 more)

### Community 91 - "Player"
Cohesion: 0.24
Nodes (4): gps(), Money, World, Player

### Community 93 - "business/route.ts"
Cohesion: 0.13
Nodes (30): Details, GET, mine(), POST, Schema, GET, POST, Schema (+22 more)

### Community 94 - "PlayerLayer.tsx"
Cohesion: 0.28
Nodes (7): meIcon, Anim, Guide, guideKey(), PlayerLayer(), subscribeLocation, INTERACT_RADIUS_M

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "AdminLandmarks.tsx"
Cohesion: 0.18
Nodes (16): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+8 more)

### Community 97 - "@playwright/test"
Cohesion: 0.20
Nodes (6): crew(), Empire, octet(), phone(), phoneSetup(), @playwright/test

### Community 98 - "call.spec.ts"
Cohesion: 0.83
Nodes (3): json(), octet(), open()

### Community 99 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 100 - "lotteries/route.ts"
Cohesion: 0.24
Nodes (11): GET, POST, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS (+3 more)

### Community 101 - "arena/combat.ts"
Cohesion: 0.07
Nodes (45): three, POST, Schema, camFwd, CombatHost, CombatInput, FeedLine, HttpMe (+37 more)

### Community 102 - "CityTile"
Cohesion: 0.17
Nodes (10): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+2 more)

### Community 105 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 107 - "LanguageSwitch.tsx"
Cohesion: 0.50
Nodes (6): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage()

### Community 109 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 110 - "getLocale"
Cohesion: 0.67
Nodes (3): fa(), getLocale(), resolver()

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 115 - "Player"
Cohesion: 0.09
Nodes (9): Hub, Player, Sock, Space, weaponOf(), World, LL, damageAt() (+1 more)

### Community 116 - "smoke.ts"
Cohesion: 0.14
Nodes (15): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+7 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 798 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `db.ts`, `server/localData.ts`, `idle.ts`, `react`, `Panels.tsx`, `Button`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `prisma`, `DriveGarage.tsx`, `Game.tsx`, `server/money.ts`, `GameMap.tsx`, `Drive`, `progression.ts`, `gpsgames.ts`, `api`, `lib/settings.ts`, `http.ts`, `world/route.ts`, `layout.tsx`, `goals.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `Drive.tsx`, `client.ts`, `HttpError`, `server/city.ts`, `match.ts`, `perf.ts`, `music.ts`, `server/empire.ts`, `server/landmarks.ts`, `gunsound.ts`, `AdminPanel.tsx`, `server/places.ts`, `geo.ts`, `business/route.ts`, `AdminLandmarks.tsx`, `lotteries/route.ts`, `arena/combat.ts`, `.onMsg`, `Avatar`, `LanguageSwitch.tsx`, `getLocale`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08987341772151898 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `HttpError` to `db.ts`, `server/localData.ts`, `Panels.tsx`, `Button`, `server/drive.ts`, `Play.tsx`, `prisma`, `Game.tsx`, `server/money.ts`, `weapons.ts`, `Drive`, `gpsgames.ts`, `lib/settings.ts`, `http.ts`, `world/route.ts`, `i18n/index.ts`, `Drive.tsx`, `match.ts`, `Match`, `LocationReporter`, `server/places.ts`, `useLocation.ts`, `geo.ts`, `LatLng`, `business/route.ts`, `arena/combat.ts`, `Player`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14705882352941177 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `arena/combat.ts`, `Remotes`, `.shoot`, `Viewmodel`, `gunsound.ts`, `Avatar`, `.onMsg`, `Drive.tsx`, `Player`, `smoke.ts`, `Drive`, `match.ts`, `Match`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._