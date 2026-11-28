# StreetQuest on Cloudflare

Production runs on Cloudflare Workers at **https://streetquest.remixt.app**. Vercel files/config are kept, but Vercel is no longer the deploy target.

## What is where

| Piece | Home |
| --- | --- |
| Next.js app | Cloudflare Worker `streetquest` (`@opennextjs/cloudflare`) |
| Static assets | Cloudflare Workers assets from `.open-next/assets` |
| Incremental cache | R2 bucket `streetquest-cache` (`NEXT_INC_CACHE_R2_BUCKET`) |
| Admin 3D model uploads | R2 bucket `remixt`, prefix `streetquest/models/` (`UPLOADS`), served by `/api/models/file/[...key]` |
| Database | Neon Postgres through `@prisma/adapter-neon` (pooled URL; per-request Prisma clients) |
| Daily cleanup | Cloudflare Cron Trigger `0 4 * * *` → `/api/cron/cleanup` with `CRON_SECRET` |
| Street Arena realtime | Existing VPS server `wss://37-32-28-215.sslip.io:8791` (`RT_URL`, shared `RT_SECRET`) |
| Iranian sites relay | Existing VPS relay `http://37-32-28-215.sslip.io:8790/<key>` (`RELAY_URL`, `RELAY_FOR=all`) — a name, never the bare IP: Workers refuse IPs (error 1003) |
| Iran front door (no VPN) | `https://37-32-28-215.sslip.io:8443` on the same VPS (`front/front.mjs`, `npm run front:deploy`, shared `FRONT_KEY`) |

## Automatic deploy

`.github/workflows/deploy-cloudflare.yml` runs on every push to `main` (and can be run manually). It does `npm ci`, `npm test`, rebuilds for Workers, deploys, and smoke-tests the live site.

GitHub repository secrets required:

- `CLOUDFLARE_API_TOKEN` — API token with the **Edit Cloudflare Workers** template (Workers Scripts:Edit, Workers Routes:Edit, account scope).
- `CLOUDFLARE_ACCOUNT_ID` — `1c36090945aa92ebdf4a0c839f53f6b9`.
- `CF_BUILD_ENV` — contents of `.env.prod` (build-time environment).
- `CF_DEV_VARS` — contents of the Worker's runtime env file (the same key/value lines used by `wrangler secret bulk`). OpenNext uploads these as Worker secrets during deploy.

The workflow writes the last two to gitignored `.env.prod` / `.dev.vars` at runtime; never commit them.

## Manual commands

```bash
npm run cf:build     # build only
npm run cf:preview   # build + local workerd preview
npm run cf:deploy    # build + deploy (needs wrangler login or CF API token)
npm run cf:typegen   # regenerate cloudflare-env.d.ts
```

To rotate Worker secrets locally:

```bash
npx wrangler secret bulk --name streetquest <file>
```

## Keeping the arena in sync

The VPS posts results to `APP_URL`. After changing the production domain, redeploy it with:

```bash
RT_APP_URL=https://streetquest.remixt.app npm run rt:deploy
```

## Players in Iran

- Iranian lines throttle Cloudflare's addresses on and off. The front door on the Iran VPS serves the whole site from
  inside Iran (README → "Players in Iran without a VPN"): share `https://37-32-28-215.sslip.io:8443` with them.
- The Worker needs `FRONT_KEY` (same as the VPS's) so players behind the front door keep their own address.
- Every deploy to Cloudflare also redeploys the front door (job `iran-front` in `.github/workflows/deploy-cloudflare.yml`)
  when the GitHub secrets `RELAY_SSH`, `FRONT_KEY` (and `RELAY_SSH_PASSWORD` if the box takes passwords) are set.
  Without them the job only warns. If the Iran box can't be reached the job fails, but the Cloudflare deploy stays live.
- Cloudflare's own egress is abroad, so Iranian sites (Snappfood, Torob, Divar, Takhfifan, travel) are read through the
  relay: `RELAY_FOR=all`. Check with `/api/health?ext=1`.
- Locale and the rough IP location use `cf-ipcountry` / `request.cf` (Vercel's `x-vercel-ip-*` headers don't exist here).

## Notes

- Workers per-request I/O rules require per-request Prisma clients; see `src/lib/db.ts`.
- `AsyncLocalStorage.enterWith()` is unavailable in workerd, so `src/server/i18n.ts` uses a `cache()` fallback.
- Vercel Blob uploads were replaced by R2; old Vercel code is left in place for reference but is unused in production.
