# StreetQuest — real-world GPS war game

Three games stacked on one real-world map:

- **Strategy (Generals: Zero Hour style)** — pick a faction, plant a base where you stand, build power /
  supply / barracks / factory / airfield / turrets on real timers, train an army, capture oil derricks
  and siege rival bases. Battles are auto-resolved.
- **Life sim (The Sims style)** — your commander has Hunger, Energy, Social and Fun that drain in real time.
  Eat food you find, sleep at your base, hang out with nearby players. Mood scales XP and combat HP.
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
  are spared. Fight back by running in and wiring C4 (a Bomb Defuse mini-game) or by marching a squad at it.
  **Raider waves** march on bases (HQ 2+) every hour or two — or provoke one for ×1.5 bounties. Towers, guard squads
  and base turrets (yours and your crew's) shoot them live on the map; commanders near the base call in ✈️ airstrikes;
  leakers steal coins.
- **Real-time strategy on the map** — deploy squads from your base. They march at unit speed (everyone sees them,
  enemy composition is fogged without Radar), guard a spot (shoot rival commanders, defend against raiders,
  reinforce nearby bases/outposts), or attack an enemy tower, squad, base or outpost. Redirect or recall them
  mid-march. Base buildings are drawn around every base so you can scout rivals.
- **Multiplayer mini-games** — arcades are a 🎯 Shooting Range (hostiles in windows, spare civilians, reload,
  combos) and chests are a 💣 Bomb Defuse (memorise the wire sequence). Tapping one opens a lobby at that spawn,
  everyone nearby is pinged, and all players get the same seeded round; the winner takes a pot bonus.
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
- **Polish** — synthesized sound effects (Web Audio, no files; mute button), 3D game-feel animations, in-app
  dialogs instead of browser pop-ups, iPhone (notch/landscape) and iPad (side panels) layouts, achievements
  for every system.

- **Story missions** — an 8-chapter campaign played on real streets: waypoints are placed around wherever you
  are, with *go* (reach a marker), *find* (hidden spot, hot/cold detector only) and *hold* (stay in a zone) steps.
- **GPS mini-games** — 🧭 Treasure Hunt (hot/cold, the spot never leaves the server), 🏃 Street Sprint (distance on
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

Plus the original layer: Pokémon-GO-style spawns, GTA-style timed runs, real package deliveries,
location messages, friends/chat/events, an admin panel and SEO/marketing tooling.

## Run locally

```bash
npm install
docker compose up -d        # local Postgres
cp .env.example .env        # defaults match docker-compose
npx prisma db push          # create tables
npm run db:seed             # demo data (SEED_LAT=.. SEED_LNG=.. to seed near you)
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

End-to-end tests (need the dev server running, ideally with `GAME_SPEED=600`): `npm run test:smoke`,
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
| Multiplayer lobbies: one lobby per spawn, same seed for every player, state advances whenever a member polls (~1×/s); the server caps scores with the same generator | `src/lib/minigames.ts`, `src/server/lobby.ts`, `src/app/api/lobby` |
| Tower defense: towers fire when a commander reports their position (`/api/loc` → `takeFire`), HP regenerates from a stored snapshot; raider waves are generated from a seed and fought by a deterministic simulation the server resolves once and clients animate | `src/lib/td.ts`, `src/server/td.ts`, `src/app/api/{towers,waves}` |
| Field armies: squad positions are interpolated from the march (from/to/depart/arrive), arrivals are settled lazily by whoever looks at the map; battles reuse the siege/outpost code with the squad as the attacking force | `src/server/{td,warfare}.ts`, `src/app/api/squads`, `src/components/game/LiveLayer.tsx` |
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
3. Note: free web services sleep after 15 min idle (slow first load), and free Postgres expires after 30 days.

After the first deploy, play once, then open `/admin?key=<ADMIN_KEY>` to make yourself admin.
Don't run the demo seed in production.

## Production checklist

- **Installable app & offline:** `/sw.js` (service worker) caches the app, map tiles you've seen and your last game
  state, so the game opens offline. Every deploy gets a new version id, and players see "New version ready → Update".
- **Push notifications:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
  (`npx web-push generate-vapid-keys`). Every in-game notification is also pushed to the phone when the player isn't
  in the app; Admin → Campaigns → live push can send to everyone. iPhone needs the app added to the Home Screen
  (iOS 16.4+).

- `/api/health` must say `"ok": true`.
- Set `CRON_SECRET` on Vercel — `vercel.json` schedules `/api/cron/cleanup` daily (prunes old notifications,
  lobbies, pings, waves, matches and superweapon launches; refunds expired bounties).
- Use a **pooled** database URL for `DATABASE_URL` when you have one; on Vercel the app also caps each
  instance at 1 connection (`DB_CONNECTION_LIMIT`) so a direct URL doesn't run out of connections.
- `NEXT_PUBLIC_SITE_URL` falls back to Vercel's production domain, but set it if you use a custom domain.
- Security headers (HSTS, nosniff, frame, referrer, permissions) and `no-store` on the API are set in
  `next.config.ts`. Client crashes show a recover screen and are recorded as `client_error` metrics.

## Before going big

- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia.
- Chat/notifications poll every few seconds. For instant delivery at scale, plug in a hosted
  realtime service (Ably, Pusher, Supabase Realtime) behind `notify()` and the chat route.
- The FPS netcode is HTTP polling (~7 requests/s per player in a match). Fine for small fights; for real
  scale move `/api/match/:id` to WebSockets or a realtime service. Hit detection is client-reported with
  server-side caps (damage, fire rate, movement speed), so it's casual-grade anti-cheat, not competitive.
- Switch `prisma db push` in the build to `prisma migrate deploy` once you have real data.
