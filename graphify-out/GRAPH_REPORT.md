# Graph Report - gps-game  (2026-10-29)

## Corpus Check
- 318 files · ~326,709 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2943 nodes · 9905 edges · 115 communities (91 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 225 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c19ddf2e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- city-pack.ts
- server/hub.ts
- HttpError
- idle.ts
- drive/landmarks.ts
- http.ts
- world3d.ts
- msg
- fmtNum
- Game.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- Play.tsx
- vectorTile.ts
- db.ts
- Frame
- react
- AdminSettings.tsx
- GameMap.tsx
- vehicles3d.ts
- Drive
- t
- gpsgames.ts
- server/places.ts
- tileMesh.ts
- skyline.ts
- lib/settings.ts
- gunsound.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- I18nProvider.tsx
- Combat
- LatLng
- i18n/index.ts
- sfx.ts
- app/page.tsx
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
- lotteries/route.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- server/arena.ts
- LocationReporter
- BuildPool
- NearbyStore
- DriveNet
- course.ts
- server/landmarks.ts
- arena/combat.ts
- AdminPanel.tsx
- allowScripts
- pins.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- geo.ts
- vercel.json
- Pwa.tsx
- server/empire.ts
- health/route.ts
- i18n.ts
- LanguageSwitch.tsx
- .tick
- Button
- CLAUDE.md
- .shoot
- seed.ts
- play/page.tsx
- next.config.ts
- osm-pbf.ts
- .onMsg
- lib/city.ts
- Player
- fa/arena.ts
- locationTracker
- avatar.ts
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

## Communities (115 total, 24 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (78): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), artFor(), artHtml(), artSvg() (+70 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (61): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+53 more)

### Community 2 - "city-pack.ts"
Cohesion: 0.15
Nodes (21): args, build(), cityAt(), dry, extractFile(), hotspots(), main(), opt() (+13 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.09
Nodes (38): GET, POST, Schema, GET, POST, Send, GET, Point (+30 more)

### Community 4 - "HttpError"
Cohesion: 0.08
Nodes (73): Action, layDrops(), POST, POST, GET, POST, POST, Schema (+65 more)

### Community 5 - "idle.ts"
Cohesion: 0.07
Nodes (53): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+45 more)

### Community 6 - "drive/landmarks.ts"
Cohesion: 0.15
Nodes (19): loadWeapons(), gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET (+11 more)

### Community 7 - "http.ts"
Cohesion: 0.06
Nodes (59): next, zod, AdminPage(), keyMatches(), GET, POST, POST, Schema (+51 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (37): Label, nameLines(), artImages, at(), Board, canvas(), curtain(), DIM (+29 more)

### Community 9 - "msg"
Cohesion: 0.22
Nodes (7): manifest(), GET(), dynamic, dirOf(), msg(), UPGRADES, SITE

### Community 10 - "fmtNum"
Cohesion: 0.07
Nodes (43): clock(), CombatHud(), MatchBar(), Scoreboard(), paintGauge(), DriveParty(), Friend, GAMES (+35 more)

### Community 11 - "Game.tsx"
Cohesion: 0.10
Nodes (43): load(), Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL (+35 more)

### Community 12 - "tiles.ts"
Cohesion: 0.09
Nodes (21): Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory, remember() (+13 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.06
Nodes (73): POST, CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz() (+65 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (36): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+28 more)

### Community 15 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, Placement, requestRewarded(), RewardedAd, W (+21 more)

### Community 16 - "vectorTile.ts"
Cohesion: 0.09
Nodes (24): Job, transferables(), AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber (+16 more)

### Community 17 - "db.ts"
Cohesion: 0.07
Nodes (42): GET, GET, GET, POST, Schema, Fields, Schema, Details (+34 more)

### Community 18 - "Frame"
Cohesion: 0.19
Nodes (4): Style, TrafficCars, tileMeshes, Frame

### Community 19 - "react"
Cohesion: 0.08
Nodes (33): react, isThenable(), Props, Opts, queue, Req, HELP, HelpCard() (+25 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminConfig, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (35): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+27 more)

### Community 22 - "vehicles3d.ts"
Cohesion: 0.21
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 23 - "Drive"
Cohesion: 0.13
Nodes (9): Drive(), Markers, angle(), Driver, Others, tagColor(), DetailSource, makeGate() (+1 more)

### Community 24 - "t"
Cohesion: 0.13
Nodes (39): askConfirm(), fmtCountdown(), Browse(), BuyerOrder(), CoverButton(), DEAL_STEPS, endLabel(), ENDS (+31 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "server/places.ts"
Cohesion: 0.09
Nodes (47): GET, Schema, POST, Schema, POST, GET, Schema, GET (+39 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.11
Nodes (34): AREA_Y, Builder, buildTileArrays(), color(), cornerSigns(), cuboid(), dashes(), disc() (+26 more)

### Community 28 - "skyline.ts"
Cohesion: 0.26
Nodes (8): BROWN, Dem, heightAt(), loadTile(), ROCK, Skyline, SNOW, tileXY()

### Community 29 - "lib/settings.ts"
Cohesion: 0.07
Nodes (50): GET, GET, POST, Schema, ITEMS, applyConfig(), catalogOriginals(), CATALOGS (+42 more)

### Community 30 - "gunsound.ts"
Cohesion: 0.27
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 31 - "server/city.ts"
Cohesion: 0.20
Nodes (20): TILE_V, tileKey, villageTile(), backoffMs(), due(), endpoints(), fetchTile(), findPlace() (+12 more)

### Community 32 - "social/route.ts"
Cohesion: 0.15
Nodes (24): GET, num(), Schema, levelForXp(), authorSelect, AutoBody, BIO_MAX, COMMENT_MAX (+16 more)

### Community 33 - "layout.tsx"
Cohesion: 0.14
Nodes (11): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+3 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "server/business.ts"
Cohesion: 0.09
Nodes (41): POST, Schema, Details, GET, mine(), POST, Schema, GET (+33 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.18
Nodes (16): GlobalError(), I18nProvider(), LocaleCtx, DEFAULT_LOCALE, Locale, Messages, parse(), pluralOf() (+8 more)

### Community 38 - "LatLng"
Cohesion: 0.10
Nodes (34): GET, box(), Car, degOf(), lineColors(), PAINTS, Road, TrafficFeed (+26 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.09
Nodes (27): days(), dynamic, GET, ACTIVE, GET, live(), Point, pub (+19 more)

### Community 40 - "sfx.ts"
Cohesion: 0.07
Nodes (48): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+40 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.13
Nodes (22): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+14 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.18
Nodes (9): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+1 more)

### Community 43 - "geom.ts"
Cohesion: 0.11
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "Drive.tsx"
Cohesion: 0.09
Nodes (24): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+16 more)

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
Cohesion: 0.07
Nodes (38): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, World (+30 more)

### Community 52 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 53 - "AdminLandmarks.tsx"
Cohesion: 0.22
Nodes (14): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+6 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (46): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+38 more)

### Community 55 - "Landmarks"
Cohesion: 0.21
Nodes (3): Landmarks, CollisionWorld, Footprint

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (41): Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud, nil(), useCombat(), WEAPON_ICON (+33 more)

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

### Community 62 - "lotteries/route.ts"
Cohesion: 0.26
Nodes (11): GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS, LOTTERY_MIN_PRICE (+3 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), perfMode (+2 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "Remotes"
Cohesion: 0.23
Nodes (3): loadSoldier(), lerpAngle(), Remotes

### Community 66 - "server/arena.ts"
Cohesion: 0.15
Nodes (21): BOT_NAMES, Brain, SKILL, FireMsg, FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, F_CROUCH (+13 more)

### Community 68 - "BuildPool"
Cohesion: 0.22
Nodes (3): Cut, TileArrays, BuildPool

### Community 71 - "course.ts"
Cohesion: 0.29
Nodes (7): layCourse(), P, Roads, samples(), RoadKind, COIN_POINTS, RACE_POINTS

### Community 72 - "server/landmarks.ts"
Cohesion: 0.16
Nodes (22): Action, Fields, GET, Meta, POST, PUT, glbProblem(), HULL_MAX_POINTS (+14 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.09
Nodes (31): camFwd, CombatHost, CombatInput, FeedLine, HttpMe, SENS_TOUCH, store, v3 (+23 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "pins.ts"
Cohesion: 0.16
Nodes (9): Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade, tradeOf() (+1 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "geo.ts"
Cohesion: 0.06
Nodes (40): ItemDef, Rarity, RARITY_COLOR, RARITY_WEIGHT, bearingTo(), cellKey(), cellOf(), dayPhase (+32 more)

### Community 83 - "Pwa.tsx"
Cohesion: 0.60
Nodes (4): installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate()

### Community 84 - "server/empire.ts"
Cohesion: 0.07
Nodes (59): @prisma/client, POST, GET, POST, Schema, GET, POST, Schema (+51 more)

### Community 85 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 86 - "i18n.ts"
Cohesion: 0.20
Nodes (13): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), setLocaleResolver(), Vars, config (+5 more)

### Community 87 - "LanguageSwitch.tsx"
Cohesion: 0.42
Nodes (7): PlayError(), useLocale(), useT(), LanguagePicker(), LanguageToggle(), setLanguage(), LOCALE_META

### Community 88 - ".tick"
Cohesion: 0.17
Nodes (7): Avatar, tinted(), Collide, FOOT_R, FootInput, newFoot(), stepFoot()

### Community 89 - "Button"
Cohesion: 0.11
Nodes (64): ArenaMenu(), Button(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+56 more)

### Community 91 - ".shoot"
Cohesion: 0.24
Nodes (4): FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 92 - "seed.ts"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, bcryptjs

### Community 93 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 95 - "osm-pbf.ts"
Cohesion: 0.20
Nodes (10): pbf, Block, blocks(), Dense, OsmElement, Plain, readOsm(), walk() (+2 more)

### Community 97 - "lib/city.ts"
Cohesion: 0.11
Nodes (26): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), centroid(), fromOverpass() (+18 more)

### Community 98 - "Player"
Cohesion: 0.09
Nodes (7): Hub, Player, Space, weaponOf(), World, LL, WeaponKey

### Community 101 - "avatar.ts"
Cohesion: 0.08
Nodes (22): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+14 more)

### Community 105 - "sim.ts"
Cohesion: 0.15
Nodes (11): MatchResult, buildings, F, host, log, m, mode, now (+3 more)

### Community 108 - "filter.ts"
Cohesion: 0.33
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 767 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `HttpError`, `idle.ts`, `http.ts`, `msg`, `fmtNum`, `Game.tsx`, `server/drive.ts`, `Call.tsx`, `Play.tsx`, `db.ts`, `react`, `AdminSettings.tsx`, `GameMap.tsx`, `Drive`, `gpsgames.ts`, `server/places.ts`, `lib/settings.ts`, `gunsound.ts`, `social/route.ts`, `layout.tsx`, `server/business.ts`, `I18nProvider.tsx`, `Combat`, `LatLng`, `i18n/index.ts`, `sfx.ts`, `app/page.tsx`, `Drive.tsx`, `Panels.tsx`, `AdminLandmarks.tsx`, `match.ts`, `lotteries/route.ts`, `perf.ts`, `server/arena.ts`, `server/landmarks.ts`, `arena/combat.ts`, `AdminPanel.tsx`, `geo.ts`, `Pwa.tsx`, `server/empire.ts`, `LanguageSwitch.tsx`, `.tick`, `Button`, `.onMsg`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07246376811594203 - nodes in this community are weakly interconnected._
- **Why does `Combat` connect `Combat` to `.onMsg`, `Remotes`, `Player`, `Viewmodel`, `.tick`, `arena/combat.ts`, `RtClient`, `Drive.tsx`, `Drive`, `match.ts`, `.shoot`, `Match`, `gunsound.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050560512468542665 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `city-pack.ts`, `HttpError`, `world3d.ts`, `fmtNum`, `tiles.ts`, `server/drive.ts`, `Play.tsx`, `Frame`, `GameMap.tsx`, `vehicles3d.ts`, `t`, `skyline.ts`, `gunsound.ts`, `server/city.ts`, `Combat`, `LatLng`, `sfx.ts`, `Drive.tsx`, `Landmarks`, `match.ts`, `perf.ts`, `Remotes`, `BuildPool`, `DriveNet`, `course.ts`, `pins.ts`, `geo.ts`, `.tick`, `Button`, `lib/city.ts`, `Viewmodel`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._