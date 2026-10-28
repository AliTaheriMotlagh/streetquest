# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~328,057 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2947 nodes · 9915 edges · 113 communities (86 shown, 27 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bc925269`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- server/hub.ts
- requireUser
- idle.ts
- AdminLandmarks.tsx
- music.ts
- world3d.ts
- msg
- Game.tsx
- server/arena.ts
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- lib/city.ts
- prisma
- DriveGarage.tsx
- react
- geo.ts
- GameMap.tsx
- drive/traffic.ts
- Drive
- auth.ts
- gpsgames.ts
- Business.tsx
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- PlayerLayer.tsx
- Remotes
- world/route.ts
- layout.tsx
- fa/index.ts
- goals.ts
- I18nProvider.tsx
- Combat
- server/traffic.ts
- db.ts
- sfx.ts
- getT
- StreetQuest — real-world GPS war game
- geom.ts
- i18n-check.ts
- Drive.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- Panels.tsx
- HttpError
- .shoot
- protocol.ts
- CollisionWorld
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
- EmojiArt.tsx
- LocationReporter
- Empire.tsx
- NearbyStore
- sim.ts
- LanguageSwitch.tsx
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- pins.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- server/places.ts
- vercel.json
- .onMsg
- i18n/index.ts
- RtClient
- i18n.ts
- weapons.ts
- Avatar
- t
- CLAUDE.md
- pwaClient.ts
- @prisma/client
- BuildPool
- next.config.ts
- overrides
- health/route.ts
- render
- Player
- fa/arena.ts
- locationTracker
- vfx.ts
- call.ts
- data.ts
- fa/empire.ts
- game.ts
- filter.ts
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

