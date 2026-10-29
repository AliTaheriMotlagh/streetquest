# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 325 files · ~335,412 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 3029 nodes · 10163 edges · 127 communities (99 shown, 28 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 227 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ffe8c12b`
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
- t
- world3d.ts
- msg
- fmtNum
- realtime/server.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- lib/city.ts
- prisma
- DrivePad.tsx
- Game.tsx
- server/money.ts
- GameMap.tsx
- Drive.tsx
- Drive
- requireUser
- gpsgames.ts
- Button
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- AdminDropMap.tsx
- auth.ts
- geo.ts
- layout.tsx
- fa/index.ts
- goals.ts
- translate
- Combat
- server/traffic.ts
- rides/route.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- physics.ts
- reporter.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- HttpError
- VectorSource
- protocol.ts
- server/city.ts
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
- pwaClient.ts
- NearbyStore
- Remotes
- WeaponKey
- AdminLandmarks.tsx
- gunsound.ts
- AdminPanel.tsx
- allowScripts
- lotteries/route.ts
- mapStyles.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- EmojiArt.tsx
- me/route.ts
- smoke.ts
- i18n/index.ts
- LatLng
- adminPlayer
- Market.tsx
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
- arena/combat.ts
- call.ts
- Viewmodel
- data.ts
- play/page.tsx
- common.ts
- I18nProvider.tsx
- sim.ts
- fa/lottery.ts
- .onMsg
- fa/settings.ts
- market.ts
- vfx.ts
- panels.ts
- World
- RtClient
- @prisma/client
- health/route.ts
- next.config.ts
- admin.ts
- app.ts
- fa/empire.ts
- location.ts
- pages.ts
- play.ts
- fa/server.ts

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
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts
- `How it works` --references--> `grant`  [INFERRED]
  README.md → src/server/rewards.ts

## Import Cycles
- None detected.

## Communities (127 total, 28 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.08
Nodes (72): cells, keys, [out = "art-preview.html", only], sym, ART, dynamic, FAQ, FEATURES (+64 more)

### Community 1 - "helpers.ts"
Cohesion: 0.15
Nodes (10): crew(), Empire, Traffic, fakeIp(), Me, octet(), Res, openGame() (+2 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.09
Nodes (31): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+23 more)

### Community 3 - "db.ts"
Cohesion: 0.09
Nodes (38): GET, POST, Schema, GET, POST, Send, GET, POST (+30 more)

### Community 4 - "server/localData.ts"
Cohesion: 0.10
Nodes (40): divarLink(), FILLER, FOOD, isFoodCat(), LINK_CHECKS, Menu, MenuItem, MenuSection (+32 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (63): GET, POST, Schema, GET, ALL_AT, BASE_OFFLINE_H, BIZ_BY_KEY, BizDef (+55 more)

### Community 6 - ".shoot"
Cohesion: 0.12
Nodes (10): Avatar, Collide, FOOT_R, FootBody, FootInput, newFoot(), stepFoot(), aimDir() (+2 more)

### Community 7 - "t"
Cohesion: 0.21
Nodes (21): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+13 more)

### Community 8 - "world3d.ts"
Cohesion: 0.07
Nodes (46): artFor(), Cloud, Pin, pinTexture(), nameLines(), oneLine(), OTHER, Trade (+38 more)

### Community 9 - "msg"
Cohesion: 0.24
Nodes (6): manifest(), GET(), dynamic, dirOf(), msg(), SITE

### Community 10 - "fmtNum"
Cohesion: 0.09
Nodes (35): clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), DriveParty(), Friend, GAMES (+27 more)

### Community 11 - "realtime/server.ts"
Cohesion: 0.12
Nodes (13): Identity, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY, server (+5 more)

### Community 12 - "tiles.ts"
Cohesion: 0.08
Nodes (23): How it works, Job, Cut, TileArrays, transferables(), BuildPool, Cached, db() (+15 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (62): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+54 more)

### Community 14 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 15 - "Play.tsx"
Cohesion: 0.06
Nodes (57): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+49 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.07
Nodes (46): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+38 more)

### Community 17 - "prisma"
Cohesion: 0.08
Nodes (38): GET, GET, GET, POST, Schema, Fields, Schema, Details (+30 more)

### Community 18 - "DrivePad.tsx"
Cohesion: 0.25
Nodes (16): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+8 more)

### Community 19 - "Game.tsx"
Cohesion: 0.06
Nodes (59): react, Art(), ArtAnim, isThenable(), Props, LatLng, Me, Drive (+51 more)

### Community 20 - "server/money.ts"
Cohesion: 0.17
Nodes (24): GET, POST, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket() (+16 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.16
Nodes (25): react-leaflet, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS (+17 more)

### Community 22 - "Drive.tsx"
Cohesion: 0.08
Nodes (31): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+23 more)

