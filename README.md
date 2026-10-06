# StreetQuest — real-world GPS game

GTA-style missions on real streets, Pokémon-GO-style spawns, real package deliveries,
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

Demo logins (password `password123`): `admin`, `VeeRunner`, `KaiNight`, `Lola`.
The first account ever created also becomes admin.

**Testing at your desk:** in dev (or as an admin) tap 🕹️ on the map to turn on the GPS
simulator, then tap the map to teleport.

End-to-end test (needs the dev server running): `npm run test:smoke`

**On your phone:** GPS only works on `https://` or `localhost`. Run `npm run tunnel` and open the
`https://….trycloudflare.com` link it prints.

## How it works

| Area | Where |
|---|---|
| Spawns: deterministic per ~450 m cell and 20-min window, so everyone sees the same world with zero storage; the server rebuilds a spawn from its id to verify claims | `src/lib/spawns.ts` |
| Time of day: local *solar* time decides night/dawn/day/dusk items and golden-hour 2× XP anywhere on Earth; daily streaks reset at the player's own midnight | `src/lib/geo.ts`, `src/lib/progression.ts` |
| Anti-cheat: claims use the server's trusted position, GPS jumps faster than 250 km/h are rejected | `src/app/api/loc`, `src/server/rewards.ts` |
| Live layer (serverless-friendly): position + presence via `/api/loc`, notifications + unread via `/api/sync` (polled every 4 s), chat polled every 3 s. "Online" = pinged in the last 90 s | `src/server/hub.ts`, `src/app/api/{loc,sync,chat}` |
| Deliveries: coins in escrow → courier accepts → GPS check-in at pickup → handover code at drop-off | `src/app/api/deliveries` |
| Admin: KPIs, 7-day funnel, players (ban/role/gift), sponsored mission drops, banners, live push, moderation, UTM link builder | `/admin` |
| SEO: SSR landing with VideoGame + FAQ JSON-LD, public event pages with Event JSON-LD, sitemap, robots, OG image, PWA manifest | `src/app` |
| Marketing: `?ref=` referrals (+150 coins each), UTM attribution stored at signup, first-party page-view/share tracking | `src/middleware.ts`, `/api/track` |

## Deploy

### Vercel
1. Push this repo to GitHub, then on vercel.com: **Add New → Project → import the repo**.
2. In the project: **Storage → Create Database → Neon (Postgres)** and connect it. That sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET` (`openssl rand -base64 32`) and
   `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-app.vercel.app`).
4. **Deployments → Redeploy**. The `vercel-build` script creates/updates the tables on every deploy.

### Render
1. Push to GitHub, then on render.com: **New → Blueprint** and pick the repo. `render.yaml` creates
   the web service + Postgres and generates `AUTH_SECRET`.
2. Set `NEXT_PUBLIC_SITE_URL` to your `https://….onrender.com` URL when prompted.
3. Note: free web services sleep after 15 min idle (slow first load), and free Postgres expires after 30 days.

After the first deploy, sign up — **the first account becomes admin**. Don't run the demo seed in production.

## Before going big

- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia.
- Chat/notifications poll every few seconds. For instant delivery at scale, plug in a hosted
  realtime service (Ably, Pusher, Supabase Realtime) behind `notify()` and the chat route.
- Switch `prisma db push` in the build to `prisma migrate deploy` once you have real data.
