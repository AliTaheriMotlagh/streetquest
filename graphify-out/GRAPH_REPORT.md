# Graph Report - gps-game  (2026-10-08)

## Corpus Check
- 188 files · ~165,008 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .prisma 1)

## Summary
- 1599 nodes · 5357 edges · 69 communities (56 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.83)
- Token cost: 234,027 input · 0 output

## Community Hubs (Navigation)
- Smoke Tests and Geo Utils
- Minigames and Lobbies
- Next.js Pages and SEO
- Tower Defense Waves
- FPS Arena Matches
- Admin Config and Flags
- Story and GPS Games
- E2E API Specs
- Dialogs and Base Panel
- README Feature Concepts
- Base RTS Defense
- Battles and Powers
- Admin Panel UI
- Bounties and Deliveries API
- Play Page Shell
- Attacks and Daily Rewards
- Outposts and Squads
- Game Shell and HUD
- Auth and Sessions
- Store and Ads
- Music and SFX
- Buttons and Error Boundaries
- Chat Rooms and Flags
- PWA Client and Settings
- Map Rendering and LOD
- Core Smoke Test
- Claims and Location API
- API Client Types
- Gear and Affixes
- Hero Progression API
- Cron and Inventory API
- Superweapons
- Package Metadata
- Beacon Screen UI
- Live Player Map Layers
- Browser Detection
- TypeScript Config
- Achievements and Progression
- Nearby Players Reporting
- Location Tracker
- NPM Scripts
- Map Screen UI
- Goals Screen UI
- Daily Quests and Campaign
- GPS Fix Filter
- Sims Needs and Mood
- Towers and Superweapon API
- Player Layer and Guides
- Runtime Dependencies
- Dev Dependencies
- Location Reporter
- Promo Ad Concepts
- Nearby Store
- Database Seed
- Web Push
- PWA Icon Set
- Allowed Install Scripts
- Service Worker Route
- DB Prep Scripts
- Health Check
- Vercel Cron Config
- Store and Stripe Docs
- Package Deliveries Doc
- King of the Hill Doc
- Location Posts Doc
- Offline Cache Doc
- Squad Runs Doc
- Solar Time Doc

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 120 edges
2. `requireUser()` - 106 edges
3. `body()` - 81 edges
4. `distanceM()` - 79 edges
5. `prisma` - 72 edges
6. `Button()` - 63 edges
7. `grant` - 62 edges
8. `notify()` - 59 edges
9. `Game()` - 52 edges
10. `zod` - 42 edges

## Surprising Connections (you probably didn't know these)
- `Notification Badge Icon (96px)` --references--> `StreetQuest Brand Mark (Yellow Map Pin with Pink Star)`  [AMBIGUOUS]
  public/icons/badge-96.png → public/icons/icon-512.png
- `Render Web Service (streetquest)` --references--> `SEO (SSR landing, JSON-LD, sitemap, robots, PWA manifest)`  [INFERRED]
  render.yaml → README.md
- `Render Postgres (streetquest-db)` --semantically_similar_to--> `Neon Postgres (Vercel Storage)`  [INFERRED] [semantically similar]
  render.yaml → README.md
- `Local Postgres 16 Service (db)` --semantically_similar_to--> `Render Postgres (streetquest-db)`  [INFERRED] [semantically similar]
  docker-compose.yml → render.yaml
