# StreetQuest — backlog (the one place for open work)

Everything unfinished from every session, in one list. Update it at the end of each session: tick what shipped
(then delete it next time), add what's new. Last gathered: 2026-11-26 (Cloudflare/Iran fixed in code + steps 3, 4, 6c done; step 7 shop interiors + owner 3D scans done in code; next: the deploy steps below, then step 2 budgets).

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

00. **Cloudflare + Iran (2026-11-26)** — code done, tests green; deploy steps need the user (auto mode refused prod secrets):
   - [x] Root cause of empty menus/Torob on prod: Workers can't fetch a bare IP (error 1003); RELAY_URL was
         `http://37.32.28.215:8790/…`. Fix in code: `reachable()` in lib/relayUrl.ts rewrites to `37-32-28-215.sslip.io`
         on Workers (probed from the edge: hostname 200 in 173 ms, IP 1003). Torob answers Cloudflare 490 → needs relay.
   - [x] Player IP `cf-connecting-ip` + front-door key (lib/clientIp.ts; forged x-forwarded-for no longer counts),
         country `cf-ipcountry` (locale picked Persian only via Accept-Language before), IP location from request.cf.
   - [x] Iran front door `front/front.mjs` (+ install.sh, `npm run front:deploy`): whole site at
         `https://37-32-28-215.sslip.io:8443`, disk cache for build files, FRONT_KEY → x-front-ip. Port 8443 open on
         the box (tested); checked locally against live prod (pages, cache hit 8 ms, guest sign-in).
   - [ ] USER: `npx wrangler secret put RELAY_URL --name streetquest` = `http://37-32-28-215.sslip.io:8790/<RELAY_KEY>`,
         `RELAY_FOR=all`, `FRONT_KEY` (same as .env, made by the first `npm run front:deploy`); push to main (CI deploys);
         `npm run front:deploy`; then `/api/health?ext=1` + a fresh `?menu=` on prod, and open the :8443 address on a phone
         on Irancell/MCI without VPN. Share the :8443 address with Iranian players.
   - [ ] Front door never seen on a real Iranian mobile line; box is 1 CPU / 1 GB — watch `systemctl status streetquest-front`.

0. **Leftovers** (2026-11-19)
   - [x] Stores phase 0: kinds + details + coins/toman, seller phone & payment page (Shop `phone`/`payLink`), buyer ↔
         shop chat (`shop:<shop>:<buyer>` rooms, My shop → Messages from buyers), public shop page `/s/<id>`, Share.
         Unit + e2e (`e2e/api/shops.spec.ts`) green. **Prisma pushed to the LOCAL db only — prod needs a deploy.**
   - [x] Fixed: Zod 4 `.partial()` kept defaults, so ⭐/👁️ toggles and "Pause sales" wiped a product's description/
         stock/discount and a shop's slogan/about/sign/links. `patch()` in `server/http.ts`; other `.partial()` uses: none.
   - [x] Crowd 0 walkers in home mode: not reproduced (26 walkers + 18 cars at Valiasr once tiles mesh; the old
         reading was taken before the cold server built any tile).
   - [x] Mode prompt: waits for the 3D loading scene to lift, and now sits above the 3D city (it was under it).
   - [x] SEO: hreflang + per-language canonical on every public page, language footer links, sitemap alternates +
         open shops, escaped JSON-LD (event titles could break out of the script tag), Organization/WebSite/Store
         data, Search Console file. → After deploy: submit `/sitemap.xml` in Search Console; NEXT_PUBLIC_SITE_URL must
         be the real domain.
   - [x] **Remixt Radio** after the Remixt update (2026-11-19): embed protocol unchanged; now also reads `next` +
         `listeners` (shown under the playing row). Headless Chrome: plays, title + next + listeners show, off → frame
         gone. Note for Remixt itself: its embed logs CORS errors fetching some R2 stems (bucket lacks CORS for
         remixt-free.vercel.app) — still plays. Not yet checked: iOS sim tap card, 360 px Persian screenshot.
   - [x] SEO finished (2026-11-19): README + .env.example for the verification/IndexNow vars, e2e for /features +
         /indexnow.txt (site.spec 11/11), 360 px Persian shots, RTL logo order fixed (was "QUEST STREET").
         After deploy: Bing + Yandex Webmaster, set INDEXNOW_KEY, resubmit /sitemap.xml.
