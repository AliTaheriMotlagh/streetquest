# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~326,709 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2944 nodes · 9902 edges · 114 communities (90 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9ba069d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- db.ts
- t
- idle.ts
- drive/landmarks.ts
- http.ts
- world3d.ts
- msg
- Rewards.tsx
- Game.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- lib/city.ts
- S
- DriveGarage.tsx
- react
- AdminSettings.tsx
- GameMap.tsx
- vehicles3d.ts
- Drive
- Market.tsx
- gpsgames.ts
- geo.ts
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- gunsound.ts
- server/places.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- track
- I18nProvider.tsx
- Combat
- drive/traffic.ts
- i18n/index.ts
- sfx.ts
- app/page.tsx
- StreetQuest — real-world GPS war game
- FootprintIndex
- i18n-check.ts
- Drive.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- lib/business.ts
- AdminLandmarks.tsx
- protocol.ts
- Landmarks
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Match
- client.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- weapons.ts
- LocationReporter
- server/empire.ts
- NearbyStore
- DriveNet
- goals.ts
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- music.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- lib/places.ts
- vercel.json
- server/steps.ts
- me/route.ts
- health/route.ts
- i18n.ts
- avatar.ts
- .shoot
- Button
- CLAUDE.md
- result/route.ts
- @prisma/client
- getT
- render
- .onMsg
- tile.worker.ts
- Player
- fa/arena.ts
- locationTracker
- vfx.ts
- call.ts
- Viewmodel
- data.ts
- sim.ts
- fa/empire.ts
- game.ts
- filter.ts
- RtClient
- help.ts
- fa/landmarks.ts
- market.ts
- pages.ts
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
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts

## Import Cycles
- None detected.

## Communities (114 total, 24 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (79): cells, keys, [out = "art-preview.html", only], sym, ArtAnim, ArtSprite(), artFor(), artHtml() (+71 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.09
Nodes (30): Production checklist, pbf, args, build(), cityAt(), dry, extractFile(), hotspots() (+22 more)

### Community 3 - "db.ts"
Cohesion: 0.06
Nodes (56): GET, GET, POST, Schema, GET, POST, Send, GET (+48 more)

### Community 4 - "t"
Cohesion: 0.07
Nodes (91): layDrops(), POST, POST, Details, GET, mine(), POST, Schema (+83 more)

