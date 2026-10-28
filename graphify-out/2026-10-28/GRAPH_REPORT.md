# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 303 files · ~308,651 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2787 nodes · 9286 edges · 111 communities (89 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 195 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `468bec7d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- t
- db.ts
- HttpError
- idle.ts
- server/landmarks.ts
- http.ts
- world3d.ts
- server/places.ts
- Rewards.tsx
- Panels.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- me/route.ts
- lib/city.ts
- prisma
- Player
- Game.tsx
- AdminSettings.tsx
- GameMap.tsx
- others.ts
- physics.ts
- Market.tsx
- gpsgames.ts
- geo.ts
- tileMesh.ts
- Play.tsx
- lib/settings.ts
- arena/combat.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- I18nProvider.tsx
- Combat
- Drive.tsx
- i18n/index.ts
- sfx.ts
- app/page.tsx
- StreetQuest — real-world GPS war game
- Drive
- i18n-check.ts
- DriveGarage.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- world/route.ts
- server/empire.ts
- client.ts
- realtime/server.ts
- i18n.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- weapons.ts
- FootprintIndex
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- AdminLandmarks.tsx
- LocationReporter
- drive/landmarks.ts
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
- ads.ts
- vercel.json
- vfx.ts
- three
- play/page.tsx
- server/steps.ts
- alerts.ts
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
- PlayerLayer.tsx
- smoke.ts
- Landmarks
- Button.tsx
- BuildPool
- tile.worker.ts
- admin.ts
- app.ts
- fa/lottery.ts
- play.ts
- fa/settings.ts
- fa/world.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 362 edges
2. `HttpError` - 142 edges
3. `requireUser()` - 120 edges
4. `Drive()` - 117 edges
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

## Communities (111 total, 22 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.10
Nodes (63): cells, keys, [out = "art-preview.html", only], sym, ArtSprite(), ArtUse(), combat, flag() (+55 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (59): Dash, store(), World, crew(), befriend(), drive(), DriveRes, driveTo() (+51 more)

### Community 2 - "t"
Cohesion: 0.17
Nodes (29): Scoreboard(), InfoCard(), GoToShop(), resizePhoto(), BizCard(), catOf(), GoThere(), PlaceCard() (+21 more)

### Community 3 - "db.ts"
Cohesion: 0.08
Nodes (41): GET, POST, Schema, POST, Send, dynamic, GET(), short() (+33 more)

### Community 4 - "HttpError"
Cohesion: 0.10
Nodes (60): layDrops(), POST, POST, GET, POST, Schema, GET, Point (+52 more)

### Community 5 - "idle.ts"
Cohesion: 0.09
Nodes (42): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+34 more)

### Community 6 - "server/landmarks.ts"
Cohesion: 0.14
Nodes (25): Action, Fields, GET, Meta, POST, PUT, BUDGET, glbProblem() (+17 more)

### Community 7 - "http.ts"
Cohesion: 0.06
Nodes (57): bcryptjs, zod, GET, POST, POST, Schema, POST, POST (+49 more)

### Community 8 - "world3d.ts"
Cohesion: 0.11
Nodes (34): Label, nameLines(), artImage(), artImages, at(), Board, canvas(), curtain() (+26 more)

### Community 9 - "server/places.ts"
Cohesion: 0.13
Nodes (31): GET, POST, Schema, GET, Schema, isDropId(), tomanFor(), parsePlaceMissionId() (+23 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.08
Nodes (38): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+30 more)

### Community 11 - "Panels.tsx"
Cohesion: 0.09
Nodes (47): ModeCards(), musicOn(), musicVolume(), onMusicChange(), AppSettings(), AVATARS, DeliveriesTab(), DeliveryRoute() (+39 more)

### Community 12 - "tiles.ts"
Cohesion: 0.09
Nodes (20): Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory, remember() (+12 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.09
Nodes (48): POST, layCourse(), P, Roads, samples(), CHECKPOINT_M, checkPoints(), COIN_M (+40 more)

### Community 14 - "Call.tsx"
Cohesion: 0.05
Nodes (48): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+40 more)

