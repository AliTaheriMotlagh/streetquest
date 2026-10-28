# Graph Report - gps-game  (2026-10-28)

## Corpus Check
- 249 files · ~271,243 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2434 nodes · 8005 edges · 99 communities (75 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 126 edges (avg confidence: 0.85)
- Token cost: 56,836 input · 0 output

## Community Hubs (Navigation)
- Landing and Art Preview
- E2E API Specs
- Dialogs and Business UI
- Admin and Calls API
- Deliveries API
- Database Seed
- Admin 3D Stores API
- Auth and Announcements
- Drive HUD and Jobs
- Cash-out and Geo Utils
- Game Shell
- Music Engine
- Tile Worker and Cuts
- Party Courses
- Video Calls
- Daily, Hero and Me API
- Blender Footprint Export
- Player Shops API
- Business API
- Buttons and Dialogs
- Admin Panel
- 2D Game Map
- Drive Netcode
- Drive Landmarks
- Market and Party HUD
- GPS Story Games
- City Tiles API
- Tile Mesh Builder
- Video Ads
- Live Config
- Sound Effects
- Store and Ads API
- Social and Leaderboard
- App Layout and Fonts
- Persian Translations
- Next Config and SEO
- Error Boundaries and i18n
- Art Kit and Empire
- Garage and Controls
- Cron and Rides
- API Client Types
- Event Pages
- README Feature Concepts
- Beacon Screen UI
- i18n Checker
- Drive Touch Pad
- Nearby Players
- Package Metadata
- TypeScript Config
- Blender Store Script
- Business Plan
- Lotteries
- Location Tracker
- Cooperative Goals
- Map Screen UI
- Locale Resolution
- Goals Screen UI
- Pedometer
- Runtime Dependencies
- NPM Scripts
- Dev Dependencies
- Store Pins
- GPS Fix Filter
- Graphics Settings
- Local Infra and GTM
- Risks and Roadmap
- Game Layer Concepts
- Location Reporter
- Promo Ad Concepts
- Nearby Store
- DriveNet
- Anti-cheat (trusted server position)
- Payments in Iran (Tapsell / Yektanet)
- Apple Touch Icon (180px)
- react-leaflet
- allowScripts
- health/route.ts
- sw.js/route.ts
- prepare-db.mjs
- render.mjs
- ads.txt/route.ts
- parse()
- vercel.json
- Daily Cron Cleanup
- Playwright E2E Suites (api/ui)
- call.ts
- common.ts
- fa/drive.ts
- game.ts
- help.ts
- landing.ts
- location.ts
- fa/money.ts
- panels.ts
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
7. `api()` - 77 edges
8. `distanceM()` - 77 edges
9. `useGame()` - 76 edges
10. `fmtNum()` - 71 edges

## Surprising Connections (you probably didn't know these)
- `Sponsor Spots (direct brand)` --semantically_similar_to--> `Store & Sponsor Spots`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Local Payment Gateway (Zarinpal / IDPay / Pay.ir)` --references--> `stripeCheckout()`  [EXTRACTED]
  marketing/BUSINESS_PLAN.md → src/server/store.ts
- `Rewarded Video Ads` --semantically_similar_to--> `Google AdSense H5 Games Ads`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Map Data at Scale Risk` --semantically_similar_to--> `Self-hosted Overpass at Scale`  [INFERRED] [semantically similar]
  marketing/BUSINESS_PLAN.md → README.md
- `Location Privacy` --conceptually_related_to--> `Photo & Text Location Posts`  [INFERRED]
  marketing/BUSINESS_PLAN.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Interlocking game layers feeding each other** — readme_strategy_layer, readme_fps_breach, readme_outposts [EXTRACTED 0.95]
- **Low-Friction Onboarding Funnel** — public_media_streetquest_ad_play_free_cta, public_media_streetquest_ad_browser_no_download, public_media_streetquest_ad_from_home_mode [INFERRED 0.75]
- **GPS proximity collection loop** — public_screens_map_player_marker, public_screens_map_interaction_radius, public_screens_map_item_markers, public_screens_map_quest_card [INFERRED 0.75]
- **Play Mode Choice (Walk vs From Home, reward tradeoff)** — public_media_streetquest_ad_walk_mode, public_media_streetquest_ad_from_home_mode, public_media_streetquest_ad_reward_system [INFERRED 0.85]
- **Story beacon wayfinding: panel, distance, route line, beacon and player marker** — public_screens_beacon_story_panel, public_screens_beacon_distance_compass, public_screens_beacon_dashed_route, public_screens_beacon_gold_beacon, public_screens_beacon_player_marker [INFERRED 0.85]
- **Top HUD status cluster** — public_screens_beacon_player_hud, public_screens_beacon_energy_meter, public_screens_beacon_currency_display [INFERRED 0.85]
- **Persistent Top HUD Overlay** — public_screens_goals_player_hud, public_screens_goals_mood_energy_indicator, public_screens_goals_currency_display [INFERRED 0.85]
- **Top HUD status cluster** — public_screens_map_player_profile_card, public_screens_map_mood_energy_meter, public_screens_map_currency_display, public_screens_map_quest_card [INFERRED 0.85]
- **PWA Web App Manifest Icon Set** — public_icons_icon_192_icon, public_icons_icon_512_icon, public_icons_maskable_512_icon [INFERRED 0.85]
- **Lazy state evaluation without background jobs** — readme_tower_defense [INFERRED 0.85]
- **Cooperative Goal Card Pattern (countdown + progress + your part + shared reward)** — public_screens_goals_countdown_timer, public_screens_goals_progress_bar, public_screens_goals_personal_contribution, public_screens_goals_shared_reward [INFERRED 0.95]
- **Deterministic seeded world content (spawns, bosses, outposts, waves, lobbies, FPS arena)** — readme_world_bosses, readme_outposts, readme_raider_waves, readme_fps_breach [INFERRED 0.95]
- **StreetQuest Cross-Platform Icon Variants** — public_icons_apple_touch_icon_icon, public_icons_badge_96_icon, public_icons_favicon_64_icon, public_icons_icon_192_icon, public_icons_icon_512_icon, public_icons_maskable_512_icon [INFERRED 0.95]
- **Serverless lazy-settled state (snapshot + timestamp, no background jobs)** — readme_lazy_snapshot_settlement, readme_life_sim, readme_street_empire, readme_tower_defense, readme_field_armies [EXTRACTED 0.85]
- **Deterministic seeded world content verified by regeneration** — readme_deterministic_world_generation, readme_deterministic_spawns, readme_world_bosses, readme_outposts, readme_raider_waves [EXTRACTED 0.85]
- **Store foot-traffic monetisation loop** — readme_business_center, marketing_business_plan_business_plan_tiers, marketing_business_plan_verified_visits_sales, marketing_business_plan_free_trial_14_day, marketing_business_plan_first_100_stores [INFERRED 0.85]

## Communities (99 total, 24 thin omitted)

### Community 0 - "Landing and Art Preview"
Cohesion: 0.07
Nodes (78): cells, keys, [out = "art-preview.html", only], sym, Home(), ArtSprite(), ArtUse(), artHtml() (+70 more)

### Community 1 - "E2E API Specs"
Cohesion: 0.05
Nodes (59): Dash, store(), World, crew(), befriend(), drive(), DriveRes, driveTo() (+51 more)

### Community 2 - "Dialogs and Business UI"
Cohesion: 0.10
Nodes (76): askConfirm(), paintGauge(), DriveParty(), AdminTools(), BusinessPanel(), CampaignForm(), Dashboard(), Data (+68 more)

### Community 3 - "Admin and Calls API"
Cohesion: 0.06
Nodes (57): Action, GET, GET, POST, Schema, GET, POST, Send (+49 more)

### Community 4 - "Deliveries API"
Cohesion: 0.09
Nodes (61): POST, POST, Schema, GET, Point, POST, pub, Schema (+53 more)

### Community 5 - "Database Seed"
Cohesion: 0.05
Nodes (68): lat, lng, prisma, start, @prisma/client, GET, POST, Schema (+60 more)

### Community 6 - "Admin 3D Stores API"
Cohesion: 0.05
Nodes (66): Action, Fields, GET, Meta, POST, PUT, AdminLandmarks(), Biz (+58 more)

### Community 7 - "Auth and Announcements"
Cohesion: 0.07
Nodes (46): bcryptjs, jose, zod, GET, POST, POST, Schema, POST (+38 more)

### Community 8 - "Drive HUD and Jobs"
Cohesion: 0.07
Nodes (58): artFor(), CAM_LABEL, CamMode, CAMS, Hud, Job, MenuTab, Picked (+50 more)

### Community 9 - "Cash-out and Geo Utils"
Cohesion: 0.08
Nodes (52): GET, POST, Schema, CELL_DEG, cellOf(), hashStr(), DROP_PREFIX, isDropId() (+44 more)

### Community 10 - "Game Shell"
Cohesion: 0.07
Nodes (52): Me, Drive, Game(), GameMap, MapLook, NAV, PHASE_ICON, PHASE_LABEL (+44 more)

### Community 11 - "Music Engine"
Cohesion: 0.07
Nodes (55): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+47 more)