### Community 5 - "idle.ts"
Cohesion: 0.09
Nodes (44): BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard(), View, getLocale() (+36 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.27
Nodes (9): Entry, BUDGET, BUDGET_LABEL, LANDMARK_DROP_M, LANDMARK_LIST_M, LANDMARK_LOAD_M, LandmarkView, placeHull() (+1 more)

### Community 7 - "http.ts"
Cohesion: 0.07
Nodes (50): bcryptjs, zod, POST, Schema, POST, POST, Schema, GET (+42 more)

### Community 8 - "world3d.ts"
Cohesion: 0.09
Nodes (41): three, Cloud, Pin, pinTexture(), nameLines(), oneLine(), OTHER, Trade (+33 more)

### Community 9 - "msg"
Cohesion: 0.19
Nodes (9): BUILD_ID, config, next, manifest(), GET(), dynamic, dirOf(), msg() (+1 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.12
Nodes (26): useGpsGame(), bump(), calm(), Celebration, CelebrationLayer(), compact(), confetti(), CountUp() (+18 more)

### Community 11 - "Game.tsx"
Cohesion: 0.10
Nodes (40): Art(), Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL (+32 more)

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (26): Cut, Style, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut() (+18 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (61): POST, layCourse(), P, Roads, samples(), Friend, GAMES, Invite (+53 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.08
Nodes (41): AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber, NAME_MODES, OPEN (+33 more)

### Community 17 - "S"
Cohesion: 0.09
Nodes (37): GET, GET, GET, POST, Schema, Fields, Schema, Details (+29 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (26): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+18 more)

### Community 19 - "react"
Cohesion: 0.09
Nodes (26): react, isThenable(), Props, Opts, queue, Req, HeroView, Me (+18 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminConfig, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (35): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+27 more)

### Community 22 - "vehicles3d.ts"
Cohesion: 0.23
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 23 - "Drive"
Cohesion: 0.11
Nodes (7): Drive(), Markers, angle(), Others, tagColor(), StorePins, DetailSource

### Community 24 - "Market.tsx"
Cohesion: 0.12
Nodes (38): askConfirm(), fmtTime(), Browse(), BuyerOrder(), DEAL_STEPS, endLabel(), ENDS, img() (+30 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "geo.ts"
Cohesion: 0.12
Nodes (37): GET, bbox(), bearingTo(), cellOf(), dayPhase, LatLng, offset(), solarHour() (+29 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+27 more)

### Community 28 - "skyline.ts"
Cohesion: 0.23
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.11
Nodes (30): Action, GET, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry, snapshot() (+22 more)

### Community 30 - "gunsound.ts"
Cohesion: 0.30
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 31 - "server/places.ts"
Cohesion: 0.16
Nodes (31): GET, parseTileKey(), tileKey, tileOf(), villageTile(), cellKey(), parsePlaceMissionId(), Place (+23 more)

### Community 32 - "social/route.ts"
Cohesion: 0.11
Nodes (31): POST, Schema, GET, num(), Schema, levelForXp(), fresh(), hit() (+23 more)

### Community 33 - "layout.tsx"
Cohesion: 0.12
Nodes (15): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+7 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "track"
Cohesion: 0.11
Nodes (28): POST, Schema, GET, POST, Schema, slugify(), GET, POST (+20 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.15
Nodes (22): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+14 more)

### Community 38 - "drive/traffic.ts"
Cohesion: 0.08
Nodes (35): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+27 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.07
Nodes (40): days(), dynamic, GET, GET, Schema, ACTIVE, GET, live() (+32 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.13
Nodes (19): EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata(), ART (+11 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.25
Nodes (7): Before going big, Deploy, How it works, Render, Run locally, StreetQuest — real-world GPS war game, Vercel

### Community 43 - "FootprintIndex"
Cohesion: 0.17
Nodes (6): Nav, Node, FootprintIndex, pointInPoly(), rayFootprint(), LocalFrame

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.06
Nodes (38): ArenaMenu(), CombatHud(), nil(), Scoreboard(), useCombat(), CAM_LABEL, CamMode, CAMS (+30 more)

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

### Community 51 - "Panels.tsx"
Cohesion: 0.09
Nodes (35): AppSettings(), AVATARS, dropoffOf(), Friend, HeroTabId, Msg, MyDeliveries, MyRide (+27 more)

### Community 52 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.15
Nodes (22): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+14 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (47): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+39 more)

### Community 55 - "Landmarks"
Cohesion: 0.20
Nodes (3): Landmarks, CollisionWorld, Footprint

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (43): Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, clock(), MatchBar(), WEAPON_ICON, BOMB_REACH_M (+35 more)

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

### Community 62 - "client.ts"
Cohesion: 0.09
Nodes (26): ApiError, CashoutView, ensureGuest(), GpsView, LatLng, ShopDeal, WorldDelivery, WorldEvent (+18 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 66 - "weapons.ts"
Cohesion: 0.08
Nodes (23): FireMsg, Space, weaponOf(), ADS, HIP, BODY_R, CROUCH_H, EYE_CROUCH (+15 more)

### Community 68 - "server/empire.ts"
Cohesion: 0.15
Nodes (24): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, DIVIDEND_H, dividendCoins() (+16 more)

### Community 71 - "goals.ts"
Cohesion: 0.26
Nodes (16): GET, POST, Schema, bump(), claimGoal(), factionGoal(), fmtReward(), goalsView() (+8 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.15
Nodes (24): Action, Fields, GET, Meta, POST, PUT, activePlan(), glbProblem() (+16 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.07
Nodes (43): BOT_NAMES, Brain, SKILL, camFwd, CombatHost, CombatHud, CombatInput, FeedLine (+35 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "music.ts"
Cohesion: 0.22
Nodes (17): graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange(), pluck() (+9 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "lib/places.ts"
Cohesion: 0.09
Nodes (22): Rarity, hashStr(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, pick(), PLACE_BUCKET_MS (+14 more)

### Community 83 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 84 - "me/route.ts"
Cohesion: 0.18
Nodes (19): GET, Schema, GET, LOCALES, ACHIEVEMENT_BY_KEY, AchievementDef, DAILY_REWARD(), dayKey() (+11 more)

### Community 85 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 86 - "i18n.ts"
Cohesion: 0.18
Nodes (14): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), Vars, config, middleware() (+6 more)

### Community 87 - "avatar.ts"
Cohesion: 0.17
Nodes (11): axisL, Clip, NATURAL, Pose, qa, qp, right, Template (+3 more)

### Community 88 - ".shoot"
Cohesion: 0.11
Nodes (11): Avatar, Collide, FOOT_R, FootBody, FootInput, newFoot(), stepFoot(), lerpAngle() (+3 more)

### Community 89 - "Button"
Cohesion: 0.11
Nodes (59): Button(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+51 more)

### Community 91 - "result/route.ts"
Cohesion: 0.36
Nodes (7): Body, POST, Row, ARENA_REWARDS_PER_DAY, isMode(), matchPrize(), serverKey()

### Community 92 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 93 - "getT"
Cohesion: 0.26
Nodes (9): AdminPage(), generateMetadata(), keyMatches(), generateMetadata(), Offline(), generateMetadata(), PlayPage(), viewport (+1 more)

### Community 97 - "tile.worker.ts"
Cohesion: 0.16
Nodes (10): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+2 more)

### Community 98 - "Player"
Cohesion: 0.12
Nodes (5): Hub, Player, World, LL, WeaponKey

### Community 101 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 105 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "filter.ts"
Cohesion: 0.33
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 769 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `db.ts`, `idle.ts`, `http.ts`, `msg`, `Rewards.tsx`, `Game.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `S`, `DriveGarage.tsx`, `react`, `AdminSettings.tsx`, `GameMap.tsx`, `Drive`, `Market.tsx`, `gpsgames.ts`, `geo.ts`, `lib/settings.ts`, `gunsound.ts`, `server/places.ts`, `social/route.ts`, `layout.tsx`, `track`, `I18nProvider.tsx`, `Combat`, `drive/traffic.ts`, `i18n/index.ts`, `app/page.tsx`, `Drive.tsx`, `Panels.tsx`, `AdminLandmarks.tsx`, `match.ts`, `client.ts`, `perf.ts`, `server/empire.ts`, `goals.ts`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `music.ts`, `me/route.ts`, `.shoot`, `Button`, `.onMsg`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07010078387458006 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `kit.ts`, `idle.ts`, `Rewards.tsx`, `Game.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `DriveGarage.tsx`, `AdminSettings.tsx`, `GameMap.tsx`, `Market.tsx`, `layout.tsx`, `I18nProvider.tsx`, `app/page.tsx`, `Drive.tsx`, `useLocation.ts`, `package.json`, `Panels.tsx`, `AdminLandmarks.tsx`, `match.ts`, `pedometer`, `client.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `Button`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `t`, `idle.ts`, `world3d.ts`, `Rewards.tsx`, `Game.tsx`, `tiles.ts`, `server/drive.ts`, `DriveGarage.tsx`, `GameMap.tsx`, `vehicles3d.ts`, `Market.tsx`, `geo.ts`, `skyline.ts`, `gunsound.ts`, `server/places.ts`, `Combat`, `drive/traffic.ts`, `Drive.tsx`, `Landmarks`, `perf.ts`, `Remotes`, `DriveNet`, `arena/combat.ts`, `music.ts`, `.shoot`, `Button`, `Viewmodel`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._