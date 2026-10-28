# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 307 files · ~313,911 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .css 5, .glb 2)

## Summary
- 2820 nodes · 9547 edges · 112 communities (90 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 212 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `862eb35f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- objects.ts
- helpers.ts
- t
- server/hub.ts
- requireUser
- idle.ts
- AdminLandmarks.tsx
- http.ts
- world3d.ts
- server/places.ts
- Rewards.tsx
- Game.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- me/route.ts
- lib/city.ts
- db.ts
- Match
- client.ts
- AdminPanel.tsx
- GameMap.tsx
- vehicles3d.ts
- Drive
- Market.tsx
- gpsgames.ts
- server/money.ts
- tileMesh.ts
- Play.tsx
- lib/settings.ts
- gunsound.ts
- server/city.ts
- social/route.ts
- layout.tsx
- fa/index.ts
- HttpError
- I18nProvider.tsx
- Combat
- Drive.tsx
- i18n/index.ts
- sfx.ts
- app/page.tsx
- tile.worker.ts
- Others
- i18n-check.ts
- DriveGarage.tsx
- useLocation.ts
- package.json
- compilerOptions
- arena.py
- StreetQuest — how it makes money
- admin/route.ts
- server/empire.ts
- Inbox.tsx
- protocol.ts
- i18n.ts
- match.ts
- pedometer
- dependencies
- scripts
- devDependencies
- Player
- geom.ts
- perf.ts
- Local Postgres 16 Service (db)
- Remotes
- server/arena.ts
- LocationReporter
- react
- NearbyStore
- DriveNet
- kit.ts
- city/route.ts
- arena/combat.ts
- OthersLayer.tsx
- allowScripts
- msg
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- ads.ts
- vercel.json
- vfx.ts
- server/quests.ts
- goals.ts
- server/steps.ts
- EmojiArt.tsx
- icons/empire.ts
- Button
- CLAUDE.md
- .shoot
- @prisma/client
- arena/route.ts
- fa/arena.ts
- call.ts
- data.ts
- fa/empire.ts
- game.ts
- geo.ts
- locationTracker
- .tick
- help.ts
- Viewmodel
- fa/landmarks.ts
- sim.ts
- market.ts
- .onMsg
- filter.ts
- RtClient
- pages.ts
- panels.ts

## God Nodes (most connected - your core abstractions)
1. `t()` - 367 edges
2. `HttpError` - 147 edges
3. `requireUser()` - 124 edges
4. `Drive()` - 121 edges
5. `Button()` - 105 edges
6. `distanceM()` - 90 edges
7. `body()` - 87 edges
8. `prisma` - 81 edges
9. `fmtNum()` - 78 edges
10. `api()` - 77 edges

## Surprising Connections (you probably didn't know these)
- `Before going big` --references--> `notify()`  [INFERRED]
  README.md → src/server/hub.ts
- `2. What to add next (in order of money per week of work)` --references--> `stripeCheckout()`  [INFERRED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `How it works` --references--> `applyConfig()`  [INFERRED]
  README.md → src/lib/config.ts
- `How it works` --references--> `questEvent()`  [INFERRED]
  README.md → src/server/quests.ts
- `How it works` --references--> `CityTile`  [INFERRED]
  README.md → src/lib/city.ts

## Import Cycles
- None detected.

## Communities (112 total, 22 thin omitted)

### Community 0 - "objects.ts"
Cohesion: 0.17
Nodes (33): combat, flag(), skullHead(), sword, economy, medal(), beast(), eyes() (+25 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (60): Dash, store(), World, crew(), ArenaMe, befriend(), drive(), DriveRes (+52 more)

### Community 2 - "t"
Cohesion: 0.24
Nodes (20): browserInfo, browserLabel(), BrowserName, cameraSteps(), desktopLocationSteps(), desktopUnavailableSteps(), IN_APP, LABEL (+12 more)

### Community 3 - "server/hub.ts"
Cohesion: 0.10
Nodes (36): GET, POST, Schema, GET, POST, Send, dynamic, GET() (+28 more)

### Community 4 - "requireUser"
Cohesion: 0.08
Nodes (61): zod, GET, POST, Schema, POST, POST, Schema, GET (+53 more)

### Community 5 - "idle.ts"
Cohesion: 0.09
Nodes (46): BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard(), View, burst() (+38 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.06
Nodes (60): GET, AdminLandmarks(), Biz, download(), Draft, LandmarkPreview(), Measured, mLng() (+52 more)

### Community 7 - "http.ts"
Cohesion: 0.07
Nodes (53): bcryptjs, jose, POST, POST, Schema, POST, POST, Schema (+45 more)

### Community 8 - "world3d.ts"
Cohesion: 0.10
Nodes (38): artFor(), Cloud, pinTexture(), nameLines(), oneLine(), OTHER, Trade, tradeOf() (+30 more)

### Community 9 - "server/places.ts"
Cohesion: 0.12
Nodes (30): hashStr(), CUSTOMER_DOOR, FOOD_AT, FoodSpawn, ITEM_AT, parsePlaceMissionId(), pick(), Place (+22 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.11
Nodes (27): Art(), ArtAnim, ensureArt(), bump(), calm(), Celebration, CelebrationLayer(), compact() (+19 more)

### Community 11 - "Game.tsx"
Cohesion: 0.06
Nodes (72): Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL, StepChip() (+64 more)

### Community 12 - "tiles.ts"
Cohesion: 0.07
Nodes (23): Style, TileArrays, BuildPool, Cached, db(), idbGet(), idbPut(), idbRead() (+15 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.08
Nodes (53): POST, layCourse(), P, Roads, samples(), CHECKPOINT_M, checkPoints(), COIN_M (+45 more)

### Community 14 - "Call.tsx"
Cohesion: 0.12
Nodes (19): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+11 more)

### Community 15 - "me/route.ts"
Cohesion: 0.17
Nodes (18): GET, DIVIDEND_H, dividendCoins(), rankOf(), ACHIEVEMENT_BY_KEY, AchievementDef, ACHIEVEMENTS, DAILY_REWARD() (+10 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.07
Nodes (46): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+38 more)

### Community 17 - "db.ts"
Cohesion: 0.06
Nodes (49): GET, days(), dynamic, GET, GET, GET, GET, POST (+41 more)

### Community 18 - "Match"
Cohesion: 0.13
Nodes (8): newBrain(), objective(), pickGoal(), tickBot(), Match, bombSide(), MatchView, Team

### Community 19 - "client.ts"
Cohesion: 0.06
Nodes (39): ApiError, CashoutView, ensureGuest(), HeroView, LatLng, Me, ShopDeal, World (+31 more)

### Community 20 - "AdminPanel.tsx"
Cohesion: 0.08
Nodes (38): AdminPage(), generateMetadata(), keyMatches(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel(), Cashout (+30 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.13
Nodes (25): GpsView, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props, TIER_COLORS (+17 more)

### Community 22 - "vehicles3d.ts"
Cohesion: 0.23
Nodes (10): Cockpit, makeCockpit(), makeVehicle(), materials(), Mats, Rotor, VehicleModel, makeClouds() (+2 more)

### Community 23 - "Drive"
Cohesion: 0.11
Nodes (8): Drive(), Landmarks, Markers, Driver, CollisionWorld, StorePins, Cut, Footprint

### Community 24 - "Market.tsx"
Cohesion: 0.12
Nodes (30): Browse(), DEAL_STEPS, endLabel(), ENDS, img(), localInput(), MarketPanel(), Mine (+22 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "server/money.ts"
Cohesion: 0.21
Nodes (21): cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell(), MoneyPickup (+13 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.10
Nodes (32): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), dashes(), disc() (+24 more)

### Community 28 - "Play.tsx"
Cohesion: 0.10
Nodes (26): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+18 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.10
Nodes (29): applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry, snapshot(), syncSettings(), AdCreative (+21 more)

### Community 30 - "gunsound.ts"
Cohesion: 0.27
Nodes (13): beepSound(), blip(), boomSound(), emptySound(), hitSound(), hurtSound(), killSound(), noiseOf() (+5 more)

### Community 31 - "server/city.ts"
Cohesion: 0.22
Nodes (22): tileKey, tileOf(), villageTile(), cellKey(), backoffMs(), due(), endpoints(), fetchTile() (+14 more)

### Community 32 - "social/route.ts"
Cohesion: 0.10
Nodes (32): GET, GET, Point, Schema, GET, num(), POST, Schema (+24 more)

### Community 33 - "layout.tsx"
Cohesion: 0.13
Nodes (13): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+5 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.12
Nodes (12): admin, app, common, drive, landing, location, lottery, money (+4 more)

### Community 35 - "HttpError"
Cohesion: 0.13
Nodes (31): Details, GET, mine(), POST, Schema, GET, POST, Schema (+23 more)

### Community 36 - "I18nProvider.tsx"
Cohesion: 0.13
Nodes (24): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+16 more)

### Community 38 - "Drive.tsx"
Cohesion: 0.07
Nodes (32): CombatPad, Crosshair(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab (+24 more)

### Community 39 - "i18n/index.ts"
Cohesion: 0.10
Nodes (23): Schema, ACTIVE, GET, live(), Point, POST, pub, Schema (+15 more)

### Community 40 - "sfx.ts"
Cohesion: 0.12
Nodes (26): audio(), awake, bell(), BRASS, build(), click(), duck(), envelope() (+18 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.12
Nodes (22): EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata(), generateMetadata() (+14 more)

### Community 42 - "tile.worker.ts"
Cohesion: 0.12
Nodes (12): Before going big, Deploy, How it works, Production checklist, Render, Run locally, StreetQuest — real-world GPS war game, Vercel (+4 more)

### Community 43 - "Others"
Cohesion: 0.21
Nodes (4): angle(), Others, tagColor(), WorldPlayer

### Community 44 - "i18n-check.ts"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "DriveGarage.tsx"
Cohesion: 0.14
Nodes (26): CTL, DriveGarage(), NAMES, Props, askTilt(), BarsArt(), buzz(), clamp1() (+18 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.17
Nodes (12): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+4 more)

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

### Community 51 - "admin/route.ts"
Cohesion: 0.11
Nodes (29): Action, GET, layDrops(), POST, GET, pub, Schema, POST (+21 more)

### Community 52 - "server/empire.ts"
Cohesion: 0.18
Nodes (20): GET, POST, Schema, BizState, BOOST_MAX_H, BOOST_MINUTES, emptyEmpire(), fameFor() (+12 more)

### Community 53 - "Inbox.tsx"
Cohesion: 0.22
Nodes (12): ago(), dayOf(), Filter, FILTERS, InboxPanel(), Item, KIND_ICON, splitIcon() (+4 more)

### Community 54 - "protocol.ts"
Cohesion: 0.07
Nodes (49): Identity, Sample, Sock, APP_URL, hub, ORIGINS, PORT, report() (+41 more)

### Community 55 - "i18n.ts"
Cohesion: 0.20
Nodes (13): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), setLocaleResolver(), Vars, config (+5 more)

### Community 56 - "match.ts"
Cohesion: 0.08
Nodes (39): Bomb, DIFF, DIFF_LABEL, SIZE_LABEL, CombatHud, nil(), useCombat(), WEAPON_ICON (+31 more)

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

### Community 61 - "Player"
Cohesion: 0.09
Nodes (7): Hub, Player, Space, weaponOf(), World, LL, WeaponKey

### Community 62 - "geom.ts"
Cohesion: 0.10
Nodes (17): Nav, Node, BODY_R, CROUCH_H, EYE_CROUCH, EYE_STAND, Footprint, FootprintIndex (+9 more)

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

### Community 68 - "react"
Cohesion: 0.10
Nodes (21): react, isThenable(), Props, Opts, queue, Req, DriveParty(), Friend (+13 more)

### Community 71 - "kit.ts"
Cohesion: 0.15
Nodes (17): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtSprite(), ArtUse(), ICONS (+9 more)

### Community 72 - "city/route.ts"
Cohesion: 0.16
Nodes (15): Action, Fields, Meta, POST, PUT, Colour, GET, Points (+7 more)

### Community 73 - "arena/combat.ts"
Cohesion: 0.06
Nodes (45): three, axisL, Clip, NATURAL, Pose, qa, qp, right (+37 more)

### Community 74 - "OthersLayer.tsx"
Cohesion: 0.20
Nodes (13): leaflet, react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), esc(), icon() (+5 more)

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
Cohesion: 0.32
Nodes (10): POST, Schema, adStatus(), claimAd(), clickAd(), dayStart(), HOUSE_AD, network() (+2 more)

### Community 83 - "vfx.ts"
Cohesion: 0.17
Nodes (9): col, dir, m4, pos, Puff, q, scl, Tracer (+1 more)

### Community 84 - "server/quests.ts"
Cohesion: 0.16
Nodes (16): ITEM_BY_KEY, ItemDef, ITEMS, Rarity, RARITY_COLOR, RARITY_WEIGHT, CAMPAIGN, campaignKey() (+8 more)

### Community 85 - "goals.ts"
Cohesion: 0.31
Nodes (15): announce(), bump(), claimGoal(), factionGoal(), fmtReward(), goalsView(), inLocale(), live() (+7 more)

### Community 86 - "server/steps.ts"
Cohesion: 0.26
Nodes (15): GET, dayKey(), DAILY_STEP_CAP, MAX_CADENCE, MAX_REPORT_S, SENSOR_FRESH_MS, STRIDE_M, addGpsSteps() (+7 more)

### Community 87 - "EmojiArt.tsx"
Cohesion: 0.23
Nodes (13): artHtml(), artSvg(), EMOJI_RE, hasEmoji(), MAP, SHOWN_AS_EMOJI, companion, dropCompanion() (+5 more)

### Community 88 - "icons/empire.ts"
Cohesion: 0.28
Nodes (14): trefoil(), empire, hammer(), store(), wrench(), button(), phoneBody(), house() (+6 more)

### Community 89 - "Button"
Cohesion: 0.09
Nodes (83): ArenaMenu(), clock(), CombatHud(), MatchBar(), Scoreboard(), Button(), askConfirm(), paintGauge() (+75 more)

### Community 91 - ".shoot"
Cohesion: 0.24
Nodes (4): FootBody, aimDir(), eyeHeight(), spreadDir()

### Community 92 - "@prisma/client"
Cohesion: 0.29
Nodes (5): lat, lng, prisma, start, @prisma/client

### Community 93 - "arena/route.ts"
Cohesion: 0.60
Nodes (4): POST, Schema, respawn(), setPassive()

### Community 99 - "geo.ts"
Cohesion: 0.26
Nodes (14): GET, bbox(), bearingTo(), dayPhase, LatLng, offset(), solarHour(), toDeg() (+6 more)

### Community 101 - ".tick"
Cohesion: 0.20
Nodes (6): Avatar, Collide, FOOT_R, FootInput, newFoot(), stepFoot()

### Community 105 - "sim.ts"
Cohesion: 0.17
Nodes (10): MatchResult, buildings, F, host, log, m, mode, now (+2 more)

### Community 108 - "filter.ts"
Cohesion: 0.29
Nodes (9): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+1 more)

## Knowledge Gaps
- **12 isolated node(s):** `@types/bcryptjs`, `@types/leaflet`, `@types/node`, `@types/react`, `@types/react-dom` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 734 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `server/hub.ts`, `requireUser`, `idle.ts`, `AdminLandmarks.tsx`, `http.ts`, `server/places.ts`, `Rewards.tsx`, `Game.tsx`, `server/drive.ts`, `Call.tsx`, `me/route.ts`, `db.ts`, `client.ts`, `AdminPanel.tsx`, `GameMap.tsx`, `Drive`, `Market.tsx`, `gpsgames.ts`, `server/money.ts`, `Play.tsx`, `gunsound.ts`, `social/route.ts`, `layout.tsx`, `HttpError`, `I18nProvider.tsx`, `Combat`, `Drive.tsx`, `i18n/index.ts`, `DriveGarage.tsx`, `admin/route.ts`, `server/empire.ts`, `Inbox.tsx`, `match.ts`, `perf.ts`, `server/arena.ts`, `react`, `kit.ts`, `city/route.ts`, `arena/combat.ts`, `ads.ts`, `server/quests.ts`, `goals.ts`, `Button`, `arena/route.ts`, `geo.ts`, `.tick`, `.onMsg`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `Drive()` (e.g. with `.dispose()` and `.dots()`) actually correct?**
  _`Drive()` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/bcryptjs`, `@types/leaflet`, `@types/node` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05136168179646441 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `t`, `idle.ts`, `AdminLandmarks.tsx`, `Rewards.tsx`, `Game.tsx`, `Call.tsx`, `client.ts`, `AdminPanel.tsx`, `GameMap.tsx`, `Market.tsx`, `Play.tsx`, `layout.tsx`, `I18nProvider.tsx`, `Drive.tsx`, `app/page.tsx`, `DriveGarage.tsx`, `useLocation.ts`, `package.json`, `Inbox.tsx`, `match.ts`, `pedometer`, `arena/combat.ts`, `OthersLayer.tsx`, `EmojiArt.tsx`, `Button`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `server/hub.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09898989898989899 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `helpers.ts` to `package.json`, `render.mjs`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._