### Community 12 - "Tile Worker and Cuts"
Cohesion: 0.06
Nodes (28): Job, Cut, Style, TileArrays, transferables(), BuildPool, Cached, db() (+20 more)

### Community 13 - "Party Courses"
Cohesion: 0.08
Nodes (48): POST, layCourse(), P, Roads, samples(), RoadKind, CHECKPOINT_M, checkPoints() (+40 more)

### Community 14 - "Video Calls"
Cohesion: 0.08
Nodes (35): CallInvite, CallPeer, CallScreen(), CAMERA, candProto(), candType(), classify(), END_TEXT (+27 more)

### Community 15 - "Daily, Hero and Me API"
Cohesion: 0.08
Nodes (38): POST, GET, POST, Schema, GET, ITEM_BY_KEY, ItemDef, ITEMS (+30 more)

### Community 16 - "Blender Footprint Export"
Cohesion: 0.07
Nodes (43): centre(), FootBuilding, Footprint, footprintAt(), FootRoad, round(), AREA, clipLine() (+35 more)

### Community 17 - "Player Shops API"
Cohesion: 0.09
Nodes (37): GET, GET, GET, POST, Schema, Fields, Schema, Details (+29 more)

### Community 18 - "Business API"
Cohesion: 0.12
Nodes (35): layDrops(), Details, GET, mine(), POST, Schema, POST, Schema (+27 more)