- `Maskable PWA Icon (512px)` --semantically_similar_to--> `Apple Touch Icon (180px)`  [INFERRED] [semantically similar]
  public/icons/maskable-512.png → public/icons/apple-touch-icon.png

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deterministic seeded world content (spawns, bosses, outposts, waves, lobbies, FPS arena)** — readme_deterministic_seeded_generation, readme_spawns, readme_world_bosses, readme_outposts, readme_raider_waves, readme_multiplayer_minigames, readme_fps_breach [INFERRED 0.95]
- **Lazy state evaluation without background jobs** — readme_lazy_snapshot_evaluation, readme_life_sim_layer, readme_tower_defense, readme_field_squads [INFERRED 0.85]
- **Interlocking game layers feeding each other** — readme_rpg_hero_system, readme_life_sim_layer, readme_strategy_layer, readme_fps_breach, readme_outposts [EXTRACTED 0.95]
- **PWA Web App Manifest Icon Set** — public_icons_icon_192_icon, public_icons_icon_512_icon, public_icons_maskable_512_icon [INFERRED 0.85]
- **StreetQuest Cross-Platform Icon Variants** — public_icons_apple_touch_icon_icon, public_icons_badge_96_icon, public_icons_favicon_64_icon, public_icons_icon_192_icon, public_icons_icon_512_icon, public_icons_maskable_512_icon [INFERRED 0.95]
- **Play Mode Choice (Walk vs From Home, reward tradeoff)** — public_media_streetquest_ad_walk_mode, public_media_streetquest_ad_from_home_mode, public_media_streetquest_ad_reward_system [INFERRED 0.85]
- **Low-Friction Onboarding Funnel** — public_media_streetquest_ad_play_free_cta, public_media_streetquest_ad_browser_no_download, public_media_streetquest_ad_from_home_mode [INFERRED 0.75]
- **Story beacon wayfinding: panel, distance, route line, beacon and player marker** — public_screens_beacon_story_panel, public_screens_beacon_distance_compass, public_screens_beacon_dashed_route, public_screens_beacon_gold_beacon, public_screens_beacon_player_marker [INFERRED 0.85]
- **Top HUD status cluster** — public_screens_beacon_player_hud, public_screens_beacon_energy_meter, public_screens_beacon_currency_display [INFERRED 0.85]
- **Cooperative Goal Card Pattern (countdown + progress + your part + shared reward)** — public_screens_goals_countdown_timer, public_screens_goals_progress_bar, public_screens_goals_personal_contribution, public_screens_goals_shared_reward [INFERRED 0.95]
- **Persistent Top HUD Overlay** — public_screens_goals_player_hud, public_screens_goals_mood_energy_indicator, public_screens_goals_currency_display [INFERRED 0.85]
- **Top HUD status cluster** — public_screens_map_player_profile_card, public_screens_map_mood_energy_meter, public_screens_map_currency_display, public_screens_map_quest_card [INFERRED 0.85]
- **GPS proximity collection loop** — public_screens_map_player_marker, public_screens_map_interaction_radius, public_screens_map_item_markers, public_screens_map_quest_card [INFERRED 0.75]

## Communities (69 total, 13 thin omitted)

### Community 0 - "Smoke Tests and Geo Utils"
Cohesion: 0.06
Nodes (63): A, ADMIN, call(), Client, collect, go(), H, here (+55 more)

### Community 1 - "Minigames and Lobbies"
Cohesion: 0.05
Nodes (64): A, arcade, atkNote, B, baseB, battleNote, bNotes, call() (+56 more)

### Community 2 - "Next.js Pages and SEO"
Cohesion: 0.05
Nodes (37): BUILD_ID, config, next, EventPage(), generateMetadata(), load(), Props, dynamic (+29 more)

### Community 3 - "Tower Defense Waves"
Cohesion: 0.05
Nodes (58): WorldWave, clientDefenders(), LiveWave, useLiveWaves(), ArmorClass, baseDefender(), buildWave(), Creep (+50 more)

### Community 4 - "FPS Arena Matches"
Cohesion: 0.06
Nodes (51): GET, n, POST, Schema, Actor, drawLabel(), Fps(), Hud (+43 more)

### Community 5 - "Admin Config and Flags"
Cohesion: 0.07
Nodes (49): Action, GET, applyConfig(), catalogOriginals(), CATALOGS, EDITABLE, Entry, snapshot() (+41 more)

### Community 6 - "Story and GPS Games"
Cohesion: 0.09
Nodes (45): GET, here(), POST, Schema, FIND_RADIUS_M, GPS_GAMES, GpsGameKind, heatOf() (+37 more)

### Community 7 - "E2E API Specs"
Cohesion: 0.09
Nodes (30): BaseView, commander(), Boss, findSpawn(), L, Loc, Near, Spawn (+22 more)

### Community 8 - "Dialogs and Base Panel"
Cohesion: 0.11
Nodes (41): askText(), Opts, queue, Req, BasePanel(), CLS_ICON, fmtLeft(), stars() (+33 more)

