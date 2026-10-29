# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 326 files · ~345,099 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3100 nodes · 10438 edges · 112 communities (95 shown, 17 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 230 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `138fa040`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- fmtNum
- lib/city.ts
- server/hub.ts
- server/localData.ts
- idle.ts
- remotes.ts
- pwaClient.ts
- world3d.ts
- goals.ts
- Session
- app/page.tsx
- tiles.ts
- server/drive.ts
- t
- Play.tsx
- AdminLandmarks.tsx
- route
- DriveGarage.tsx
- Rewards.tsx
- server/money.ts
- GameMap.tsx
- arena/combat.ts
- store.ts
- EmojiArt.tsx
- gpsgames.ts
- react
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- i18n/index.ts
- http.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- realtime/server.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- db.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
- i18n-check.ts
- drive/landmarks.ts
- Frame
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- HttpError
- i18n.ts
- smoke.ts
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
- locationTracker
- vectorTile.ts
- NearbyStore
- OthersLayer.tsx
- rewards.ts
- server/landmarks.ts
- .onMsg
- AdminPanel.tsx
- allowScripts
- PlayerLayer.tsx
- mapStyles.ts
- ref_node_child_process
- render.mjs
- Panels.tsx
- vercel.json
- Drive.tsx
- distanceM
- server/places.ts
- ads.txt/route.ts
- server/traffic.ts
- Player
- Button
- CLAUDE.md
- money.spec.ts
- DriveNet
- business/route.ts
- play/page.tsx
- overrides
- footprint.ts
- @playwright/test
- randomSpot
- StreetQuest — real-world GPS war game
- Drive
- fa/arena.ts
- call.ts
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
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts
- `How it works` --references--> `grant`  [INFERRED]
  README.md → src/server/rewards.ts

## Import Cycles
- None detected.

## Communities (112 total, 17 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.09
Nodes (64): cells, keys, [out = "art-preview.html", only], sym, ArtAnim, ArtSprite(), combat, flag() (+56 more)

### Community 1 - "fmtNum"
Cohesion: 0.10
Nodes (35): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), Art(), paintGauge(), HeroView (+27 more)

### Community 2 - "lib/city.ts"
Cohesion: 0.06
Nodes (53): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+45 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.11
Nodes (32): GET, POST, Schema, GET, POST, Send, dynamic, GET() (+24 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.06
Nodes (76): DivarList(), LINK_ICON, Links, DIVAR_CAT_KEYS, DIVAR_CATS, DivarArea, DivarCat, divarLink() (+68 more)

### Community 5 - "idle.ts"
Cohesion: 0.05
Nodes (73): lat, lng, prisma, start, @prisma/client, GET, POST, GET (+65 more)

### Community 6 - "remotes.ts"
Cohesion: 0.09
Nodes (20): loadSoldier(), HttpMe, Ent, HTTP_DELAY_MS, lerpAngle(), Remotes, RT_DELAY_MS, Sign (+12 more)

### Community 7 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 8 - "world3d.ts"
Cohesion: 0.08
Nodes (41): artFor(), Cloud, pinTexture(), nameLines(), oneLine(), OTHER, Trade, tradeOf() (+33 more)

### Community 9 - "goals.ts"
Cohesion: 0.17
Nodes (22): GET, Schema, Vars, GOAL_METRICS, GoalDef, GoalReward, MilestoneDef, announce() (+14 more)

### Community 10 - "Session"
Cohesion: 0.22
Nodes (5): candProto(), candType(), forceRelay(), Session, statusOf()

### Community 11 - "app/page.tsx"
Cohesion: 0.20
Nodes (9): ART, dynamic, FAQ, FEATURES, Home(), metadata, PILLARS, STEPS (+1 more)

### Community 12 - "tiles.ts"
Cohesion: 0.06
Nodes (26): Production checklist, TileArrays, BuildPool, Cached, db(), DetailSource, idbGet(), idbPut() (+18 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (54): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+46 more)

### Community 14 - "t"
Cohesion: 0.13
Nodes (34): CallInvite, CallPeer, CallScreen(), CAMERA, classify(), END_TEXT, getMedia(), MediaProblem (+26 more)

### Community 15 - "Play.tsx"
Cohesion: 0.09
Nodes (30): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+22 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.14
Nodes (24): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+16 more)

### Community 17 - "route"
Cohesion: 0.09
Nodes (36): GET, GET, Schema, Fields, Schema, Details, Schema, discountLive() (+28 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.13
Nodes (27): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+19 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.07
Nodes (40): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+32 more)

