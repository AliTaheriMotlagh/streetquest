# StreetQuest — how it makes money

StreetQuest is now three products in one app: a **game** (walk, or drive the 3D city
from home), a **local social network** (posts, check-ins, followers), and a **foot-traffic
channel for real stores** (missions and coupons at their door). Each one has its own
revenue, and they feed each other: players create the audience, the audience is what
stores pay for, and stores create missions that make the game feel alive.

## 1. What's already built and can charge today

| Stream | Who pays | How it works in the app | Price |
|---|---|---|---|
| Business plans | Local stores | Business center → Plans. Claim the store, run missions, redeem coupons, see visits | Free · Starter $29 · Pro $99 · Chain $299 / month |
| Gem packs | Players | Store → gem packs (Stripe Checkout) | $0.99 – $49.99 |
| Rewarded video | Advertisers (via Google H5 Games Ads) | "Free gems" button plays an ad first | eCPM-based |
| Sponsor spots | Brands, directly | Admin → sponsor creatives; timed views, click tracking | flat fee / CPM you set |
| Market fee | Player shop sellers | 5% of each sale (setting `shopFeePct`) | % of GMV |
| Shop rent | Player shop owners | 300 coins / month to keep a shop open | coins → drives gem sales |

The business plan is the big one. A store's alternative is Instagram ads or flyers, where
it never learns whether anyone walked in. Here it gets **verified visits** (the player
was physically at the door, checked by GPS on the server) and **verified sales** (the
cashier typed the player's coupon code). That's the pitch.

### Plan design (in `src/lib/business.ts`)

- **Free**: real name on the map, 1 visit mission, 30 visits/month. This is the hook,
  because most owners won't pay before they've seen a customer.
- **Starter $29**: coupons, 3 missions, 500 visits. Every new store gets a 14-day free trial.
- **Pro $99**: gold pin, 3D billboard over the store, pinned in the nearby feed, push to
  players near the store, 10 missions, 3,000 visits.
- **Chain $299**: up to 10 locations.

Coins paid to players come from the game, not from the store. They cost you nothing real,
and they're what makes a player cross the street.

## 2. What to add next (in order of money per week of work)

1. **Local payment gateway.** Stripe doesn't work for Iranian cards or businesses. Add
   Zarinpal or IDPay (or Pay.ir) next to Stripe in `src/server/store.ts`. `stripeCheckout()`
   is already generic, so a second provider is a small change. Price plans in Toman for
   Iran (e.g. Starter ≈ the price of one small Instagram ad campaign).
2. **Pay-per-result for stores that won't subscribe.** Charge per verified check-in
   (e.g. $0.20–$0.50) and per redeemed coupon ($1–$3) from a prepaid wallet. The data is
   already recorded (`BizVisit`, `redeemedAt`). This is the easiest sale ("you only pay
   when someone comes in").
3. **StreetQuest+ subscription for players ($3.99–$4.99/month).** Full rewards when
   playing from home (instead of ×0.5), exclusive cars and paint jobs, no ads. Home
   players are the ones most willing to pay, because they're trading money for not walking.
4. **Cars and cosmetics.** The 3D city has a car; sell skins, rims, horns, trails and
   premium models for gems. Cosmetics are the top-grossing item in every top-10 game, and
   they don't hurt fairness.
5. **City Pass (battle pass), monthly.** Free and paid tracks of rewards for weekly goals
   (deliveries, check-ins, steps).
6. **Brand campaigns.** National brands (drinks, food delivery, telecoms, banks) buy a
   city-wide "event week": a branded mission chain, billboards on real buildings in the 3D
   city, a feed takeover. Sell as a package (e.g. $2k–$20k per city per week depending on
   audience size).
7. **QR code at the till** instead of typing the coupon: faster for cashiers, so more
   redemptions get recorded and the numbers look better at renewal time.

## 3. Later: bigger, slower bets

- **Foot-traffic insights.** Aggregated, anonymised "how many players pass this street,
  at what hour" reports for landlords, franchise scouts and city tourism boards. Only with
  strict aggregation (never individuals) and a clear privacy policy.
- **Tourism and city partnerships.** City councils and malls pay for a "discover the
  district" story chapter that walks people past their sights and shops.
- **Courier network.** The game already has deliveries and rides. Partnering with a real
  delivery company is possible, but it brings licensing, insurance and labour-law questions.
  Keep in-game deliveries virtual until there's legal advice.

## 4. Getting the first 100 paying stores

1. **One neighbourhood first.** Pick a busy shopping street. Density beats reach:
   20 active stores on one street make the game feel real; 20 stores across a whole city
   don't.
2. **Seed it yourself.** Walk in, help the owner claim the store (it takes a minute from
   inside), and turn on the 14-day trial. Post the first mission for them ("check in for
   50 coins").
3. **Bring players the same week.** A local event ("Saturday street race on X street"),
   Instagram/Telegram posts with the share links (`?ref=` referrals already pay 150
   coins), and push notifications to everyone who played nearby.
4. **Renewal meeting at day 12.** Show the owner their dashboard: visits, coupons
   redeemed, repeat customers. Convert to Starter or Pro.
5. **Then the next street.** Each new street makes the city better for the players
   already there.

**Numbers to watch** (most are already in Admin → KPIs / Metrics): daily active players
per neighbourhood, check-ins per store per week, coupon redemption rate, trial → paid
conversion, store churn, gem purchase conversion, D1/D7/D30 player retention.

## 5. A rough model (illustrative only, not a forecast)

All inputs are assumptions to replace with real numbers once you have them.

| | Year 1, one city | Year 2, five cities |
|---|---|---|
| Monthly active players | 20,000 | 150,000 |
| Paying players (2%) × $5/month | $2,000 / mo | $15,000 / mo |
| Paying stores × avg $45/month | 150 → $6,750 / mo | 1,200 → $54,000 / mo |
| Ads + brand campaigns | $1,500 / mo | $20,000 / mo |
| **Monthly revenue (end of year)** | **≈ $10k** | **≈ $89k** |

The business side matters more than it first looks. Stores pay every month whether or not
a given player spends, and their revenue grows with player density, not just player
count.

## 6. Costs and risks to plan for

- **Map data at scale.** The 3D city and real places come from OpenStreetMap via public
  Overpass servers, cached per ~450 m cell for a month. That's fine to launch with. Past a
  few thousand daily players, run your own Overpass instance (set `OVERPASS_URL`) or buy a
  commercial vector-tile feed, and switch the 2D map tiles to a paid provider
  (`NEXT_PUBLIC_TILE_URL`). OpenStreetMap data must be credited (the map already shows
  "© OpenStreetMap contributors"; add it to the 3D view's about/credits too).
- **Fake claims.** Anyone standing in a shop can claim it. Keep the admin "Verified"
  badge for checked owners, handle disputes ("contact support if it's yours"), and later
  verify by phone call or a postcard code.
- **Location privacy.** Strangers' positions are already fuzzed and posts are rounded to
  ~100 m. Keep it that way, and publish a privacy policy before selling any insights.
- **The lottery feature.** If tickets are bought with real money (or with gems bought with
  real money) and the pot can be cashed out, that's gambling in most countries, Iran
  included. Keep the lottery coin-only with no cash-out, or remove it before marketing to
  stores and app stores.
- **App stores.** If you wrap the web app for iOS/Android, digital items (gems, StreetQuest+,
  cars) must use Apple/Google in-app purchase. Business plans are B2B services and can
  stay on your own payment page.
- **Payments in Iran.** Stripe and Google AdSense don't pay out there; use a local gateway
  and a local ad network (e.g. Tapsell or Yektanet) for Iranian traffic.
