# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 303 files · ~308,652 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2786 nodes · 9314 edges · 99 communities (80 shown, 19 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 194 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f1566426`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- api
- hub.ts
- HttpError
- idle.ts
- server/landmarks.ts
- http.ts
- world3d.ts
- server/money.ts
- Game.tsx
- fmtNum
- tiles.ts
- server/drive.ts
- sfx.ts
- requireUser
- lib/city.ts
- db.ts
- Player
- react
- AdminSettings.tsx
- GameMap.tsx
- others.ts
- Landmarks
- Market.tsx
- gpsgames.ts
- server/places.ts
- tileMesh.ts
- Play.tsx
- lib/settings.ts
- arena/combat.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- lib/business.ts
- I18nProvider.tsx
- Combat
- Drive.tsx
- i18n/index.ts
- t
- app/page.tsx
- StreetQuest — real-world GPS war game
- Drive
- i18n-check.ts
- DriveGarage.tsx
- LatLng
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- geo.ts
- locationTracker
- Panels.tsx
- realtime/server.ts
- i18n.ts
- match.ts
- Pedometer
- dependencies
- scripts
- devDependencies
- weapons.ts
- geom.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- AdminLandmarks.tsx
- LocationReporter
- lib/money.ts
- NearbyStore
- DriveNet
- EmojiArt.tsx
- goals.ts
- avatar.ts
- AdminPanel.tsx
- allowScripts
- msg
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- store/route.ts
- vercel.json
- vfx.ts
- health/route.ts
- play/page.tsx
- arena.ts
- footprint.ts
- call.ts
- Button
- CLAUDE.md
- data.ts
- fa/empire.ts
- game.ts
- help.ts
- fa/landmarks.ts
- market.ts
- pages.ts
- panels.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 362 edges
2. `HttpError` - 142 edges
3. `requireUser()` - 120 edges
4. `Drive()` - 119 edges
5. `Button()` - 105 edges
6. `distanceM()` - 87 edges
7. `body()` - 85 edges
8. `prisma` - 80 edges
9. `fmtNum()` - 78 edges
10. `api()` - 77 edges

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