### Community 15 - "me/route.ts"
Cohesion: 0.18
Nodes (19): POST, GET, POST, Schema, GET, LOCALES, ACHIEVEMENT_BY_KEY, AchievementDef (+11 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.07
Nodes (45): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+37 more)

### Community 17 - "prisma"
Cohesion: 0.08
Nodes (38): GET, GET, GET, POST, Schema, Fields, Schema, Details (+30 more)

### Community 18 - "Player"
Cohesion: 0.08
Nodes (15): newBrain(), objective(), pickGoal(), tickBot(), Match, Player, backToWorld(), disband() (+7 more)

### Community 19 - "Game.tsx"
Cohesion: 0.08
Nodes (50): react, Me, Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON (+42 more)

### Community 20 - "AdminSettings.tsx"
Cohesion: 0.14
Nodes (18): CAT_LABEL, CatalogEntry, clone(), Col, COLUMNS, Def, FIELD_LABEL, GameDataTab() (+10 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.19
Nodes (20): Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, useMapView(), esc() (+12 more)

### Community 22 - "others.ts"
Cohesion: 0.10
Nodes (24): NetState, Payload, Driver, Snap, Walker, Cockpit, makeCockpit(), makeVehicle() (+16 more)

### Community 23 - "physics.ts"
Cohesion: 0.18
Nodes (11): Body, cellOf(), CollisionWorld, Controls, forward(), stepAir(), stepGround(), Footprint (+3 more)

### Community 24 - "Market.tsx"
Cohesion: 0.12
Nodes (34): clock(), MatchBar(), fmtCountdown(), Browse(), DEAL_STEPS, endLabel(), ENDS, img() (+26 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (32): GET, here(), POST, Schema, offset(), FIND_RADIUS_M, GPS_GAMES, GpsGameKind (+24 more)

### Community 26 - "geo.ts"
Cohesion: 0.07
Nodes (36): Rarity, villageTile(), bearingTo(), CELL_DEG, cellOf(), hashStr(), LatLng, rng() (+28 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.11
Nodes (29): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), dashes(), disc() (+21 more)

### Community 28 - "Play.tsx"
Cohesion: 0.08
Nodes (29): AutoVideo(), Props, Opts, queue, Req, AdBreak, AdNetwork, load() (+21 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.11
Nodes (32): Action, GET, ItemDef, ITEMS, RARITY_COLOR, RARITY_WEIGHT, applyConfig(), catalogOriginals() (+24 more)

### Community 30 - "arena/combat.ts"
Cohesion: 0.06
Nodes (46): camFwd, CombatHost, CombatInput, FeedLine, SENS_TOUCH, store, v3, v3b (+38 more)

### Community 31 - "server/city.ts"
Cohesion: 0.15
Nodes (29): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), TILE_V (+21 more)

### Community 32 - "social/route.ts"
Cohesion: 0.11
Nodes (32): GET, GET, Point, Schema, GET, num(), Schema, bbox() (+24 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.13
Nodes (8): arena, common, drive, fa, landing, location, money, server

### Community 35 - "server/business.ts"
Cohesion: 0.09
Nodes (43): Details, GET, mine(), POST, Schema, GET, POST, Schema (+35 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.12
Nodes (25): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+17 more)

### Community 37 - "Combat"
Cohesion: 0.07
Nodes (3): Combat, RtClient, Vfx

### Community 38 - "Drive.tsx"
Cohesion: 0.11
Nodes (18): ArenaMenu(), CombatHud(), useCombat(), CAM_LABEL, CamMode, CAMS, Hud, Job (+10 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.08
Nodes (31): days(), dynamic, GET, GET, pub, Schema, Schema, ACTIVE (+23 more)

### Community 40 - "sfx.ts"
Cohesion: 0.08
Nodes (42): duckMusic(), graph(), listeners, midi(), Mood, pluck(), PROGS, refresh() (+34 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.12
Nodes (23): AdminPage(), generateMetadata(), keyMatches(), EventPage(), generateMetadata(), load(), Props, dynamic (+15 more)

### Community 42 - "StreetQuest — real-world GPS war game"
Cohesion: 0.22
Nodes (8): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel

### Community 43 - "Drive"
Cohesion: 0.18
Nodes (7): Drive(), Markers, angle(), Others, tagColor(), makeGate(), makeSign()

### Community 44 - "i18n-check.ts"
Cohesion: 0.12
Nodes (14): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+6 more)

### Community 45 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (25): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+17 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): Selected, WorldPlayer, Listener, nearby, NearPlayer, NearReport, Sample, FireReport (+4 more)

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

### Community 51 - "world/route.ts"
Cohesion: 0.16
Nodes (22): GET, Schema, GET, dayPhase, solarHour(), LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE (+14 more)

### Community 52 - "server/empire.ts"
Cohesion: 0.15
Nodes (23): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, buyCost(), emptyEmpire() (+15 more)

### Community 53 - "client.ts"
Cohesion: 0.09
Nodes (22): ApiError, CashoutView, ensureGuest(), GpsView, HeroView, LatLng, ShopDeal, WorldDelivery (+14 more)

### Community 54 - "realtime/server.ts"
Cohesion: 0.05
Nodes (57): MatchResult, Sample, APP_URL, hidden, last, lastCreate, matches, newSid() (+49 more)

### Community 55 - "i18n.ts"
Cohesion: 0.24
Nodes (11): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware(), als (+3 more)

### Community 56 - "match.ts"
Cohesion: 0.07
Nodes (48): BOT_NAMES, Brain, SKILL, Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud (+40 more)

### Community 57 - "pedometer"
Cohesion: 0.20
Nodes (5): MotionPerm, pedometer, Snapshot, StepStatus, useSteps()

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
Cohesion: 0.12
Nodes (14): FireMsg, Space, weaponOf(), FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL, damageAt(), isWeapon() (+6 more)

### Community 62 - "FootprintIndex"
Cohesion: 0.18
Nodes (5): Nav, Node, FootprintIndex, pointInPoly(), rayFootprint()

### Community 63 - "perf.ts"
Cohesion: 0.23
Nodes (11): GraphicsSettings(), apply(), autoIsLite(), isLite(), isTouch(), listeners, Nav, onPerfChange() (+3 more)

### Community 64 - "Local Postgres 16 Service (db)"
Cohesion: 0.50
Nodes (4): Local Postgres 16 Service (db), pgdata Volume, Render Postgres (streetquest-db), Render Web Service (streetquest)

### Community 65 - "Remotes"
Cohesion: 0.18
Nodes (4): loadSoldier(), lerpAngle(), Remotes, RosterEntry

### Community 66 - "AdminLandmarks.tsx"
Cohesion: 0.23
Nodes (13): AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng(), photoLinks() (+5 more)

### Community 68 - "drive/landmarks.ts"
Cohesion: 0.19
Nodes (15): gltfLoader(), isReference(), loadModel(), measure(), prepare(), Entry, BUDGET_LABEL, convexHull() (+7 more)

### Community 71 - "EmojiArt.tsx"
Cohesion: 0.21
Nodes (15): artFor(), artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion (+7 more)

### Community 72 - "goals.ts"
Cohesion: 0.22
Nodes (19): GoalDef, GoalReward, MilestoneDef, announce(), bump(), claimGoal(), factionGoal(), fmtReward() (+11 more)

### Community 73 - "avatar.ts"
Cohesion: 0.08
Nodes (16): Avatar, axisL, Clip, loadWeapons(), NATURAL, Pose, qa, qp (+8 more)

### Community 74 - "AdminPanel.tsx"
Cohesion: 0.12
Nodes (21): AdminDropMap(), Clicks(), P, Recenter(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel() (+13 more)

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

### Community 81 - "ads.ts"
Cohesion: 0.28
Nodes (11): POST, Schema, AdCreative, adStatus(), claimAd(), clickAd(), dayStart(), HOUSE_AD (+3 more)

### Community 83 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 84 - "three"
Cohesion: 0.15
Nodes (10): three, Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade (+2 more)

### Community 85 - "play/page.tsx"
Cohesion: 0.50
Nodes (3): generateMetadata(), PlayPage(), viewport

### Community 86 - "server/steps.ts"
Cohesion: 0.27
Nodes (14): GET, DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps(), addMotionSteps() (+6 more)

### Community 87 - "alerts.ts"
Cohesion: 0.16
Nodes (12): lat, lng, prisma, start, @prisma/client, DIVIDEND_H, dividendCoins(), rankOf() (+4 more)

### Community 89 - "Button"
Cohesion: 0.17
Nodes (39): Button(), askConfirm(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details (+31 more)

### Community 99 - "PlayerLayer.tsx"
Cohesion: 0.20
Nodes (10): leaflet, react-leaflet, iconCache, meIcon, Anim, Guide, guideKey(), PlayerLayer() (+2 more)

### Community 100 - "smoke.ts"
Cohesion: 0.23
Nodes (12): C, client(), count(), F, KEY, main(), ORIGIN, sleep() (+4 more)

### Community 101 - "Landmarks"
Cohesion: 0.22
Nodes (3): disposeModel(), Landmarks, Frame

### Community 102 - "Button.tsx"
Cohesion: 0.25
Nodes (7): isThenable(), Props, installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate(), ShareButton()

### Community 103 - "BuildPool"
Cohesion: 0.20
Nodes (4): Cut, Style, TileArrays, BuildPool

### Community 104 - "tile.worker.ts"
Cohesion: 0.25
Nodes (4): Job, transferables(), NameMode, CityTile

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 761 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `db.ts`, `HttpError`, `idle.ts`, `server/landmarks.ts`, `http.ts`, `server/places.ts`, `Rewards.tsx`, `Panels.tsx`, `server/drive.ts`, `Call.tsx`, `me/route.ts`, `prisma`, `Game.tsx`, `AdminSettings.tsx`, `GameMap.tsx`, `Market.tsx`, `gpsgames.ts`, `geo.ts`, `Play.tsx`, `lib/settings.ts`, `arena/combat.ts`, `server/city.ts`, `social/route.ts`, `layout.tsx`, `server/business.ts`, `I18nProvider.tsx`, `Combat`, `Drive.tsx`, `i18n/index.ts`, `app/page.tsx`, `Drive`, `DriveGarage.tsx`, `world/route.ts`, `server/empire.ts`, `client.ts`, `match.ts`, `perf.ts`, `AdminLandmarks.tsx`, `goals.ts`, `AdminPanel.tsx`, `ads.ts`, `alerts.ts`, `Button`, `Button.tsx`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Are the 51 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 51 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0968421052631579 - nodes in this community are weakly interconnected._
- **Why does `Drive()` connect `Drive` to `t`, `HttpError`, `world3d.ts`, `Rewards.tsx`, `Panels.tsx`, `tiles.ts`, `server/drive.ts`, `lib/city.ts`, `others.ts`, `physics.ts`, `Market.tsx`, `geo.ts`, `Play.tsx`, `arena/combat.ts`, `server/city.ts`, `Combat`, `Drive.tsx`, `sfx.ts`, `DriveGarage.tsx`, `perf.ts`, `Remotes`, `drive/landmarks.ts`, `DriveNet`, `avatar.ts`, `three`, `Button`, `Landmarks`, `BuildPool`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051526251526251524 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `helpers.ts` to `package.json`, `render.mjs`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._