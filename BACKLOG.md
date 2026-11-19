# StreetQuest — backlog (the one place for open work)

Everything unfinished from every session, in one list. Update it at the end of each session: tick what shipped
(then delete it next time), add what's new. Last gathered: 2026-11-19.

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
   - [ ] **Remixt Radio** (code + unit tests done: `lib/radio.ts` remixt*, `components/drive/radio.ts`): browser
         playback check paused — the user is updating Remixt and will say when to finish. Then: pick it in the 3D
         city (Chrome: starts on its own; iOS sim: the tap card), check the song title shows, switch off → frame gone.
1. **iPad bugs**
   - [~] Zoom stuck after landscape → portrait: `components/game/zoomGuard.ts` re-sets the viewport meta when zoomed
         after a rotation — never seen on a real iPad/simulator yet.
   - [ ] iPad Chrome map view: panel missing / can't zoom back → `100dvh` + `env(safe-area-inset-*)`, layout from `visualViewport`.
   - [ ] Settings tab doesn't fit / won't scroll → own scroller (`overflow-y:auto; overscroll-behavior:contain;
         touch-action: pan-y`), canvas touch handlers ignore events from inside panels; 2 columns ≥768 px.
   - [x] Inputs < 16 px zoom on focus: the 16 px rule now also covers `any-pointer: coarse` (iPad with a trackpad).
   - Tools: iPad simulator (iPad 10th gen + iPad Pro) Safari and Chrome, `xcrun simctl` rotate + screenshot,
     Playwright WebKit iPad profile for regressions, Safari Web Inspector on the sim.
2. **No lag on any device + less heat**
   - [ ] `lib/perf/tier.ts` (pure): tier from a 2 s startup benchmark (frame time of a fixed scene) + `hardwareConcurrency`,
         `deviceMemory`, screen size; cached per device, re-run after updates.
   - [ ] `lib/perf/features.ts` (pure): registry {id, cost, minTier} for post-processing, shadows, MSAA, SSR, rain,
         crowd/traffic/parked counts, street kit, real 3D people (impostors on low), sherpa voices (phone voice on low),
         HRTF, radio, interiors, hidden 2D map. Settings: "Turned off on this device for smoothness: …" + toggles.
   - [ ] Heat: 30 fps cap with real frame pacing on low/mid, DPR 1 on low, ~10 fps when idle (no input, nothing
         moving), no drawing under menus/hidden tab, battery-saver switch, auto step-down when frame time climbs.
   - [ ] Budgets as tests: draw calls / triangles per tier asserted from `renderer.info` in a headless run.
   - Tools: Xcode Instruments (Energy Log + GPU) and Safari Web Inspector Timelines on a cabled iPad, `stats-gl` dev
     overlay, Spector.js for draw calls, `npm run test:lag`, Chrome CPU 4× throttle. Practices: instancing, LOD +
     impostors, object pools, a per-frame time-budgeted work queue (≤4 ms), no React state per frame, KTX2/meshopt assets.
     Target: iPad 7th gen steady 30 fps for 15 min without getting hot.
3. **NPC chat**
   - [ ] One audio channel "talk": neural reads the reply → else a premade line only if its text matches → else
         speechSynthesis; a new line stops the old. Never two voices.
   - [ ] Replies sometimes not spoken: unlock AudioContext + speechSynthesis on the first talk tap (iOS).
   - [ ] Context-aware replies (`lib/street/npcTalk.ts`): per-NPC persona (seeded name, age, temper), role, mood,
         wanted level, armed/unarmed, recent events, place type, time; conversation memory (repeat insults escalate).
         Utility-AI scoring for reactions; optional Claude route per the decision table.
   - [ ] Shopkeepers flee too soon: threat score (car speed toward them, gun drawn, shots, wanted) with hysteresis
         (flee > 0.7, calm < 0.3), shopkeepers braver + stay near the shop, return when calm. Unit tests.
4. **Travel quick fixes**
   - [x] Fuel tiers (settings → Travel planner, `fuelCost`) + "My fuel card still has quota" toggle on the plan.
   - [ ] Shared z-index scale (`--z-map < --z-hud < --z-sheet < --z-dialog < --z-toast`), dialogs portalled to body.
   - [ ] RTL checkbox on the redirect page (logical CSS props, `margin-inline-*`).
   - [ ] Bus duration missing (Tehran → Shiraz): OSRM road km ÷ ~70 km/h bus speed, shown as "about".
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
   - [ ] Mosque/school/bank/hospital/police/government are NOT shops (extend `isShop` everywhere: cards, signs,
         keepers, list/search) → info cards (prayer times computed locally, opening hours).
7. **Shop interiors** — [ ] door → fade into an interior per store type (counter, shelves, fridges, labels from the
   real menu/catalog, keeper behind the counter); city stops drawing inside. Procedural layout + instancing + baked AO,
   one static env map; CC0/CC BY props (Kenney, Poly Haven, Quaternius) via `gltf-transform` (meshopt + KTX2); low tier
   gets a simpler room.
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
- [ ] Relay needs HTTPS + a domain before browsers can use it.

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
