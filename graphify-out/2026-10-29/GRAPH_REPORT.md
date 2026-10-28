# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~326,796 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2944 nodes · 9907 edges · 110 communities (92 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1474a019`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- party/route.ts
- requireUser
- idle.ts
- drive/landmarks.ts
- auth.ts
- world3d.ts
- msg
- Game.tsx
- HttpError
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- db.ts
- DriveGarage.tsx
- react
- geo.ts
- GameMap.tsx
- vehicles3d.ts
- Drive
- Market.tsx
- t
- server/money.ts
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- lib/city.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- I18nProvider.tsx
- Combat
- LatLng
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- Drive.tsx
- reporter.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- lib/business.ts
- AdminLandmarks.tsx
- protocol.ts
- physics.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Match
- report
- perf.ts
- Local Postgres 16 Service (db)
- DriveParty.tsx
- Landmarks
- useLocation.ts
- server/empire.ts
- NearbyStore
- DriveNet
- goals.ts
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- three
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- server/steps.ts
- i18n/index.ts
- health/route.ts
- i18n.ts
- avatar.ts
- Style
- Button
- CLAUDE.md
- course.ts
- @prisma/client
- drive/route.ts
- next.config.ts
- Player
- fa/arena.ts
- locationTracker
- vfx.ts
- call.ts
- data.ts
- fa/empire.ts
- game.ts
- tracker.ts
- smoke.ts
- help.ts
- fa/landmarks.ts
- market.ts
- pages.ts
- panels.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 373 edges
2. `HttpError` - 153 edges
3. `Drive()` - 139 edges
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
- `Production checklist` --references--> `CityDetail`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts

## Import Cycles
- None detected.

## Communities (110 total, 18 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (76): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artHtml(), artSvg(), EMOJI_RE (+68 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.10
Nodes (29): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+21 more)

### Community 3 - "party/route.ts"
Cohesion: 0.10
Nodes (36): GET, POST, Schema, GET, POST, Send, GET, GET (+28 more)