### Community 23 - "Drive"
Cohesion: 0.08
Nodes (12): Drive(), Markers, DriveNet, angle(), Driver, Others, tagColor(), StorePins (+4 more)

### Community 24 - "requireUser"
Cohesion: 0.06
Nodes (49): zod, GET, Schema, POST, Schema, GET, GET, Point (+41 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "Button"
Cohesion: 0.09
Nodes (65): ArenaMenu(), Button(), Opts, queue, Req, AdminTools(), BusinessPanel(), CampaignForm() (+57 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (36): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes() (+28 more)

### Community 28 - "skyline.ts"
Cohesion: 0.15
Nodes (10): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+2 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (38): Action, GET, layDrops(), POST, ITEMS, applyConfig(), catalogOriginals(), CATALOGS (+30 more)

### Community 30 - "AdminDropMap.tsx"
Cohesion: 0.47
Nodes (5): AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 31 - "auth.ts"
Cohesion: 0.11
Nodes (32): jose, next, AdminPage(), keyMatches(), POST, POST, POST, Schema (+24 more)

### Community 32 - "geo.ts"
Cohesion: 0.09
Nodes (41): GET, POST, Schema, GET, num(), Schema, GET, bbox() (+33 more)

### Community 33 - "layout.tsx"
Cohesion: 0.15
Nodes (10): cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport, Analytics() (+2 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (10): drive, game, help, fa, landing, landmarks, local, money (+2 more)

### Community 35 - "goals.ts"
Cohesion: 0.13
Nodes (29): POST, Schema, GET, POST, Schema, adStatus(), claimAd(), clickAd() (+21 more)

### Community 36 - "translate"
Cohesion: 0.17
Nodes (14): GlobalError(), I18nProvider(), DEFAULT_LOCALE, Locale, parse(), pluralOf(), registerMessages(), render() (+6 more)

### Community 38 - "server/traffic.ts"
Cohesion: 0.15
Nodes (23): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+15 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.12
Nodes (20): GET, pub, Schema, Schema, ACTIVE, GET, live(), Point (+12 more)

### Community 40 - "sfx.ts"
Cohesion: 0.08
Nodes (44): graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange(), pluck() (+36 more)

### Community 41 - "getT"
Cohesion: 0.24
Nodes (13): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+5 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.20
Nodes (8): Before going big, Deploy, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel, CityDetail

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "physics.ts"
Cohesion: 0.22
Nodes (9): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+1 more)

### Community 46 - "reporter.ts"
Cohesion: 0.22
Nodes (8): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, LocationSnapshot

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
Nodes (51): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, ShopDeal, World, WorldDelivery (+43 more)

### Community 52 - "HttpError"
Cohesion: 0.14
Nodes (40): POST, POST, Schema, POST, POST, Schema, POST, POST (+32 more)

### Community 53 - "VectorSource"
Cohesion: 0.15
Nodes (5): idbGet(), idbRead(), remember(), TileSource, VectorSource

### Community 54 - "protocol.ts"
Cohesion: 0.09
Nodes (40): BOT_NAMES, Brain, SKILL, Sample, Sock, FireMsg, RtHandlers, FREE_RESPAWN_S (+32 more)

### Community 55 - "server/city.ts"
Cohesion: 0.14
Nodes (31): Colour, GET, Points, POST, Upload, parseTileKey(), TILE_V, tileKey (+23 more)

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
Cohesion: 0.08
Nodes (12): newBrain(), objective(), pickGoal(), tickBot(), Hub, Match, Player, bombSide() (+4 more)

### Community 62 - "drive.spec.ts"
Cohesion: 0.23
Nodes (11): ArenaMe, befriend(), drive(), DriveRes, driveTo(), homePlayer(), Other, Party (+3 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "local.spec.ts"
Cohesion: 0.22
Nodes (7): StubVendor, vendors, Feed, Post, expectOk(), fund(), uploadPlaces()

### Community 66 - "randomSpot"
Cohesion: 0.21
Nodes (10): Loc, Near, World, WorldP, LatLng, randomSpot(), octet(), returningPlayer() (+2 more)

### Community 68 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 70 - "Remotes"
Cohesion: 0.23
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 71 - "WeaponKey"
Cohesion: 0.20
Nodes (4): Space, weaponOf(), WeaponKey, Zone

### Community 72 - "AdminLandmarks.tsx"
Cohesion: 0.06
Nodes (56): Action, Fields, GET, Meta, POST, PUT, AdminLandmarks(), Biz (+48 more)

### Community 73 - "gunsound.ts"
Cohesion: 0.27
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lotteries/route.ts"
Cohesion: 0.13
Nodes (23): days(), dynamic, GET, POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED (+15 more)

### Community 77 - "mapStyles.ts"
Cohesion: 0.17
Nodes (8): dynamic, SW, TILE_HOSTS, DEFAULT_STYLE, DEFAULT_TILES, MAP_STYLES, tileHosts(), Tiles

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.12
Nodes (29): hashStr(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), PLACE_BUCKET_MS (+21 more)

### Community 83 - "EmojiArt.tsx"
Cohesion: 0.23
Nodes (13): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+5 more)

### Community 84 - "me/route.ts"
Cohesion: 0.11
Nodes (28): POST, GET, POST, Schema, GET, ItemDef, Rarity, RARITY_COLOR (+20 more)

### Community 85 - "smoke.ts"
Cohesion: 0.26
Nodes (12): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+4 more)

### Community 86 - "i18n/index.ts"
Cohesion: 0.15
Nodes (18): catalogs, compiled, dateFmt, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, LOCALES, numFmt (+10 more)

### Community 87 - "LatLng"
Cohesion: 0.10
Nodes (22): Car, degOf(), lineColors(), PAINTS, Road, TrafficCars, TrafficFeed, Cockpit (+14 more)

### Community 88 - "adminPlayer"
Cohesion: 0.25
Nodes (8): Dash, store(), World, Mission, setup(), World, adminPlayer(), TestPlace

### Community 89 - "Market.tsx"
Cohesion: 0.11
Nodes (41): askConfirm(), Dashboard(), fmtTime(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel() (+33 more)

### Community 91 - "Player"
Cohesion: 0.22
Nodes (3): META, World, Player

### Community 92 - "money.spec.ts"
Cohesion: 0.25
Nodes (6): gps(), Money, ADMIN_KEY, E2E_DB, PORT, STUB_PORT

### Community 93 - "business/route.ts"
Cohesion: 0.10
Nodes (37): Details, GET, mine(), POST, Schema, GET, POST, Schema (+29 more)

### Community 94 - "PlayerLayer.tsx"
Cohesion: 0.20
Nodes (10): leaflet, iconCache, meIcon, Anim, Guide, guideKey(), PlayerLayer(), subscribeLocation (+2 more)

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

### Community 100 - "locationTracker"
Cohesion: 0.14
Nodes (11): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+3 more)

### Community 101 - "arena/combat.ts"
Cohesion: 0.06
Nodes (45): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+37 more)

