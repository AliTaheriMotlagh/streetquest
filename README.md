# StreetQuest — real-world GPS game

GTA-style missions on real streets, Pokémon-GO-style spawns, real package deliveries,
location messages, friends/chat/events, an admin panel and SEO/marketing tooling.

## Run locally

```bash
npm install
npx prisma db push          # create the SQLite DB
npm run db:seed             # demo data (SEED_LAT=.. SEED_LNG=.. to seed near you)
npm run dev                 # http://localhost:3000
```

Demo logins (password `password123`): `admin`, `VeeRunner`, `KaiNight`, `Lola`.
The first account ever created also becomes admin.

**Testing at your desk:** in dev (or as an admin) tap 🕹️ on the map to turn on the GPS
simulator, then tap the map to teleport.

End-to-end test (needs the dev server running): `npx tsx scripts/smoke.ts`

## How it works

| Area | Where |
|---|---|
| Spawns: deterministic per ~450 m cell and 20-min window, so everyone sees the same world with zero storage; the server rebuilds a spawn from its id to verify claims | `src/lib/spawns.ts` |
| Time of day: local *solar* time decides night/dawn/day/dusk items and golden-hour 2× XP anywhere on Earth; daily streaks reset at the player's own midnight | `src/lib/geo.ts`, `src/lib/progression.ts` |
| Anti-cheat: claims use the server's trusted position (socket), GPS jumps faster than 250 km/h are rejected | `src/server/realtime.ts`, `src/server/rewards.ts` |
| Realtime: presence, friends online, chat (global / local ~5 km / DM / event), notifications | `src/server/realtime.ts`, `server.ts` |
| Deliveries: coins in escrow → courier accepts → GPS check-in at pickup → handover code at drop-off | `src/app/api/deliveries` |
| Admin: KPIs, 7-day funnel, players (ban/role/gift), sponsored mission drops, banners, live push, moderation, UTM link builder | `/admin` |
| SEO: SSR landing with VideoGame + FAQ JSON-LD, public event pages with Event JSON-LD, sitemap, robots, OG image, PWA manifest | `src/app` |
| Marketing: `?ref=` referrals (+150 coins each), UTM attribution stored at signup, first-party page-view/share tracking | `src/middleware.ts`, `/api/track` |

## Before production

- `AUTH_SECRET` → long random string; `NEXT_PUBLIC_SITE_URL` → your domain.
- Switch Prisma to PostgreSQL (`provider = "postgresql"` in `prisma/schema.prisma`).
- Map tiles: the default public OSM tile server is for light use only. Set
  `NEXT_PUBLIC_TILE_URL` (+ `NEXT_PUBLIC_TILE_ATTRIBUTION`) to a provider like MapTiler or Stadia.
- Presence is in-memory (one server process). To scale horizontally add the Socket.IO Redis adapter
  and move presence to Redis.
- `npm run build && npm start`.