### Community 9 - "README Feature Concepts"
Cohesion: 0.07
Nodes (42): Local Postgres 16 Service (db), pgdata Volume, Admin Panel, GPS Anti-cheat (server trusted position, 250 km/h jump limit), Bounties, Campaign Chapters and Daily Quests, Clash of Clans Siege Rules (stars, trophies, leagues, shields), Daily Cron Cleanup (/api/cron/cleanup) (+34 more)

### Community 10 - "Base RTS Defense"
Cohesion: 0.10
Nodes (42): GET, POST, Schema, NO_BONUS, BASE_MIN_SPACING_M, baseDefense(), buildCost(), builderCount() (+34 more)

### Community 11 - "Battles and Powers"
Cohesion: 0.16
Nodes (35): POST, Schema, POST, Schema, resolveBoss(), toBonus(), armyStats(), BattleResult (+27 more)

### Community 12 - "Admin Panel UI"
Cohesion: 0.09
Nodes (31): AdminPage(), keyMatches(), metadata, ADMIN_NAV, AdminPanel(), Data, fmt(), MiniBars() (+23 more)

### Community 13 - "Bounties and Deliveries API"
Cohesion: 0.11
Nodes (28): GET, POST, Schema, GET, Point, POST, pub, Schema (+20 more)

### Community 14 - "Play Page Shell"
Cohesion: 0.09
Nodes (33): metadata, PlayPage(), viewport, AutoVideo(), Props, Fps, Game(), GameMap (+25 more)

### Community 15 - "Attacks and Daily Rewards"
Cohesion: 0.16
Nodes (25): casualties(), POST, Schema, POST, POST, Schema, POST, Schema (+17 more)

### Community 16 - "Outposts and Squads"
Cohesion: 0.12
Nodes (30): count(), GET, POST, Schema, checkHostile(), GET, locate(), POST (+22 more)

### Community 17 - "Game Shell and HUD"
Cohesion: 0.11
Nodes (28): LatLng, Me, World, creepPosOrNull(), NAV, PHASE_ICON, WaveBanner(), HELP (+20 more)

### Community 18 - "Auth and Sessions"
Cohesion: 0.14
Nodes (24): jose, zod, POST, POST, Schema, POST, POST, Schema (+16 more)

### Community 19 - "Store and Ads"
Cohesion: 0.14
Nodes (25): POST, POST, Schema, GET, POST, Schema, spendGems(), POST() (+17 more)

### Community 20 - "Music and SFX"
Cohesion: 0.12
Nodes (28): duckMusic(), graph(), listeners, midi(), Mood, musicOn(), musicVolume(), onMusicChange() (+20 more)

### Community 21 - "Buttons and Error Boundaries"
Cohesion: 0.16
Nodes (24): react, Button(), isThenable(), Props, askConfirm(), LobbyView, GearTab(), HeroTab() (+16 more)

### Community 22 - "Chat Rooms and Flags"
Cohesion: 0.14
Nodes (20): GET, POST, Send, defendersAt(), GET, POST, Schema, GET (+12 more)

### Community 23 - "PWA Client and Settings"
Cohesion: 0.15
Nodes (25): AppSettings(), AVATARS, DeliveryRoute(), Friend, GoTo(), Msg, MyDeliveries, navUrl() (+17 more)

### Community 24 - "Map Rendering and LOD"
Cohesion: 0.13
Nodes (24): GpsView, WorldDelivery, WorldNote, WorldSpawn, Clutter, clutterEmoji(), clutterRank(), Layers() (+16 more)

### Community 25 - "Core Smoke Test"
Cohesion: 0.09
Nodes (22): A, ADMIN, B, bPos, C, call(), campQ, chest (+14 more)

### Community 26 - "Claims and Location API"
Cohesion: 0.18
Nodes (21): POST, recordClaim(), Schema, POST, Schema, POST, Schema, atBase() (+13 more)

### Community 27 - "API Client Types"
Cohesion: 0.08
Nodes (23): BaseView, ensureGuest(), HeroView, League, WorldBase, WorldBoss, WorldEvent, WorldFlag (+15 more)

### Community 28 - "Gear and Affixes"
Cohesion: 0.12
Nodes (22): Affix, AFFIX_BY_KEY, AFFIXES, affixValue(), GEAR_BASE_BY_KEY, GEAR_BASES, GearBase, GearItem (+14 more)