### Community 19 - "Buttons and Dialogs"
Cohesion: 0.09
Nodes (32): react, Button(), isThenable(), Props, Opts, queue, Req, HELP (+24 more)

### Community 20 - "Admin Panel"
Cohesion: 0.08
Nodes (37): AdminPage(), generateMetadata(), keyMatches(), ADMIN_NAV, AdminLandmarks, AdminPanel(), Cashout, Data (+29 more)

### Community 21 - "2D Game Map"
Cohesion: 0.11
Nodes (31): leaflet, GpsView, Clicks(), FrameTarget(), GameMap(), guidesFor(), Layers(), Props (+23 more)

### Community 22 - "Drive Netcode"
Cohesion: 0.09
Nodes (22): three, NetState, Payload, angle(), Driver, Others, Snap, tagColor() (+14 more)

### Community 23 - "Drive Landmarks"
Cohesion: 0.11
Nodes (13): Drive(), Landmarks, Markers, Body, cellOf(), CollisionWorld, Controls, forward() (+5 more)

### Community 24 - "Market and Party HUD"
Cohesion: 0.12
Nodes (32): PartyHud(), Browse(), DEAL_STEPS, endLabel(), ENDS, img(), localInput(), MarketPanel() (+24 more)

### Community 25 - "GPS Story Games"
Cohesion: 0.13
Nodes (31): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+23 more)

### Community 26 - "City Tiles API"
Cohesion: 0.14
Nodes (31): Colour, GET, Points, POST, Upload, overpassQuery(), parseTileKey(), TILE_V (+23 more)

### Community 27 - "Tile Mesh Builder"
Cohesion: 0.11
Nodes (30): AREA_Y, box(), Builder, buildTileArrays(), color(), cornerSigns(), dashes(), disc() (+22 more)

### Community 28 - "Video Ads"
Cohesion: 0.10
Nodes (29): AutoVideo(), Props, AdBreak, AdNetwork, load(), Placement, requestRewarded(), RewardedAd (+21 more)

### Community 29 - "Live Config"
Cohesion: 0.11
Nodes (27): applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry, snapshot(), syncSettings(), applySettings() (+19 more)

### Community 30 - "Sound Effects"
Cohesion: 0.12
Nodes (27): audio(), audioOut(), awake, bell(), BRASS, build(), click(), duck() (+19 more)

