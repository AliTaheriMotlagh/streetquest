# StreetQuest — backlog (the one place for open work)

Everything unfinished from every session, in one list. Update it at the end of each session: tick what shipped
(then delete it next time), add what's new. Last gathered: 2026-11-26 (step 2 perf done in code; step 6 bare hands in code, unchecked in a browser; user asked: implement everything first, then test everything at the end).

## NEXT SESSION — start here (written 2026-11-26, second session of the day)
User's order: **implement everything first, then test everything at the end.** Remove done items as you go.
Shipped this session (code + fa/tr + README + tests, all run): moderation i18n + tests/moderation.test.ts +
e2e/api/moderation.spec.ts (found+fixed: "AK-47" slipped through the weapon words); remote players see bare hands
(weapon byte 255 = BARE_IDX; also fixed /api/drive clamping weapons 5–8 to 4); punching other players (realtime
`punch` msg + HTTP `weapon:"fists"`, tests/punchPlayers.test.ts + drive.spec fists); knockable bins/bags/benches/dumpsters
(lib/street/props.ts, drive/looseProps.ts — seen working headless: car 11→9 m/s into a dumpster, 2 woken); URL-synced
trip/stay/Market filters (lib/urlState.ts, components/useUrlParam.ts); self-serve house ads in coins + AdSlot with the
house → Yektanet/Tapsell (IR) / AdSense (known non-IR only) chain (model HouseAd, /api/ads/{slot,go,house}, Admin →
Listings "Player ads", Market → Advertise; e2e/api/ads.spec.ts). Screenshotted at 360×740 fa: Market ad card, Advertise form.
The 2026-11-26 00:27 "plan" deploy FAILED on the missing translations — fixed; check the CI run of this push.
1. Left of the old list (top-down): metro station sheet (line bold/others dimmed), RAPTOR planner + fares; travel
   source adapters (probe each site first); hotels SWR + NDJSON streaming + skeleton rows; nearby-city suggestions +
   day-by-day plan; shared list engine for product lists in Market (search/sort inside a shop); ~60 raw z-indexes →
   tokens; civic-place category fixes; seller center (Shop + Business linked); SEO audit (Lighthouse on prod pages).
2. Never checked in a browser: punch guard/jab/hook close-ups + first-person fists (headless drive now boots in ~35 s
   on a warm :3100 — force `__drive.live.current.canDrive = true` in an interval to drive as a GPS guest), a punch on
   another player in two browsers, a bench/bin tipping, Admin → Listings with player ads, travel day strip at 360 px,
   metro sheets for Mashhad/Isfahan/Shiraz/Tabriz, low-tier lite city.
3. Local `next build` fails in next/font (Google Fonts parse, "reading '1'") on this Mac only — CI builds fine.
   Kill any :3100 dev server you start (it leaks Postgres clients → "too many clients" after many hot reloads).

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