### Community 20 - "server/money.ts"
Cohesion: 0.17
Nodes (20): GET, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell() (+12 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.18
Nodes (17): GpsView, WorldSpot, GameMap, GameItem, Layers(), Poi, Props, TIER_COLORS (+9 more)

### Community 22 - "arena/combat.ts"
Cohesion: 0.06
Nodes (64): Sample, Sock, FireMsg, DIFF, DIFF_LABEL, SIZE_LABEL, camFwd, CombatHost (+56 more)

### Community 23 - "store.ts"
Cohesion: 0.13
Nodes (23): POST, Schema, GET, POST, Schema, spendGems(), POST(), AdCreative (+15 more)

### Community 24 - "EmojiArt.tsx"
Cohesion: 0.23
Nodes (13): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+5 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "react"
Cohesion: 0.14
Nodes (18): react, isThenable(), Props, Opts, queue, Req, BusinessPanel(), CampaignForm() (+10 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (35): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+27 more)

### Community 28 - "skyline.ts"
Cohesion: 0.26
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.09
Nodes (39): Action, GET, POST, GET, POST, Schema, ITEMS, applyConfig() (+31 more)

### Community 30 - "i18n/index.ts"
Cohesion: 0.15
Nodes (13): GET, GET, tileUrl(), catalogs, compiled, dateFmt, numFmt, parse() (+5 more)

### Community 31 - "http.ts"
Cohesion: 0.07
Nodes (50): bcryptjs, jose, zod, POST, Schema, POST, POST, Schema (+42 more)

### Community 32 - "social/route.ts"
Cohesion: 0.10
Nodes (33): GET, pub, Schema, GET, GET, Point, Schema, GET (+25 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "realtime/server.ts"
Cohesion: 0.14
Nodes (12): Identity, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY, server (+4 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.16
Nodes (19): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+11 more)

### Community 37 - "Combat"
Cohesion: 0.05
Nodes (12): Avatar, loadWeapons(), Combat, Collide, FOOT_R, FootBody, FootInput, newFoot() (+4 more)

### Community 38 - "avatar.ts"
Cohesion: 0.07
Nodes (23): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+15 more)

### Community 39 - "db.ts"
Cohesion: 0.06
Nodes (34): GET, GET, days(), dynamic, GET, empty, num, Query (+26 more)

### Community 40 - "sfx.ts"
Cohesion: 0.07
Nodes (48): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+40 more)

### Community 41 - "getT"
Cohesion: 0.20
Nodes (15): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+7 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS (+10 more)