### Community 31 - "Store and Ads API"
Cohesion: 0.14
Nodes (22): POST, Schema, GET, POST, Schema, spendGems(), POST(), AdCreative (+14 more)

### Community 32 - "Social and Leaderboard"
Cohesion: 0.14
Nodes (25): GET, GET, num(), Schema, levelForXp(), authorSelect, AutoBody, BIO_MAX (+17 more)

### Community 33 - "App Layout and Fonts"
Cohesion: 0.11
Nodes (17): react-dom, cinzel, fredoka, generateMetadata(), inter, RootLayout(), VAZIRMATN, viewport (+9 more)

### Community 34 - "Persian Translations"
Cohesion: 0.12
Nodes (12): admin, app, data, empire, landmarks, lottery, market, pages (+4 more)

### Community 35 - "Next Config and SEO"
Cohesion: 0.13
Nodes (14): BUILD_ID, config, next, GET(), ART, dynamic, FAQ, FEATURES (+6 more)

### Community 36 - "Error Boundaries and i18n"
Cohesion: 0.16
Nodes (19): GlobalError(), PlayError(), I18nProvider(), LocaleCtx, useLocale(), useT(), LanguagePicker(), LanguageToggle() (+11 more)

### Community 37 - "Art Kit and Empire"
Cohesion: 0.15
Nodes (21): Art(), ArtAnim, BUY_STEPS, clock(), EmpireTab(), fa(), money(), StepsCard() (+13 more)

### Community 38 - "Garage and Controls"
Cohesion: 0.12
Nodes (21): CTL, DriveGarage(), NAMES, Props, askTilt(), SteerMode, Friend, GAMES (+13 more)

### Community 39 - "Cron and Rides"
Cohesion: 0.13
Nodes (19): days(), dynamic, GET, ACTIVE, GET, live(), Point, pub (+11 more)

### Community 40 - "API Client Types"
Cohesion: 0.10
Nodes (20): ApiError, CashoutView, ensureGuest(), HeroView, LatLng, ShopDeal, WorldDelivery, WorldEvent (+12 more)

### Community 41 - "Event Pages"
Cohesion: 0.18
Nodes (16): EventPage(), generateMetadata(), load(), Props, dynamic, EventsPage(), generateMetadata(), generateMetadata() (+8 more)

### Community 42 - "README Feature Concepts"
Cohesion: 0.12
Nodes (19): City Pass (battle pass), Tourism and City Partnerships, StreetQuest README, 3D Art Kit (emoji to vector icons), Bounties, Clash of Clans Siege Rules, Crew Pings, Fantasy Parchment Map (+11 more)

### Community 43 - "Beacon Screen UI"
Cohesion: 0.13
Nodes (20): Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero), Mission Countdown Timer (29:52), Currency Display (Coins 1,950 / Gems 25 with + purchase), Dark Leaflet/OpenStreetMap Base Map, Dashed Guidance Line to Beacon, Distance and Direction Indicator (148 m N to gold beacon), Mood/Energy Meter, Fort Marker (Fort Test 1) (+12 more)

### Community 44 - "i18n Checker"
Cohesion: 0.11
Nodes (15): typescript, calleeName(), candidates, catalog, files, insideT(), isCodeLiteral(), keys (+7 more)

### Community 45 - "Drive Touch Pad"
Cohesion: 0.20
Nodes (18): BarsArt(), buzz(), clamp1(), DrivePad, Hold(), Input, Pedals(), Props (+10 more)

### Community 46 - "Nearby Players"
Cohesion: 0.14
Nodes (15): Fix, Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent (+7 more)

### Community 47 - "Package Metadata"
Cohesion: 0.11
Nodes (18): engines, node, name, private, type, version, @mapbox/vector-tile, pbf (+10 more)

### Community 48 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "Blender Store Script"
Cohesion: 0.18
Nodes (8): args(), box(), footprint_ring(), front_edge(), hex_rgb(), main(), material(), prism()

### Community 50 - "Business Plan"
Cohesion: 0.17
Nodes (12): StreetQuest Business Plan, Business Plan Tiers (Free/Starter/Pro/Chain), Real Courier Network, Foot-traffic Insights Reports, Gem Packs, Market Fee (shopFeePct 5%), Pay-per-result Store Pricing, QR Code Coupon at Till (+4 more)