### Community 105 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 107 - "I18nProvider.tsx"
Cohesion: 0.28
Nodes (10): PlayError(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALE_META (+2 more)

### Community 108 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 113 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 117 - "@prisma/client"
Cohesion: 0.25
Nodes (6): lat, lng, prisma, start, bcryptjs, @prisma/client

### Community 118 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

## Knowledge Gaps
- **12 isolated node(s):** `pgdata Volume`, `Render Web Service (streetquest)`, `prisma`, `tsx`, `@types/bcryptjs` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 814 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `db.ts`, `server/localData.ts`, `idle.ts`, `.shoot`, `msg`, `fmtNum`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `prisma`, `DrivePad.tsx`, `Game.tsx`, `server/money.ts`, `GameMap.tsx`, `Drive.tsx`, `Drive`, `requireUser`, `gpsgames.ts`, `Button`, `lib/settings.ts`, `auth.ts`, `geo.ts`, `layout.tsx`, `goals.ts`, `translate`, `Combat`, `server/traffic.ts`, `rides/route.ts`, `sfx.ts`, `Panels.tsx`, `HttpError`, `protocol.ts`, `server/city.ts`, `match.ts`, `perf.ts`, `pwaClient.ts`, `AdminLandmarks.tsx`, `gunsound.ts`, `AdminPanel.tsx`, `lotteries/route.ts`, `server/places.ts`, `me/route.ts`, `i18n/index.ts`, `Market.tsx`, `business/route.ts`, `arena/combat.ts`, `I18nProvider.tsx`, `.onMsg`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `Render Web Service (streetquest)`, `prisma` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07832130446404705 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Game.tsx` to `t`, `fmtNum`, `Call.tsx`, `Play.tsx`, `DrivePad.tsx`, `GameMap.tsx`, `Drive.tsx`, `Button`, `AdminDropMap.tsx`, `layout.tsx`, `translate`, `getT`, `package.json`, `Panels.tsx`, `match.ts`, `pwaClient.ts`, `AdminLandmarks.tsx`, `AdminPanel.tsx`, `EmojiArt.tsx`, `Market.tsx`, `PlayerLayer.tsx`, `arena/combat.ts`, `I18nProvider.tsx`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `city-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0915915915915916 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `@prisma/client` to `city-pack.ts`, `db.ts`, `goals.ts`, `idle.ts`, `server/localData.ts`, `server/traffic.ts`, `AdminLandmarks.tsx`, `server/drive.ts`, `package.json`, `prisma`, `server/money.ts`, `protocol.ts`, `server/city.ts`, `gpsgames.ts`, `money.spec.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._