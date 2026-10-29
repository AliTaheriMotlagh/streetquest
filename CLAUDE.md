# StreetQuest — working notes for Claude 

A real-world GPS game (Next.js 15 + Prisma/Postgres + Leaflet 2D map + three.js 3D city + a WebSocket
realtime server for Street Arena). Persian (fa) and English. README.md describes every feature; read
only the section you need.

## Where things are (read these instead of exploring)
| Area | Files |
|---|---|
| 2D map, layers, map styles | `src/components/game/{Game,GameMap,mapStyles}.ts(x)`, `src/app/world.css` |
| Store cards (Snappfood menus/reviews/hours, Torob walk-in stores, Divar) | `src/components/game/StoreInfo.tsx`, `src/lib/localData.ts` (pure), `src/server/localData.ts` (fetch + ExtCache), `src/app/api/local/route.ts`; prod reads Snappfood via the Iran relay `relay/{relay.mjs,install.sh}` (`SNAPPFOOD_URL`) |
| 3D city geometry (worker) / look | `src/components/drive/tileMesh.ts` / `world3d.ts`; data: `vectorTile.ts`, `src/lib/city.ts` |
| Driving mode, items in 3D | `src/components/drive/Drive.tsx` (beacons, loot, `settle()`), `markers.ts`, `pins.ts` |
| Street Arena | `src/lib/arena/{weapons,modes,medals,protocol}.ts`, `src/components/arena/*`, `realtime/*` |
| Who's online / presence | `src/server/presence.ts`, `src/app/api/online/route.ts`, `src/components/game/Online.tsx` |
| Settings & economy defaults | `src/lib/settings.ts` (Admin → Game settings edits them live) |
| Translations | `src/lib/i18n/fa/*.ts` — every `t()`/`msg()` key needs a Persian entry |

## Commands
- `npm test` — unit tests (`tests/*.test.ts`, Node test runner via tsx) + typecheck + i18n check. Run before finishing.
- `npm run test:e2e:api -- e2e/api/<file>.spec.ts --workers=1` — one API spec (starts its own server on :3200; slow cold).
- `npm run i18n:check` — 0 missing / 0 unused is required.
- Dev server usually already runs on :3000 (`lsof -iTCP:3000`); restart it after `prisma generate`.

## Fast, low-token tools (installed)
- `rg` (ripgrep) for text search — always quote globs in zsh: `rg -n "x" -g '*.ts'`.
- `fd` to find files by name; `sg` (ast-grep) for structural search/rewrite, e.g. `sg -p 'useLocal<$T>($$$)' src`.
- `scc` for a size overview; `jq` for JSON; `gh` for GitHub.
- Read big files in ranges (`sed -n a,bp`), never whole: Drive.tsx (~2k lines), tileMesh.ts (~1.2k), combat.ts (~1.2k).

## Done means
Code + Persian translations + README/.env.example for anything user-visible or configurable + a test
(unit for pure logic, e2e for routes) + `graphify update .` (local only — graphify-out/ is gitignored, never commit it) + clean `npm test`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
