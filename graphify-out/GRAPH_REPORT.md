# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~328,057 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2948 nodes · 9910 edges · 114 communities (89 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 227 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7d55b1a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- db.ts
- HttpError
- idle.ts
- AdminLandmarks.tsx
- music.ts
- Drive.tsx
- msg
- Button.tsx
- server/arena.ts
- LatLng
- server/drive.ts
- Call.tsx
- Play.tsx
- lib/city.ts
- S
- DriveGarage.tsx
- client.ts
- server/money.ts
- GameMap.tsx
- drive/traffic.ts
- Drive
- http.ts
- gpsgames.ts
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminPanel.tsx
- Remotes
- distanceM
- layout.tsx
- fa/index.ts
- goals.ts
- I18nProvider.tsx
- Combat
- server/traffic.ts
- i18n/index.ts
- sfx.ts
- getT
- CityTile
- geom.ts
- i18n-check.ts
- physics.ts
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- requireUser
- .shoot
- protocol.ts
- server/city.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Match
- Viewmodel
- perf.ts
- Local Postgres 16 Service (db)
- gunsound.ts
- t
- LocationReporter
- Game.tsx
- NearbyStore
- server/empire.ts
- LanguageSwitch.tsx
- server/landmarks.ts
- arena/combat.ts
- AdminSettings.tsx
- allowScripts
- lotteries/route.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- .onMsg
- server/hub.ts
- RtClient
- i18n.ts
- geo.ts
- Avatar
- Market.tsx
- CLAUDE.md
- server/steps.ts
- seed.ts
- lib/business.ts
- next.config.ts
- overrides
- health/route.ts
- render
- Player
- fa/arena.ts
- locationTracker
- vfx.ts
- call.ts
- drive/landmarks.ts
- data.ts
- DriveNet
- common.ts
- game.ts
- filter.ts
- play.ts
- fa/server.ts
- fa/settings.ts
- market.ts
- panels.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 373 edges
2. `HttpError` - 153 edges
3. `Drive()` - 136 edges
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
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts
- `How it works` --references--> `grant`  [INFERRED]
  README.md → src/server/rewards.ts

## Import Cycles
- None detected.

## Communities (114 total, 25 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (79): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtAnim, ArtSprite(), ArtUse() (+71 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.10
Nodes (29): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+21 more)

### Community 3 - "db.ts"
Cohesion: 0.08
Nodes (36): GET, POST, Schema, GET, POST, Send, GET, GET (+28 more)

### Community 4 - "HttpError"
Cohesion: 0.11
Nodes (27): GET, GET, Point, POST, pub, Schema, GET, POST (+19 more)

### Community 5 - "idle.ts"
Cohesion: 0.10
Nodes (40): BUY_STEPS, clock(), EmpireTab(), fa(), money(), View, burst(), ALL_AT (+32 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.16
Nodes (21): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+13 more)

### Community 7 - "music.ts"
Cohesion: 0.22
Nodes (17): graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange(), pluck() (+9 more)

### Community 8 - "Drive.tsx"
Cohesion: 0.05
Nodes (67): CombatPad, Crosshair(), artFor(), CAM_LABEL, CamMode, CAMS, Hud, Job (+59 more)

### Community 9 - "msg"
Cohesion: 0.15
Nodes (11): GET(), ART, dynamic, FAQ, FEATURES, metadata, PILLARS, STEPS (+3 more)

### Community 10 - "Button.tsx"
Cohesion: 0.17
Nodes (13): isThenable(), Props, ago(), dayOf(), Filter, FILTERS, InboxPanel(), Item (+5 more)

### Community 11 - "server/arena.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_AIM, F_FIRE, isWeapon() (+10 more)