1. **iPad bugs**
   - [~] Zoom stuck after landscape → portrait: `components/game/zoomGuard.ts` re-sets the viewport meta when zoomed
         after a rotation — never seen on a real iPad/simulator yet.
   - [~] iPad Chrome map view: panel missing / can't zoom back → likely a page pinch-zoom (iOS ignores user-scalable=no).
         Now blocked in the whole game: gesturestart/gesturechange cancelled (zoomGuard.ts) + `.game` touch-action
         pan-x pan-y. Check on a real iPad.
   - [~] Settings doesn't fit / won't scroll: NOT reproduced in WebKit at iPad 7 size (810×1080 + landscape, en/fa):
         2D Profile→Settings and the 3D menu's Settings fit and have their own scrollers. Real-iPad touch check left.
   - [x] Persian digits in the invite link (Vazirmatn FD): `.mono[dir=ltr]` now a Latin mono font.
   - [x] Inputs < 16 px zoom on focus: the 16 px rule now also covers `any-pointer: coarse` (iPad with a trackpad).
   - Tools: iPad simulator (iPad 10th gen + iPad Pro) Safari and Chrome, `xcrun simctl` rotate + screenshot,
     Playwright WebKit iPad profile for regressions, Safari Web Inspector on the sim.
2. **No lag on any device + less heat**
   - [ ] `lib/perf/tier.ts` (pure): tier from a 2 s startup benchmark (frame time of a fixed scene) + `hardwareConcurrency`,
         `deviceMemory`, screen size; cached per device, re-run after updates.
   - [ ] `lib/perf/features.ts` (pure): registry {id, cost, minTier} for post-processing, shadows, MSAA, SSR, rain,
         crowd/traffic/parked counts, street kit, real 3D people (impostors on low), sherpa voices (phone voice on low),
         HRTF, radio, interiors, hidden 2D map. Settings: "Turned off on this device for smoothness: …" + toggles.
   - [x] Heat (2026-11-19): `lib/perf/pace.ts` (pure, tests/pace.test.ts) — 30 fps on low/medium, battery saver or under a
         side menu; 20 fps idle (12 s no input, camera still; 20 not 10 because the sim clamps dt at 50 ms); nothing drawn
         under a full-screen menu/store; Adaptive.setPace so a cap isn't read as a slow GPU; never paced in ?bench.
         Settings: Battery saver toggle (auto on ≤20 % battery, not charging) + "Turned off on this device: …"
         (`offEffects` in quality.ts). Verified headless: idle 21 fps, saver 30, full-screen menu draw:false.
   - [x] Low tier trees: 20-tri blobs (`makeTemplates(style, lite)`) — trees were ~480k of the low tier's 1.14M triangles.
   - [ ] Budgets as tests: NOT done. Numbers measured (Tehran 35.7006,51.4013, 1280×800, before the tree change):
         low 268 calls/1.14M tris, medium 307/1.86M, high 327/1.97M, ultra 322/2.07M. After: low read 54/20k (tiles
         probably not all loaded — re-measure). Next: GFX_BUDGETS per tier in lib/perf/frameStats.ts, judged in
         benchResult, printed by test:lag. Medium/high triangles also high: find the next big meshes (instanced
         unnamed 911-tri ×84 = cars?).
     Testing note: headless guests hit the 20/h/IP guest limit → send `x-forwarded-for: 10.x.x.x` per context.
     Chrome Energy Saver caps rAF at 30 fps below 20 % battery — lag numbers on a low Mac battery are meaningless.
   - Tools: Xcode Instruments (Energy Log + GPU) and Safari Web Inspector Timelines on a cabled iPad, `stats-gl` dev
     overlay, Spector.js for draw calls, `npm run test:lag`, Chrome CPU 4× throttle. Practices: instancing, LOD +
     impostors, object pools, a per-frame time-budgeted work queue (≤4 ms), no React state per frame, KTX2/meshopt assets.
     Target: iPad 7th gen steady 30 fps for 15 min without getting hot.
