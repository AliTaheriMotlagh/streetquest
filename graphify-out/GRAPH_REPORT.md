# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 325 files · ~335,412 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3027 nodes · 10188 edges · 114 communities (95 shown, 19 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b5fb125a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- server/hub.ts
- server/localData.ts
- idle.ts
- AdminLandmarks.tsx
- music.ts
- world3d.ts
- msg
- Rewards.tsx
- realtime/server.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- db.ts
- DriveGarage.tsx
- react
- server/money.ts
- GameMap.tsx
- Drive.tsx
- Drive
- http.ts
- gpsgames.ts
- fmtNum
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminPanel.tsx
- loc/route.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- goals.ts
- I18nProvider.tsx
- Combat
- drive/traffic.ts
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- CollisionWorld
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- HttpError
- Business.tsx
- protocol.ts
- lib/city.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Player
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- randomSpot
- LocationReporter
- Game.tsx
- NearbyStore
- osm-pbf.ts
- app/page.tsx
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
- Landmarks
- i18n/index.ts
- smoke.ts
- i18n.ts
- distanceM
- adminPlayer
- t
- CLAUDE.md
- Player
- money.spec.ts
- business/route.ts
- PlayerLayer.tsx
- overrides
- jobs.spec.ts
- call-lte.spec.ts
- call.spec.ts
- fa/arena.ts
- locationTracker
- avatar.ts
- call.ts
- drive/landmarks.ts
- data.ts
- play/page.tsx
- common.ts
- game.ts
- tracker.ts
- fa/lottery.ts
- fa/world.ts
- fa/settings.ts
- market.ts
- panels.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 385 edges
2. `HttpError` - 155 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 128 edges
5. `Button()` - 108 edges
6. `distanceM()` - 97 edges
7. `body()` - 87 edges
8. `prisma` - 85 edges
9. `fmtNum()` - 82 edges
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

## Communities (114 total, 19 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.08
Nodes (75): cells, keys, [out = "art-preview.html", only], sym, artHtml(), artSvg(), EMOJI_RE, hasEmoji() (+67 more)