### Community 43 - "geom.ts"
Cohesion: 0.09
Nodes (20): Nav, Node, aimDir(), BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, eyeHeight() (+12 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "drive/landmarks.ts"
Cohesion: 0.15
Nodes (10): disposeModel(), prepare(), Entry, Landmarks, Cut, LANDMARK_DROP_M, LANDMARK_LIST_M, LANDMARK_LOAD_M (+2 more)

### Community 46 - "Frame"
Cohesion: 0.19
Nodes (5): cellOf(), CollisionWorld, Footprint, Style, Frame

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
Nodes (58): World, ALL_LAYERS, Game(), InfoCard(), MAP_LAYERS, MapLayer, NAV, offRouteM() (+50 more)

### Community 52 - "HttpError"
Cohesion: 0.09
Nodes (58): POST, POST, Schema, GET, Point, POST, pub, Schema (+50 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 54 - "smoke.ts"
Cohesion: 0.14
Nodes (15): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+7 more)

### Community 55 - "server/city.ts"
Cohesion: 0.14
Nodes (34): Colour, GET, Info, Points, POST, Upload, GET, overpassQuery() (+26 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (46): BOT_NAMES, Brain, objective(), pickGoal(), SKILL, tickBot(), Bomb, MatchResult (+38 more)

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

### Community 67 - "locationTracker"
Cohesion: 0.09
Nodes (15): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+7 more)

### Community 68 - "vectorTile.ts"
Cohesion: 0.06
Nodes (41): How it works, Job, transferables(), AREA, clipLine(), clipRing(), flatRoofRegion(), Geom (+33 more)

### Community 70 - "OthersLayer.tsx"
Cohesion: 0.23
Nodes (11): leaflet, react-leaflet, RouteLine(), NearPlayer, esc(), icon(), iconCache, meIcon (+3 more)

### Community 71 - "rewards.ts"
Cohesion: 0.14
Nodes (24): POST, GET, Schema, price(), Schema, GET, Schema, ITEM_BY_KEY (+16 more)

### Community 72 - "server/landmarks.ts"
Cohesion: 0.16
Nodes (21): Action, Fields, GET, Meta, POST, PUT, glbProblem(), HULL_MAX_POINTS (+13 more)

### Community 73 - ".onMsg"
Cohesion: 0.17
Nodes (14): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+6 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.07
Nodes (39): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+31 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "PlayerLayer.tsx"
Cohesion: 0.20
Nodes (12): Clicks(), FrameTarget(), GameMap(), guidesFor(), TrafficLayer(), Anim, Guide, guideKey() (+4 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.15
Nodes (9): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, mapStyle, tileHosts() (+1 more)

### Community 80 - "Panels.tsx"
Cohesion: 0.06
Nodes (53): ApiError, CashoutView, ensureGuest(), LatLng, ShopDeal, WorldDelivery, WorldEvent, WorldLottery (+45 more)

### Community 83 - "Drive.tsx"
Cohesion: 0.07
Nodes (37): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+29 more)

### Community 84 - "distanceM"
Cohesion: 0.14
Nodes (27): layDrops(), GET, Listener, nearby, NearReport, Sample, Sent, bbox() (+19 more)

### Community 85 - "server/places.ts"
Cohesion: 0.12
Nodes (31): msg(), tomanFor(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick() (+23 more)

### Community 86 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 87 - "server/traffic.ts"
Cohesion: 0.08
Nodes (38): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+30 more)

### Community 88 - "Player"
Cohesion: 0.18
Nodes (5): World, Traffic, Player, openGame(), SfxHook

### Community 89 - "Button"
Cohesion: 0.09
Nodes (66): Button(), askConfirm(), AdminTools(), Dashboard(), api(), fmtTime(), ReadyTray(), Browse() (+58 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.29
Nodes (5): Money, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 93 - "business/route.ts"
Cohesion: 0.12
Nodes (29): Details, GET, mine(), POST, Schema, activePlan(), BIZ_CHECKIN_M, BIZ_LIMITS (+21 more)

### Community 94 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "footprint.ts"
Cohesion: 0.25
Nodes (9): centre(), FootBuilding, Footprint, footprintAt(), footprintObj(), FootRoad, round(), insidePacked() (+1 more)

### Community 97 - "@playwright/test"
Cohesion: 0.22
Nodes (6): crew(), Empire, json(), octet(), open(), @playwright/test

### Community 98 - "randomSpot"
Cohesion: 0.24
Nodes (6): META, randomSpot(), octet(), returningPlayer(), test, withGps()

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.20
Nodes (9): octet(), phone(), phoneSetup(), Before going big, Deploy, Render, Run locally, StreetQuest — real-world GPS war game (+1 more)

### Community 108 - "Drive"
Cohesion: 0.11
Nodes (11): Drive(), Markers, angle(), Driver, Others, tagColor(), StorePins, paintSignals() (+3 more)

### Community 115 - "Player"
Cohesion: 0.06
Nodes (10): newBrain(), Hub, Match, Player, Space, weaponOf(), World, Team (+2 more)

### Community 119 - "next"
Cohesion: 0.22
Nodes (6): BUILD_ID, config, next, GET(), dynamic, SITE

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 815 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `fmtNum`, `server/hub.ts`, `server/localData.ts`, `idle.ts`, `pwaClient.ts`, `goals.ts`, `app/page.tsx`, `server/drive.ts`, `Play.tsx`, `AdminLandmarks.tsx`, `route`, `DriveGarage.tsx`, `Rewards.tsx`, `server/money.ts`, `GameMap.tsx`, `arena/combat.ts`, `store.ts`, `gpsgames.ts`, `react`, `lib/settings.ts`, `i18n/index.ts`, `http.ts`, `social/route.ts`, `layout.tsx`, `I18nProvider.tsx`, `Combat`, `db.ts`, `sfx.ts`, `lotteries/route.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `perf.ts`, `rewards.ts`, `server/landmarks.ts`, `.onMsg`, `AdminPanel.tsx`, `Panels.tsx`, `Drive.tsx`, `distanceM`, `server/places.ts`, `server/traffic.ts`, `Button`, `business/route.ts`, `Drive`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09357309357309357 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `distanceM` to `server/localData.ts`, `server/drive.ts`, `Play.tsx`, `route`, `server/money.ts`, `GameMap.tsx`, `arena/combat.ts`, `gpsgames.ts`, `lib/settings.ts`, `http.ts`, `social/route.ts`, `db.ts`, `lotteries/route.ts`, `Game.tsx`, `HttpError`, `server/city.ts`, `match.ts`, `locationTracker`, `rewards.ts`, `PlayerLayer.tsx`, `Panels.tsx`, `Drive.tsx`, `server/places.ts`, `server/traffic.ts`, `business/route.ts`, `Drive`, `Player`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `fmtNum` be split into smaller, more focused modules?**
  _Cohesion score 0.0953058321479374 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `fmtNum`, `remotes.ts`, `world3d.ts`, `tiles.ts`, `server/drive.ts`, `t`, `Play.tsx`, `DriveGarage.tsx`, `Rewards.tsx`, `arena/combat.ts`, `react`, `skyline.ts`, `Combat`, `sfx.ts`, `drive/landmarks.ts`, `Frame`, `Game.tsx`, `server/city.ts`, `perf.ts`, `vectorTile.ts`, `.onMsg`, `PlayerLayer.tsx`, `Drive.tsx`, `distanceM`, `server/traffic.ts`, `Button`, `DriveNet`, `footprint.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._