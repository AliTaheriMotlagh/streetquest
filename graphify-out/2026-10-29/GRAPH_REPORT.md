# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 337 files · ~363,929 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3243 nodes · 10862 edges · 115 communities (97 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 236 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `471c6d29`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- fmtNum
- lib/city.ts
- calls/route.ts
- server/localData.ts
- idle.ts
- StoreInfo.tsx
- Pwa.tsx
- world3d.ts
- goals.ts
- Call.tsx
- msg
- tiles.ts
- server/drive.ts
- ui.tsx
- Play.tsx
- AdminLandmarks.tsx
- S
- music.ts
- Rewards.tsx
- arena/combat.ts
- GameMap.tsx
- protocol.ts
- business/route.ts
- gunsound.ts
- gpsgames.ts
- t
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- Drive.tsx
- http.ts
- distanceM
- layout.tsx
- fa/index.ts
- local/route.ts
- I18nProvider.tsx
- Combat
- avatar.ts
- i18n/index.ts
- sfx.ts
- getT
- lotteries/route.ts
- geom.ts
- i18n-check.ts
- vfx.ts
- randomSpot
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Game.tsx
- requireUser
- i18n.ts
- RtClient
- server/city.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- expectOk
- drive.spec.ts
- perf.ts
- Local Postgres 16 Service (db)
- local.spec.ts
- server/money.ts
- locationTracker
- vectorTile.ts
- NearbyStore
- useLocation.ts
- me/route.ts
- three
- LocationReporter
- AdminPanel.tsx
- allowScripts
- AdminDropMap.tsx
- mapStyles.ts
- health/route.ts
- lib/money.ts
- Panels.tsx
- filter.ts
- vercel.json
- remotes.ts
- PlayerLayer.tsx
- server/places.ts
- HttpError
- LatLng
- Player
- Market.tsx
- render.mjs
- money.spec.ts
- DrivePad.tsx
- overrides
- seed.ts
- install.sh
- vendorMenu
- @playwright/test
- fa/arena.ts
- localData.test.ts
- call.ts
- common.ts
- StreetQuest — real-world GPS war game
- data.ts
- game.ts
- fa/lottery.ts
- helpers.ts
- market.ts
- Drive
- panels.ts
- fa/settings.ts
- fa/world.ts
- osm-pbf.ts
- jobs.spec.ts
- Player

## God Nodes (most connected - your core abstractions)
1. `t()` - 405 edges
2. `HttpError` - 157 edges
3. `Drive()` - 139 edges
4. `requireUser()` - 132 edges
5. `Button()` - 113 edges
6. `distanceM()` - 109 edges
7. `fmtNum()` - 94 edges
8. `body()` - 87 edges
9. `prisma` - 85 edges
10. `api()` - 84 edges

