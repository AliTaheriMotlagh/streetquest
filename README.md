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

End-to-end test (needs the dev server running, ideally with `GAME_SPEED=600`): `npm run test:smoke`

**On your phone:** GPS only works on `https://` or `localhost`. Run `npm run tunnel` and open the
`https://….trycloudflare.com` link it prints.

## How it works

| Area | Where |
|---|---|
| Strategy rules: factions, buildings, power, units, auto-resolved battles (pure, shared client/server) | `src/lib/rts.ts`, `src/app/api/{base,battle}` |
| Life sim: needs decay computed from a stored snapshot + timestamp, so no background jobs; mood multiplies XP in `grant()` | `src/lib/sims.ts`, `src/server/needs.ts`, `src/app/api/sims` |
| World bosses: deterministic per ~1.3 km region and 2 h window like spawns; only damage is stored. The killing hit pays every contributor | `src/lib/bosses.ts`, `src/server/boss.ts` |
| FPS: the arena is generated from the match seed on every client. Clients POST position + hits ~7×/s; the server owns HP, kills, capture and the result. The first live human is the *host* and runs bot/boss AI; if it goes quiet the next player takes over | `src/lib/arena.ts`, `src/server/match.ts`, `src/components/fps/Fps.tsx` |
| Spawns: deterministic per ~450 m cell and 20-min window, so everyone sees the same world with zero storage; the server rebuilds a spawn from its id to verify claims | `src/lib/spawns.ts` |
| Time of day: local *solar* time decides night/dawn/day/dusk items and golden-hour 2× XP anywhere on Earth; daily streaks reset at the player's own midnight | `src/lib/geo.ts`, `src/lib/progression.ts` |
| Anti-cheat: claims use the server's trusted position, GPS jumps faster than 250 km/h are rejected | `src/app/api/loc`, `src/server/rewards.ts` |
| Live layer (serverless-friendly): position + presence via `/api/loc`, notifications + unread via `/api/sync` (polled every 4 s), chat polled every 3 s. "Online" = pinged in the last 90 s | `src/server/hub.ts`, `src/app/api/{loc,sync,chat}` |
| Deliveries: coins in escrow → courier accepts → GPS check-in at pickup → handover code at drop-off | `src/app/api/deliveries` |
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

## Before going big

- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia.
- Chat/notifications poll every few seconds. For instant delivery at scale, plug in a hosted
  realtime service (Ably, Pusher, Supabase Realtime) behind `notify()` and the chat route.
- The FPS netcode is HTTP polling (~7 requests/s per player in a match). Fine for small fights; for real
  scale move `/api/match/:id` to WebSockets or a realtime service. Hit detection is client-reported with
  server-side caps (damage, fire rate, movement speed), so it's casual-grade anti-cheat, not competitive.
- Switch `prisma db push` in the build to `prisma migrate deploy` once you have real data.