### Community 51 - "Lotteries"
Cohesion: 0.21
Nodes (15): GET, Schema, LOTTERY_MAX_HOSTED, LOTTERY_MAX_LEAD_MS, LOTTERY_MAX_PRICE, LOTTERY_MAX_TICKETS, LOTTERY_MIN_LEAD_MS, LOTTERY_MIN_PRICE (+7 more)

### Community 53 - "Cooperative Goals"
Cohesion: 0.29
Nodes (16): announce(), bump(), claimGoal(), factionGoal(), fmtReward(), goalsReady(), goalsView(), inLocale() (+8 more)

### Community 54 - "Map Screen UI"
Cohesion: 0.17
Nodes (16): Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero), Currency Display (Coins 1,950 / Gems 25 with + purchase), Dark Leaflet/OpenStreetMap Basemap (London Bridge), Day/Night Theme Toggle, Floating Glassy HUD Overlay Layout, Fort Marker (Fort Test 1), Interaction / Reach Radius Rings (purple solid + cyan dashed), Collectible Item Markers (gem, toolbox, donut, star, flag) (+8 more)

### Community 55 - "Locale Resolution"
Cohesion: 0.20
Nodes (13): isLocale(), LOCALE_COOKIE, LOCALE_HEADER, pickLocale(), resolveLocale(), setLocaleResolver(), Vars, config (+5 more)

### Community 56 - "Goals Screen UI"
Cohesion: 0.21
Nodes (15): Goal Countdown (ends in 4d 10h), Currency Display (Coins 1,950 / Gems 25 + buy), Dark Map Background (London), Faction Goal Card (Total War), Faction Standing Row (Coalition: 3), Map Cash Pickup Marker, Mood / Energy Indicator, Your Part (Personal Contribution) (+7 more)

### Community 58 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, jose, leaflet, @mapbox/vector-tile, next, pbf, @prisma/client (+6 more)

### Community 59 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:push, db:seed, dev, i18n:check, postinstall, start (+6 more)

### Community 60 - "Dev Dependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+4 more)

### Community 61 - "Store Pins"
Cohesion: 0.21
Nodes (5): Cloud, Pin, pinTexture(), StorePins, Trade

### Community 62 - "GPS Fix Filter"
Cohesion: 0.30
Nodes (8): Axis, dist(), FixFilter, measurePos(), measureVel(), predict(), rad(), RawFix

### Community 63 - "Graphics Settings"
Cohesion: 0.26
Nodes (10): GraphicsSettings(), apply(), autoIsLite(), isLite(), listeners, Nav, onPerfChange(), PerfMode (+2 more)

### Community 64 - "Local Infra and GTM"
Cohesion: 0.20
Nodes (11): Local Postgres 16 Service (db), pgdata Volume, Go-to-market: First 100 Paying Stores, 14-day Free Trial, Numbers to Watch (KPIs), Admin Panel, Live Game Settings (GameConfig), Referrals and UTM Attribution (+3 more)

### Community 65 - "Risks and Roadmap"
Cohesion: 0.18
Nodes (8): Brand Campaign Event Weeks, Car Cosmetics, 3D City Drive (three.js), Business Center (store owners), Play From Home, Real Places from OpenStreetMap, Social Network, Test Mode (no GPS, teleport)