## Surprising Connections (you probably didn't know these)
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Where things are (read these instead of exploring)` --references--> `msg()`  [INFERRED]
  CLAUDE.md → src/lib/i18n/index.ts
- `Where things are (read these instead of exploring)` --references--> `t()`  [INFERRED]
  CLAUDE.md → src/lib/i18n/index.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts

## Import Cycles
- None detected.

## Communities (115 total, 18 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (78): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artFor(), artHtml(), artSvg() (+70 more)

### Community 1 - "fmtNum"
Cohesion: 0.17
Nodes (25): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), InfoView(), MenuPrice() (+17 more)

### Community 2 - "lib/city.ts"
Cohesion: 0.07
Nodes (48): Production checklist, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+40 more)

### Community 3 - "calls/route.ts"
Cohesion: 0.12
Nodes (29): GET, POST, Schema, GET, POST, Send, GET, POST (+21 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.08
Nodes (38): divarLink(), isFoodCat(), normName(), onHost(), sellsOnSnappfood(), snappfoodCode(), torobLink(), torobShopId() (+30 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (61): Commands, Done means, Fast, low-token tools (installed), graphify, StreetQuest — working notes for Claude, Where things are (read these instead of exploring), GET, ALL_AT (+53 more)

### Community 6 - "StoreInfo.tsx"
Cohesion: 0.09
Nodes (38): clock(), DivarList(), HoursTable(), InfoProps, LINK_ICON, Links, OpenBadge(), spanText() (+30 more)

### Community 7 - "Pwa.tsx"
Cohesion: 0.60
Nodes (4): installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate()

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (41): PropKind, nameLines(), oneLine(), makeCockpit(), artImages, at(), canvas(), curtain() (+33 more)

### Community 9 - "goals.ts"
Cohesion: 0.17
Nodes (23): GET, POST, Schema, Vars, GOAL_METRICS, GoalDef, GoalReward, MilestoneDef (+15 more)

### Community 10 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 11 - "msg"
Cohesion: 0.12
Nodes (16): BUILD_ID, config, next, GET(), ART, dynamic, FAQ, FEATURES (+8 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (26): Cut, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+18 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (52): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+44 more)

### Community 14 - "ui.tsx"
Cohesion: 0.11
Nodes (22): isThenable(), Props, HeroView, LatLng, Me, World, HELP, HelpCard() (+14 more)

### Community 15 - "Play.tsx"
Cohesion: 0.06
Nodes (54): react, Art(), ArtAnim, AutoVideo(), Props, Opts, queue, Req (+46 more)

### Community 16 - "AdminLandmarks.tsx"
Cohesion: 0.07
Nodes (56): Action, Fields, GET, Meta, POST, PUT, AdminLandmarks(), Biz (+48 more)

### Community 17 - "S"
Cohesion: 0.12
Nodes (21): Fields, POST, Schema, Details, GET, Schema, S, MAX_DISCOUNT (+13 more)

### Community 18 - "music.ts"
Cohesion: 0.18
Nodes (22): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+14 more)

### Community 19 - "Rewards.tsx"
Cohesion: 0.08
Nodes (34): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+26 more)

### Community 20 - "arena/combat.ts"
Cohesion: 0.06
Nodes (50): FireMsg, POST, Schema, camFwd, CombatHost, CombatInput, FeedLine, SENS_TOUCH (+42 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.14
Nodes (29): leaflet, Clicks(), FrameTarget(), GameItem, GameMap(), guidesFor(), Layers(), Poi (+21 more)

### Community 22 - "protocol.ts"
Cohesion: 0.07
Nodes (48): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+40 more)

### Community 23 - "business/route.ts"
Cohesion: 0.12
Nodes (30): Details, GET, mine(), POST, Schema, activePlan(), BIZ_CHECKIN_M, BIZ_LIMITS (+22 more)

### Community 24 - "gunsound.ts"
Cohesion: 0.26
Nodes (12): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+4 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "t"
Cohesion: 0.12
Nodes (64): Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm() (+56 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.06
Nodes (57): AREA_Y, Builder, buildingLook(), buildTileArrays(), color(), COOLER, cornerSigns(), cuboid() (+49 more)

### Community 28 - "skyline.ts"
Cohesion: 0.26
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (36): Action, GET, layDrops(), POST, ITEMS, applyConfig(), catalogOriginals(), CATALOGS (+28 more)

### Community 30 - "Drive.tsx"
Cohesion: 0.06
Nodes (44): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+36 more)

### Community 31 - "http.ts"
Cohesion: 0.08
Nodes (42): bcryptjs, jose, GET, POST, POST, Schema, POST, POST (+34 more)

### Community 32 - "distanceM"
Cohesion: 0.08
Nodes (55): GET, POST, Schema, GET, GET, num(), POST, Schema (+47 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.11
Nodes (13): admin, app, drive, empire, help, landing, landmarks, local (+5 more)

### Community 35 - "local/route.ts"
Cohesion: 0.18
Nodes (15): empty, GET, num, Query, DIVAR_CAT_KEYS, StoreData, findPlace(), divarAround() (+7 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.15
Nodes (21): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+13 more)

### Community 37 - "Combat"
Cohesion: 0.05
Nodes (8): Avatar, loadSoldier(), Combat, FootBody, Remotes, Vfx, aimDir(), eyeHeight()

### Community 38 - "avatar.ts"
Cohesion: 0.09
Nodes (15): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+7 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.07
Nodes (37): days(), dynamic, GET, GET, pub, Schema, Schema, ACTIVE (+29 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (27): audio(), audioOut(), awake, bell(), BRASS, build(), click(), duck() (+19 more)

### Community 41 - "getT"
Cohesion: 0.20
Nodes (15): EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata(), generateMetadata() (+7 more)

### Community 42 - "lotteries/route.ts"
Cohesion: 0.17
Nodes (18): POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS (+10 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 46 - "randomSpot"
Cohesion: 0.20
Nodes (7): META, Online, randomSpot(), octet(), returningPlayer(), test, withGps()

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
Nodes (56): ALL_LAYERS, Drive, Game(), GameMap, LAYERS_BEFORE_TOROB, MAP_LAYERS, MapLayer, NAV (+48 more)

### Community 52 - "requireUser"
Cohesion: 0.06
Nodes (82): How it works, zod, Colour, Info, Points, POST, Upload, POST (+74 more)

### Community 53 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 55 - "server/city.ts"
Cohesion: 0.19
Nodes (27): GET, overpassQuery(), parseTileKey(), tileKey, tileOf(), villageTile(), packPlaces(), cellKey() (+19 more)

### Community 56 - "match.ts"
Cohesion: 0.05
Nodes (59): BOT_NAMES, Brain, SKILL, Bomb, MatchResult, buildings, F, host (+51 more)

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, assets:arena, build, city:pack, city:pack:prod, db:push, db:seed, dev (+15 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "expectOk"
Cohesion: 0.18
Nodes (13): Dash, store(), World, Mission, setup(), World, Feed, Post (+5 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.27
Nodes (9): ArenaMe, befriend(), drive(), DriveRes, driveTo(), Other, Party, PartyState (+1 more)

### Community 63 - "perf.ts"
Cohesion: 0.24
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isTouch(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.12
Nodes (14): A, ads, D, districts, pairAt(), shops, SMALLTOWN, StubShop (+6 more)

### Community 66 - "server/money.ts"
Cohesion: 0.17
Nodes (19): GET, POST, Schema, POST, Schema, POST, isDropId(), tiersOwned() (+11 more)

### Community 68 - "vectorTile.ts"
Cohesion: 0.07
Nodes (32): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), Job, transferables() (+24 more)

### Community 70 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+4 more)

### Community 71 - "me/route.ts"
Cohesion: 0.07
Nodes (48): @prisma/client, POST, GET, POST, Schema, GET, POST, Schema (+40 more)

### Community 72 - "three"
Cohesion: 0.16
Nodes (9): three, Cloud, Pin, pinTexture(), StorePins, OTHER, Trade, tradeOf() (+1 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.08
Nodes (38): AdminPage(), generateMetadata(), keyMatches(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel(), Cashout (+30 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "AdminDropMap.tsx"
Cohesion: 0.47
Nodes (5): react-leaflet, AdminDropMap(), Clicks(), P, Recenter()

### Community 77 - "mapStyles.ts"
Cohesion: 0.07
Nodes (23): agents, allowed(), handle(), keyOk(), PORT, readBody(), send(), server (+15 more)

### Community 78 - "health/route.ts"
Cohesion: 0.29
Nodes (9): dynamic, GET(), short(), turnConfigured(), divarBase(), divarCities(), divarDistricts(), extHealth() (+1 more)

### Community 79 - "lib/money.ts"
Cohesion: 0.31
Nodes (9): CELL_DEG, cellOf(), DROP_PREFIX, MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell(), MoneyPickup (+1 more)

### Community 80 - "Panels.tsx"
Cohesion: 0.07
Nodes (50): ApiError, CashoutView, ensureGuest(), fmtTime(), GpsView, ShopDeal, WorldDelivery, WorldEvent (+42 more)

### Community 81 - "filter.ts"
Cohesion: 0.31
Nodes (8): Axis, dist(), Fix, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 83 - "remotes.ts"
Cohesion: 0.06
Nodes (29): HttpMe, Ent, HTTP_DELAY_MS, lerpAngle(), RT_DELAY_MS, Sign, Snap, Target (+21 more)

### Community 84 - "PlayerLayer.tsx"
Cohesion: 0.32
Nodes (6): meIcon, Anim, Guide, guideKey(), PlayerLayer(), subscribeLocation

### Community 85 - "server/places.ts"
Cohesion: 0.12
Nodes (27): CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), PLACE_BUCKET_MS, PLACE_CAT_KEYS (+19 more)

### Community 86 - "HttpError"
Cohesion: 0.10
Nodes (29): dynamic, GET(), POST, Schema, GET, GET, GET, POST (+21 more)

### Community 87 - "LatLng"
Cohesion: 0.08
Nodes (39): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficCars (+31 more)

### Community 88 - "Player"
Cohesion: 0.23
Nodes (5): crew(), homePlayer(), Player, openGame(), SfxHook

### Community 89 - "Market.tsx"
Cohesion: 0.11
Nodes (37): askConfirm(), Browse(), BuyerOrder(), DEAL_STEPS, endLabel(), ENDS, GoToShop(), img() (+29 more)

### Community 91 - "money.spec.ts"
Cohesion: 0.22
Nodes (7): gps(), Money, World, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 92 - "DrivePad.tsx"
Cohesion: 0.25
Nodes (16): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+8 more)

### Community 93 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 94 - "seed.ts"
Cohesion: 0.33
Nodes (4): lat, lng, prisma, start

### Community 96 - "vendorMenu"
Cohesion: 0.24
Nodes (14): rialToToman(), vendorKind, base(), cached(), cellOf(), matchScore(), matchVendor(), searchVendors() (+6 more)

### Community 97 - "@playwright/test"
Cohesion: 0.22
Nodes (6): Empire, Traffic, json(), octet(), open(), @playwright/test

### Community 99 - "localData.test.ts"
Cohesion: 0.24
Nodes (14): done(), emptyWeek(), latinDigits(), minutes(), nameScore(), sameLetters(), sameName(), sameStore() (+6 more)

### Community 102 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (10): octet(), phone(), phoneSetup(), Before going big, Deploy, Render, Run locally, Snappfood from abroad: the relay (ArvanCloud) (+2 more)

### Community 106 - "helpers.ts"
Cohesion: 0.22
Nodes (9): Loc, Near, World, WorldP, fakeIp(), LatLng, Me, octet() (+1 more)

### Community 108 - "Drive"
Cohesion: 0.10
Nodes (7): Drive(), Landmarks, Markers, DriveNet, CollisionWorld, Footprint, DetailSource

### Community 112 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 113 - "jobs.spec.ts"
Cohesion: 0.40
Nodes (3): Lottery, MyRides, Ride

### Community 115 - "Player"
Cohesion: 0.06
Nodes (13): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, Space (+5 more)

## Knowledge Gaps
- **13 isolated node(s):** `TEHRAN`, `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 867 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `fmtNum`, `calls/route.ts`, `server/localData.ts`, `idle.ts`, `StoreInfo.tsx`, `Pwa.tsx`, `goals.ts`, `Call.tsx`, `msg`, `server/drive.ts`, `ui.tsx`, `Play.tsx`, `AdminLandmarks.tsx`, `S`, `music.ts`, `Rewards.tsx`, `arena/combat.ts`, `GameMap.tsx`, `business/route.ts`, `gunsound.ts`, `gpsgames.ts`, `lib/settings.ts`, `Drive.tsx`, `http.ts`, `distanceM`, `layout.tsx`, `local/route.ts`, `I18nProvider.tsx`, `Combat`, `i18n/index.ts`, `lotteries/route.ts`, `Game.tsx`, `requireUser`, `server/city.ts`, `match.ts`, `perf.ts`, `server/money.ts`, `me/route.ts`, `AdminPanel.tsx`, `Panels.tsx`, `server/places.ts`, `HttpError`, `LatLng`, `Market.tsx`, `DrivePad.tsx`, `Drive`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TEHRAN`, `pgdata Volume`, `Render Web Service (streetquest)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07246376811594203 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `fmtNum`, `lib/city.ts`, `world3d.ts`, `tiles.ts`, `server/drive.ts`, `Play.tsx`, `music.ts`, `Rewards.tsx`, `arena/combat.ts`, `GameMap.tsx`, `t`, `skyline.ts`, `Drive.tsx`, `distanceM`, `Combat`, `avatar.ts`, `sfx.ts`, `server/city.ts`, `match.ts`, `perf.ts`, `vectorTile.ts`, `three`, `remotes.ts`, `LatLng`, `DrivePad.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `lib/city.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06868686868686869 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `@playwright/test` to `local.spec.ts`, `StreetQuest — real-world GPS war game`, `helpers.ts`, `randomSpot`, `package.json`, `jobs.spec.ts`, `Player`, `render.mjs`, `money.spec.ts`, `expectOk`, `drive.spec.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._