0. **Prod DB schema — USER decides (found 2026-11-26)**: Cloudflare builds had no DATABASE_URL, so `db-sync.mjs`
   skipped `prisma db push` on every deploy — prod has no HouseAd table (`/api/ads/slot` answers 503; the slot and
   Advertise just hide), and likely misses ListingReport / ShopScan / Product.review too. Fix on branch
   `fix/cf-schema-sync` (CI reads the Worker's .dev.vars): merge it and the next deploy syncs (additive only).
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
3. **NPC chat** — never heard in a real 3D view / iPhone. Left: place type in replies (no data in Drive).
4. **Travel leftovers**: ~60 raw z-indexes in world/globals/filters css + inline zIndex in Game/Empire/LocationUi modals;
   not screenshotted at 360 px.
5. **Travel upgrade**
   - [~] (2026-11-26, code + unit tests, not seen in a browser) Day strip with each day's cheapest ticket, cheapest day
         green, empty greyed, "Next day with tickets" (`lib/travel/calendar.ts`, Travel.tsx `useDayCells`: ±3 days
         searched ahead 2 at a time through the phone cache). Check at 360 px Persian.
   - [ ] URL-synced trip/stay/Market filters done 2026-11-26; left: a shared engine for product lists inside a shop
         (Map/UI "scroll + search + filter in every list").
   - [ ] Hotels fast: stale-while-revalidate cache, stream each source as it answers (NDJSON), skeleton rows, prefetch.
   - [ ] Source adapters `{search, deepLink}` → one Offer (toman, source, link, duration, checkedAt), deduped, cheapest
         first. Tickets: Sepehr360, 3click, Flytoday, Snapptrip, Ghasedak24, Safar724, Raja. Stays: Eghamat24,
         Snapptrip, Otaghak, Jajiga, Shab. Events: Vadoostan, Emruzkojaberam, Evand, Tiwall. Probe first; link-only when blocked.
   - [ ] Nearby-city suggestions; day-by-day plan with price/source/duration per item; user-added steps (paste a URL);
         final list with reserve links (Jalali dates), total, share/export. Unit tests per deepLink builder.
6. **Hero & physics**
   - [~] (2026-11-26, code + unit tests, NOT yet seen in a browser) Bare hands by default in the open city
         (`lib/street/melee.ts`): fire punches right/left/right-hook (reach 1.7 m, 12/18/8 dmg, hook ×1.6), bones aimed for
         a boxer's guard + strike (avatar.ts `fists`/`aimBone`, rig-agnostic), first-person fists (viewmodel.ts), swing/
         thump sounds (+ `punchSwing`/`punchHit` slots), Q cycles fists → pistol → SMG, X/3 holsters, HUD ✊ button,
         touch triggers show a fist, punches are "hitPerson" crimes, bystanders back off (`npc.scuffle`), keepers/NPC talk
         react to `combat.gunOut` instead of aim. Matches always guns.
         CHECK: headless boot with guest + `/api/loc {sim:true}` timed out at 240 s on :3100 (cold) — retry warm; look at
         the guard/jab/hook close-ups (wrap `__drive.gfx.render`), first-person fists, a punch on a walker.
   - [ ] Hit-able props left: cones, chairs, signs, streetKit (postbox/cabinets/phone) — bins, bags, benches, dumpsters
         done 2026-11-26 (lib/street/props.ts); a knocked prop isn't hittable again once it rests (collider off).
   - [ ] Civic places: 2D-map clinics/opticians share a category; libraries still "Books & library" in missions; prayer
         times vs an official Tehran timetable; CivicCard never seen in a browser.
7. **Shop interiors** — never tried with a real Polycam/Scaniverse export; never seen on iPhone/iPad Safari; scan mode has no
   collision/keeper; owner places products onto scan shelves (next); CC0 props + baked AO + real product photos (proxy
   Snappfood CDN via /api/img); 360×740 Persian + iOS sim shots.
8. **Metro** — [ ] tap a station → sheet (lines, exits, interchanges, first/last train, headway) + its line bold, others
   dimmed; station-to-station planner (RAPTOR), fares; Tehran, Mashhad, Isfahan, Shiraz, Tabriz, Karaj from Geofabrik
   `route=subway` relations in the city packs.

## Stores & ads plan (after step 0; decisions above)
1. Player-store flag + filter everywhere (Listing/ProductSource "player", 3D pole signs, public /s/ /p/ pages, API v1).
2. Source-parity flows: Snappfood menu+options+orders, Divar fields+chat+renew, Torob compare, Takhfifan vouchers,
   cinematicket/Jabama event sessions + QR tickets, travel tickets, bookings.
3. ~~Ads: AdSlot + self-serve in coins~~ (done 2026-11-26). Left: the networks' real script URLs from the user's
   publisher panels (YEKTANET_SCRIPT / TAPSELL_SCRIPT / ADSENSE_SLOT), more slot placements (shop pages, events).
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
2026-11-26 (2): moderation tests/i18n, bare-hands protocol, punching players, knockable props, URL filters, house ads + AdSlot.
2026-11-26: travel day strip with prices (code). GPU benchmark tier + lite city on low + per-tier draw budgets (lib/perf/{tier,features}.ts, graphics/bench.ts).
AAA graphics steps 1–7 (film look, medium tier, SSR, night lights, atmosphere, city detail, car look) — see README
"Realistic graphics" … "Car finish". Older waves: see `git log`.