3. **NPC chat** (2026-11-26: a–d done in code, unit-tested; never heard in a real 3D view / iPhone yet)
   - [x] One talk channel (lib/street/talkVoice.ts): neural → exact-text premade → speechSynthesis → subtitle; new line stops old.
   - [x] iOS: `unlockTalk()` on every talk-panel tap.
   - [x] Shopkeeper threat score with hysteresis (lib/street/threat.ts), keepers return when calm (`storefronts.reopen`).
   - [x] Context replies: `personaOf(id)`, gun/shots/crash/hour/met-before/insult escalation. Left: place type (no data in Drive).
   - [~] (was) Context-aware replies (`lib/street/npcTalk.ts`): per-NPC persona (seeded name, age, temper), role, mood,
         wanted level, armed/unarmed, recent events, place type, time; conversation memory (repeat insults escalate).
         Utility-AI scoring for reactions; optional Claude route per the decision table.
   - [x] (was) Shopkeepers flee too soon: threat score (car speed toward them, gun drawn, shots, wanted) with hysteresis
         (flee > 0.7, calm < 0.3), shopkeepers braver + stay near the shop, return when calm. Unit tests.
4. **Travel quick fixes**
   - [x] Fuel tiers (settings → Travel planner, `fuelCost`) + "My fuel card still has quota" toggle on the plan.
   - [x] (2026-11-26) Shared z-index scale; LeaveGuard dialog portalled. Left: ~60 raw z-indexes in world/globals/filters css
         and inline zIndex in Game/Empire/LocationUi modals. Not screenshotted at 360 px.
   - [x] (was) Shared z-index scale (`--z-map < --z-hud < --z-sheet < --z-dialog < --z-toast`), dialogs portalled to body.
   - [x] RTL checkbox on the redirect page (logical CSS props, `margin-inline-*`).
   - [x] (uses the bus site's road km, else straight line × 1.3; no OSRM call) Bus duration missing (Tehran → Shiraz): OSRM road km ÷ ~70 km/h bus speed, shown as "about".
5. **Travel upgrade**
   - [ ] Nearest date with a ticket: ±14-day calendar strip (lowest price/day, grey = none, "next available"),
         days fetched in parallel with `p-limit` 4 and cached 30 min (stale-while-revalidate).
   - [ ] One pure facet engine (`lib/facets.ts`) for every result list: price range, departure window, duration,
         company, class, seats, stops, rating; instant on loaded results; URL-synced.
   - [ ] Hotels fast: stale-while-revalidate cache, stream each source as it answers (route returns NDJSON),
         skeleton rows, prefetch when the city is picked.
   - [ ] Source adapters `{search, deepLink}` normalised to one Offer (toman, source, link, duration, checkedAt),
         deduped, cheapest first. Probe each endpoint first and note results in memory `travel-sites-endpoints`;
         link-only when blocked. Tickets: Sepehr360, 3click, Flytoday, Snapptrip, Ghasedak24, Safar724, Raja.
         Stays: Eghamat24, Snapptrip, Otaghak, Jajiga, Shab. Events: Vadoostan, Emruzkojaberam, Evand, Tiwall.
   - [ ] Nearby-city suggestions (distance + things to do); day-by-day plan with exact price/source/duration per item,
         estimates labelled; user-added steps (manual or paste a URL → parse known sites, else og: tags);
         final list with working reserve links (Jalali dates), total, share/export. Unit tests for every deepLink builder.
6. **Hero & physics**
   - [ ] Hero empty-handed by default + punches; draw a gun on demand; NPCs react differently (ties to step 3).
   - [ ] Hit-able props (bins, dumpsters, cones, chairs, signs, streetKit): extend `lib/street/carPhysics.ts` with
         light prop bodies (mass per kind, impulse from car mass × speed, slide/tip/dent/break, car slows); only props
         within 40 m awake, sleep at rest, instanced matrices. (Rapier WASM only if this proves too weak.)
   - [x] (2026-11-26) `civicKind` + CivicCard (local prayer times lib/prayerTimes.ts, emergency numbers, hours). Left:
         2D-map clinics/opticians share a category (only "درمانگاه" switches); libraries still "Books & library" in missions;
         prayer times not compared to an official Tehran timetable; card never seen in a browser.
   - [x] (was) Mosque/school/bank/hospital/police/government are NOT shops (extend `isShop` everywhere: cards, signs,
         keepers, list/search) → info cards (prayer times computed locally, opening hours).
7. **Shop interiors** (2026-11-26) — 3D rooms per trade, real menu on shelves with tags, keeper, buy; owner scans.
   - [x] `lib/interior.ts` (pure, tests/interior.test.ts): 12 trades' rooms, fixtures + spots, drinks → fridge, plain
         stock fill, walking/collision, stand-in-front. `drive/interior3d.ts` builds it (no shadows, ≤6 point lights,
         RoomEnvironment off on lite, one tag atlas); Drive draws only the room while inside (city frozen).
   - [x] ShopScreen = HUD over the room (drag look, tap walk/pick/keeper/door, 📋 list sheet, coin checkout for player
         shops via /api/shops/orders, toman → call / pay link). Player shops (`sh:`) now 3D markers you can enter.
   - [x] Owner 3D scan: ScanCard → browser optimiser (gltf-transform + meshoptimizer, WebP) → /api/shops/scan
         (`ShopScan`, lib/glbCheck.ts, e2e/api/shopScan.spec.ts green) → interior loads it (`loadModel`, meshopt).
         **Prisma pushed to the LOCAL db only — prod needs a deploy.** next.config: node:fs/path stubbed in the client
         bundle (gltf-transform's NodeIO).
   - [ ] Never tried with a real Polycam/Scaniverse export (big textures, KTX2-required exports get refused — tell
         owners to pick "GLB" not "GLB (KTX2)"); never seen on iPhone/iPad Safari (WebP encode falls back to JPEG).
   - [ ] Scan mode has no collision (walk box = scan bounds) and no keeper; place products into a scan (owner drags
         them onto its shelves) — next step.
   - [ ] Kenney/Quaternius CC0 props (fridges, espresso machine, tills) via gltf-transform to replace the box fixtures
         on medium+; baked AO lightmap per room; real product photos as box textures (Snappfood CDN lacks CORS →
         proxy through /api/img first).
   - [ ] Interior screenshots only headless 1280×720; check 360×740 Persian + iOS sim (sims: ShopScreen HUD sizes).
8. **Metro** — [ ] tap a station → sheet (lines, exits, interchanges, first/last train, headway) + its line bold on the
   metro map, others dimmed; station-to-station planner with the RAPTOR algorithm, fares; Iranian metros (Tehran,
   Mashhad, Isfahan, Shiraz, Tabriz, Karaj) from Geofabrik OSM `route=subway` relations in the city packs.

## Stores & ads plan (after step 0; decisions above)
1. Player-store flag + filter everywhere (Listing/ProductSource "player", 3D pole signs, public /s/ /p/ pages, API v1).
2. Source-parity flows: Snappfood menu+options+orders, Divar fields+chat+renew, Torob compare, Takhfifan vouchers,
   cinematicket/Jabama event sessions + QR tickets, travel tickets, bookings.
3. Ads: `AdSlot` with fallback house → Yektanet/Tapsell (Iran) / AdSense (outside Iran); coins for self-serve.
4. Panels: seller center (Shop + Business linked), buyer "my tickets/orders", advertiser, admin moderation queue.
5. Trust & safety: pre-checks, reports, first-3-listings review, rate limits, audit log.

## Game / 3D city (open)
- [ ] Women NPC models (no CC BY hijab/chador model exists — needs a custom/commissioned one).
- [ ] Real rigged soldier for the arena (candidate MadTrollStudio "Low Poly Soldiers Rigged Free", police.py approach).
- [ ] Gangs, drive-by from the car, police helicopter, hospital/police-station respawns, money penalties.
- [ ] Hand-built short-range arenas for 5v5 bomb matches; sidearms in the bomb-mode buy strip; traffic-light model.
- [ ] Real Tehran building footprints (Overture / Microsoft ML; OSM ~1 % in Tehranpars).
- [ ] Plates on traffic cars (fleet3d plates blank); NPC control beyond wait/come/go home; slope animation.
- [ ] Far camera can sit against a building wall. Visible tris ~425k — watch mid-range Android.
- [ ] Perf ideas: Drive re-renders on HUD sig changes, tile-add hitches; alley/service widths need OMT `service`.
- [ ] Iranian radio stations (IRIB streams not https).

## Map / UI (open)
- [ ] 2D map zoom still 100–160 ms worst frame — finish.
- [ ] Apple-Maps-style minimal map UI; scroll + search + filter in every list (reuse `lib/facets.ts`); product search on iPad.
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
AAA graphics steps 1–7 (film look, medium tier, SSR, night lights, atmosphere, city detail, car look) — see README
"Realistic graphics" … "Car finish". Older waves: see `git log`.