### Community 12 - "LatLng"
Cohesion: 0.07
Nodes (24): TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead(), Job (+16 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.06
Nodes (68): POST, HttpMe, layCourse(), P, Roads, samples(), Friend, GAMES (+60 more)

### Community 14 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 15 - "Play.tsx"
Cohesion: 0.08
Nodes (32): react, AutoVideo(), Props, Opts, queue, Req, AdBreak, AdNetwork (+24 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.06
Nodes (50): centre(), FootBuilding, Footprint, footprintAt(), footprintObj(), FootRoad, round(), AREA (+42 more)

### Community 17 - "S"
Cohesion: 0.09
Nodes (41): @prisma/client, GET, GET, GET, POST, Schema, Fields, POST (+33 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 19 - "client.ts"
Cohesion: 0.07
Nodes (32): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, Me, ShopDeal (+24 more)

### Community 20 - "server/money.ts"
Cohesion: 0.17
Nodes (19): GET, POST, Schema, POST, Schema, POST, isDropId(), tiersOwned() (+11 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (35): leaflet, react-leaflet, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers() (+27 more)

### Community 22 - "drive/traffic.ts"
Cohesion: 0.08
Nodes (25): three, angle(), Driver, Snap, Walker, box(), Style, Car (+17 more)

### Community 23 - "Drive"
Cohesion: 0.11
Nodes (10): Drive(), Landmarks, Markers, Others, tagColor(), DetailSource, oneLine(), makeGate() (+2 more)

### Community 24 - "http.ts"
Cohesion: 0.08
Nodes (42): bcryptjs, next, AdminPage(), keyMatches(), GET, POST, POST, Schema (+34 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.12
Nodes (30): GET, here(), POST, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf(), HOLD_RADIUS_M (+22 more)

### Community 26 - "Button"
Cohesion: 0.17
Nodes (30): ArenaMenu(), Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+22 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.08
Nodes (38): Job, AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), Cut (+30 more)

### Community 28 - "skyline.ts"
Cohesion: 0.26
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.09
Nodes (39): Action, GET, layDrops(), POST, ItemDef, ITEMS, RARITY_COLOR, RARITY_WEIGHT (+31 more)

### Community 30 - "AdminPanel.tsx"
Cohesion: 0.12
Nodes (21): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+13 more)

### Community 31 - "Remotes"
Cohesion: 0.22
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 32 - "distanceM"
Cohesion: 0.08
Nodes (54): Details, GET, mine(), POST, Schema, POST, Schema, GET (+46 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, location (+5 more)

### Community 35 - "goals.ts"
Cohesion: 0.14
Nodes (28): POST, Schema, GET, AdCreative, adStatus(), claimAd(), clickAd(), dayStart() (+20 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.23
Nodes (13): GlobalError(), I18nProvider(), LocaleCtx, DEFAULT_LOCALE, Locale, parse(), registerMessages(), translate() (+5 more)

### Community 38 - "server/traffic.ts"
Cohesion: 0.14
Nodes (25): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, signalPhase() (+17 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.09
Nodes (26): days(), dynamic, GET, ACTIVE, GET, live(), Point, pub (+18 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.22
Nodes (14): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+6 more)

### Community 42 - "CityTile"
Cohesion: 0.17
Nodes (10): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+2 more)

### Community 43 - "geom.ts"
Cohesion: 0.06
Nodes (30): Nav, Node, buildings, F, host, log, m, mode (+22 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "physics.ts"
Cohesion: 0.23
Nodes (9): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+1 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.18
Nodes (11): Listener, nearby, NearReport, Sample, FireReport, Sent, GeoError, Listener (+3 more)

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
Cohesion: 0.10
Nodes (47): paintGauge(), PartyHud(), api(), fmtTime(), QuestsTab(), useHero(), useHeroAct(), fmtCountdown() (+39 more)

### Community 52 - "requireUser"
Cohesion: 0.08
Nodes (59): zod, POST, Schema, DELETE, LatLng, POST, Schema, GET (+51 more)

### Community 53 - ".shoot"
Cohesion: 0.33
Nodes (3): FootBody, eyeHeight(), spreadDir()

### Community 54 - "protocol.ts"
Cohesion: 0.05
Nodes (61): Identity, MatchResult, Sample, Sock, APP_URL, hub, ORIGINS, PORT (+53 more)

### Community 55 - "server/city.ts"
Cohesion: 0.14
Nodes (31): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), TILE_V (+23 more)

### Community 56 - "match.ts"
Cohesion: 0.10
Nodes (30): BOT_NAMES, Brain, SKILL, Bomb, BOMB_REACH_M, BOMB_TIMER_S, DEFUSE_S, FREEZE_S (+22 more)

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

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "gunsound.ts"
Cohesion: 0.24
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 66 - "t"
Cohesion: 0.21
Nodes (21): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+13 more)

### Community 68 - "Game.tsx"
Cohesion: 0.05
Nodes (74): PlayPage(), viewport, Art(), load(), Drive, Game(), GameMap, MapLook (+66 more)

### Community 70 - "server/empire.ts"
Cohesion: 0.15
Nodes (23): POST, BizState, BOOST_MAX_H, BOOST_MINUTES, buyCost(), dividendCoins(), emptyEmpire(), fameFor() (+15 more)

### Community 71 - "LanguageSwitch.tsx"
Cohesion: 0.42
Nodes (7): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALE_META

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (25): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+17 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.05
Nodes (49): DIFF, DIFF_LABEL, SIZE_LABEL, axisL, Clip, loadWeapons(), NATURAL, Pose (+41 more)

### Community 74 - "AdminSettings.tsx"
Cohesion: 0.14
Nodes (18): CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL, GameDataTab() (+10 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lotteries/route.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS (+10 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.12
Nodes (28): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place, PLACE_BUCKET_MS (+20 more)

### Community 84 - "server/hub.ts"
Cohesion: 0.09
Nodes (35): POST, GET, Schema, GET, alertsAt, GET, Rarity, LOCALES (+27 more)

### Community 86 - "i18n.ts"
Cohesion: 0.20
Nodes (13): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), setLocaleResolver(), Vars, config (+5 more)

### Community 87 - "geo.ts"
Cohesion: 0.19
Nodes (15): bearingTo(), CELL_DEG, cellOf(), dayPhase, offset(), solarHour(), toDeg(), toRad() (+7 more)

### Community 89 - "Market.tsx"
Cohesion: 0.08
Nodes (56): askConfirm(), DriveParty(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS (+48 more)

### Community 91 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 92 - "seed.ts"
Cohesion: 0.33
Nodes (4): lat, lng, prisma, start

### Community 93 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 98 - "Player"
Cohesion: 0.09
Nodes (7): Hub, Player, Space, weaponOf(), World, damageAt(), WeaponKey

### Community 101 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 103 - "drive/landmarks.ts"
Cohesion: 0.33
Nodes (7): Entry, BUDGET_LABEL, LANDMARK_DROP_M, LANDMARK_LIST_M, LANDMARK_LOAD_M, placeHull(), SUPPORTED_EXTENSIONS

### Community 108 - "filter.ts"
Cohesion: 0.31
Nodes (8): Axis, dist(), Fix, measurePos(), measureVel(), predict(), rad(), RawFix

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 772 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `db.ts`, `HttpError`, `idle.ts`, `AdminLandmarks.tsx`, `music.ts`, `Drive.tsx`, `Button.tsx`, `server/arena.ts`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `S`, `DriveGarage.tsx`, `client.ts`, `server/money.ts`, `GameMap.tsx`, `Drive`, `http.ts`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `AdminPanel.tsx`, `distanceM`, `layout.tsx`, `goals.ts`, `I18nProvider.tsx`, `Combat`, `server/traffic.ts`, `i18n/index.ts`, `Panels.tsx`, `requireUser`, `server/city.ts`, `perf.ts`, `gunsound.ts`, `Game.tsx`, `server/empire.ts`, `LanguageSwitch.tsx`, `server/landmarks.ts`, `arena/combat.ts`, `AdminSettings.tsx`, `lotteries/route.ts`, `server/places.ts`, `.onMsg`, `server/hub.ts`, `geo.ts`, `Avatar`, `Market.tsx`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0696528555431131 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `music.ts`, `Drive.tsx`, `LatLng`, `server/drive.ts`, `Play.tsx`, `lib/city.ts`, `DriveGarage.tsx`, `GameMap.tsx`, `drive/traffic.ts`, `Button`, `tileMesh.ts`, `skyline.ts`, `Remotes`, `distanceM`, `Combat`, `server/traffic.ts`, `physics.ts`, `Panels.tsx`, `.shoot`, `server/city.ts`, `Viewmodel`, `perf.ts`, `gunsound.ts`, `t`, `Game.tsx`, `arena/combat.ts`, `geo.ts`, `Avatar`, `Market.tsx`, `DriveNet`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Play.tsx` to `kit.ts`, `idle.ts`, `AdminLandmarks.tsx`, `Drive.tsx`, `Button.tsx`, `server/drive.ts`, `Call.tsx`, `DriveGarage.tsx`, `client.ts`, `GameMap.tsx`, `Button`, `AdminPanel.tsx`, `layout.tsx`, `I18nProvider.tsx`, `getT`, `useLocation.ts`, `package.json`, `Panels.tsx`, `pedometer`, `t`, `Game.tsx`, `LanguageSwitch.tsx`, `arena/combat.ts`, `AdminSettings.tsx`, `Market.tsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._