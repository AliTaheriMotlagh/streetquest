# StreetQuest — real-world GPS war game

Three games stacked on one real-world map:

- **Strategy (Generals: Zero Hour style)** — pick a faction, plant a base where you stand, build power /
  supply / barracks / factory / airfield / turrets on real timers, train an army, capture oil derricks
  and siege rival bases. Battles are auto-resolved.
- **Life sim (The Sims style)** — your commander has Hunger, Energy, Social and Fun that drain in real time.
  Eat food you find, sleep at your base, hang out with nearby players or check in at real cafés, bars and parks.
  Time alone never drags a need below a floor, and a long break counts as a night's sleep, so coming back
  never means a miserable commander. Mood scales XP, combat HP and Street Empire income (all tunable in
  Admin → Game settings → Life sim).
- **FPS (Counter-Strike / CoD style)** — walk within 200 m of an enemy base while other players are online and
  you can *breach* it: a live first-person match (capture the zone or wipe the defenders + garrison bots,
  no respawns). World **bosses** roam the map with shared HP — raid them in first person or bombard them.

- **RPG** — your commander is a hero: pick a class (Vanguard, Marksman, Engineer, Quartermaster, Warlord),
  spend attribute points (STR/AGI/INT/CHA) each level, and loot gear (weapon/armor/gadget, 4 rarities, random
  affixes). The equipped weapon is your FPS gun (rifle, SMG, marksman rifle, LMG). Salvage gear for 🔩 scrap,
  forge it higher. A 13-chapter campaign plus 3 daily quests guide you through every system.
- **Deeper RTS** — unit counters (infantry / vehicle / air), Generals-style veterancy (Veteran → Elite →
  Heroic), a research tree paid in coins + scrap, General's Powers bought with Command Points (Supply Drop,
  Spy Drone, Paradrop, Artillery Barrage, Battle Cry…), and permanent **outposts** on the real map:
  capture them, garrison troops, collect tribute, fight the faction war.
- **Clash of Clans rules** — sieges score ★★★ by destruction %, loot scales with destruction, trophies and
  leagues (Bronze → Legend, league bonus loot), Army Camps cap housing space, Builder's Huts add
  concurrent builders, the Vault protects coins, Walls add HP, 💎 gems rush any timer, attacking breaks
  your shield, and you can take revenge from your battle reports.

