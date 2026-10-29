# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 326 files · ~345,099 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3098 nodes · 10439 edges · 118 communities (100 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 229 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7a2d18e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- Empire.tsx
- city-pack.ts
- db.ts
- server/localData.ts
- idle.ts
- drive/landmarks.ts
- pwaClient.ts
- Drive.tsx
- client.ts
- t
- app/page.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- AdminLandmarks.tsx
- server/shops.ts
- DriveGarage.tsx
- Rewards.tsx
- server/places.ts
- GameMap.tsx
- arena/combat.ts
- goals.ts
- EmojiArt.tsx
- msg
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminDropMap.tsx
- http.ts
- distanceM
- layout.tsx
- fa/index.ts
- music.ts
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
- physics.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- HttpError
- i18n.ts
- realtime/hub.ts
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
- helpers.ts
- LocationReporter
- lib/city.ts
- NearbyStore
- OthersLayer.tsx
- me/route.ts
- server/landmarks.ts
- .onMsg
- AdminPanel.tsx
- allowScripts
- PlayerLayer.tsx
- mapStyles.ts
- ref_node_child_process
- render.mjs
- Panels.tsx
- health/route.ts
- vercel.json
- others.ts
- useLocation.ts
- lib/places.ts
- ads.txt/route.ts
- LatLng
- Player
- Market.tsx
- CLAUDE.md
- money.spec.ts
- DriveNet
- lib/business.ts
- play/page.tsx
- overrides
- footprint.ts
- @playwright/test
- randomSpot
- server/steps.ts
- CombatPad.tsx
- StreetQuest — real-world GPS war game
- server/empire.ts
- sim.ts
- Drive
- fa/arena.ts
- call.ts
- vfx.ts
- common.ts
- Player
- data.ts
- game.ts
- next
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

## Communities (118 total, 18 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.10
Nodes (63): cells, keys, [out = "art-preview.html", only], sym, ArtAnim, combat, flag(), skullHead() (+55 more)

### Community 1 - "Empire.tsx"
Cohesion: 0.14
Nodes (21): BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard(), View, MotionPerm (+13 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.07
Nodes (32): lat, lng, prisma, start, pbf, @prisma/client, args, build() (+24 more)

### Community 3 - "db.ts"
Cohesion: 0.08
Nodes (41): GET, POST, Schema, POST, Send, GET, POST, Schema (+33 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.06
Nodes (73): empty, GET, num, Query, DIVAR_CAT_KEYS, DIVAR_CATS, DivarCat, divarLink() (+65 more)

### Community 5 - "idle.ts"
Cohesion: 0.14
Nodes (23): ALL_AT, BASE_OFFLINE_H, BizDef, bizMult(), cycleRevenue(), cycleSecs(), FAME_BONUS, fameMult() (+15 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.20
Nodes (15): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+7 more)

### Community 7 - "pwaClient.ts"
Cohesion: 0.16
Nodes (24): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+16 more)

### Community 8 - "Drive.tsx"
Cohesion: 0.06
Nodes (67): three, artFor(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+59 more)

### Community 9 - "client.ts"
Cohesion: 0.09
Nodes (23): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, ShopDeal, WorldDelivery, WorldEvent (+15 more)

### Community 10 - "t"
Cohesion: 0.19
Nodes (36): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), InfoCard(), RouteChip(), HelpCard() (+28 more)

### Community 11 - "app/page.tsx"
Cohesion: 0.17
Nodes (12): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+4 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (23): TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead(), Job (+15 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (51): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+43 more)

### Community 14 - "Call.tsx"
Cohesion: 0.05
Nodes (46): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+38 more)