## Communities (99 total, 19 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.10
Nodes (63): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), ArtUse(), combat, flag() (+55 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (59): Dash, store(), World, crew(), befriend(), drive(), DriveRes, driveTo() (+51 more)

### Community 2 - "api"
Cohesion: 0.15
Nodes (37): DriveParty(), api(), InfoCard(), CoverButton(), BagTab(), NearbyPanel(), NoteCard(), ProfilePanel() (+29 more)

### Community 3 - "hub.ts"
Cohesion: 0.10
Nodes (38): GET, POST, Schema, GET, POST, Send, GET, POST (+30 more)

### Community 4 - "HttpError"
Cohesion: 0.10
Nodes (48): Details, GET, mine(), POST, Schema, POST, Schema, POST (+40 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (66): lat, lng, prisma, start, @prisma/client, POST, GET, ALL_AT (+58 more)

### Community 6 - "server/landmarks.ts"
Cohesion: 0.11
Nodes (32): Action, Fields, GET, Meta, POST, PUT, Entry, BUDGET (+24 more)

### Community 7 - "http.ts"
Cohesion: 0.05
Nodes (75): bcryptjs, zod, GET, POST, POST, Schema, POST, POST (+67 more)

### Community 8 - "world3d.ts"
Cohesion: 0.07
Nodes (44): three, Cloud, Pin, pinTexture(), StorePins, Label, nameLines(), oneLine() (+36 more)

### Community 9 - "server/money.ts"
Cohesion: 0.19
Nodes (16): GET, POST, Schema, POST, Schema, isDropId(), tomanFor(), afterMoney() (+8 more)

### Community 10 - "Game.tsx"
Cohesion: 0.06
Nodes (63): Art(), ArtAnim, Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON (+55 more)

### Community 11 - "fmtNum"
Cohesion: 0.13
Nodes (30): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), fmtTime(), fmtCountdown(), LotteryCard() (+22 more)

### Community 12 - "tiles.ts"
Cohesion: 0.10
Nodes (21): Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory, remember() (+13 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.09
Nodes (47): POST, layCourse(), P, Roads, samples(), CHECKPOINT_M, checkPoints(), COIN_M (+39 more)

### Community 14 - "sfx.ts"
Cohesion: 0.06
Nodes (45): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+37 more)

### Community 15 - "requireUser"
Cohesion: 0.07
Nodes (50): POST, GET, POST, pub, Schema, GET, POST, Schema (+42 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.09
Nodes (31): AREA, Geom, HouseNumber, NAME_MODES, OPEN, P, ROAD, Storefront (+23 more)

### Community 17 - "db.ts"
Cohesion: 0.07
Nodes (47): Schema, GET, GET, GET, POST, Schema, Fields, POST (+39 more)

### Community 18 - "Player"
Cohesion: 0.07
Nodes (17): newBrain(), objective(), pickGoal(), tickBot(), Match, Player, backToWorld(), disband() (+9 more)

### Community 19 - "react"
Cohesion: 0.13
Nodes (25): react, HELP, HelpCard(), helpSeen(), markHelpSeen(), seenKey(), TOUR_KEY, TourStep (+17 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.13
Nodes (19): AdminConfig, CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL (+11 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.12
Nodes (32): leaflet, react-leaflet, Selected, WorldPlayer, Clicks(), FrameTarget(), GameMap(), guidesFor() (+24 more)

### Community 22 - "others.ts"
Cohesion: 0.12
Nodes (18): NetState, Payload, Driver, Snap, Walker, Style, Cockpit, makeCockpit() (+10 more)

### Community 23 - "Landmarks"
Cohesion: 0.14
Nodes (8): disposeModel(), Landmarks, cellOf(), CollisionWorld, Footprint, Ray, Frame, placeHull()

### Community 24 - "Market.tsx"
Cohesion: 0.12
Nodes (36): askConfirm(), Browse(), BuyerOrder(), DEAL_STEPS, endLabel(), ENDS, GoToShop(), img() (+28 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "server/places.ts"
Cohesion: 0.11
Nodes (34): tileOf(), cellKey(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick() (+26 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.09
Nodes (32): Job, AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), Cut (+24 more)

### Community 28 - "Play.tsx"
Cohesion: 0.06
Nodes (51): AutoVideo(), Props, Opts, queue, Req, AdBreak, AdNetwork, load() (+43 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.11
Nodes (34): Action, GET, layDrops(), POST, ITEMS, applyConfig(), catalogOriginals(), CATALOGS (+26 more)

### Community 30 - "arena/combat.ts"
Cohesion: 0.09
Nodes (32): camFwd, CombatHost, CombatInput, FeedLine, SENS_TOUCH, store, v3, v3b (+24 more)

### Community 31 - "server/city.ts"
Cohesion: 0.17
Nodes (24): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), tileKey (+16 more)

### Community 32 - "social/route.ts"
Cohesion: 0.15
Nodes (23): GET, num(), Schema, bbox(), authorSelect, AutoBody, BIO_MAX, COMMENT_MAX (+15 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "lib/business.ts"
Cohesion: 0.17
Nodes (11): BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, PLAN_KEYS (+3 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.12
Nodes (25): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+17 more)

### Community 37 - "Combat"
Cohesion: 0.06
Nodes (8): Avatar, Combat, FootBody, Viewmodel, aimDir(), eyeHeight(), spreadDir(), WeaponKey

### Community 38 - "Drive.tsx"
Cohesion: 0.08
Nodes (33): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+25 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.09
Nodes (27): days(), dynamic, GET, Schema, ACTIVE, GET, live(), Point (+19 more)

### Community 40 - "t"
Cohesion: 0.24
Nodes (20): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+12 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.12
Nodes (23): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+15 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.22
Nodes (8): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel

### Community 43 - "Drive"
Cohesion: 0.09
Nodes (13): Drive(), paintGauge(), Markers, angle(), Others, tagColor(), TileArrays, BuildPool (+5 more)

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "DriveGarage.tsx"
Cohesion: 0.13
Nodes (27): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+19 more)

### Community 46 - "LatLng"
Cohesion: 0.11
Nodes (22): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+14 more)

### Community 47 - "package.json"
Cohesion: 0.10
Nodes (19): engines, node, name, private, type, version, @mapbox/vector-tile, pbf (+11 more)

### Community 48 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "arena.py"
Cohesion: 0.08
Nodes (25): anim(), ball(), box(), clear_pose(), cyl(), death(), finish(), gait() (+17 more)

### Community 50 - "StreetQuest — how it makes money"
Cohesion: 0.22
Nodes (8): 1. What's already built and can charge today, 2. What to add next (in order of money per week of work), 3. Later: bigger, slower bets, 4. Getting the first 100 paying stores, 5. A rough model (illustrative only, not a forecast), 6. Costs and risks to plan for, Plan design (in `src/lib/business.ts`), StreetQuest — how it makes money

### Community 51 - "geo.ts"
Cohesion: 0.12
Nodes (27): POST, Schema, GET, Schema, GET, dayPhase, offset(), solarHour() (+19 more)

### Community 53 - "Panels.tsx"
Cohesion: 0.06
Nodes (51): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, WorldDelivery (+43 more)

### Community 54 - "realtime/server.ts"
Cohesion: 0.05
Nodes (60): Sample, APP_URL, hidden, last, lastCreate, matches, ORIGINS, players (+52 more)

### Community 55 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 56 - "match.ts"
Cohesion: 0.06
Nodes (58): BOT_NAMES, Brain, SKILL, Bomb, MatchResult, buildings, F, host (+50 more)

### Community 58 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+7 more)

### Community 59 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, assets:arena, build, db:push, db:seed, dev, i18n:check, postinstall (+11 more)

### Community 60 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+5 more)

### Community 61 - "weapons.ts"
Cohesion: 0.11
Nodes (14): FireMsg, Space, weaponOf(), FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, damageAt(), isWeapon() (+6 more)

### Community 62 - "geom.ts"
Cohesion: 0.11
Nodes (16): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+8 more)

### Community 63 - "perf.ts"
Cohesion: 0.27
Nodes (9): GraphicsSettings(), apply(), autoIsLite(), listeners, Nav, onPerfChange(), perfMode, probeFrameRate() (+1 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "Remotes"
Cohesion: 0.15
Nodes (3): loadSoldier(), Remotes, RtClient

### Community 66 - "AdminLandmarks.tsx"
Cohesion: 0.15
Nodes (21): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+13 more)

### Community 68 - "lib/money.ts"
Cohesion: 0.18
Nodes (18): clipLine(), clipRing(), flatRoofRegion(), sliceVectorTile(), fillFrontage(), pack(), villageTile(), cellOf() (+10 more)

### Community 71 - "EmojiArt.tsx"
Cohesion: 0.17
Nodes (18): artFor(), artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion (+10 more)

### Community 72 - "goals.ts"
Cohesion: 0.22
Nodes (19): GoalDef, GoalReward, MilestoneDef, announce(), bump(), claimGoal(), factionGoal(), fmtReward() (+11 more)

### Community 73 - "avatar.ts"
Cohesion: 0.12
Nodes (14): axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp, right (+6 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (20): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+12 more)

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "msg"
Cohesion: 0.22
Nodes (7): BUILD_ID, config, next, GET(), dynamic, msg(), SITE

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "store/route.ts"
Cohesion: 0.19
Nodes (16): POST, Schema, GET, POST, Schema, spendGems(), adStatus(), claimAd() (+8 more)

### Community 83 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 84 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 85 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 87 - "footprint.ts"
Cohesion: 0.23
Nodes (10): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), VT_ZOOM, insidePacked() (+2 more)

### Community 89 - "Button"
Cohesion: 0.12
Nodes (28): Button(), isThenable(), Props, AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data (+20 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 739 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `api`, `hub.ts`, `HttpError`, `idle.ts`, `server/landmarks.ts`, `http.ts`, `server/money.ts`, `Game.tsx`, `fmtNum`, `server/drive.ts`, `sfx.ts`, `requireUser`, `db.ts`, `react`, `AdminSettings.tsx`, `GameMap.tsx`, `Market.tsx`, `gpsgames.ts`, `server/places.ts`, `Play.tsx`, `lib/settings.ts`, `arena/combat.ts`, `server/city.ts`, `social/route.ts`, `layout.tsx`, `I18nProvider.tsx`, `Combat`, `Drive.tsx`, `i18n/index.ts`, `app/page.tsx`, `Drive`, `DriveGarage.tsx`, `geo.ts`, `Panels.tsx`, `match.ts`, `perf.ts`, `AdminLandmarks.tsx`, `goals.ts`, `AdminPanel.tsx`, `store/route.ts`, `Button`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Are the 51 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 51 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0968421052631579 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `api`, `HttpError`, `server/landmarks.ts`, `world3d.ts`, `fmtNum`, `tiles.ts`, `server/drive.ts`, `GameMap.tsx`, `others.ts`, `Landmarks`, `server/places.ts`, `tileMesh.ts`, `Play.tsx`, `arena/combat.ts`, `server/city.ts`, `Combat`, `Drive.tsx`, `t`, `DriveGarage.tsx`, `Panels.tsx`, `match.ts`, `Remotes`, `lib/money.ts`, `DriveNet`, `footprint.ts`, `Button`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051526251526251524 - nodes in this community are weakly interconnected._
- **Why does `distanceM()` connect `HttpError` to `api`, `http.ts`, `server/money.ts`, `Game.tsx`, `fmtNum`, `server/drive.ts`, `db.ts`, `Player`, `gpsgames.ts`, `server/places.ts`, `Play.tsx`, `lib/settings.ts`, `social/route.ts`, `Drive.tsx`, `i18n/index.ts`, `Drive`, `LatLng`, `geo.ts`, `Panels.tsx`, `match.ts`, `weapons.ts`, `LocationReporter`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._