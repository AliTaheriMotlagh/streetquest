# StreetQuest — backlog (the one place for open work)

Everything unfinished from every session, in one list. Update it at the end of each session: tick what shipped
(then delete it next time), add what's new. Last gathered: 2026-11-26, third session (see NEXT SESSION).

## NEXT SESSION — start here (written 2026-11-26, fourth session)
Shipped this session (code, unit tests 1026+, fa/tr, README, .env.example):
- **Store products in 3D from their photos** — `lib/product3d/*` (≈60 kinds, rules: 98 % of cached items confident),
  `drive/product3d.ts` (templates at real size + the real photo, cut-outs, live GLB swap-in), interior3d uses it for
  every listed thing; shelf labels with ٪ badge + struck old price. Queue/API `server/product3d.ts` (Product3D table:
  20,558 products locally after a sweep), `/api/product3d` (game), `/api/product3d/work` (runner, Bearer token),
  Admin → 🥤 Product models. Runner `scripts/product3d/` (TripoSR on CPU + rembg + Qwen3.5-4B via llama.cpp, pins +
  SHA-256), workflow `.github/workflows/product3d.yml` (every 6 h, 4 shards, chains itself). README → Deploy →
  "Product models" has the setup.
- **Walk-in entry** (`lib/walkIn.ts`): walking at a store's door takes you in; re-arms 7 m away.
- Cherry-picked `fix/cf-schema-sync` (CI deploys run `prisma db push` again — additive only).
Verified on GitHub (run 45835833553): classify 275/275 (~80 s per 25), 4/4 models made and live, ~30 s each on the
runner, US runner reaches cdn.snappfood.ir directly, prod serves the .glb from R2 (32 KB). Left then: 11,268 to make,
4,378 to classify — the full chained run was started 2026-11-26 (4 shards, ~25 runner-hours).
Check next:
- [ ] Look at ~20 live models in Admin → Product models; move AUTO_LIVE (0.72) if bad ones go live. The LLM's kinds are
      loose sometimes («ice-cream cake» → sohan) — correct in the admin or tighten HINT in classifyPrompt.ts.
- [ ] Deploys now retry the build 3× (a Google Fonts hiccup in next/font failed one on 2026-11-26).
- [ ] Optional: GITHUB_DISPATCH_TOKEN + GITHUB_REPO on the server for the admin's "Start runner" button.
- [ ] Inside a store at 360×740 fa + iPad: product templates with photos, labels, walking in; a live model swapping in.
- [ ] Ideas not built: carrying a product (pick up / put back with physics), shoplifting → wanted star, checkout at the
      counter by walking to the keeper; the same ProductKit for market stalls / kiosks / other 3D places.
Older open items from the third session (still open): cones/chairs after the polyline fix (a headless count this
session found nothing — the probe walked the wrong structure, inconclusive), knocking a kit piece, far
camera over roofs, scan floor, setback respawn, NPC store-kind lines — never seen in a browser.

## Kish trip (2026-11-28) — shipped in code, unit tests (travelGuide.test.ts), fa/tr, README
- Trip planner: «🗺️ Kish guide» on a Kish stop (`lib/travel/guide.ts`, 57 OSM places: beaches, sights, fun, malls,
  parks, ferries/airport, hospitals; directions, add-to-trip, «Stores & food around it» → explore mode there, where
  Snappfood/Torob/Divar load); «Before you go» checklist under *To book* (`lib/travel/prep.ts`, ticks in `Plan.prep`);
  8 more Kish outings; Kish explore jump; Kish city pack def.
- [ ] Never seen in a browser (local Docker/Postgres was down): GuideView + PrepList at 360×740 fa, the guide map,
      «Stores & food around it» landing in explore mode on Kish with the store layers.
- [ ] Build the pack: `npm run city:pack -- kish` (local, needs the db) and on prod.
- Checked on prod 2026-11-28 at Kish (26.5376,54.0186): Snappfood 58 vendors (first load ~26 s), Divar, Takhfifan deals,
  Tehran→Kish flights (Alibaba + MrBilit), 118 Jabama stays — all OK. Site opens from abroad (check-host.net: 37/39
  nodes 200 incl. US, UK, DE, TR; ch/is probes failed) and from 5 Iranian nodes.