### Community 66 - "Game Layer Concepts"
Cohesion: 0.22
Nodes (9): Campaign and Daily Quests, Deeper RTS (counters, veterancy, research, General's Powers), Deterministic Spawns, Field Armies / Real-time Squads, FPS Base Breach, Outposts (territory), Raider Waves, RPG Hero System (classes, attributes, gear) (+1 more)

### Community 68 - "Promo Ad Concepts"
Cohesion: 0.36
Nodes (10): StreetQuest Ad Image, Browser-Based, No Download, From Home Mode (No Walking Needed), GPS Location-Based Gameplay, Neon Dark Visual Style, Play Free CTA, Reward System, StreetQuest Brand (+2 more)

### Community 71 - "Anti-cheat (trusted server position)"
Cohesion: 0.25
Nodes (6): Anti-cheat (trusted server position), C4 Planting (hold to plant), GPS Games (Treasure Hunt, Street Sprint, Checkpoint Rally), Live Layer (polling presence/sync/chat), Street Combat, Tower Defense on Real Map

### Community 72 - "Payments in Iran (Tapsell / Yektanet)"
Cohesion: 0.33
Nodes (6): Local Payment Gateway (Zarinpal / IDPay / Pay.ir), Rewarded Video Ads, Sponsor Spots (direct brand), Google AdSense H5 Games Ads, Store & Sponsor Spots, Stripe Checkout over REST

### Community 73 - "Apple Touch Icon (180px)"
Cohesion: 0.38
Nodes (7): Apple Touch Icon (180px), Notification Badge Icon (96px), Favicon (64px), PWA Icon (192px), PWA Icon (512px), Maskable PWA Icon (512px), StreetQuest Brand Mark (Yellow Map Pin with Pink Star)

### Community 74 - "react-leaflet"
Cohesion: 0.38
Nodes (6): react-leaflet, AdminDropMap(), Clicks(), P, Recenter(), AdminDropMap

### Community 75 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 76 - "health/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), short(), turnConfigured()

### Community 77 - "sw.js/route.ts"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 80 - "ads.txt/route.ts"
Cohesion: 0.67
Nodes (3): dynamic, GET(), adsTxt()

### Community 81 - "parse()"
Cohesion: 0.50
Nodes (4): parse(), pluralOf(), render(), translate()

## Ambiguous Edges - Review These
- `Fort Marker (Fort Test 1)` → `Player Location Marker`  [AMBIGUOUS]
  public/screens/map.jpg · relation: conceptually_related_to
- `Collectible Item Markers (gem, toolbox, donut, star, flag)` → `Yellow Zone / Area-of-Effect Circle`  [AMBIGUOUS]
  public/screens/map.jpg · relation: conceptually_related_to
- `Mood / Energy Indicator` → `Player HUD (Avatar, Name, Rank, Level, XP Bar)`  [AMBIGUOUS]
  public/screens/goals.jpg · relation: conceptually_related_to
- `From Home Mode (No Walking Needed)` → `Reward System`  [AMBIGUOUS]
  public/media/streetquest-ad.jpg · relation: conceptually_related_to
- `StreetQuest Brand Mark (Yellow Map Pin with Pink Star)` → `Notification Badge Icon (96px)`  [AMBIGUOUS]
  public/icons/badge-96.png · relation: references

## Knowledge Gaps
- **49 isolated node(s):** `Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero)`, `Mission Countdown Timer (29:52)`, `Currency Display (Coins 1,950 / Gems 25 with + purchase)`, `Mood/Energy Meter`, `Fort Marker (Fort Test 1)` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 638 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Dialogs and Business UI` to `Landing and Art Preview`, `Admin and Calls API`, `Deliveries API`, `Database Seed`, `Admin 3D Stores API`, `Auth and Announcements`, `Drive HUD and Jobs`, `Cash-out and Geo Utils`, `Game Shell`, `Music Engine`, `Party Courses`, `Video Calls`, `Daily, Hero and Me API`, `Player Shops API`, `Business API`, `Buttons and Dialogs`, `Admin Panel`, `2D Game Map`, `Drive Landmarks`, `Market and Party HUD`, `GPS Story Games`, `City Tiles API`, `Video Ads`, `Store and Ads API`, `Social and Leaderboard`, `App Layout and Fonts`, `Error Boundaries and i18n`, `Art Kit and Empire`, `Garage and Controls`, `Cron and Rides`, `API Client Types`, `Event Pages`, `Drive Touch Pad`, `Lotteries`, `Cooperative Goals`, `Graphics Settings`, `parse()`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Are the 41 inferred relationships involving `Drive()` (e.g. with `.cutsFor()` and `.dispose()`) actually correct?**
  _`Drive()` has 41 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero)`, `Mission Countdown Timer (29:52)`, `Currency Display (Coins 1,950 / Gems 25 with + purchase)` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Landing and Art Preview` be split into smaller, more focused modules?**
  _Cohesion score 0.07199625993454885 - nodes in this community are weakly interconnected._
- **Why does `@playwright/test` connect `E2E API Specs` to `Package Metadata`, `render.mjs`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Fort Marker (Fort Test 1)` and `Player Location Marker`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Collectible Item Markers (gem, toolbox, donut, star, flag)` and `Yellow Zone / Area-of-Effect Circle`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._