### Community 29 - "Hero Progression API"
Cohesion: 0.11
Nodes (21): Attr, POST, Schema, state(), forgeCost(), MAX_GEAR_LEVEL, SALVAGE_SCRAP, ATTR_BASE (+13 more)

### Community 30 - "Cron and Inventory API"
Cohesion: 0.15
Nodes (16): GET, days(), dynamic, GET, POST, price(), Schema, ITEM_BY_KEY (+8 more)

### Community 31 - "Superweapons"
Cohesion: 0.19
Nodes (19): chargeMs(), falloff(), INTERCEPT_MAX, INTERCEPT_PER_SAM, INTERCEPT_RANGE_M, levelPower(), SUPER_BY_FACTION, SUPER_MAX_LEVEL (+11 more)

### Community 32 - "Package Metadata"
Cohesion: 0.10
Nodes (19): engines, node, name, private, type, version, prisma, react-dom (+11 more)

### Community 33 - "Beacon Screen UI"
Cohesion: 0.13
Nodes (20): Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero), Mission Countdown Timer (29:52), Currency Display (Coins 1,950 / Gems 25 with + purchase), Dark Leaflet/OpenStreetMap Base Map, Dashed Guidance Line to Beacon, Distance and Direction Indicator (148 m N to gold beacon), Mood/Energy Meter, Fort Marker (Fort Test 1) (+12 more)

### Community 34 - "Live Player Map Layers"
Cohesion: 0.18
Nodes (16): leaflet, react-leaflet, Selected, WorldPlayer, LiveLayer(), squadColor(), esc(), icon() (+8 more)

### Community 35 - "Browser Detection"
Cohesion: 0.19
Nodes (16): browserInfo, browserLabel(), BrowserName, IN_APP, LABEL, locationSteps(), openInBrowserUrl(), Os (+8 more)

### Community 36 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 37 - "Achievements and Progression"
Cohesion: 0.22
Nodes (16): GET, GET, attrPointsFree(), commandPoints(), ACHIEVEMENT_BY_KEY, AchievementDef, ACHIEVEMENTS, DAILY_REWARD() (+8 more)

### Community 38 - "Nearby Players Reporting"
Cohesion: 0.17
Nodes (12): Listener, nearby, NearPlayer, NearReport, Sample, FireReport, Sent, GeoError (+4 more)

### Community 40 - "NPM Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, db:push, db:seed, dev, postinstall, start, test:e2e (+8 more)

### Community 41 - "Map Screen UI"
Cohesion: 0.17
Nodes (16): Bottom Navigation Bar (Nearby, Base, Play, Jobs, Crew, Hero), Currency Display (Coins 1,950 / Gems 25 with + purchase), Dark Leaflet/OpenStreetMap Basemap (London Bridge), Day/Night Theme Toggle, Floating Glassy HUD Overlay Layout, Fort Marker (Fort Test 1), Interaction / Reach Radius Rings (purple solid + cyan dashed), Collectible Item Markers (gem, toolbox, donut, star, flag) (+8 more)

### Community 42 - "Goals Screen UI"
Cohesion: 0.21
Nodes (15): Goal Countdown (ends in 4d 10h), Currency Display (Coins 1,950 / Gems 25 + buy), Dark Map Background (London), Faction Goal Card (Total War), Faction Standing Row (Coalition: 3), Map Cash Pickup Marker, Mood / Energy Indicator, Your Part (Personal Contribution) (+7 more)

### Community 43 - "Daily Quests and Campaign"
Cohesion: 0.24
Nodes (13): Rarity, dayKey(), CAMPAIGN, campaignKey(), DAILY_POOL, dailyQuests(), QuestDef, QuestKind (+5 more)

### Community 44 - "GPS Fix Filter"
Cohesion: 0.25
Nodes (10): Axis, dist(), Fix, FixFilter, measurePos(), measureVel(), predict(), rad() (+2 more)

### Community 45 - "Sims Needs and Mood"
Cohesion: 0.21
Nodes (12): addNeeds(), AT_BASE_M, clamp(), currentNeeds(), MESS_HALL_COST, Mood, NeedKey, NEEDS (+4 more)