- **Tower defense on the real map** — build towers where you stand inside your territory (🔫 MG Nest, 🎯 Sniper,
  💣 Cannon, 🚀 SAM, ⚡ Tesla). Their range rings are on everyone's map and they **shoot rival commanders** who walk in:
  you have street HP, get downed (lose some coins to the tower owner, 3 min recovery), and rookies below level 3
  are spared. Fight back by running in and planting C4 (hold to plant — closer means a bigger blast) or by marching a squad at it.
  **Raider waves** march on bases (HQ 2+) every hour or two — or provoke one for ×1.5 bounties. Towers, guard squads
  and base turrets (yours and your crew's) shoot them live on the map; commanders near the base call in ✈️ airstrikes;
  leakers steal coins.
- **Real-time strategy on the map** — deploy squads from your base. They march at unit speed (everyone sees them,
  enemy composition is fogged without Radar), guard a spot (shoot rival commanders, defend against raiders,
  reinforce nearby bases/outposts), or attack an enemy tower, squad, base or outpost. Redirect or recall them
  mid-march. Base buildings are drawn around every base so you can scout rivals.
- **Street Empire (idle tycoon)** — an AdVenture Capitalist-style idle game in 🎮 Play: 11 street businesses (hot dog cart →
  spaceport), tap to run a cycle or hire a manager to automate it, count milestones (speed ×2), cash upgrades, offline
  earnings (vault upgrades), fame stars (prestige, +2% each), empire ranks that pay coins and gems in the main game, and
  dividends every 4 h. 🔋 Power cells on the map double income for 30 min (stack to 4 h).
- **Every step counts** — a phone pedometer (accelerometer peaks gated by a walking rhythm, so shaking doesn't count)
  reports steps while the game is open; GPS distance on foot fills in when the sensor can't. Steps today boost empire
  income up to ×2 at 10,000; banked steps buy instant Step Rushes; step quests, milestones and a weekly world goal.
  The server caps every report by a believable cadence. (A web page can't count while it's closed — a native wrapper
  with HealthKit / Health Connect would be needed for that.)
- **Chests open on the spot** (with a celebration) and **C4** is planted by holding a button — the closer you dare to
  stand to the tower, the bigger the blast (decided by the server from your position).
- **Squad runs** — start a run solo, as a 🏎️ race (podium pays +50% / +25%) or a 🤝 co-op run (+20% per teammate);
  squadmates' live positions show on the map. Crew **pings** (⚔️ attack / 🆘 help / 🚩 rally / 💰 loot) coordinate it all.

- **Street combat** — shoot rival commanders, enemy towers and squads within 60 m (headshots, cooldown, hero
  damage bonus). Downing someone takes coins and trophies. Rookies (< level 3) can't fight or be shot.
- **Superweapons** (Generals: Zero Hour) — Dragon ☢️ Nuclear Missile, Coalition 🔆 Particle Cannon, Insurgency 🚀
  SCUD Storm. Built at HQ 4, charge for hours, hit anywhere within 5 km. Everyone near the target sees a public
  countdown and can run; SAM sites intercept missiles; the blast hits towers, squads, bases, garrisons and
  commanders; nukes and SCUDs leave radiation/toxins that keep hurting anyone who walks in.
- **King of the hill flags** — plant a flag on a real spot; it pays while you hold it. Rivals capture it by
  standing on it for 60 s while none of your crew is there.
- **Bounties** — put coins on a rival's head; whoever downs them (gun, tower, superweapon) collects.
- **Photo & text posts** pinned to places — only visible to players who walk there; likes pay XP, reports hide abuse.
- **3D art kit** — every emoji in the game (UI, server messages, translations, map markers) is drawn as a glossy,
  outlined, top-lit vector icon with idle animations (`src/components/art`); preview them all with
  `npx tsx scripts/art-preview.ts art.html`.
- **Polish** — synthesized sound effects (Web Audio, no files; mute button), 3D game-feel animations, in-app
  dialogs instead of browser pop-ups, iPhone (notch/landscape) and iPad (side panels) layouts, achievements
  for every system.

- **Story missions** — an 8-chapter campaign played on real streets: waypoints are placed around wherever you
  are, with *go* (reach a marker), *find* (hidden spot, hot/cold detector only) and *hold* (stay in a zone) steps.
- **GPS games** — 🧭 Treasure Hunt (hot/cold, the spot never leaves the server), 🏃 Street Sprint (distance on
  foot; driving doesn't count) and 🏁 Checkpoint Rally.
- **Goals** — a weekly 🌍 world operation everyone works on together, a weekly faction goal (with a live faction
  race) and permanent personal milestones with tiers. Everyone who contributed claims the shared rewards.
- **Store & sponsor spots** — gem packs via Stripe Checkout, coin offers / instant heal / energy drink / base
  shield paid in gems, and rewarded sponsor spots (timed server-side, daily cap, views and clicks per sponsor).
- **Live game settings** — Admin → Game settings edits every tunable (reach radius, rewards, multipliers, timers,
  ranges, goals, gem packs, ads…) and Admin → Game data edits unit/building/tower/item/research stats. Changes go
  live within ~15 s, no redeploy.

Every layer feeds the others: hero bonuses change battle maths, build times, income and FPS stats;
mood scales XP; loot funds research; territory funds the army.

- **Real places** — restaurants, cafés, shops, pharmacies, gyms and parks come from OpenStreetMap, with their real
  names. Jobs happen *at* them: a 🍔 burger delivery starts at a real burger joint and ends at another real place, a ☕
  check-in is at a real café, and food spawns sit on real restaurants instead of random street corners.
- **3D city & play from home** — tap 🚗 DRIVE to drive a cartoon car through your real streets in 3D (real building
  footprints and heights, roads, parks, water and store signs, storybook toon style with day/night). From home or in
  test mode the car *is* your commander: where you drive is where you are, jobs are beacons of light, loot is collected by
  driving through it. Walking with GPS, the car follows you. Cells without map data yet are drawn as a fantasy village.
- **Street Arena (GTA Online meets Counter-Strike, on your real streets)** — in the 3D city, everyone driving or walking
  nearby shows up live (20 updates a second over WebSockets). Press **F** / 🚶 to get out of the car and walk as a 3D
  soldier (third-person over the shoulder, or first-person with the gun in hand). In the open city fighting is opt-in:
  everyone starts in 🕊️ passive mode, fighting unlocks at level 3, and you can't drop back to passive mid-fight. Or start a
  **match** on the streets around you (Menu → Street Arena): 💀 Deathmatch, ⚔️ Team Deathmatch or 💣 Bomb Defusal (plant at
  site A or B, defuse, rounds, side swap), small / medium / large arena, with up to 10 bots (easy / normal / hard) so it's
  fun with one friend or none. Five guns (pistol, SMG, rifle, sniper with a scope, shotgun), aim down sights, recoil,
  headshots, kill feed, scoreboard. Phones get a shooter layout (floating stick, drag to aim, fire buttons on both sides,
  aim assist and optional auto-fire); desktop uses mouse look and WASD. Matches pay XP and coins (12 paid matches a day).
- **Fantasy map** — the 2D map is an illustrated parchment map (paper grain, drifting cloud shadows, compass rose, colours
  of the hour). ⋯ → Map style picks any of 17 looks: fantasy, street, night ops, satellite (with or without place names),
  terrain, topographic, light, midnight, voyager, city streets, humanitarian, cycling, retro, noir, blueprint and neon
  (`src/components/game/mapStyles.ts`; every provider there works without a key, and the service worker keeps their
  tiles for offline).
- **Social network** — 🌐 Social: a feed (following / nearby / trending), posts with photos, check-ins at real places,
  follows, likes, comments, reports, profiles; deliveries and store visits post themselves. Mutual followers can DM
  and call. Crew chat lives inside Social.
- **Business center** — real store owners claim their place from inside the store, post missions (check-in for coins)
  and coupons (a code the cashier redeems at the till), and see visits, redemptions and repeat customers. Plans:
  Free / Starter / Pro / Chain (Stripe), with a free trial. See `marketing/BUSINESS_PLAN.md` for the monetisation plan.
- **Real menus & prices** — every store card (real places, businesses, Market shops) shows the store's real menu or
  catalog from Snappfood (restaurants, cafés, bakeries, supermarkets — matched by name within ~120 m, from the
  area's vendor list or else Snappfood's own search) and, for non-food stores, its own Torob shop (found by exact
  name or the owner's torob.com/shop link) with that shop's catalog and a search inside it or across all of Torob.
  Off by default on the map: ⋯ → 🍽️ *Menus on the map* puts Snappfood
  vendors on the map, filtered by kind; tap one for its menu. Owners can paste their Snappfood / Torob / Divar links
  in the Business center or their Market shop, which beat the automatic match. (Divar ads near a location aren't
  shown: Divar's API refuses automated access and its Kenar platform has no public search.)

Plus the original layer: Pokémon-GO-style spawns, GTA-style timed runs, real package deliveries,
location messages, friends/chat/events, an admin panel and SEO/marketing tooling.

## Run locally

```bash
npm install
docker compose up -d        # local Postgres
cp .env.example .env        # defaults match docker-compose
npx prisma db push          # create tables
npm run db:seed             # demo data (SEED_LAT=.. SEED_LNG=.. to seed near you)
npm run city:pack -- tehran # street detail and real places (optional, ~20 s per country)
npm run dev                 # http://localhost:3000
```

**No login:** opening `/play` creates a guest commander automatically (saved in a 1-year cookie);
players can rename their callsign in Profile. To become admin, set `ADMIN_KEY` and open
`/admin?key=<ADMIN_KEY>` once in a browser that has played.

**Test mode (no walking needed):** anyone can tap 🕹️ (or "Test mode — no GPS" when location is off).
Then tap the map to move, and every "Get closer" button becomes **Teleport here**. It's remembered in the
browser until you switch it off. Set `TEST_MODE=off` in production to limit it to admins once the game is live.

**Faster timers for testing:** `GAME_SPEED=600 npm run dev` makes construction and training 600× faster
(ignored in production). Jump straight into a live fight with `/play?match=<id>`.

**Street Arena (live multiplayer):** run the realtime server next to the app and point the app at it:

```bash
npm run rt                                          # ws://localhost:8787 (uses AUTH_SECRET from .env)
NEXT_PUBLIC_RT_URL=ws://localhost:8787 npm run dev  # or put NEXT_PUBLIC_RT_URL in .env
npm run rt:smoke                                    # two scripted players: open-city fight, then a match with bots
npm run rt:sim -- bomb                              # a whole match of bots in simulated time (tdm | ffa | bomb)
```

Without `NEXT_PUBLIC_RT_URL` the 3D city still works (driving, walking, other drivers over HTTP) but there's no
fighting. The soldier and gun models are generated in Blender from `assets/blender/arena.py`: `npm run assets:arena`
rebuilds `public/models/arena/*.glb` (add `-- preview.png` to render a preview).

**End-to-end tests (Playwright):** `npm run test:e2e` starts its own dev server on port 3200 against a separate
`streetquest_e2e` database (create it once: `docker compose exec db createdb -U postgres streetquest_e2e`; override with
`E2E_DATABASE_URL`) and runs two suites:
- `npm run test:e2e:api` — server behaviour: accounts, bans, referrals, admin access, the economy (daily, store, ads,
  selling), base building, claims, lobbies, runs, play-from-home travel, SEO/health/security headers — including
  double-tap races (two identical requests at once must never charge or pay twice).
- `npm run test:e2e:ui` — the game in a phone-sized Chrome: first visit, GPS on/off, bottom nav, store, double-tap on
  buttons, the marker following GPS. Uses your installed Google Chrome (`PW_CHANNEL=chromium` for Playwright's own).

Older smoke scripts (need the dev server running, ideally with `GAME_SPEED=600`): `npm run test:smoke`,
`npm run test:features` (settings, army delivery, bag multi-sell, goals, store, ads, GPS games, story) and
`npm run test:mp` (lobbies, squad runs, towers shooting players, C4, squads, skirmishes, raider waves, pings).

**On your phone:** GPS only works on `https://` or `localhost`. Run `npm run tunnel` and open the
`https://….trycloudflare.com` link it prints.

## How it works

| Area | Where |
|---|---|
| Strategy rules: factions, buildings, power, units, auto-resolved battles (pure, shared client/server) | `src/lib/rts.ts`, `src/app/api/{base,battle}` |
| RPG: classes/attributes/bonus folding, gear rolls, quests, General's Powers (pure) | `src/lib/{hero,gear,quests,powers}.ts`, `src/server/{hero,quests}.ts`, `src/app/api/{hero,powers}` |
| Territory: deterministic outposts per ~900 m cell, only ownership + garrison stored | `src/lib/outposts.ts`, `src/app/api/outposts` |
| Life sim: needs decay computed from a stored snapshot + timestamp, so no background jobs; mood multiplies XP in `grant()` | `src/lib/sims.ts`, `src/server/needs.ts`, `src/app/api/sims` |
| World bosses: deterministic per ~1.3 km region and 2 h window like spawns; only damage is stored. The killing hit pays every contributor | `src/lib/bosses.ts`, `src/server/boss.ts` |
| FPS: the arena is generated from the match seed on every client. Clients POST position + hits ~7×/s; the server owns HP, kills, capture and the result. The first live human is the *host* and runs bot/boss AI; if it goes quiet the next player takes over | `src/lib/arena.ts`, `src/server/match.ts`, `src/components/fps/Fps.tsx` |
| Squad-run lobbies (race / co-op): one lobby per run spawn, state advances whenever a member polls (~1×/s) | `src/lib/lobbies.ts`, `src/server/lobby.ts`, `src/app/api/lobby` |
| Street Empire: pure economy rules shared by client and server; the server settles the stored snapshot to "now" on every request (no background jobs), the client runs the same maths between syncs | `src/lib/idle.ts`, `src/server/empire.ts`, `src/app/api/empire`, `src/components/game/Empire.tsx` |
| Steps: accelerometer pedometer in the browser, batched reports capped by cadence per day, GPS-distance fallback in `/api/loc` | `src/components/game/steps.ts`, `src/lib/steps.ts`, `src/server/steps.ts`, `src/app/api/steps` |
| Art kit: icons as vector shapes + shared gradient materials, one lazily-filled SVG sprite; a MutationObserver swaps emoji text for art without touching React's text nodes | `src/components/art` |
| Tower defense: towers fire when a commander reports their position (`/api/loc` → `takeFire`), HP regenerates from a stored snapshot; raider waves are generated from a seed and fought by a deterministic simulation the server resolves once and clients animate | `src/lib/td.ts`, `src/server/td.ts`, `src/app/api/{towers,waves}` |
| Field armies: squad positions are interpolated from the march (from/to/depart/arrive), arrivals are settled lazily by whoever looks at the map; battles reuse the siege/outpost code with the squad as the attacking force | `src/server/{td,warfare}.ts`, `src/app/api/squads`, `src/components/game/LiveLayer.tsx` |
| Real places & 3D city: OpenStreetMap (Overpass) per ~450 m cell, cached in `CityTile` for a month, never waited on for long (the client draws a generated village meanwhile). `OVERPASS_URL` lists endpoints (`off` disables; admins can upload tiles with `POST /api/city`). Place jobs are deterministic per place and 30-min window, rebuilt from their id to verify | `src/lib/{city,places}.ts`, `src/server/{city,places}.ts`, `/api/{city,places}` |
| Store menus & prices: Snappfood (vendor list per ~1 km cell, 3 pages, 12 h; name search 12 h, top 3 hits checked by position; menus 6 h) and Torob (search, shop by name / id, a shop's catalog via `shop_id`, 12 h) cached in `ExtCache`, one fetch per key at a time, stale copy on failure. Neither has an official API — `SNAPPFOOD_URL` / `TOROB_URL` (`off` disables), admin switch *Menus & prices from Snappfood and Torob* | `src/lib/localData.ts`, `src/server/localData.ts`, `/api/local`, `src/components/game/StoreInfo.tsx` |
| 3D drive: three.js, one merged mesh set per tile (toon walls with lit windows, roofs, roads, parks, instanced trees), arcade car physics with building collisions, tiles streamed around the car; the car's position feeds play-from-home travel (server cap `driveSpeedKmh`) | `src/components/drive` |
| Street Arena: a separate Node WebSocket server (`realtime/`) holds everyone in memory — no database. The app signs a 10-min ticket (`/api/rt/ticket`: who you are, friends, virtual or real GPS); results come back HMAC-signed (`/api/rt/result`, paid once per match, daily cap). Binary state 20×/s each way, positions in each client's own local metres, interest management (600 m, same privacy rules as the HTTP presence). Hits: the client draws them at once, the server referees with lag compensation (targets rewound ≤ 350 ms), fire-rate/ammo/range checks and, in matches, line of sight through the real buildings (the host's client sends the arena's streets and footprints). Bots walk a street graph built from the same map | `realtime/`, `src/lib/arena`, `src/components/arena`, `/api/rt` |
| Social: posts/follows/likes/comments; game-made posts store a translatable template so each reader sees their language; photos at `/post-img/<id>` | `src/server/social.ts`, `/api/social`, `src/components/game/Social.tsx` |
| Businesses: claim on the spot (≤150 m), campaigns limited by plan, check-in ≤80 m, 6-char coupon codes redeemed once by the owner; plans paid through the same Stripe Checkout + webhook as gems (`biz:<plan>:<id>` purchases) | `src/lib/business.ts`, `src/server/business.ts`, `/api/business`, `src/components/game/Business.tsx` |
| Spawns: deterministic per ~450 m cell and 20-min window, so everyone sees the same world with zero storage; the server rebuilds a spawn from its id to verify claims | `src/lib/spawns.ts` |
| Time of day: local *solar* time decides night/dawn/day/dusk items and golden-hour 2× XP anywhere on Earth; daily streaks reset at the player's own midnight | `src/lib/geo.ts`, `src/lib/progression.ts` |
| Anti-cheat: claims use the server's trusted position, GPS jumps faster than 250 km/h are rejected | `src/app/api/loc`, `src/server/rewards.ts` |
| Live layer (serverless-friendly): position + presence via `/api/loc`, notifications + unread via `/api/sync` (polled every 4 s), chat polled every 3 s. "Online" = pinged in the last 90 s | `src/server/hub.ts`, `src/app/api/{loc,sync,chat}` |
| Deliveries: coins in escrow → courier accepts → GPS check-in at pickup → handover code at drop-off | `src/app/api/deliveries` |
| Live settings: every tunable has a default in `lib/settings.ts`; admin overrides are stored in `GameConfig`, loaded per server instance (15 s cache) and sent to clients with `/api/me`; `applyConfig()` updates the rule constants and catalog stats in place on both sides | `src/lib/{settings,config}.ts`, `src/server/settings.ts` |
| Goals: game events (every `questEvent`) feed per-user, per-faction and world counters per week | `src/server/goals.ts`, `/api/goals` |
| GPS games & story: targets generated server-side around the trusted position; hidden spots never sent to the client | `src/lib/story.ts`, `src/server/gpsgames.ts`, `/api/gpsgame` |
| Store, sponsor spots: Stripe Checkout over REST (no SDK), credited once per session by webhook or on return | `src/server/{store,ads}.ts`, `/api/{store,ads}` |
| Admin: KPIs, 7-day funnel, players (ban/role/gift), sponsored mission drops, banners, live push, moderation, UTM link builder | `/admin` |
| SEO: SSR landing with VideoGame + FAQ JSON-LD, public event pages with Event JSON-LD, sitemap, robots, OG image, PWA manifest | `src/app` |
| Marketing: `?ref=` referrals (+150 coins each), UTM attribution stored when the guest account is created, first-party page-view/share tracking | `src/middleware.ts`, `/api/track` |

## Deploy

### Vercel
1. Push this repo to GitHub, then on vercel.com: **Add New → Project → import the repo**.
2. In the project: **Storage → Create Database → Neon (Postgres)** and connect it. That sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET` (`openssl rand -base64 32`),
   `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-app.vercel.app`) and `ADMIN_KEY` (any long secret).
4. **Deployments → Redeploy**. Every build runs `scripts/db-sync.mjs`, which creates/updates the tables
   (and fails the build with a clear message if no database is connected).
5. Open `https://your-app.vercel.app/api/health` — it says exactly what's missing if anything is wrong.

### Render
1. Push to GitHub, then on render.com: **New → Blueprint** and pick the repo. `render.yaml` creates
   the web service + Postgres and generates `AUTH_SECRET`.
2. Set `NEXT_PUBLIC_SITE_URL` to your `https://….onrender.com` URL when prompted.
3. The blueprint also creates `streetquest-realtime` (Street Arena). Set its `APP_URL` to the web app's URL and
   `RT_ORIGINS` to the same origin, and set the web app's `NEXT_PUBLIC_RT_URL` to `wss://<realtime-service>.onrender.com`,
   then redeploy the web app (NEXT_PUBLIC_ values are baked in at build time). It shares the web app's `AUTH_SECRET`.
4. Note: free web services sleep after 15 min idle (slow first load) — use a paid instance for the realtime server, or
   players wait for it to wake — and free Postgres expires after 30 days.

**On Vercel**, the app can't hold WebSockets: run `npm run rt` anywhere that can (Render, Fly.io, Railway, a VPS) with
`AUTH_SECRET` (same as the app), `APP_URL` and `RT_ORIGINS`, and set `NEXT_PUBLIC_RT_URL` on Vercel.

After the first deploy, play once, then open `/admin?key=<ADMIN_KEY>` to make yourself admin.
Don't run the demo seed in production.

## Production checklist

- **Installable app & offline:** `/sw.js` (service worker) caches the app, map tiles you've seen and your last game
  state, so the game opens offline. It also keeps the heavy files on the phone so a launch never downloads them again:
  fonts, the arena's 3D models and the 3D decoder (fetched in the background on install and every launch), and the
  3D city's street maps you've driven through (vector tiles a week, city-pack detail a day). The app asks the browser
  for persistent storage so Android doesn't clear it when space runs low. Every deploy gets a new version id, and
  players see "New version ready → Update".
- **Push notifications:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
  (`npx web-push generate-vapid-keys`). Every in-game notification is also pushed to the phone when the player isn't
  in the app; Admin → Campaigns → live push can send to everyone. iPhone needs the app added to the Home Screen
  (iOS 16.4+).

- **Real ads (Google AdSense):** sign up at adsense.google.com with your production domain, then apply for
  **H5 Games Ads** (AdSense → Ads → By site → H5 games). Set `ADSENSE_CLIENT="ca-pub-…"` and redeploy: `/ads.txt`
  is served automatically and the store's *Free gems* button plays a Google rewarded video first. Where Google has no
  ad (Iran and other sanctioned countries, ad blockers, frequency caps) players get your sponsor spot instead, so the
  button always works. `ADSENSE_TEST=on` shows Google's test ads while you try it. Admin → Game settings → Store & ads
  → *Google video ads on* switches it live; views are counted as "Google video ads" in Admin → Revenue.

- **City packs (3D street detail and real places):** `npm run city:pack:prod -- tehran karaj mashhad isfahan shiraz tabriz`
  reads production settings from `.env.prod` (a copy of `.env` with the production `DATABASE_URL` and
  `DATABASE_URL_UNPOOLED`; git-ignored — keep `.env` on your local database) and Geofabrik's daily Iran extract and stores every mapped tree, traffic
  light, crossing, bus stop, bench, fountain and sports pitch per cell (`CityDetail`), and every named restaurant, café,
  shop and park (`CityTile.pois`) — without it, places only arrive with an Overpass tile, which is often busy. `--top 3` builds the three places with the most
  active players (any country — the right extract is found automatically), `--list` shows what's built and where
  players are. Re-run weekly to pick up map edits.
- **Live traffic:** comes from players' real GPS (shown only where 2+ players drove in the last 15 min) and, with
  `NESHAN_API_KEY`, from Neshan's live routing where players are looking. The key needs the **Direction** service
  enabled in the Neshan panel — `/api/traffic` reports `"neshan": "no-access"` until it is.
  AI cars drive the real streets at those speeds and stop at the traffic lights, which run one 40 s cycle on the
  clock (north–south first) so every player sees the same lights.
- **Mountain skyline:** `/api/dem` proxies Terrarium elevation tiles (AWS open terrain data, cached for a month;
  `DEM_TILE_URL` to use another source) for the real mountains on the horizon — Alborz, Tochal and Damavand from
  Tehran. The streets themselves are still flat.
- `/api/health` must say `"ok": true`.
- Set `CRON_SECRET` on Vercel — `vercel.json` schedules `/api/cron/cleanup` daily (prunes old notifications,
  lobbies, pings, waves, matches and superweapon launches; refunds expired bounties).
- Use a **pooled** database URL for `DATABASE_URL` when you have one; on Vercel the app also caps each
  instance at 1 connection (`DB_CONNECTION_LIMIT`) so a direct URL doesn't run out of connections.
- `NEXT_PUBLIC_SITE_URL` falls back to Vercel's production domain, but set it if you use a custom domain.
- Security headers (HSTS, nosniff, frame, referrer, permissions) and `no-store` on the API are set in
  `next.config.ts`. Client crashes show a recover screen and are recorded as `client_error` metrics.

## Before going big

- Real places / 3D city: public Overpass servers are slow and rate-limited. Tiles are cached a month per cell, but at
  scale run your own Overpass and point `OVERPASS_URL` at it. City packs cover places in the packed cities meanwhile.
- Store menus: Snappfood and Torob are read through their unofficial web APIs, which can change or block servers
  outside Iran without notice — store cards then simply show no menu. Check `/api/local?near=1&lat=35.7&lng=51.4`
  from the production server after deploying.
- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia. It replaces the
  default street tiles (fantasy, street, night ops and the filtered looks); the satellite, terrain and CARTO styles
  use the free public servers of Esri, OpenTopoMap, CARTO and OSM France — fine for light use, check their terms
  before heavy traffic.
- Chat/notifications poll every few seconds. For instant delivery at scale, plug in a hosted
  realtime service (Ably, Pusher, Supabase Realtime) behind `notify()` and the chat route.
- Street Arena runs in one realtime process (in memory). One instance handles a few thousand players; past that,
  shard by region (each instance owns an area; route players with the ticket). Anti-cheat is server-refereed but
  movement is client-reported (speed-capped, no walking through buildings in matches), so it's casual-grade, not
  competitive: aim itself can't be verified. In the open city the server doesn't know the buildings, so shots
  there aren't checked for walls.
- Switch `prisma db push` in the build to `prisma migrate deploy` once you have real data.
