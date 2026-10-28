// Live game settings. Every tunable the admin panel can edit lives here with its
// default. The server loads overrides from the database (GameConfig) and the client
// receives them with /api/me; both call applySettings(), which mutates `S` in place,
// so game code just reads `S.someKey` at call time. Pure.
import { msg } from "./i18n";

export type GoalReward = { xp?: number; coins?: number; gems?: number };
/** A goal counts one metric (see GOAL_METRICS) up to a target. */
export type GoalDef = { key: string; title: string; emoji: string; metric: string; target: number; reward: GoalReward };
/** Personal goals are permanent milestones with tiers (each tier pays once). */
export type MilestoneDef = { key: string; title: string; emoji: string; metric: string; tiers: number[]; reward: GoalReward };
export type GemPack = { key: string; gems: number; priceCents: number; label: string; bonus?: string };
export type AdCreative = { id: string; sponsor: string; title: string; body?: string; imageUrl?: string; videoUrl?: string; clickUrl?: string; active?: boolean };
export type GemOffer = { key: string; gems: number; coins: number; label: string };
/** Bigger money on the map: `amount` toman a pickup (on GPS), bought once for `price` toman, `perCell` extra pickups per area. */
export type MoneyTier = { amount: number; price: number; perCell: number };

const DEFAULTS = {
  // ---- money on the map (toman)
  moneyGps: 10_000,
  moneyHome: 1_000,
  moneyPerCell: 4,
  // Each level is bought from the wallet, in order, and adds its own pickups on top of
  // the free ones (fractional perCell = a chance). Each pays back in a few walks.
  moneyTiers: [
    { amount: 20_000, price: 100_000, perCell: 2 },
    { amount: 50_000, price: 400_000, perCell: 1 },
    { amount: 100_000, price: 1_000_000, perCell: 0.5 },
  ] as MoneyTier[],
  mapMaxItems: 10,
  placeVisitToman: 10_000,
  placeDeliverToman: 20_000,
  moneyDailyCap: 0,
  cashoutMin: 1_000_000,
  cashoutEnabled: true,

  // ---- players & map
  interactRadius: 60,
  claimSlack: 15,
  maxSpeedKmh: 250,
  footSpeedKmh: 25,
  viewRadiusKm: 8,
  testMode: false,

  // ---- play from home
  remoteEnabled: true,
  remoteRewardMult: 0.5,
  remoteSpeedKmh: 40,
  driveSpeedKmh: 80,

  // ---- real places & businesses
  placeMissionShare: 1,
  bizEnabled: true,
  bizCampaignMaxCoins: 200,
  bizTrialDays: 14,

  // ---- social
  socialEnabled: true,
  socialPostsPerHour: 6,

  // ---- rewards & economy
  xpMult: 1,
  coinMult: 1,
  sellMult: 1,
  startCoins: 100,
  startGems: 25,
  referralCoins: 150,
  dailyCoinsBase: 25,
  dailyCoinsStep: 10,
  dailyXpBase: 30,
  dailyXpStep: 10,
  dailyStreakCap: 7,
  dailyGems: 1,
  levelUpGems: 2,
  achievementGems: 5,
  questGemsCampaign: 5,
  questGemsDaily: 2,

  // ---- GPS games & story
  huntMinM: 150,
  huntMaxM: 350,
  huntMinutes: 15,
  huntXp: 150,
  huntCoins: 80,
  sprintMeters: 400,
  sprintMinutes: 6,
  sprintXp: 120,
  sprintCoins: 60,
  rallyCheckpoints: 3,
  rallyMinutes: 20,
  rallyXp: 250,
  rallyCoins: 120,
  gpsGameGems: 1,
  gpsGameCooldownMin: 3,
  storyEnabled: true,

  // ---- goals
  goalsEnabled: true,
  worldGoals: [
    { key: "w_money", title: msg("Operation Cash Rain"), emoji: "💵", metric: "money", target: 20000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_place", title: msg("Operation Main Street"), emoji: "🏪", metric: "place", target: 5000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_walk", title: msg("Operation Long March"), emoji: "🥾", metric: "walk_m", target: 2_000_000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_steps", title: msg("Operation Ten Million Steps"), emoji: "👟", metric: "steps", target: 10_000_000, reward: { xp: 500, coins: 300, gems: 10 } },
  ] as GoalDef[],
  factionGoals: [] as GoalDef[],
  personalGoals: [
    { key: "p_money", title: msg("Money Hunter"), emoji: "💵", metric: "money", tiers: [10, 50, 200, 500, 1000], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_place", title: msg("Regular"), emoji: "🏪", metric: "place", tiers: [5, 25, 100, 300, 1000], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_steps", title: msg("Step Master"), emoji: "👟", metric: "steps", tiers: [10_000, 50_000, 200_000, 500_000, 1_000_000], reward: { xp: 200, coins: 150, gems: 4 } },
    { key: "p_empire", title: msg("Tycoon"), emoji: "🏦", metric: "empire_rank", tiers: [1, 3, 5, 8, 12], reward: { xp: 200, coins: 150, gems: 4 } },
    { key: "p_walk", title: msg("Road Warrior"), emoji: "🥾", metric: "walk_m", tiers: [1000, 5000, 20000, 50000, 100000], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_gps", title: msg("Explorer"), emoji: "🧭", metric: "gps_game", tiers: [1, 5, 15, 40, 100], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_story", title: msg("Storyteller"), emoji: "📖", metric: "story", tiers: [1, 3, 6, 10], reward: { xp: 250, coins: 150, gems: 5 } },
  ] as MilestoneDef[],

  // ---- store & ads (monetization)
  storeEnabled: true,
  gemPacks: [
    { key: "pouch", gems: 80, priceCents: 99, label: msg("Pouch of Gems") },
    { key: "bag", gems: 500, priceCents: 499, label: msg("Bag of Gems"), bonus: msg("+25%") },
    { key: "box", gems: 1200, priceCents: 999, label: msg("Box of Gems"), bonus: msg("Popular") },
    { key: "chest", gems: 2800, priceCents: 1999, label: msg("Chest of Gems"), bonus: msg("+40%") },
    { key: "vault", gems: 7500, priceCents: 4999, label: msg("Vault of Gems"), bonus: msg("Best value") },
  ] as GemPack[],
  gemOffers: [
    { key: "coins_s", gems: 10, coins: 500, label: msg("Coin Pouch") },
    { key: "coins_m", gems: 45, coins: 2500, label: msg("Coin Sack") },
    { key: "coins_l", gems: 160, coins: 10000, label: msg("Coin Crate") },
  ] as GemOffer[],
  currency: "usd",
  adsEnabled: true,
  adNetworkEnabled: true,
  adSeconds: 15,
  adGems: 3,
  adCoins: 50,
  adDailyLimit: 5,
  adCreatives: [] as AdCreative[],

  // ---- player shops
  shopsEnabled: true,
  shopOpenCost: 300,
  shopRenewCost: 300,
  shopDays: 30,
  shopFeePct: 5,
  shopMaxProducts: 60,
  shopMaxFeatured: 8,
  shopMaxPhotos: 5,
  shopMaxPrice: 1_000_000,
  shopOrderDays: 7,

  // ---- game data (stat overrides, edited in the admin "Game data" tab)
  catalog: {} as CatalogOverrides,
};

export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;
export type SettingType = "number" | "bool" | "text" | "json";
/** Per-entry stat overrides for the game catalogs: { units: { tank: { atk: 20 } }, ... } */
export type CatalogOverrides = Partial<Record<"items", Record<string, Record<string, number>>>>;
export type SettingDef = { key: SettingKey; group: string; label: string; help: string; min?: number; max?: number; step?: number };

/** What the admin panel shows, grouped. Every key in DEFAULTS appears once. */
export const SETTING_DEFS: SettingDef[] = [
  { key: "moneyGps", group: msg("Money & cash-out"), label: msg("Money per pickup on GPS (toman)"), help: msg("What one pickup on the map pays a player who walks there with real GPS."), min: 0, max: 10_000_000 },
  { key: "moneyHome", group: msg("Money & cash-out"), label: msg("Money per pickup from home (toman)"), help: msg("What one pickup pays a player in Play from home. Admin drops and store missions are scaled by the same ratio."), min: 0, max: 10_000_000 },
  { key: "moneyPerCell", group: msg("Money & cash-out"), label: msg("Money pickups per area"), help: msg("How many pickups the game places in each ~450 m map cell every 20 minutes. 0 = only admin drops."), min: 0, max: 20 },
  { key: "moneyTiers", group: msg("Money & cash-out"), label: msg("Money levels"), help: msg("Bigger money on the map. Players buy each level from their wallet, in order; until then they don't see its pickups. Amounts are for GPS (from home they're scaled like the rest); the price is the same for everyone.") },
  { key: "mapMaxItems", group: msg("Money & cash-out"), label: msg("Items visible on the map"), help: msg("Most money pickups and store missions shown to a player at once — the nearest ones, admin drops first."), min: 1, max: 50 },
  { key: "placeVisitToman", group: msg("Money & cash-out"), label: msg("Store check-in mission (toman)"), help: msg("Paid for checking in at a store on GPS."), min: 0, max: 10_000_000 },
  { key: "placeDeliverToman", group: msg("Money & cash-out"), label: msg("Store delivery mission (toman)"), help: msg("Paid for delivering an order from a store on GPS."), min: 0, max: 10_000_000 },
  { key: "moneyDailyCap", group: msg("Money & cash-out"), label: msg("Daily earning cap per player (toman)"), help: msg("Most toman one player can earn in a day. 0 = no cap."), min: 0, max: 1_000_000_000 },
  { key: "cashoutMin", group: msg("Money & cash-out"), label: msg("Minimum cash-out (toman)"), help: msg("Players can ask to be paid once their wallet reaches this."), min: 1000, max: 1_000_000_000 },
  { key: "cashoutEnabled", group: msg("Money & cash-out"), label: msg("Cash-out requests on"), help: msg("Turn off to pause new cash-out requests (pending ones stay in the list).") },
  { key: "interactRadius", group: msg("Players & map"), label: msg("Player reach (m)"), help: msg("How close a player must be to pick up money and do store missions."), min: 10, max: 500 },
  { key: "claimSlack", group: msg("Players & map"), label: msg("GPS slack (m)"), help: msg("Extra metres the server forgives on top of the reach, to absorb GPS error."), min: 0, max: 200 },
  { key: "maxSpeedKmh", group: msg("Players & map"), label: msg("Anti-cheat max speed (km/h)"), help: msg("GPS jumps faster than this are ignored. Cars and trains are fine at the default."), min: 50, max: 2000 },
  { key: "footSpeedKmh", group: msg("Players & map"), label: msg("On-foot speed limit (km/h)"), help: msg("Movement faster than this doesn't count toward walking goals and sprints (so driving doesn't count)."), min: 5, max: 200 },
  { key: "viewRadiusKm", group: msg("Players & map"), label: msg("Map view radius (km)"), help: msg("How far away other players and events are loaded."), min: 1, max: 50, step: 0.5 },
  { key: "testMode", group: msg("Players & map"), label: msg("Test mode for everyone"), help: msg("Instant teleports for testing — they never earn toman, and while this is on nobody earns toman on GPS. Off by default in production (admins always have it; local dev always has it). Players use Play from home instead.") },

  { key: "remoteEnabled", group: msg("Play from home"), label: msg("Play from home on"), help: msg("Players who don't want to walk can play from the couch: they move by tapping the map and travel at a capped speed.") },
  { key: "remoteRewardMult", group: msg("Play from home"), label: msg("Reward multiplier at home"), help: msg("XP and coins earned from home are multiplied by this (0.5 = half). Toman from home is set under Money & cash-out."), min: 0, max: 1, step: 0.05 },
  { key: "remoteSpeedKmh", group: msg("Play from home"), label: msg("Travel speed at home (km/h)"), help: msg("How fast a home player's commander moves across the map toward where they tapped."), min: 5, max: 1000 },
  { key: "driveSpeedKmh", group: msg("Play from home"), label: msg("3D car top speed (km/h)"), help: msg("Players driving the 3D city from home can move this fast; the server accepts positions up to this speed."), min: 10, max: 300 },

  { key: "placeMissionShare", group: msg("Real places & businesses"), label: msg("Places with a mission"), help: msg("Share of real shops, restaurants and cafés that offer a mission in each 30-minute window (1 = every store)."), min: 0, max: 1, step: 0.05 },
  { key: "bizEnabled", group: msg("Real places & businesses"), label: msg("Business accounts on"), help: msg("Real stores can register, claim their place on the map and post campaigns.") },
  { key: "bizCampaignMaxCoins", group: msg("Real places & businesses"), label: msg("Max coins per campaign visit"), help: msg("The most coins a business campaign can pay a player per check-in or redemption."), min: 0, max: 5000 },
  { key: "bizTrialDays", group: msg("Real places & businesses"), label: msg("Free trial (days)"), help: msg("How long a new business can try the Starter plan for free (once)."), min: 0, max: 90 },

  { key: "socialEnabled", group: msg("Social"), label: msg("Social feed on"), help: msg("Players can post, follow each other, like and comment.") },
  { key: "socialPostsPerHour", group: msg("Social"), label: msg("Posts per hour (max)"), help: msg("How many posts one player can publish per hour — keeps the feed free of spam."), min: 1, max: 100 },

  { key: "xpMult", group: msg("Rewards & economy"), label: msg("Global XP ×"), help: msg("Multiplies all XP players earn (events, weekends…)."), min: 0, max: 20, step: 0.1 },
  { key: "coinMult", group: msg("Rewards & economy"), label: msg("Global coin ×"), help: msg("Multiplies coins created by the game (not transfers between players or refunds)."), min: 0, max: 20, step: 0.1 },
  { key: "sellMult", group: msg("Rewards & economy"), label: msg("Item sell price ×"), help: msg("Multiplies what items in the bag sell for."), min: 0, max: 20, step: 0.1 },
  { key: "startCoins", group: msg("Rewards & economy"), label: msg("Starting coins"), help: msg("Coins a new player starts with."), min: 0, max: 100000 },
  { key: "startGems", group: msg("Rewards & economy"), label: msg("Starting gems"), help: "", min: 0, max: 10000 },
  { key: "referralCoins", group: msg("Rewards & economy"), label: msg("Referral bonus (coins)"), help: msg("Paid to both the inviter and the new player."), min: 0, max: 100000 },
  { key: "dailyCoinsBase", group: msg("Rewards & economy"), label: msg("Daily reward coins (base)"), help: msg("Daily coins = base + step × streak (capped)."), min: 0, max: 100000 },
  { key: "dailyCoinsStep", group: msg("Rewards & economy"), label: msg("Daily reward coins (per streak day)"), help: "", min: 0, max: 10000 },
  { key: "dailyXpBase", group: msg("Rewards & economy"), label: msg("Daily reward XP (base)"), help: "", min: 0, max: 100000 },
  { key: "dailyXpStep", group: msg("Rewards & economy"), label: msg("Daily reward XP (per streak day)"), help: "", min: 0, max: 10000 },
  { key: "dailyStreakCap", group: msg("Rewards & economy"), label: msg("Daily streak cap (days)"), help: msg("Streak bonus stops growing after this many days."), min: 1, max: 365 },
  { key: "dailyGems", group: msg("Rewards & economy"), label: msg("Daily reward gems"), help: msg("Gems in every daily drop (doubled on day 7+)."), min: 0, max: 1000 },
  { key: "levelUpGems", group: msg("Rewards & economy"), label: msg("Gems per level-up"), help: "", min: 0, max: 1000 },
  { key: "achievementGems", group: msg("Rewards & economy"), label: msg("Gems per achievement"), help: "", min: 0, max: 1000 },
  { key: "questGemsCampaign", group: msg("Rewards & economy"), label: msg("Gems per campaign quest"), help: "", min: 0, max: 1000 },
  { key: "questGemsDaily", group: msg("Rewards & economy"), label: msg("Gems per daily quest"), help: "", min: 0, max: 1000 },

  { key: "huntMinM", group: msg("GPS games & story"), label: msg("Treasure hunt: min distance (m)"), help: "", min: 20, max: 5000 },
  { key: "huntMaxM", group: msg("GPS games & story"), label: msg("Treasure hunt: max distance (m)"), help: "", min: 20, max: 10000 },
  { key: "huntMinutes", group: msg("GPS games & story"), label: msg("Treasure hunt: time limit (min)"), help: "", min: 1, max: 240 },
  { key: "huntXp", group: msg("GPS games & story"), label: msg("Treasure hunt: XP"), help: "", min: 0, max: 100000 },
  { key: "huntCoins", group: msg("GPS games & story"), label: msg("Treasure hunt: coins"), help: "", min: 0, max: 100000 },
  { key: "sprintMeters", group: msg("GPS games & story"), label: msg("Sprint: distance (m)"), help: "", min: 50, max: 20000 },
  { key: "sprintMinutes", group: msg("GPS games & story"), label: msg("Sprint: time limit (min)"), help: "", min: 1, max: 240 },
  { key: "sprintXp", group: msg("GPS games & story"), label: msg("Sprint: XP"), help: "", min: 0, max: 100000 },
  { key: "sprintCoins", group: msg("GPS games & story"), label: msg("Sprint: coins"), help: "", min: 0, max: 100000 },
  { key: "rallyCheckpoints", group: msg("GPS games & story"), label: msg("Rally: checkpoints"), help: "", min: 2, max: 10 },
  { key: "rallyMinutes", group: msg("GPS games & story"), label: msg("Rally: time limit (min)"), help: "", min: 1, max: 240 },
  { key: "rallyXp", group: msg("GPS games & story"), label: msg("Rally: XP"), help: "", min: 0, max: 100000 },
  { key: "rallyCoins", group: msg("GPS games & story"), label: msg("Rally: coins"), help: "", min: 0, max: 100000 },
  { key: "gpsGameGems", group: msg("GPS games & story"), label: msg("GPS game win: gems"), help: "", min: 0, max: 1000 },
  { key: "gpsGameCooldownMin", group: msg("GPS games & story"), label: msg("Cooldown between GPS games (min)"), help: "", min: 0, max: 1440 },
  { key: "storyEnabled", group: msg("GPS games & story"), label: msg("Story missions on"), help: "" },

  { key: "goalsEnabled", group: msg("Goals"), label: msg("Goals on"), help: msg("World, faction and personal goals.") },
  { key: "worldGoals", group: msg("Goals"), label: msg("World operations (rotate weekly)"), help: msg("Everyone works toward one goal per week; everyone who contributed claims the reward. Metrics: see the list under this section.") },
  { key: "factionGoals", group: msg("Goals"), label: msg("Faction goals (rotate weekly)"), help: msg("Each faction works toward the same goal; members who contributed claim the reward.") },
  { key: "personalGoals", group: msg("Goals"), label: msg("Personal milestones"), help: msg("Permanent tiers; each tier pays its reward × tier number.") },

  { key: "storeEnabled", group: msg("Store & ads"), label: msg("Gem store on"), help: msg("Real-money purchases need STRIPE_SECRET_KEY set on the server.") },
  { key: "gemPacks", group: msg("Store & ads"), label: msg("Gem packs (real money)"), help: msg("priceCents is in the currency below (e.g. 499 = 4.99).") },
  { key: "currency", group: msg("Store & ads"), label: msg("Currency"), help: msg("ISO code Stripe charges in, e.g. usd, eur, gbp.") },
  { key: "gemOffers", group: msg("Store & ads"), label: msg("Coin offers (paid in gems)"), help: "" },
  { key: "adsEnabled", group: msg("Store & ads"), label: msg("Rewarded ads on"), help: msg("Players watch a sponsor spot to earn gems and coins.") },
  { key: "adNetworkEnabled", group: msg("Store & ads"), label: msg("Google video ads on"), help: msg("Needs ADSENSE_CLIENT on the server. Players get a Google rewarded video first; where Google has no ad (some countries, ad blockers), they see a sponsor spot instead.") },
  { key: "adSeconds", group: msg("Store & ads"), label: msg("Ad length (s)"), help: "", min: 3, max: 120 },
  { key: "adGems", group: msg("Store & ads"), label: msg("Gems per ad"), help: "", min: 0, max: 1000 },
  { key: "adCoins", group: msg("Store & ads"), label: msg("Coins per ad"), help: "", min: 0, max: 100000 },
  { key: "adDailyLimit", group: msg("Store & ads"), label: msg("Ads per player per day"), help: "", min: 0, max: 100 },
  { key: "adCreatives", group: msg("Store & ads"), label: msg("Sponsor ads"), help: msg("Ads players watch. With none, the game shows its own invite-a-friend spot.") },
  { key: "shopsEnabled", group: msg("Player shops"), label: msg("Player shops on"), help: msg("Players can open a shop at a real place and sell items for coins.") },
  { key: "shopOpenCost", group: msg("Player shops"), label: msg("Opening cost (coins)"), help: msg("Paid once when a shop opens; covers its first month."), min: 0, max: 1000000 },
  { key: "shopRenewCost", group: msg("Player shops"), label: msg("Renewal cost (coins)"), help: msg("Each renewal keeps the shop open for another period."), min: 0, max: 1000000 },
  { key: "shopDays", group: msg("Player shops"), label: msg("Days per period"), help: msg("How long a shop stays open after opening or renewing."), min: 1, max: 365 },
  { key: "shopFeePct", group: msg("Player shops"), label: msg("Market fee (%)"), help: msg("Taken from the seller's payout when an order is handed over."), min: 0, max: 50 },
  { key: "shopMaxProducts", group: msg("Player shops"), label: msg("Products per shop"), help: "", min: 1, max: 500 },
  { key: "shopMaxFeatured", group: msg("Player shops"), label: msg("Shop window slots"), help: msg("How many products a seller can feature in their shop window."), min: 1, max: 30 },
  { key: "shopMaxPhotos", group: msg("Player shops"), label: msg("Photos per product"), help: "", min: 1, max: 10 },
  { key: "shopMaxPrice", group: msg("Player shops"), label: msg("Highest price (coins)"), help: "", min: 10, max: 100000000 },
  { key: "shopOrderDays", group: msg("Player shops"), label: msg("Days to hand an order over"), help: msg("Orders not handed over in time are refunded to the buyer automatically."), min: 1, max: 60 },
  { key: "catalog", group: msg("Game data"), label: msg("Stat overrides"), help: msg("Edited in the Game data tab.") },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** The live settings. Mutated in place by applySettings — always read at call time. */
export const S: Settings = clone(DEFAULTS);
export const settingDefault = <K extends SettingKey>(k: K): Settings[K] => clone(DEFAULTS[k]);
export const settingType = (k: SettingKey): SettingType => {
  const v = DEFAULTS[k];
  return typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : typeof v === "string" ? "text" : "json";
};

/** Keep only known keys with the right type and within the allowed range. */
export function sanitizeSettings(over: unknown): Partial<Settings> {
  const out: Record<string, unknown> = {};
  if (!over || typeof over !== "object") return out;
  for (const def of SETTING_DEFS) {
    const v = (over as Record<string, unknown>)[def.key];
    if (v === undefined) continue;
    const t = settingType(def.key);
    if (t === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      out[def.key] = Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
    } else if (t === "bool") {
      if (typeof v === "boolean") out[def.key] = v;
    } else if (t === "text") {
      if (typeof v === "string" && v.length < 40) out[def.key] = v;
    } else if (Array.isArray(DEFAULTS[def.key]) ? Array.isArray(v) : typeof v === "object" && v) {
      out[def.key] = v;
    }
  }
  return out as Partial<Settings>;
}

/** Reset to defaults, then apply overrides. Returns the live object. */
export function applySettings(over: unknown) {
  const clean = sanitizeSettings(over);
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) (S as Record<string, unknown>)[k] = k in clean ? clone(clean[k]) : clone(DEFAULTS[k]);
  return S;
}

/** Metrics that goals can count. Game events feed them (see server/goals.ts). */
export const GOAL_METRICS: Record<string, string> = {
  money: msg("Money picked up"),
  place: msg("Store missions done"),
  run: msg("Deliveries finished"),
  steps: msg("Steps walked"),
  empire_rank: msg("Empire ranks reached"),
  post: msg("Posts pinned"),
  walk_m: msg("Metres walked"),
  gps_game: msg("GPS games won"),
  story: msg("Story chapters finished"),
  ads: msg("Sponsor spots watched"),
};