### Community 1 - "helpers.ts"
Cohesion: 0.15
Nodes (10): crew(), Empire, Traffic, fakeIp(), Me, octet(), Res, openGame() (+2 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.15
Nodes (21): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+13 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.10
Nodes (37): GET, POST, Schema, GET, POST, Send, dynamic, GET() (+29 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.09
Nodes (41): divarLink(), FILLER, FOOD, isFoodCat(), LINK_CHECKS, Menu, MenuItem, MenuSection (+33 more)

### Community 5 - "idle.ts"
Cohesion: 0.05
Nodes (72): lat, lng, prisma, start, @prisma/client, GET, POST, GET (+64 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.22
Nodes (14): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+6 more)

### Community 7 - "music.ts"
Cohesion: 0.20
Nodes (19): graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange(), pluck() (+11 more)

### Community 8 - "world3d.ts"
Cohesion: 0.07
Nodes (45): artFor(), Cloud, Pin, pinTexture(), StorePins, nameLines(), OTHER, Trade (+37 more)

### Community 9 - "msg"
Cohesion: 0.22
Nodes (7): BUILD_ID, config, next, GET(), dynamic, msg(), SITE

### Community 10 - "Rewards.tsx"
Cohesion: 0.08
Nodes (32): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+24 more)

### Community 11 - "realtime/server.ts"
Cohesion: 0.08
Nodes (21): MatchResult, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY, server (+13 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (23): TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead(), Job (+15 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (55): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+47 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Play.tsx"
Cohesion: 0.06
Nodes (53): AutoVideo(), Props, Opts, queue, Req, AdBreak, AdNetwork, load() (+45 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.06
Nodes (42): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+34 more)

### Community 17 - "db.ts"
Cohesion: 0.08
Nodes (39): empty, GET, num, Query, GET, GET, GET, POST (+31 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (26): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+18 more)

### Community 19 - "react"
Cohesion: 0.10
Nodes (31): react, isThenable(), Props, Me, HELP, HelpCard(), helpSeen(), markHelpSeen() (+23 more)

### Community 20 - "server/money.ts"
Cohesion: 0.16
Nodes (24): GET, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell() (+16 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.10
Nodes (33): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+25 more)

### Community 22 - "Drive.tsx"
Cohesion: 0.07
Nodes (42): HttpMe, RT_DELAY_MS, CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+34 more)

### Community 23 - "Drive"
Cohesion: 0.11
Nodes (9): Drive(), Markers, DriveNet, Others, tagColor(), DetailSource, oneLine(), makeGate() (+1 more)

### Community 24 - "http.ts"
Cohesion: 0.05
Nodes (58): bcryptjs, zod, GET, POST, Schema, POST, POST, Schema (+50 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.12
Nodes (30): GET, here(), POST, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf(), HOLD_RADIUS_M (+22 more)

### Community 26 - "fmtNum"
Cohesion: 0.17
Nodes (27): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), InfoCard(), BizCard() (+19 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+27 more)

### Community 28 - "skyline.ts"
Cohesion: 0.12
Nodes (13): Built, MarkerInfo, markersOf(), BROWN, Dem, heightAt(), loadTile(), ROCK (+5 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.09
Nodes (36): PUT, Action, GET, POST, ITEMS, applyConfig(), catalogOriginals(), CATALOGS (+28 more)

### Community 30 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 31 - "loc/route.ts"
Cohesion: 0.18
Nodes (13): jose, GET, POST, Schema, Body, POST, Row, GET (+5 more)

### Community 32 - "social/route.ts"
Cohesion: 0.15
Nodes (23): GET, num(), Schema, levelForXp(), authorSelect, AutoBody, BIO_MAX, COMMENT_MAX (+15 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (12): cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport, manifest() (+4 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "goals.ts"
Cohesion: 0.09
Nodes (40): POST, Schema, GET, POST, Schema, GET, POST, Schema (+32 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.13
Nodes (24): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+16 more)

### Community 37 - "Combat"
Cohesion: 0.04
Nodes (14): Avatar, loadSoldier(), loadWeapons(), Combat, FootBody, lerpAngle(), Remotes, Vfx (+6 more)

### Community 38 - "drive/traffic.ts"
Cohesion: 0.08
Nodes (35): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+27 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.13
Nodes (19): GET, pub, Schema, ACTIVE, GET, live(), Point, pub (+11 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.20
Nodes (15): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+7 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (9): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+1 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.21
Nodes (9): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, LocationSnapshot (+1 more)

### Community 47 - "package.json"
Cohesion: 0.10
Nodes (19): engines, node, name, private, type, version, @mapbox/vector-tile, prisma (+11 more)

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
Nodes (54): ApiError, CashoutView, fmtTime(), GpsView, LatLng, ShopDeal, World, WorldDelivery (+46 more)

### Community 52 - "HttpError"
Cohesion: 0.09
Nodes (58): POST, POST, POST, Schema, POST, POST, Schema, GET (+50 more)

### Community 53 - "Business.tsx"
Cohesion: 0.27
Nodes (14): BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm(), money(), Pitch() (+6 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (51): BOT_NAMES, Brain, SKILL, Sample, Sock, FireMsg, Space, weaponOf() (+43 more)

### Community 55 - "lib/city.ts"
Cohesion: 0.09
Nodes (45): Colour, GET, Points, POST, Upload, centroid(), CityTile, fromOverpass() (+37 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (45): Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud, nil(), useCombat(), WEAPON_ICON (+37 more)

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
Cohesion: 0.08
Nodes (11): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, World (+3 more)

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
Cohesion: 0.22
Nodes (7): StubVendor, vendors, Feed, Post, expectOk(), fund(), uploadPlaces()

### Community 66 - "randomSpot"
Cohesion: 0.21
Nodes (10): Loc, Near, World, WorldP, LatLng, randomSpot(), octet(), returningPlayer() (+2 more)

### Community 68 - "Game.tsx"
Cohesion: 0.08
Nodes (48): Art(), ArtAnim, Drive, Game(), GameMap, NAV, PHASE_ICON, PHASE_LABEL (+40 more)

### Community 70 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 71 - "app/page.tsx"
Cohesion: 0.20
Nodes (10): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+2 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (23): Action, Fields, GET, Meta, POST, BUDGET, glbProblem(), HULL_MAX_POINTS (+15 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.11
Nodes (31): camFwd, CombatHost, CombatInput, FeedLine, SENS_TOUCH, store, v3, v3b (+23 more)

### Community 74 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminRevenue, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lotteries/route.ts"
Cohesion: 0.14
Nodes (22): days(), dynamic, GET, POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED (+14 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.33
Nodes (4): dynamic, SW, TILE_HOSTS, tileHosts()

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.13
Nodes (29): tileOf(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place (+21 more)

### Community 83 - "Landmarks"
Cohesion: 0.23
Nodes (3): prepare(), Landmarks, Cut

### Community 84 - "i18n/index.ts"
Cohesion: 0.12
Nodes (25): POST, GET, POST, Schema, GET, catalogs, compiled, dateFmt (+17 more)

### Community 85 - "smoke.ts"
Cohesion: 0.11
Nodes (20): Identity, C, client(), count(), F, KEY, main(), ORIGIN (+12 more)

### Community 86 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 87 - "distanceM"
Cohesion: 0.20
Nodes (20): layDrops(), GET, bbox(), bearingTo(), dayPhase, distanceM(), LatLng, offset() (+12 more)

### Community 88 - "adminPlayer"
Cohesion: 0.25
Nodes (8): Dash, store(), World, Mission, setup(), World, adminPlayer(), TestPlace

### Community 89 - "t"
Cohesion: 0.09
Nodes (73): Button(), askConfirm(), AdminTools(), api(), ensureGuest(), HeroView, QuestsTab(), useHero() (+65 more)

### Community 91 - "Player"
Cohesion: 0.22
Nodes (3): META, World, Player

### Community 92 - "money.spec.ts"
Cohesion: 0.25
Nodes (6): gps(), Money, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 93 - "business/route.ts"
Cohesion: 0.12
Nodes (30): Details, GET, mine(), POST, Schema, activePlan(), BIZ_CHECKIN_M, BIZ_LIMITS (+22 more)

### Community 94 - "PlayerLayer.tsx"
Cohesion: 0.31
Nodes (6): Anim, Guide, guideKey(), PlayerLayer(), subscribeLocation, INTERACT_RADIUS_M

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "jobs.spec.ts"
Cohesion: 0.40
Nodes (3): Lottery, MyRides, Ride

### Community 97 - "call-lte.spec.ts"
Cohesion: 0.60
Nodes (3): octet(), phone(), phoneSetup()

### Community 98 - "call.spec.ts"
Cohesion: 0.83
Nodes (3): json(), octet(), open()

### Community 101 - "avatar.ts"
Cohesion: 0.07
Nodes (23): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+15 more)

### Community 103 - "drive/landmarks.ts"
Cohesion: 0.19
Nodes (15): gltfLoader(), isReference(), loadModel(), measure(), Entry, BUDGET_LABEL, convexHull(), LANDMARK_DROP_M (+7 more)

### Community 105 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 108 - "tracker.ts"
Cohesion: 0.23
Nodes (11): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+3 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 792 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `server/localData.ts`, `idle.ts`, `AdminLandmarks.tsx`, `music.ts`, `Rewards.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `db.ts`, `DriveGarage.tsx`, `react`, `server/money.ts`, `GameMap.tsx`, `Drive.tsx`, `Drive`, `http.ts`, `gpsgames.ts`, `fmtNum`, `lib/settings.ts`, `AdminPanel.tsx`, `loc/route.ts`, `social/route.ts`, `layout.tsx`, `goals.ts`, `I18nProvider.tsx`, `Combat`, `drive/traffic.ts`, `rides/route.ts`, `Panels.tsx`, `HttpError`, `Business.tsx`, `protocol.ts`, `lib/city.ts`, `match.ts`, `perf.ts`, `Game.tsx`, `app/page.tsx`, `server/landmarks.ts`, `arena/combat.ts`, `AdminSettings.tsx`, `lotteries/route.ts`, `server/places.ts`, `i18n/index.ts`, `distanceM`, `business/route.ts`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07540574282147317 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `arena/combat.ts`, `Drive`, `smoke.ts`, `protocol.ts`, `Drive.tsx`, `match.ts`, `Player`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `city-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14666666666666667 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `music.ts`, `world3d.ts`, `Rewards.tsx`, `tiles.ts`, `server/drive.ts`, `Play.tsx`, `vectorTile.ts`, `DriveGarage.tsx`, `GameMap.tsx`, `Drive.tsx`, `fmtNum`, `skyline.ts`, `Combat`, `drive/traffic.ts`, `CollisionWorld`, `Business.tsx`, `lib/city.ts`, `match.ts`, `perf.ts`, `Game.tsx`, `arena/combat.ts`, `server/places.ts`, `Landmarks`, `distanceM`, `t`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._