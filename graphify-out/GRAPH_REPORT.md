# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 275 files · ~271,391 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 5, .css 4, .example 1)

## Summary
- 2367 nodes · 7914 edges · 95 communities (79 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `711a9aeb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kit.ts
- helpers.ts
- t
- hub.ts
- requireUser
- idle.ts
- AdminLandmarks.tsx
- http.ts
- world3d.ts
- server/money.ts
- Rewards.tsx
- Panels.tsx
- tiles.ts
- server/drive.ts
- Call.tsx
- me/route.ts
- lib/city.ts
- server/shops.ts
- distanceM
- client.ts
- AdminPanel.tsx
- GameMap.tsx
- others.ts
- Landmarks
- Market.tsx
- gpsgames.ts
- server/places.ts
- tileMesh.ts
- Play.tsx
- lib/settings.ts
- sfx.ts
- HttpError
- social.ts
- layout.tsx
- fa/index.ts
- server/business.ts
- i18n/index.ts
- Empire.tsx
- Drive.tsx
- rides/route.ts
- Game.tsx
- app/page.tsx
- StreetQuest (real-world GPS war game)
- Drive
- i18n-check.ts
- DrivePad.tsx
- useLocation.ts
- package.json
- compilerOptions
- streetquest_store.py
- StreetQuest Business Plan
- lotteries/route.ts
- LocationTracker
- music.ts
- social/route.ts
- i18n.ts
- tile.worker.ts
- Pedometer
- dependencies
- scripts
- devDependencies
- three
- filter.ts
- perf.ts
- Go-to-market: First 100 Paying Stores
- Business Center (store owners)
- Deterministic Seeded World Generation
- LocationReporter
- vectorTile.ts
- NearbyStore
- DriveNet
- Tower Defense on Real Map
- Store & Sponsor Spots
- server/quests.ts
- AdminDropMap.tsx
- allowScripts
- lib/places.ts
- sw.js/route.ts
- ref_node_child_process
- render.mjs
- ads.txt/route.ts
- ads.ts
- vercel.json
- Daily Cron Cleanup
- Playwright E2E Suites (api/ui)
- push.ts
- VectorSource
- footprint.ts
- Dialogs.tsx
- Pwa.tsx
- CLAUDE.md
- Web Push Notifications (VAPID)
- Render Deploy (Blueprint)
- Service Worker Offline Cache
- Solar Time of Day

## God Nodes (most connected - your core abstractions)
1. `t()` - 347 edges
2. `HttpError` - 140 edges
3. `requireUser()` - 118 edges
4. `Drive()` - 103 edges
5. `body()` - 85 edges
6. `prisma` - 79 edges
7. `distanceM()` - 77 edges
8. `api()` - 77 edges
9. `useGame()` - 76 edges
10. `fmtNum()` - 71 edges

## Surprising Connections (you probably didn't know these)
- `Sponsor Spots (direct brand)` --semantically_similar_to--> `Store & Sponsor Spots`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Local Payment Gateway (Zarinpal / IDPay / Pay.ir)` --references--> `stripeCheckout()`  [EXTRACTED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Map Data at Scale Risk` --semantically_similar_to--> `Self-hosted Overpass at Scale`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Rewarded Video Ads` --semantically_similar_to--> `Google AdSense H5 Games Ads`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Location Privacy` --conceptually_related_to--> `Photo & Text Location Posts`  [INFERRED]
  marketing/BUSINESS_PLAN.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deterministic seeded world content verified by regeneration** — readme_deterministic_world_generation, readme_deterministic_spawns, readme_world_bosses, readme_outposts, readme_raider_waves [EXTRACTED 0.85]
- **Serverless lazy-settled state (snapshot + timestamp, no background jobs)** — readme_lazy_snapshot_settlement, readme_life_sim, readme_street_empire, readme_tower_defense, readme_field_armies [EXTRACTED 0.85]
- **Interlocking game layers feeding each other** — readme_strategy_layer, readme_fps_breach, readme_outposts [EXTRACTED 0.95]
- **Lazy state evaluation without background jobs** — readme_tower_defense [INFERRED 0.85]
- **Store foot-traffic monetisation loop** — readme_business_center, marketing_business_plan_business_plan_tiers, marketing_business_plan_verified_visits_sales, marketing_business_plan_free_trial_14_day, marketing_business_plan_first_100_stores [INFERRED 0.85]
- **Deterministic seeded world content (spawns, bosses, outposts, waves, lobbies, FPS arena)** — readme_world_bosses, readme_outposts, readme_raider_waves, readme_fps_breach [INFERRED 0.95]

## Communities (95 total, 16 thin omitted)

### Community 0 - "kit.ts"
Cohesion: 0.07
Nodes (79): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtSprite(), ArtUse(), artFor() (+71 more)

### Community 1 - "helpers.ts"
Cohesion: 0.05
Nodes (59): Dash, store(), World, crew(), befriend(), drive(), DriveRes, driveTo() (+51 more)

### Community 2 - "t"
Cohesion: 0.11
Nodes (64): paintGauge(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data, Details, DetailsForm() (+56 more)

### Community 3 - "hub.ts"
Cohesion: 0.13
Nodes (28): GET, POST, Schema, dynamic, GET(), short(), DEFAULT_LOCALE, Locale (+20 more)

### Community 4 - "requireUser"
Cohesion: 0.07
Nodes (62): zod, POST, Schema, POST, Schema, GET, Point, POST (+54 more)

### Community 5 - "idle.ts"
Cohesion: 0.06
Nodes (60): GET, POST, Schema, GET, POST, Schema, ALL_AT, BASE_OFFLINE_H (+52 more)

### Community 6 - "AdminLandmarks.tsx"
Cohesion: 0.07
Nodes (52): Action, Fields, GET, Meta, POST, AdminLandmarks(), Biz, download() (+44 more)

### Community 7 - "http.ts"
Cohesion: 0.07
Nodes (39): bcryptjs, GET, POST, POST, Schema, POST, POST, Schema (+31 more)

### Community 8 - "world3d.ts"
Cohesion: 0.11
Nodes (35): nameLines(), artImage(), artImages, at(), Board, canvas(), curtain(), drawIcon() (+27 more)

### Community 9 - "server/money.ts"
Cohesion: 0.18
Nodes (22): GET, cellOf(), DROP_PREFIX, isDropId(), MONEY_BUCKET_MS, moneyAround(), moneyBucket(), moneyForCell() (+14 more)

### Community 10 - "Rewards.tsx"
Cohesion: 0.08
Nodes (31): DriveParty(), Friend, GAMES, Invite, MEDAL, PartyHud(), Props, Resp (+23 more)

### Community 11 - "Panels.tsx"
Cohesion: 0.11
Nodes (36): AppSettings(), AVATARS, dropoffOf(), Friend, HeroTabId, Msg, MyDeliveries, MyRide (+28 more)

### Community 12 - "tiles.ts"
Cohesion: 0.11
Nodes (18): Cached, db(), idbGet(), idbPut(), idbRead(), Job, memory, remember() (+10 more)

### Community 13 - "server/drive.ts"
Cohesion: 0.07
Nodes (59): GET, Point, POST, Schema, layCourse(), P, Roads, samples() (+51 more)

### Community 14 - "Call.tsx"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "me/route.ts"
Cohesion: 0.18
Nodes (16): POST, GET, POST, Schema, GET, PATCH, ACHIEVEMENT_BY_KEY, AchievementDef (+8 more)

### Community 16 - "lib/city.ts"
Cohesion: 0.13
Nodes (21): AreaKind, centroid(), CityArea, CityBuilding, CityRoad, fromOverpass(), heightOf(), makeFrame() (+13 more)

### Community 17 - "server/shops.ts"
Cohesion: 0.11
Nodes (29): GET, GET, GET, Details, GET, POST, Schema, discountLive() (+21 more)

### Community 18 - "distanceM"
Cohesion: 0.18
Nodes (21): layDrops(), GET, GET, bbox(), bearingTo(), DayPhase, distanceM(), LatLng (+13 more)

### Community 19 - "client.ts"
Cohesion: 0.07
Nodes (41): react, Button(), isThenable(), Props, ApiError, CashoutView, ensureGuest(), HeroView (+33 more)

### Community 20 - "AdminPanel.tsx"
Cohesion: 0.08
Nodes (37): AdminPage(), keyMatches(), ADMIN_NAV, AdminDropMap, AdminLandmarks, AdminPanel(), Cashout, Data (+29 more)

### Community 21 - "GameMap.tsx"
Cohesion: 0.11
Nodes (32): leaflet, GpsView, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props (+24 more)

### Community 22 - "others.ts"
Cohesion: 0.15
Nodes (14): Driver, Snap, Walker, Style, Cockpit, makeCockpit(), makeVehicle(), materials() (+6 more)

### Community 23 - "Landmarks"
Cohesion: 0.16
Nodes (5): disposeModel(), Landmarks, CollisionWorld, Footprint, Frame

### Community 24 - "Market.tsx"
Cohesion: 0.13
Nodes (36): askConfirm(), fmtCountdown(), Browse(), BuyerOrder(), DEAL_STEPS, endLabel(), ENDS, img() (+28 more)

### Community 25 - "gpsgames.ts"
Cohesion: 0.07
Nodes (52): lat, lng, prisma, start, @prisma/client, GET, here(), POST (+44 more)

### Community 26 - "server/places.ts"
Cohesion: 0.16
Nodes (32): tileKey, tileOf(), cellKey(), parsePlaceMissionId(), Place, placeMissions(), backoffMs(), due() (+24 more)

### Community 27 - "tileMesh.ts"
Cohesion: 0.11
Nodes (29): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), dashes(), disc() (+21 more)

### Community 28 - "Play.tsx"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 29 - "lib/settings.ts"
Cohesion: 0.11
Nodes (33): Action, GET, ITEMS, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry (+25 more)

### Community 30 - "sfx.ts"
Cohesion: 0.12
Nodes (27): audio(), audioOut(), awake, bell(), BRASS, build(), click(), duck() (+19 more)

### Community 31 - "HttpError"
Cohesion: 0.11
Nodes (27): PUT, GET, POST, Send, Colour, GET, Points, POST (+19 more)

### Community 32 - "social.ts"
Cohesion: 0.12
Nodes (17): authorSelect, AutoBody, BIO_MAX, COMMENT_MAX, feed(), FEED_PAGE, FeedTab, HIDE_AT_REPORTS (+9 more)

### Community 33 - "layout.tsx"
Cohesion: 0.10
Nodes (18): BUILD_ID, config, next, react-dom, cinzel, fredoka, generateMetadata(), inter (+10 more)

### Community 34 - "fa/index.ts"
Cohesion: 0.07
Nodes (21): admin, app, call, common, data, drive, empire, game (+13 more)

### Community 35 - "server/business.ts"
Cohesion: 0.12
Nodes (30): Details, mine(), POST, Schema, activePlan(), BIZ_CHECKIN_M, BIZ_LIMITS, BIZ_SETUP_M (+22 more)

### Community 36 - "i18n/index.ts"
Cohesion: 0.09
Nodes (33): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+25 more)

### Community 37 - "Empire.tsx"
Cohesion: 0.13
Nodes (28): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+20 more)

### Community 38 - "Drive.tsx"
Cohesion: 0.08
Nodes (37): CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked, PlaceRow (+29 more)

### Community 39 - "rides/route.ts"
Cohesion: 0.11
Nodes (24): days(), dynamic, GET, GET, Schema, ACTIVE, GET, live() (+16 more)

### Community 40 - "Game.tsx"
Cohesion: 0.11
Nodes (34): Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL, StepChip() (+26 more)

### Community 41 - "app/page.tsx"
Cohesion: 0.11
Nodes (24): generateMetadata(), EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata() (+16 more)

### Community 42 - "StreetQuest (real-world GPS war game)"
Cohesion: 0.12
Nodes (19): City Pass (battle pass), Tourism and City Partnerships, StreetQuest README, 3D Art Kit (emoji to vector icons), Bounties, Clash of Clans Siege Rules, Crew Pings, Fantasy Parchment Map (+11 more)

### Community 43 - "Drive"
Cohesion: 0.18
Nodes (6): Drive(), Markers, angle(), Others, tagColor(), WorldPlayer

### Community 44 - "i18n-check.ts"
Cohesion: 0.12
Nodes (14): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+6 more)

### Community 45 - "DrivePad.tsx"
Cohesion: 0.15
Nodes (23): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+15 more)

### Community 46 - "useLocation.ts"
Cohesion: 0.16
Nodes (13): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+5 more)

### Community 47 - "package.json"
Cohesion: 0.10
Nodes (19): engines, node, name, private, type, version, jose, @mapbox/vector-tile (+11 more)

### Community 48 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "streetquest_store.py"
Cohesion: 0.18
Nodes (8): args(), box(), footprint_ring(), front_edge(), hex_rgb(), main(), material(), prism()

### Community 50 - "StreetQuest Business Plan"
Cohesion: 0.17
Nodes (12): StreetQuest Business Plan, Business Plan Tiers (Free/Starter/Pro/Chain), Real Courier Network, Foot-traffic Insights Reports, Gem Packs, Market Fee (shopFeePct 5%), Pay-per-result Store Pricing, QR Code Coupon at Till (+4 more)

### Community 51 - "lotteries/route.ts"
Cohesion: 0.16
Nodes (20): POST, POST, Schema, GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE (+12 more)

### Community 53 - "music.ts"
Cohesion: 0.18
Nodes (22): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+14 more)

### Community 54 - "social/route.ts"
Cohesion: 0.18
Nodes (17): GET, Schema, Fields, POST, Schema, GET, num(), POST (+9 more)

### Community 55 - "i18n.ts"
Cohesion: 0.22
Nodes (12): fa, isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), config, middleware() (+4 more)

### Community 56 - "tile.worker.ts"
Cohesion: 0.12
Nodes (8): Job, Cut, TileArrays, transferables(), BuildPool, NameMode, VtCell, CityTile

### Community 58 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+6 more)

### Community 59 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:push, db:seed, dev, i18n:check, postinstall, start (+6 more)

### Community 60 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+4 more)

### Community 61 - "three"
Cohesion: 0.15
Nodes (10): three, Cloud, Pin, pinTexture(), StorePins, oneLine(), OTHER, Trade (+2 more)

### Community 62 - "filter.ts"
Cohesion: 0.27
Nodes (9): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+1 more)

### Community 63 - "perf.ts"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), PerfMode (+2 more)

### Community 64 - "Go-to-market: First 100 Paying Stores"
Cohesion: 0.20
Nodes (11): Local Postgres 16 Service (db), pgdata Volume, Go-to-market: First 100 Paying Stores, 14-day Free Trial, Numbers to Watch (KPIs), Admin Panel, Live Game Settings (GameConfig), Referrals and UTM Attribution (+3 more)

### Community 65 - "Business Center (store owners)"
Cohesion: 0.18
Nodes (8): Brand Campaign Event Weeks, Car Cosmetics, 3D City Drive (three.js), Business Center (store owners), Play From Home, Real Places from OpenStreetMap, Social Network, Test Mode (no GPS, teleport)

### Community 66 - "Deterministic Seeded World Generation"
Cohesion: 0.22
Nodes (9): Campaign and Daily Quests, Deeper RTS (counters, veterancy, research, General's Powers), Deterministic Spawns, Field Armies / Real-time Squads, FPS Base Breach, Outposts (territory), Raider Waves, RPG Hero System (classes, attributes, gear) (+1 more)

### Community 68 - "vectorTile.ts"
Cohesion: 0.13
Nodes (18): AREA, clipLine(), clipRing(), flatRoofRegion(), Geom, HouseNumber, NAME_MODES, OPEN (+10 more)

### Community 71 - "Tower Defense on Real Map"
Cohesion: 0.25
Nodes (6): Anti-cheat (trusted server position), C4 Planting (hold to plant), GPS Games (Treasure Hunt, Street Sprint, Checkpoint Rally), Live Layer (polling presence/sync/chat), Street Combat, Tower Defense on Real Map

### Community 72 - "Store & Sponsor Spots"
Cohesion: 0.33
Nodes (6): Local Payment Gateway (Zarinpal / IDPay / Pay.ir), Rewarded Video Ads, Sponsor Spots (direct brand), Google AdSense H5 Games Ads, Store & Sponsor Spots, Stripe Checkout over REST

### Community 73 - "server/quests.ts"
Cohesion: 0.18
Nodes (16): ItemDef, Rarity, RARITY_COLOR, RARITY_WEIGHT, villageTile(), hashStr(), rng(), CAMPAIGN (+8 more)

### Community 74 - "AdminDropMap.tsx"
Cohesion: 0.47
Nodes (5): react-leaflet, AdminDropMap(), Clicks(), P, Recenter()

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "lib/places.ts"
Cohesion: 0.14
Nodes (12): FOOD_AT, FoodSpawn, ITEM_AT, pick(), PLACE_BUCKET_MS, PLACE_CAT_KEYS, placeBucket(), PlaceMissionKind (+4 more)

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "ads.ts"
Cohesion: 0.28
Nodes (11): POST, Schema, AdCreative, adStatus(), claimAd(), clickAd(), dayStart(), HOUSE_AD (+3 more)

### Community 85 - "push.ts"
Cohesion: 0.31
Nodes (8): GET, POST, Schema, ACTIVE_MS, PushPayload, pushPublicKey(), pushTo(), topicOf()

### Community 87 - "footprint.ts"
Cohesion: 0.27
Nodes (8): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), VT_ZOOM, insidePacked()

### Community 88 - "Dialogs.tsx"
Cohesion: 0.29
Nodes (4): DialogHost(), Opts, queue, Req

### Community 89 - "Pwa.tsx"
Cohesion: 0.60
Nodes (4): installHScroll(), pendingUpdate(), Pwa(), setPendingUpdate()

## Knowledge Gaps
- **31 isolated node(s):** `pgdata Volume`, `prisma`, `tsx`, `@types/bcryptjs`, `@types/leaflet` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 621 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `t` to `kit.ts`, `hub.ts`, `requireUser`, `idle.ts`, `AdminLandmarks.tsx`, `http.ts`, `server/money.ts`, `Rewards.tsx`, `Panels.tsx`, `server/drive.ts`, `Call.tsx`, `me/route.ts`, `server/shops.ts`, `distanceM`, `client.ts`, `AdminPanel.tsx`, `GameMap.tsx`, `Market.tsx`, `gpsgames.ts`, `server/places.ts`, `Play.tsx`, `lib/settings.ts`, `HttpError`, `social.ts`, `layout.tsx`, `server/business.ts`, `i18n/index.ts`, `Empire.tsx`, `Drive.tsx`, `rides/route.ts`, `Game.tsx`, `app/page.tsx`, `Drive`, `DrivePad.tsx`, `lotteries/route.ts`, `music.ts`, `social/route.ts`, `perf.ts`, `server/quests.ts`, `ads.ts`, `push.ts`, `Dialogs.tsx`, `Pwa.tsx`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Are the 41 inferred relationships involving `Drive()` (e.g. with `.cutsFor()` and `.dispose()`) actually correct?**
  _`Drive()` has 41 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pgdata Volume`, `prisma`, `tsx` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `kit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07092198581560284 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `helpers.ts` to `package.json`, `render.mjs`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054212454212454214 - nodes in this community are weakly interconnected._
- **Why does `stripeCheckout()` connect `server/business.ts` to `Store & Sponsor Spots`, `http.ts`, `HttpError`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._