### Community 15 - "Play.tsx"
Cohesion: 0.11
Nodes (27): AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd, W, AdModal() (+19 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.19
Nodes (15): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+7 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.09
Nodes (37): GET, GET, GET, POST, Schema, Fields, Schema, Details (+29 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.08
Nodes (35): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+27 more)

### Community 20 - "server/places.ts"
Cohesion: 0.11
Nodes (44): GET, Schema, POST, GET, cellOf(), dayPhase, solarHour(), DROP_PREFIX (+36 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.16
Nodes (23): Clicks(), FrameTarget(), GameItem, GameMap(), guidesFor(), Layers(), Poi, Props (+15 more)

### Community 22 - "arena/combat.ts"
Cohesion: 0.08
Nodes (52): Sample, FireMsg, camFwd, CombatHost, FeedLine, HttpMe, store, v3 (+44 more)

### Community 23 - "goals.ts"
Cohesion: 0.09
Nodes (41): POST, Schema, POST, Schema, GET, POST, Schema, spendGems() (+33 more)

### Community 24 - "EmojiArt.tsx"
Cohesion: 0.23
Nodes (13): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+5 more)

### Community 25 - "msg"
Cohesion: 0.08
Nodes (43): GET, here(), POST, Schema, ItemDef, ITEMS, Rarity, RARITY_COLOR (+35 more)

### Community 26 - "Button"
Cohesion: 0.13
Nodes (37): Button(), isThenable(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+29 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.08
Nodes (37): Job, AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), Cut (+29 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (34): Action, GET, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry, snapshot() (+26 more)

### Community 30 - "AdminDropMap.tsx"
Cohesion: 0.38
Nodes (6): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 31 - "http.ts"
Cohesion: 0.06
Nodes (54): bcryptjs, zod, GET, POST, POST, Schema, POST, POST (+46 more)

### Community 32 - "distanceM"
Cohesion: 0.08
Nodes (50): layDrops(), Details, GET, mine(), POST, Schema, GET, num() (+42 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.14
Nodes (21): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+13 more)

### Community 37 - "Combat"
Cohesion: 0.04
Nodes (15): Avatar, loadSoldier(), Combat, Collide, FOOT_R, FootBody, FootInput, newFoot() (+7 more)

### Community 38 - "avatar.ts"
Cohesion: 0.13
Nodes (14): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+6 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.08
Nodes (31): days(), dynamic, GET, Schema, ACTIVE, GET, live(), Point (+23 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.20
Nodes (15): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+7 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.21
Nodes (15): GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS, LOTTERY_MIN_PRICE (+7 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (18): Nav, Node, aimDir(), BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, eyeHeight() (+10 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "Landmarks"
Cohesion: 0.27
Nodes (3): disposeModel(), Landmarks, LandmarkView

### Community 46 - "physics.ts"
Cohesion: 0.24
Nodes (8): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint

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
Nodes (52): react, Art(), Props, LatLng, Me, ALL_LAYERS, Drive, Game() (+44 more)

### Community 52 - "HttpError"
Cohesion: 0.08
Nodes (69): POST, POST, GET, POST, Schema, GET, Point, POST (+61 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 54 - "realtime/hub.ts"
Cohesion: 0.06
Nodes (35): Identity, MatchResult, Sock, APP_URL, hub, ORIGINS, PORT, report() (+27 more)

### Community 55 - "server/city.ts"
Cohesion: 0.13
Nodes (35): Colour, GET, Info, Points, POST, Upload, CityTile, overpassQuery() (+27 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (46): BOT_NAMES, Brain, SKILL, Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud (+38 more)

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+13 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "adminPlayer"
Cohesion: 0.29
Nodes (8): Dash, store(), World, setup(), Feed, Post, adminPlayer(), uploadPlaces()

### Community 62 - "drive.spec.ts"
Cohesion: 0.15
Nodes (16): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+8 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.14
Nodes (11): A, ads, D, districts, pairAt(), shops, SMALLTOWN, StubShop (+3 more)

### Community 66 - "helpers.ts"
Cohesion: 0.17
Nodes (12): Mission, World, Loc, Near, World, WorldP, fakeIp(), LatLng (+4 more)

### Community 68 - "lib/city.ts"
Cohesion: 0.07
Nodes (43): Production checklist, AREA, Geom, HouseNumber, NAME_MODES, OPEN, ROAD, Storefront (+35 more)

### Community 70 - "OthersLayer.tsx"
Cohesion: 0.33
Nodes (8): leaflet, esc(), icon(), iconCache, meIcon, Entry, htmlOf(), OthersLayer()

### Community 71 - "me/route.ts"
Cohesion: 0.09
Nodes (37): POST, GET, POST, Schema, GET, Schema, GET, GET (+29 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (25): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+17 more)

### Community 73 - ".onMsg"
Cohesion: 0.19
Nodes (14): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+6 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.07
Nodes (37): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+29 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "PlayerLayer.tsx"
Cohesion: 0.33
Nodes (4): Anim, Guide, guideKey(), INTERACT_RADIUS_M

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (8): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, tileHosts(), Tiles

### Community 80 - "Panels.tsx"
Cohesion: 0.10
Nodes (38): fmtTime(), ModeCards(), fmtCountdown(), LotteryCard(), LotteryTab(), toLocalInput(), useNow(), AVATARS (+30 more)

### Community 81 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 83 - "others.ts"
Cohesion: 0.11
Nodes (24): NetState, Payload, Driver, Snap, Walker, Cockpit, makeCockpit(), makeVehicle() (+16 more)

### Community 84 - "useLocation.ts"
Cohesion: 0.16
Nodes (12): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+4 more)

### Community 85 - "lib/places.ts"
Cohesion: 0.10
Nodes (23): clipLine(), clipRing(), flatRoofRegion(), sliceVectorTile(), fillFrontage(), pack(), hashStr(), CUSTOMER_DOOR (+15 more)

### Community 86 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 87 - "LatLng"
Cohesion: 0.09
Nodes (36): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+28 more)

### Community 88 - "Player"
Cohesion: 0.18
Nodes (5): World, Traffic, Player, openGame(), SfxHook

### Community 89 - "Market.tsx"
Cohesion: 0.12
Nodes (38): askConfirm(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS, GoToShop() (+30 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.29
Nodes (5): Money, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 93 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 94 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "footprint.ts"
Cohesion: 0.27
Nodes (8): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), VT_ZOOM, insidePacked()

### Community 97 - "@playwright/test"
Cohesion: 0.22
Nodes (6): crew(), Empire, json(), octet(), open(), @playwright/test

### Community 98 - "randomSpot"
Cohesion: 0.24
Nodes (6): META, randomSpot(), octet(), returningPlayer(), test, withGps()

### Community 99 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 101 - "CombatPad.tsx"
Cohesion: 0.33
Nodes (6): CombatInput, SENS_TOUCH, ActButton(), CombatPad, Crosshair(), Props

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, How it works, Render, Run locally (+2 more)

### Community 105 - "server/empire.ts"
Cohesion: 0.15
Nodes (17): BIZ_BY_KEY, BizState, BOOST_MAX_H, BOOST_MINUTES, DIVIDEND_H, EmpireState, emptyEmpire(), RUSH_MINUTES (+9 more)

### Community 107 - "sim.ts"
Cohesion: 0.20
Nodes (9): buildings, F, host, log, m, mode, now, ORIGIN (+1 more)

### Community 108 - "Drive"
Cohesion: 0.10
Nodes (10): Drive(), Markers, angle(), Others, tagColor(), StorePins, DetailSource, WorldPlayer (+2 more)

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 115 - "Player"
Cohesion: 0.06
Nodes (15): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, Space (+7 more)

### Community 119 - "next"
Cohesion: 0.22
Nodes (6): BUILD_ID, config, next, GET(), dynamic, SITE

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 814 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `Empire.tsx`, `db.ts`, `server/localData.ts`, `pwaClient.ts`, `Drive.tsx`, `client.ts`, `app/page.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `AdminLandmarks.tsx`, `server/shops.ts`, `DriveGarage.tsx`, `Rewards.tsx`, `server/places.ts`, `GameMap.tsx`, `arena/combat.ts`, `goals.ts`, `msg`, `Button`, `lib/settings.ts`, `http.ts`, `distanceM`, `layout.tsx`, `music.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `lotteries/route.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `match.ts`, `perf.ts`, `me/route.ts`, `server/landmarks.ts`, `.onMsg`, `AdminPanel.tsx`, `Panels.tsx`, `Market.tsx`, `CombatPad.tsx`, `server/empire.ts`, `Drive`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09578947368421052 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `server/localData.ts`, `Drive.tsx`, `t`, `server/drive.ts`, `Play.tsx`, `server/shops.ts`, `server/places.ts`, `GameMap.tsx`, `arena/combat.ts`, `goals.ts`, `msg`, `lib/settings.ts`, `http.ts`, `i18n/index.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `match.ts`, `LocationReporter`, `Panels.tsx`, `useLocation.ts`, `lib/places.ts`, `LatLng`, `Drive`, `Player`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `Empire.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `Drive.tsx`, `.onMsg`, `geom.ts`, `Drive`, `Player`, `arena/combat.ts`, `realtime/hub.ts`, `match.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._