### Community 4 - "requireUser"
Cohesion: 0.08
Nodes (68): zod, POST, Schema, POST, Schema, POST, POST, Schema (+60 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (41): BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard(), View, ALL_AT (+33 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.20
Nodes (15): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+7 more)

### Community 7 - "auth.ts"
Cohesion: 0.10
Nodes (30): next, AdminPage(), keyMatches(), POST, POST, Schema, POST, POST (+22 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (38): artFor(), nameLines(), oneLine(), OTHER, tradeOf(), TRADES, artImage(), artImages (+30 more)

### Community 9 - "msg"
Cohesion: 0.14
Nodes (14): manifest(), GET(), ART, dynamic, FAQ, FEATURES, Home(), metadata (+6 more)

### Community 10 - "Game.tsx"
Cohesion: 0.06
Nodes (70): Art(), ArtAnim, load(), requestRewarded(), Drive, Game(), GameMap, MapLook (+62 more)

### Community 11 - "HttpError"
Cohesion: 0.10
Nodes (27): GET, Colour, GET, Points, POST, Upload, GET, POST (+19 more)

### Community 12 - "tiles.ts"
Cohesion: 0.10
Nodes (21): Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory, remember() (+13 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.13
Nodes (25): CHECKPOINT_M, checkPoints(), COIN_M, COUNTDOWN_MS, isPartyCode(), newPartyCode(), PARTY_GAMES, PARTY_IDLE_MS (+17 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (22): AutoVideo(), Props, AdBreak, AdNetwork, Placement, RewardedAd, W, AdOffer (+14 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.07
Nodes (32): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+24 more)

### Community 17 - "db.ts"
Cohesion: 0.08
Nodes (33): GET, GET, GET, GET, POST, Schema, Fields, POST (+25 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 19 - "react"
Cohesion: 0.09
Nodes (29): react, isThenable(), Props, Me, HELP, helpSeen(), markHelpSeen(), seenKey() (+21 more)

### Community 20 - "geo.ts"
Cohesion: 0.12
Nodes (23): Rarity, bearingTo(), CELL_DEG, cellOf(), dayPhase, offset(), rng(), solarHour() (+15 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (36): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+28 more)

### Community 22 - "vehicles3d.ts"
Cohesion: 0.23
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 23 - "Drive"
Cohesion: 0.12
Nodes (7): Drive(), Markers, angle(), Others, tagColor(), DetailSource, TileSource

### Community 24 - "Market.tsx"
Cohesion: 0.08
Nodes (58): askConfirm(), Opts, queue, Req, Dashboard(), fmtTime(), fmtCountdown(), LotteryCard() (+50 more)

### Community 25 - "t"
Cohesion: 0.14
Nodes (32): GET, here(), POST, Schema, t(), FIND_RADIUS_M, GPS_GAMES, GpsGameKind (+24 more)

### Community 26 - "server/money.ts"
Cohesion: 0.09
Nodes (40): GET, Schema, GET, Schema, POST, GET, bbox(), LOTTERY_MAX_HOSTED (+32 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.11
Nodes (34): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+26 more)

### Community 28 - "skyline.ts"
Cohesion: 0.23
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (36): Action, GET, layDrops(), POST, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE (+28 more)

### Community 30 - "lib/city.ts"
Cohesion: 0.14
Nodes (19): Production checklist, centroid(), CityDetail, fromOverpass(), heightOf(), NAMED_COLOURS, osmColour(), OsmEl (+11 more)

### Community 31 - "server/city.ts"
Cohesion: 0.23
Nodes (20): tileKey, villageTile(), cellKey(), backoffMs(), due(), endpoints(), fetchTile(), findPlace() (+12 more)

### Community 32 - "social/route.ts"
Cohesion: 0.14
Nodes (25): GET, num(), POST, Schema, levelForXp(), authorSelect, AutoBody, BIO_MAX (+17 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (15): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+7 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "server/business.ts"
Cohesion: 0.11
Nodes (37): Details, GET, mine(), POST, Schema, GET, POST, Schema (+29 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.13
Nodes (24): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+16 more)

### Community 37 - "Combat"
Cohesion: 0.04
Nodes (19): Avatar, loadSoldier(), Combat, beepSound(), blip(), boomSound(), emptySound(), hitSound() (+11 more)

### Community 38 - "LatLng"
Cohesion: 0.09
Nodes (33): box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed (+25 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.13
Nodes (19): days(), dynamic, GET, ACTIVE, GET, live(), Point, pub (+11 more)

### Community 40 - "sfx.ts"
Cohesion: 0.07
Nodes (49): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+41 more)

### Community 41 - "getT"
Cohesion: 0.17
Nodes (17): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+9 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.25
Nodes (7): Before going big, Deploy, How it works, Render, Run locally, StreetQuest — real-world GPS war game, Vercel

### Community 43 - "geom.ts"
Cohesion: 0.08
Nodes (20): Nav, Node, FootBody, aimDir(), BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND (+12 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.07
Nodes (31): ArenaMenu(), useCombat(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+23 more)

### Community 46 - "reporter.ts"
Cohesion: 0.28
Nodes (7): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent

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

### Community 51 - "Panels.tsx"
Cohesion: 0.06
Nodes (47): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, WorldDelivery (+39 more)

### Community 52 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.23
Nodes (13): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+5 more)

### Community 54 - "protocol.ts"
Cohesion: 0.06
Nodes (53): BOT_NAMES, Brain, SKILL, Identity, Sample, APP_URL, hub, ORIGINS (+45 more)

### Community 55 - "physics.ts"
Cohesion: 0.23
Nodes (7): Body, cellOf(), CollisionWorld, Controls, Footprint, Ray, VehicleDef

### Community 56 - "match.ts"
Cohesion: 0.05
Nodes (56): Bomb, MatchResult, buildings, F, host, log, m, mode (+48 more)

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

### Community 62 - "report"
Cohesion: 0.20
Nodes (19): POST, gridSpot(), isPaint(), footFlags(), assertCanParty(), createParty(), isVirtual(), joinParty() (+11 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "DriveParty.tsx"
Cohesion: 0.18
Nodes (12): Friend, GAMES, Invite, MEDAL, Props, Resp, allowedVehicle(), isVehicle() (+4 more)

### Community 66 - "Landmarks"
Cohesion: 0.22
Nodes (4): disposeModel(), Landmarks, Cut, LandmarkView

### Community 67 - "useLocation.ts"
Cohesion: 0.25
Nodes (5): LocationReporter, LocationSnapshot, GeoState, serverSnapshot, useLocation()

### Community 68 - "server/empire.ts"
Cohesion: 0.15
Nodes (25): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, BUSINESSES, buyCost() (+17 more)

### Community 71 - "goals.ts"
Cohesion: 0.18
Nodes (23): GET, POST, Schema, campaignKey(), announce(), bump(), claimGoal(), factionGoal() (+15 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (24): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+16 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.08
Nodes (34): camFwd, CombatHost, CombatInput, FeedLine, HttpMe, SENS_TOUCH, store, v3 (+26 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.07
Nodes (39): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+31 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "three"
Cohesion: 0.19
Nodes (6): three, Cloud, Pin, pinTexture(), StorePins, Trade

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.12
Nodes (30): tileOf(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place (+22 more)

### Community 83 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 84 - "i18n/index.ts"
Cohesion: 0.08
Nodes (35): POST, GET, pub, Schema, GET, PATCH, alertsAt, GET (+27 more)

### Community 85 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 86 - "i18n.ts"
Cohesion: 0.22
Nodes (12): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), Vars, config, middleware() (+4 more)

### Community 87 - "avatar.ts"
Cohesion: 0.13
Nodes (14): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+6 more)

### Community 88 - "Style"
Cohesion: 0.17
Nodes (4): Style, TileArrays, BuildPool, CityTile

### Community 89 - "Button"
Cohesion: 0.11
Nodes (60): Button(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Data, Details, DetailsForm() (+52 more)

### Community 91 - "course.ts"
Cohesion: 0.25
Nodes (8): layCourse(), P, Roads, samples(), RoadKind, COIN_POINTS, PartyGame, RACE_POINTS

### Community 92 - "@prisma/client"
Cohesion: 0.25
Nodes (6): lat, lng, prisma, start, bcryptjs, @prisma/client

### Community 93 - "drive/route.ts"
Cohesion: 0.40
Nodes (5): DELETE, LatLng, POST, Schema, park()

### Community 98 - "Player"
Cohesion: 0.08
Nodes (13): Hub, Player, Sock, FireMsg, Space, weaponOf(), World, LL (+5 more)

### Community 101 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 108 - "tracker.ts"
Cohesion: 0.23
Nodes (11): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+3 more)

### Community 109 - "smoke.ts"
Cohesion: 0.14
Nodes (15): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+7 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 768 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `party/route.ts`, `requireUser`, `idle.ts`, `auth.ts`, `msg`, `Game.tsx`, `HttpError`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `db.ts`, `DriveGarage.tsx`, `react`, `geo.ts`, `GameMap.tsx`, `Drive`, `Market.tsx`, `server/money.ts`, `lib/settings.ts`, `social/route.ts`, `layout.tsx`, `server/business.ts`, `I18nProvider.tsx`, `Combat`, `rides/route.ts`, `sfx.ts`, `getT`, `Drive.tsx`, `Panels.tsx`, `AdminLandmarks.tsx`, `protocol.ts`, `match.ts`, `report`, `perf.ts`, `DriveParty.tsx`, `server/empire.ts`, `goals.ts`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `server/places.ts`, `i18n/index.ts`, `Button`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07448107448107448 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `requireUser`, `world3d.ts`, `Game.tsx`, `tiles.ts`, `DriveGarage.tsx`, `geo.ts`, `GameMap.tsx`, `vehicles3d.ts`, `Market.tsx`, `t`, `skyline.ts`, `server/city.ts`, `Combat`, `LatLng`, `sfx.ts`, `Drive.tsx`, `physics.ts`, `match.ts`, `report`, `DriveParty.tsx`, `Landmarks`, `DriveNet`, `arena/combat.ts`, `three`, `server/places.ts`, `Style`, `Button`, `course.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `kit.ts`, `idle.ts`, `Game.tsx`, `Call.tsx`, `Play.tsx`, `DriveGarage.tsx`, `GameMap.tsx`, `Market.tsx`, `layout.tsx`, `I18nProvider.tsx`, `getT`, `Drive.tsx`, `package.json`, `Panels.tsx`, `AdminLandmarks.tsx`, `match.ts`, `pedometer`, `DriveParty.tsx`, `useLocation.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `Button`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._