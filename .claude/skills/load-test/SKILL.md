---
name: load-test
description: Load-test StreetQuest with many simulated players (k6) — map/sync, 3D city presence, relayed Street Arena. Use when asked about scale, many concurrent players, lag under load, or before/after a backend performance change.
---

# Load test (k6, local only)

Tools: `k6` (brew), scripts in `scripts/load/` — `seed.ts` (players), `scenarios.js` (k6).
Never run against production: seed.ts refuses a non-local DATABASE_URL, and the scenarios
default to `BASE=http://localhost:3300`.

## Run (token-cheap: every step prints a few lines)
1. Server (a production build in `.next-load`, port 3300 — leaves the :3000 dev server alone; `next dev` numbers are meaningless):
   `npm run load:server > $SCRATCH/load-server.log 2>&1` in the background; wait for "Ready" with Monitor/grep, don't read the log.
2. Players: `npm run load:seed -- --players 300` (more players than VUs).
3. Test: `VUS=100 HOLD=1m SCENARIO=mix npm run load:test 2>&1 | tail -14`
   - `SCENARIO=map|city|arena|mix`; `P95_MS` sets the threshold (default 800).
   - Output is one line per endpoint (count, rps, p50/p95/p99, fails) + "thresholds ok"/crossed; also `.load/summary.json`.
4. Compare: re-run the same command after a change (copy `.load/summary.json` aside first). Run back to back — the Mac's load swings numbers (see memory e2e-under-load).
5. Clean up: `npm run load:clean`, stop the :3300 server.

## Reading results
- Rates a real player makes: sync 1/4 s (1/12 s idle), loc ~1/20 s, world 1/25 s, drive 1–4/s, arena host 6–7/s.
- One local Node + local Postgres is not Vercel: watch **relative** changes and which endpoint degrades first, not absolute rps.
- Fails with 409 on `loc` = speed cap (players walk only metres; investigate if seen).

## Adding a scenario
Add a function in `scenarios.js` that sleeps the real client's cadence, tag each request `name`, add the name to `endpoints` and to `share` for the mix. Keep requests idempotent and local (never call /api/local: it hits third-party sites).