### Community 46 - "Towers and Superweapon API"
Cohesion: 0.23
Nodes (11): GET, POST, Schema, GET, POST, Schema, spendScrap(), maxTowers() (+3 more)

### Community 47 - "Player Layer and Guides"
Cohesion: 0.22
Nodes (11): Clicks(), FrameTarget(), GameMap(), guidesFor(), Anim, Guide, guideKey(), PlayerLayer() (+3 more)

### Community 48 - "Runtime Dependencies"
Cohesion: 0.17
Nodes (12): dependencies, bcryptjs, jose, leaflet, next, @prisma/client, react, react-dom (+4 more)

### Community 49 - "Dev Dependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @playwright/test, prisma, tsx, @types/bcryptjs, @types/leaflet, @types/node, @types/react (+4 more)

### Community 51 - "Promo Ad Concepts"
Cohesion: 0.36
Nodes (10): StreetQuest Ad Image, Browser-Based, No Download, From Home Mode (No Walking Needed), GPS Location-Based Gameplay, Neon Dark Visual Style, Play Free CTA, Reward System, StreetQuest Brand (+2 more)

### Community 53 - "Database Seed"
Cohesion: 0.25
Nodes (6): lat, lng, prisma, start, bcryptjs, @prisma/client

### Community 54 - "Web Push"
Cohesion: 0.43
Nodes (6): GET, POST, Schema, PushPayload, pushPublicKey(), pushTo()

### Community 55 - "PWA Icon Set"
Cohesion: 0.38
Nodes (7): Apple Touch Icon (180px), Notification Badge Icon (96px), Favicon (64px), PWA Icon (192px), PWA Icon (512px), Maskable PWA Icon (512px), StreetQuest Brand Mark (Yellow Map Pin with Pink Star)

### Community 56 - "Allowed Install Scripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@6.19.3, @prisma/client@6.19.3, @prisma/engines@6.19.3

### Community 57 - "Service Worker Route"
Cohesion: 0.40
Nodes (3): dynamic, SW, TILE_HOSTS

### Community 59 - "Health Check"
Cohesion: 0.67
Nodes (3): dynamic, GET(), short()

## Ambiguous Edges - Review These
- `StreetQuest Brand Mark (Yellow Map Pin with Pink Star)` → `Notification Badge Icon (96px)`  [AMBIGUOUS]
  public/icons/badge-96.png · relation: references
- `From Home Mode (No Walking Needed)` → `Reward System`  [AMBIGUOUS]
  public/media/streetquest-ad.jpg · relation: conceptually_related_to
- `Player HUD (Avatar, Name, Rank, Level, XP Bar)` → `Mood / Energy Indicator`  [AMBIGUOUS]
  public/screens/goals.jpg · relation: conceptually_related_to
- `Player Location Marker` → `Fort Marker (Fort Test 1)`  [AMBIGUOUS]
  public/screens/map.jpg · relation: conceptually_related_to
- `Collectible Item Markers (gem, toolbox, donut, star, flag)` → `Yellow Zone / Area-of-Effect Circle`  [AMBIGUOUS]
  public/screens/map.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **446 isolated node(s):** `BaseView`, `Spawn`, `World`, `L`, `Near` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 488 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `StreetQuest Brand Mark (Yellow Map Pin with Pink Star)` and `Notification Badge Icon (96px)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `react` connect `Buttons and Error Boundaries` to `Package Metadata`, `Minigames and Lobbies`, `Next.js Pages and SEO`, `Live Player Map Layers`, `FPS Arena Matches`, `Browser Detection`, `Nearby Players Reporting`, `Tower Defense Waves`, `Dialogs and Base Panel`, `Admin Panel UI`, `Play Page Shell`, `Player Layer and Guides`, `Game Shell and HUD`, `PWA Client and Settings`, `Map Rendering and LOD`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `BaseView`, `Spawn`, `World` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Smoke Tests and Geo Utils` be split into smaller, more focused modules?**
  _Cohesion score 0.05517503805175038 - nodes in this community are weakly interconnected._
- **What is the exact relationship between `From Home Mode (No Walking Needed)` and `Reward System`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `next` connect `Next.js Pages and SEO` to `Package Metadata`, `Admin Panel UI`, `Play Page Shell`, `Game Shell and HUD`, `Auth and Sessions`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `Minigames and Lobbies` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._