## Communities (113 total, 27 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.08
Nodes (69): cells, keys, [out = "art-preview.html", only], sym, ART, dynamic, FAQ, FEATURES (+61 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.10
Nodes (29): pbf, args, build(), cityAt(), dry, extractFile(), hotspots(), main() (+21 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.14
Nodes (27): GET, POST, Schema, GET, POST, Send, GET, POST (+19 more)

### Community 4 - "requireUser"
Cohesion: 0.06
Nodes (47): zod, GET, Schema, POST, Schema, GET, Colour, GET (+39 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (65): POST, GET, ALL_AT, BASE_OFFLINE_H, BIZ_BY_KEY, BizDef, bizMult(), BizState (+57 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.09
Nodes (34): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+26 more)

### Community 7 - "music.ts"
Cohesion: 0.17
Nodes (23): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+15 more)

### Community 8 - "world3d.ts"
Cohesion: 0.08
Nodes (42): artFor(), Label, nameLines(), makeCockpit(), artImage(), artImages, at(), Board (+34 more)

### Community 9 - "msg"
Cohesion: 0.22
Nodes (7): manifest(), GET(), dynamic, dirOf(), msg(), UPGRADES, SITE

### Community 10 - "Game.tsx"
Cohesion: 0.10
Nodes (33): Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL, Tour (+25 more)

### Community 11 - "server/arena.ts"
Cohesion: 0.19
Nodes (15): POST, Schema, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_AIM, F_FIRE, F_SPRINT (+7 more)

### Community 12 - "tiles.ts"
Cohesion: 0.08
Nodes (21): Cut, Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory (+13 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.06
Nodes (63): DELETE, LatLng, POST, Schema, GET, Point, POST, Schema (+55 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (28): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+20 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.06
Nodes (48): centre(), FootBuilding, footprintAt(), FootRoad, round(), Job, AREA, clipLine() (+40 more)

### Community 17 - "prisma"
Cohesion: 0.10
Nodes (37): GET, GET, GET, POST, Schema, Fields, Schema, Details (+29 more)

### Community 18 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 19 - "react"
Cohesion: 0.10
Nodes (25): react, isThenable(), Props, Opts, queue, Req, HeroView, Me (+17 more)

### Community 20 - "geo.ts"
Cohesion: 0.09
Nodes (41): GET, fillFrontage(), villageTile(), CELL_DEG, cellOf(), hashStr(), LatLng, rng() (+33 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.17
Nodes (22): GpsView, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS (+14 more)

### Community 22 - "drive/traffic.ts"
Cohesion: 0.10
Nodes (22): three, Driver, Snap, Walker, Footprint, Style, Car, degOf() (+14 more)

### Community 23 - "Drive"
Cohesion: 0.10
Nodes (9): Drive(), Markers, DriveNet, angle(), Others, tagColor(), DetailSource, WorldPlayer (+1 more)

### Community 24 - "auth.ts"
Cohesion: 0.09
Nodes (36): jose, next, AdminPage(), keyMatches(), POST, POST, POST, Schema (+28 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.11
Nodes (35): GET, here(), POST, Schema, bearingTo(), offset(), toDeg(), toRad() (+27 more)

### Community 26 - "Business.tsx"
Cohesion: 0.18
Nodes (17): BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm(), money(), Pitch() (+9 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (37): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes() (+29 more)

### Community 28 - "skyline.ts"
Cohesion: 0.17
Nodes (9): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY() (+1 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.06
Nodes (55): Action, GET, layDrops(), POST, POST, Schema, GET, Schema (+47 more)

### Community 30 - "PlayerLayer.tsx"
Cohesion: 0.14
Nodes (15): leaflet, react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap, iconCache (+7 more)

### Community 31 - "Remotes"
Cohesion: 0.19
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 32 - "world/route.ts"
Cohesion: 0.11
Nodes (35): GET, GET, GET, num(), Schema, GET, bbox(), dayPhase (+27 more)

### Community 33 - "layout.tsx"
Cohesion: 0.14
Nodes (11): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+3 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "goals.ts"
Cohesion: 0.09
Nodes (41): POST, Schema, GET, POST, Schema, GET, POST, Schema (+33 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.16
Nodes (17): GlobalError(), I18nProvider(), LocaleCtx, DEFAULT_LOCALE, Locale, LOCALE_META, Messages, parse() (+9 more)

### Community 38 - "server/traffic.ts"
Cohesion: 0.14
Nodes (24): GET, along(), bearing(), CONGESTION_COLORS, decodePolyline(), dirOf(), FREE_KMH, TRAFFIC_DEG (+16 more)

### Community 39 - "db.ts"
Cohesion: 0.08
Nodes (27): days(), dynamic, GET, GET, pub, Schema, Schema, ACTIVE (+19 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "getT"
Cohesion: 0.18
Nodes (16): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+8 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (9): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+1 more)

### Community 43 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.10
Nodes (16): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+8 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.06
Nodes (44): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, paintGauge(), Picked (+36 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.16
Nodes (13): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+5 more)

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
Cohesion: 0.08
Nodes (43): ApiError, CashoutView, fmtTime(), LatLng, ShopDeal, WorldDelivery, WorldEvent, WorldLottery (+35 more)

### Community 52 - "HttpError"
Cohesion: 0.08
Nodes (62): POST, Details, GET, mine(), POST, Schema, POST, POST (+54 more)

### Community 53 - ".shoot"
Cohesion: 0.21
Nodes (4): FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 54 - "protocol.ts"
Cohesion: 0.08
Nodes (43): Identity, Sample, APP_URL, hub, ORIGINS, PORT, report(), RESULT_KEY (+35 more)

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (41): BOT_NAMES, Brain, SKILL, Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, BOMB_REACH_M (+33 more)

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
Cohesion: 0.15
Nodes (7): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "gunsound.ts"
Cohesion: 0.30
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 66 - "EmojiArt.tsx"
Cohesion: 0.23
Nodes (13): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+5 more)

### Community 68 - "Empire.tsx"
Cohesion: 0.07
Nodes (47): Art(), ArtAnim, added, ensureArt(), root(), BUY_STEPS, clock(), EmpireTab() (+39 more)

### Community 70 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 71 - "LanguageSwitch.tsx"
Cohesion: 0.50
Nodes (6): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage()

### Community 72 - "server/landmarks.ts"
Cohesion: 0.15
Nodes (25): Action, Fields, GET, Meta, POST, PUT, GET, activePlan() (+17 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.08
Nodes (30): camFwd, CombatHost, CombatHud, CombatInput, FeedLine, HttpMe, SENS_TOUCH, store (+22 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (34): ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data, Drop, fmt(), MiniBars() (+26 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "pins.ts"
Cohesion: 0.15
Nodes (11): Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade, tradeOf() (+3 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "server/places.ts"
Cohesion: 0.09
Nodes (49): TILE_V, tileOf(), cellKey(), tomanFor(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT (+41 more)

### Community 84 - "i18n/index.ts"
Cohesion: 0.09
Nodes (31): POST, GET, POST, Schema, POST, price(), Schema, GET (+23 more)

### Community 86 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 87 - "weapons.ts"
Cohesion: 0.11
Nodes (16): axisL, Clip, NATURAL, Pose, qa, qp, right, Template (+8 more)

### Community 89 - "t"
Cohesion: 0.09
Nodes (85): ArenaMenu(), Button(), askConfirm(), DriveParty(), AdminTools(), api(), ensureGuest(), InfoCard() (+77 more)

### Community 91 - "pwaClient.ts"
Cohesion: 0.17
Nodes (23): AppSettings(), installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), b64ToBytes(), canInstall(), currentPushSub() (+15 more)

### Community 92 - "@prisma/client"
Cohesion: 0.25
Nodes (6): lat, lng, prisma, start, bcryptjs, @prisma/client

### Community 95 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, deepmerge-ts, postcss

### Community 96 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 98 - "Player"
Cohesion: 0.08
Nodes (11): Hub, Player, Sock, Space, weaponOf(), World, Team, LocalFrame (+3 more)

### Community 101 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 108 - "filter.ts"
Cohesion: 0.29
Nodes (9): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+1 more)

### Community 109 - "smoke.ts"
Cohesion: 0.26
Nodes (12): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+4 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 770 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `server/hub.ts`, `requireUser`, `idle.ts`, `AdminLandmarks.tsx`, `music.ts`, `msg`, `Game.tsx`, `server/arena.ts`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `prisma`, `DriveGarage.tsx`, `react`, `geo.ts`, `GameMap.tsx`, `Drive`, `auth.ts`, `gpsgames.ts`, `Business.tsx`, `lib/settings.ts`, `world/route.ts`, `layout.tsx`, `goals.ts`, `I18nProvider.tsx`, `Combat`, `server/traffic.ts`, `db.ts`, `Drive.tsx`, `Panels.tsx`, `HttpError`, `match.ts`, `perf.ts`, `gunsound.ts`, `Empire.tsx`, `LanguageSwitch.tsx`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `server/places.ts`, `.onMsg`, `i18n/index.ts`, `Avatar`, `pwaClient.ts`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08461306835290575 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `AdminLandmarks.tsx`, `music.ts`, `world3d.ts`, `tiles.ts`, `server/drive.ts`, `Play.tsx`, `lib/city.ts`, `DriveGarage.tsx`, `geo.ts`, `drive/traffic.ts`, `gpsgames.ts`, `Business.tsx`, `skyline.ts`, `Remotes`, `Combat`, `server/traffic.ts`, `Drive.tsx`, `HttpError`, `.shoot`, `CollisionWorld`, `Viewmodel`, `gunsound.ts`, `Empire.tsx`, `arena/combat.ts`, `pins.ts`, `server/places.ts`, `Avatar`, `t`, `BuildPool`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `gunsound.ts`, `Player`, `arena/combat.ts`, `Drive.tsx`, `.onMsg`, `.shoot`, `RtClient`, `Drive`, `match.ts`, `Avatar`, `Match`, `Viewmodel`, `Remotes`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._