- [ ] **Torob refuses the Arvan server's IP** (490 in 0.07 s; 200 from a home line in Iran; no CORS, so phones can't
      read it either) → walk-in stores and Torob prices are empty on prod. Options: a partnership/API key with Torob, or
      the relay on a non-datacenter Iranian line. Never spoof a browser. The layer no longer hangs on it (waitTorob).
- Checked across Iran 2026-11-28 (Mashhad, Tabriz, Zahedan, Ahvaz, Rasht, Kish): Snappfood 19–226 vendors, Takhfifan
  2–120 deals everywhere. Divar was empty in Mashhad and Zahedan (Divar's own city centres 21–30 km off) → fixed with
  `divarCityIn` (finds the city by its neighbourhoods); re-check those two after deploy.
- [ ] **Bilbooard answers 403 everywhere** (server and the Mac) — its API changed or closed; re-probe the endpoint.
- [ ] Outing prices for the new Kish activities are rough 1405 estimates — adjust when real quotes are known.
- [ ] Ideas: guides for Qeshm, Shiraz, Isfahan, Mashhad (one `guide(...)` each); show guide places as a map layer
      when a player is on the island; Kish buses/cinemas via `transit:build` if OSM has the routes.

## Decisions (answered 2026-11-17 — follow these, don't re-ask)

| Question | Decision | Why |
|---|---|---|
| NPC chat replies | **Hybrid.** Rules engine always (instant, offline, free); free-text chat goes to a server route `/api/npc/talk` calling Claude (`claude-opus-5-5`, effort `low`, `max_tokens` ~200, persona + game state as a cached system prompt, `fallbacks: "default"`). Off unless `ANTHROPIC_API_KEY` is set + admin toggle; per-user daily cap; any error → rules reply. | Iran can't reach the API directly, Vercel can. ~300 in / ~60 out tokens ≈ $0.002–0.003 per reply on Opus 5.5. Switching the model to `claude-haiku-5-5` (~40× cheaper) is the user's call — it's one setting. |
| Fuel price | **Tiered, from settings:** 1,500 (first 60 L quota) / 3,000 (next 50 L) / 10,000 toman (beyond quota, since 17 Shahrivar 1405). Trip cost uses 10,000 by default (a trip is extra driving); "I still have quota" toggle blends the cheaper tiers. | Real 1405 prices; admin can edit when they change. |
| Which iPad is "2019" | **Don't depend on the model** — measure at runtime (benchmark tier). Test against the worst case: iPad 7th gen (A10, 3 GB). | Same code then works on every slow device. |
| Page zoom in the game | Block page pinch-zoom on /play only (map and 3D keep their own zoom); list/travel pages stay zoomable. | Fixes the stuck zoom without hurting accessibility on reading pages. |
| Store toman payments | **No gateway at first:** "contact seller", cash on pickup, or the seller's own payment link (their Zarinpal/IDPay page). Escrow gateway later, once there is an enamad. | Zarinpal needs enamad + a company; no money flows through us = no liability. |
| Ad networks | Self-serve house ads first; **Yektanet** (native) for Iran, **Tapsell** as second; **AdSense** only outside Iran (Turkey). One `AdSlot` with fallback chain; lazy-loaded, never in the 3D view. | AdSense doesn't pay Iranian publishers. |
| Self-serve ads paid in | **Coins** at launch; toman later with the gateway. | Works now, no payment law issues. |
| Shop vs Business | **Link, don't merge:** Business (verified real store) can own one player Shop; one seller center for both. | Keeps claims/plans intact, no migration. |
| Moderation | **Post-moderation + automatic pre-checks** (banned words, price sanity, phone format, duplicate text) + report button; a new seller's first 3 listings are pre-moderated. | Fast for good sellers, safe against spam. |
| Stores per user | **One**; more for verified businesses / paid plans. | Simple; ties into the plans. |

## Now — run top-down (tools + best practice per step)

0000. **One server on Arvan — LIVE at https://streetquest.remixt.app** (2026-11-28, verified: 200, /api/health ok, LE cert by DNS-01): box `root@37.152.178.0` (Ubuntu 26.04,
     2 vCPU, 2 GB, 28 GB; 22/80/443 open). Key `~/.ssh/arvan-streetquest.pem` (`SERVER_SSH_KEY_FILE` in .env).
     GitHub secrets `SERVER_SSH`, `SERVER_SSH_KEY`, `SERVER_ENV` (= .env.server: fresh secrets + VAPID/Neshan/
     PRODUCT3D_TOKEN, CADDY_TLS=cloudflare) → every push to main deploys; CI points the DNS (scripts/server-dns.sh,
     detaches the Worker custom domain) and Caddy gets the certificate by DNS-01 with `CF_DNS_API_TOKEN` (falls back
     to CLOUDFLARE_API_TOKEN). CF_DNS_API_TOKEN is a DNS-only token for remixt.app (also in .env). The user deleted the
     streetquest Worker on Cloudflare. Why: from abroad Iran drops HTTP(S) to the box (Let's Encrypt and GitHub time out; SSH works).
     "Deploy to Cloudflare" is manual only now. Consequences to handle:
     - [ ] Players outside Iran can't reach the site (unverified from a real foreign browser; GitHub/LE time out).
     - [ ] Optional: TURN relay for video calls (/api/health: no CLOUDFLARE_TURN_KEY_ID).
     - [ ] product3d runner (GitHub, abroad) → server (Iran): every run 2026-11-26…28 failed (classify: HTTP 500 = Neon
           402; reconstruct: setup.sh "venv already exists"). Fixed 2026-11-28: setup.sh keeps uv's Python in the cache;
           each job opens an SSH tunnel (scripts/product3d/tunnel.sh, secrets SERVER_SSH + SERVER_SSH_KEY) to the
           server's :443 — tested from the Mac (health 200, real cert). Decision (user, 2026-11-28): compute stays on
           GitHub (server has 2 GB), everything stored/served on Arvan. Check the first GitHub run end to end.
     - [ ] NPC Claude chat (`/api/npc/talk`) was decided but never built (no Anthropic code in src). From the Iran box
           api.anthropic.com is unreachable → it needs a hop abroad (Cloudflare Worker / AI Gateway).
     - [ ] Empty DB: copy Neon's data once its quota resets (README → "One server").
     - [ ] Local `server:deploy` from the Mac: Docker Hub 403s (Node/Caddy now from mirrors), Mac disk was 100 % full
           and Docker Desktop hit I/O errors (24 GB build cache) — free space + restart Docker Desktop.

000. **Prod down 2026-11-27 — USER**: Neon answers HTTP 402 "exceeded the quota" (`/api/health`), so every DB page
     fails; not the SEO commit. Upgrade Neon or wait for the monthly reset; check what burns compute (product3d runs every
     6 h). Same day the Iran box 37.32.28.215 timed out on every port (22/8443/8790/8791) from the Mac and from Cloudflare
     — check it in the Arvan panel. CI now redeploys the front door after each Cloudflare deploy once GitHub secrets
     `RELAY_SSH`, `FRONT_KEY` (+ `RELAY_SSH_PASSWORD`) are set (`gh secret set NAME`); never run from CI yet.

00. **Cloudflare + Iran deploy — USER** (code done 2026-11-26): `npx wrangler secret put RELAY_URL --name streetquest` =
    `http://37-32-28-215.sslip.io:8790/<RELAY_KEY>`, `RELAY_FOR=all`, `FRONT_KEY` (same as .env, made by the first
    `npm run front:deploy`); push to main (CI deploys); `npm run front:deploy`; then `/api/health?ext=1` + a fresh `?menu=`
    on prod, and open the :8443 address on a phone on Irancell/MCI without VPN. Front door never seen on a real Iranian
    line; box is 1 CPU / 1 GB — watch `systemctl status streetquest-front`. After deploy: Search Console + Bing + Yandex,
    `INDEXNOW_KEY`, resubmit `/sitemap.xml`; NEXT_PUBLIC_SITE_URL = real domain. Prisma (Shop phone/payLink, ShopScan, Product.review, ListingReport, HouseAd)
    is on the LOCAL db only until that deploy.
1. **iPad checks** (code done, never seen on a real iPad/sim): zoom stuck after rotation (`zoomGuard.ts`), page pinch-zoom
   blocked in the game, Settings fit/scroll by touch. Remixt Radio: iOS sim tap + 360 px Persian shot.
2. **Perf** (2026-11-26: benchmark tier, lite city on low, GFX budgets DONE in code + unit tests)
   - Done: `lib/perf/tier.ts` + `graphics/bench.ts` (M1 1.85 Mpx/ms Chrome+WebKit, SwiftShader 0.09; iPad-class score
     0.2 → low verified in headless: 173 calls / 261k tris, 10 walkers, 30 fps pace), `lib/perf/features.ts` (lite city
     follows the low tier, Settings lists the cuts), `GFX_BUDGETS` in frameStats (judged in benchResult, printed by test:lag),
     demotion unlearned after 5 min untouched.
   - [ ] Thresholds for A10–A15 are scaled from FP32 specs, not measured: run the page on the iPad sim/real iPad and read
         `localStorage.sq_gfx_bench`. Medium budget never re-measured after the lite-city change.
   - [ ] Real-device fps + heat (Instruments Energy Log), target iPad 7th gen steady 30 fps for 15 min.
3. **NPC chat** — never heard in a real 3D view / iPhone (store kinds now in replies, 2026-11-26).
5. **Travel upgrade**
   - [~] (2026-11-26, code + unit tests, not seen in a browser) Day strip with each day's cheapest ticket, cheapest day
         green, empty greyed, "Next day with tickets" (`lib/travel/calendar.ts`, Travel.tsx `useDayCells`: ±3 days
         searched ahead 2 at a time through the phone cache). Check at 360 px Persian.
6. **Hero & physics**
   - [~] (2026-11-26, code + unit tests, NOT yet seen in a browser) Bare hands by default in the open city
         (`lib/street/melee.ts`): fire punches right/left/right-hook (reach 1.7 m, 12/18/8 dmg, hook ×1.6), bones aimed for
         a boxer's guard + strike (avatar.ts `fists`/`aimBone`, rig-agnostic), first-person fists (viewmodel.ts), swing/
         thump sounds (+ `punchSwing`/`punchHit` slots), Q cycles fists → pistol → SMG, X/3 holsters, HUD ✊ button,
         touch triggers show a fist, punches are "hitPerson" crimes, bystanders back off (`npc.scuffle`), keepers/NPC talk
         react to `combat.gunOut` instead of aim. Matches always guns.
         CHECK: headless boot with guest + `/api/loc {sim:true}` timed out at 240 s on :3100 (cold) — retry warm; look at
         the guard/jab/hook close-ups (wrap `__drive.gfx.render`), first-person fists, a punch on a walker.
7. **Shop interiors** — never tried with a real Polycam/Scaniverse export; never seen on iPhone/iPad Safari; scan floor +
   keeper done 2026-11-26 (`lib/scanFloor.ts`); left: owner places products onto scan shelves (an editor on /shop-scan); CC0 props + baked AO + real product photos (proxy
   Snappfood CDN via /api/img); 360×740 Persian + iOS sim shots.
8. **Metro** — Karaj has no line of its own in OSM yet (Line 5's Karaj stations are in Tehran's network). Istanbul's
   exits need the Turkey extract (`npm run transit:build -- istanbul <turkey.osm.pbf>`, ~600 MB).

## Stores & ads plan (after step 0; decisions above)
1. Player-store flag + filter: product search done 2026-11-26 (source «Player shops»); left: 3D pole signs, a /p/ product
   page, API v1.
2. Source-parity flows: Snappfood menu+options+orders, Divar fields+chat+renew, Torob compare, Takhfifan vouchers,
   cinematicket/Jabama event sessions + QR tickets, travel tickets, bookings.
3. Ads: placements done (shop pages, product search, outings — `adPositions`). Left: the networks' real script URLs
   from the user's publisher panels (YEKTANET_SCRIPT / TAPSELL_SCRIPT / ADSENSE_SLOT).
4. Panels: Seller center done 2026-11-26; buyer orders, advertiser and the moderation queue already existed. Left: a
   buyer "my tickets" view that shows a ticket's QR (needs source-parity tickets, item 2).
5. Trust & safety: limits on new listings / ads done 2026-11-26 (reports had their own); audit log exists.

## Game / 3D city (open)
- [ ] Women NPC models (no CC BY hijab/chador model exists — needs a custom/commissioned one).
- [ ] Real rigged soldier for the arena (candidate MadTrollStudio "Low Poly Soldiers Rigged Free", police.py approach).
- [ ] Gangs, drive-by from the car (helicopter, respawns, fines done 2026-11-26; fines are 0 until the admin sets them).
- [ ] Helicopter rotor sound needs a recorded sample (sound slot); "cover" (bridges/tunnels) doesn't hide you from it yet.
- [ ] Hand-built short-range arenas for 5v5 bomb matches; sidearms in the bomb-mode buy strip; traffic-light model.
- [ ] Real Tehran building footprints (Overture / Microsoft ML; OSM ~1 % in Tehranpars).
- [ ] NPC control beyond wait/come/go home; slope animation. (Traffic plates exist — fleet3d plate atlas; confirm visually.)
- [ ] Visible tris ~425k — watch mid-range Android. (Far camera vs walls fixed 2026-11-26 — confirm in a real city.)
- [ ] Perf ideas: Drive re-renders on HUD sig changes, tile-add hitches; alley/service widths need OMT `service`.
- [ ] Iranian radio stations (IRIB streams not https).

## Map / UI (open)
- [ ] 2D map zoom still 100–160 ms worst frame — finish.
- [ ] Apple-Maps-style minimal map UI; more lists on the shared engine (`lib/listEngine.ts` — shop products use it); product search on iPad.
- [ ] Persian middle dots: fixed in translations and code joins 2026-11-26; admin screens still use «·» (left on purpose).
- [ ] Feature inventory page (keep/remove), incl. gems/coins — user said "don't touch" money; let them decide.
- [ ] Worldwide menus beyond OSM need a source (Google Places key unset).

## Data & sources (open)
- [ ] Live Torob per-store stock in prod (this Mac gets 490; never spoof UA).
- [ ] Turkey travel sources; Booking.ir / Flytoday real data (link-only now); Digikala link-only (bot wall).
- [ ] Activity prices in `lib/travel/activities.ts` are estimates → real figures; real activity booking (link-out now).
- [ ] Hotel/Bilbooard real photos never seen (alibaba cdn 404, bilbooard 403 from here).
- [ ] Relay needs HTTPS + a domain before browsers can use it. (Workers' fetch to https on :8791 timed out in the probe —
      keep the server→relay hop on plain HTTP by sslip.io name, or put the relay behind the front door's TLS.)

## Needs the user (can't be done from this Mac)
- [ ] Run e2e never run here: realReset, local, arena radius, 11-11 API specs, `e2e/api/gameFiles.spec.ts`
      (an e2e run clobbers the :3000 dev server). Write e2e for /api/sync `cfg` + admin dev access.
- [ ] `ANTHROPIC_API_KEY` on Vercel if NPC Claude replies should go live.
- [ ] Vercel: `BLOB_READ_WRITE_TOKEN`; relay redeploy (Takhfifan paths, Divar detail); answer RELAY_FOR for IETT.
- [ ] Yektanet / Tapsell publisher accounts (and AdSense for outside Iran) when ads start.
- [ ] Prod city pack rebuild `npm run city:pack:prod -- tehran` (needs OK).
- [ ] Live IETT needs a Turkish relay (`IETT_URL`); IETT GTFS download needs a VPN.
- [ ] Voices: `npm run assets:voices`, English clips on /dev/voices, `NEXT_PUBLIC_TTS_BASE` hosting; HF credits are 0.
- [ ] Recorded sounds from soundsnap need the user's subscription (assets/sounds/<slot>/).
- [ ] Real-device fps + heat check on the iPad (Instruments Energy Log) and `npm run test:lag` on the phone.
- [ ] README: hero moves, Sky Rings, dev access.

## Never seen working in a real 3D view (check on the iPad sim / user's browser)
Settings voice picker + loading-screen voice line, plates, follower orders, slope lean, sign look + wall packing,
shopkeeper run-in, people separation, crowd prewarm, kerb stepping, partner billboards/branded signs, 3D planes,
bridges, Ottoman mosques, billboard trailers, skydive, hero moves, Turkish police livery.

## Done record
2026-11-26 (3): metro RAPTOR/fares/exits/map lines, z-index tokens, kit props, place categories, prayer check, hotels streaming,
travel sources + extras, list engine, Seller center, limits, NPC kinds, ad positions, player search, camera, scan floor,
setbacks, helicopter, «•» in Persian, db client leak fix.
2026-11-26 (2): moderation tests/i18n, bare-hands protocol, punching players, knockable props, URL filters, house ads + AdSlot.
2026-11-26: travel day strip with prices (code). GPU benchmark tier + lite city on low + per-tier draw budgets (lib/perf/{tier,features}.ts, graphics/bench.ts).
AAA graphics steps 1–7 (film look, medium tier, SSR, night lights, atmosphere, city detail, car look) — see README
"Realistic graphics" … "Car finish". Older waves: see `git log`.
