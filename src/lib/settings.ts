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

const DEFAULTS = {
  // ---- players & map
  interactRadius: 60,
  claimSlack: 15,
  spawnMin: 3,
  spawnMax: 6,
  goldenHourMult: 2,
  maxSpeedKmh: 250,
  footSpeedKmh: 25,
  viewRadiusKm: 8,
  breachRange: 200,
  siegeRange: 5000,
  shootRange: 60,
  baseSpacing: 250,
  testMode: false,

  // ---- play from home
  remoteEnabled: true,
  remoteRewardMult: 0.5,
  remoteSpeedKmh: 40,

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
  rushMinutesPerGem: 1,

  // ---- base & army
  buildTimeMult: 1,
  trainTimeMult: 1,
  researchTimeMult: 1,
  buildCostMult: 1,
  unitCostMult: 1,
  supplyPerLevelHour: 60,
  supplyCapHours: 12,
  relocateCost: 500,
  shieldHours: 2,
  siegeCooldownMin: 30,

  // ---- territory
  outpostIncomeHour: 40,
  flagIncomeHour: 30,
  flagCost: 300,
  flagCaptureSeconds: 60,
  flagRadius: 30,

  // ---- street combat
  playerMaxHp: 100,
  hpRegenS: 6,
  downedMin: 3,
  rookieLevel: 3,
  downedCoinLoss: 0.05,
  shootDmg: 16,
  shootCooldownS: 6,

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
    { key: "w_collect", title: msg("Operation Scavenge"), emoji: "🌍", metric: "collect", target: 5000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_boss", title: msg("Operation Titanfall"), emoji: "🐉", metric: "boss_dmg", target: 250000, reward: { xp: 600, coins: 400, gems: 15 } },
    { key: "w_walk", title: msg("Operation Long March"), emoji: "🥾", metric: "walk_m", target: 2_000_000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_raiders", title: msg("Operation Iron Wall"), emoji: "🛡️", metric: "raiders", target: 20000, reward: { xp: 500, coins: 300, gems: 10 } },
  ] as GoalDef[],
  factionGoals: [
    { key: "f_outpost", title: msg("Hold the Line"), emoji: "🚩", metric: "outpost", target: 60, reward: { xp: 300, coins: 250, gems: 5 } },
    { key: "f_train", title: msg("Mass Mobilization"), emoji: "🪖", metric: "train", target: 3000, reward: { xp: 300, coins: 250, gems: 5 } },
    { key: "f_siege", title: msg("Total War"), emoji: "⚔️", metric: "siege_win", target: 150, reward: { xp: 350, coins: 300, gems: 6 } },
    { key: "f_collect", title: msg("Supply Run"), emoji: "📦", metric: "collect", target: 1500, reward: { xp: 300, coins: 200, gems: 5 } },
  ] as GoalDef[],
  personalGoals: [
    { key: "p_walk", title: msg("Road Warrior"), emoji: "🥾", metric: "walk_m", tiers: [1000, 5000, 20000, 50000, 100000], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_collect", title: msg("Scavenger"), emoji: "🎒", metric: "collect", tiers: [10, 50, 200, 500, 1000], reward: { xp: 120, coins: 80, gems: 2 } },
    { key: "p_siege", title: msg("Conqueror"), emoji: "⚔️", metric: "siege_win", tiers: [1, 5, 20, 50, 100], reward: { xp: 200, coins: 150, gems: 3 } },
    { key: "p_train", title: msg("Warlord"), emoji: "🪖", metric: "train", tiers: [10, 50, 200, 500, 1000], reward: { xp: 120, coins: 100, gems: 2 } },
    { key: "p_boss", title: msg("Titan Slayer"), emoji: "🐉", metric: "boss_dmg", tiers: [500, 2500, 10000, 50000], reward: { xp: 250, coins: 200, gems: 4 } },
    { key: "p_gps", title: msg("Explorer"), emoji: "🧭", metric: "gps_game", tiers: [1, 5, 15, 40, 100], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_kills", title: msg("Sharpshooter"), emoji: "🎯", metric: "kills", tiers: [5, 25, 100, 300], reward: { xp: 200, coins: 120, gems: 3 } },
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
  healGems: 5,
  refreshGems: 5,
  shieldGems: 30,
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
export type CatalogOverrides = Partial<Record<"units" | "buildings" | "towers" | "items" | "research", Record<string, Record<string, number>>>>;
export type SettingDef = { key: SettingKey; group: string; label: string; help: string; min?: number; max?: number; step?: number };

/** What the admin panel shows, grouped. Every key in DEFAULTS appears once. */
export const SETTING_DEFS: SettingDef[] = [
  { key: "interactRadius", group: msg("Players & map"), label: msg("Player reach (m)"), help: msg("How close a player must be to collect, start runs, play arcades and finish missions."), min: 10, max: 500 },
  { key: "claimSlack", group: msg("Players & map"), label: msg("GPS slack (m)"), help: msg("Extra metres the server forgives on top of the reach, to absorb GPS error."), min: 0, max: 200 },
  { key: "spawnMin", group: msg("Players & map"), label: msg("Spawns per area (min)"), help: msg("Fewest spawns in each ~450 m map cell per 20-minute window."), min: 0, max: 20 },
  { key: "spawnMax", group: msg("Players & map"), label: msg("Spawns per area (max)"), help: msg("Most spawns in each map cell per window."), min: 1, max: 30 },
  { key: "goldenHourMult", group: msg("Players & map"), label: msg("Golden-hour XP ×"), help: msg("Spawn XP multiplier at dawn and dusk."), min: 1, max: 10, step: 0.1 },
  { key: "maxSpeedKmh", group: msg("Players & map"), label: msg("Anti-cheat max speed (km/h)"), help: msg("GPS jumps faster than this are ignored. Cars and trains are fine at the default."), min: 50, max: 2000 },
  { key: "footSpeedKmh", group: msg("Players & map"), label: msg("On-foot speed limit (km/h)"), help: msg("Movement faster than this doesn't count toward walking goals and sprints (so driving doesn't count)."), min: 5, max: 200 },
  { key: "viewRadiusKm", group: msg("Players & map"), label: msg("Map view radius (km)"), help: msg("How far away other players, bases and events show on the map."), min: 1, max: 50, step: 0.5 },
  { key: "breachRange", group: msg("Players & map"), label: msg("FPS breach range (m)"), help: msg("Walk this close to an enemy base or boss to fight it in first person."), min: 20, max: 2000 },
  { key: "siegeRange", group: msg("Players & map"), label: msg("Army range from base (m)"), help: msg("Armies can siege and march this far from your base."), min: 500, max: 50000 },
  { key: "shootRange", group: msg("Players & map"), label: msg("Street-combat range (m)"), help: msg("Shoot rival commanders, towers and squads within this distance."), min: 10, max: 500 },
  { key: "baseSpacing", group: msg("Players & map"), label: msg("Min distance between bases (m)"), help: "", min: 0, max: 5000 },
  { key: "testMode", group: msg("Players & map"), label: msg("Test mode for everyone"), help: msg("Instant teleports with full rewards — for testing. Off by default in production (admins always have it; local dev always has it). Players use Play from home instead.") },

  { key: "remoteEnabled", group: msg("Play from home"), label: msg("Play from home on"), help: msg("Players who don't want to walk can play from the couch: they move by tapping the map and travel at a capped speed.") },
  { key: "remoteRewardMult", group: msg("Play from home"), label: msg("Reward multiplier at home"), help: msg("XP and coins earned from home are multiplied by this (0.5 = half). Walking players always get full rewards."), min: 0, max: 1, step: 0.05 },
  { key: "remoteSpeedKmh", group: msg("Play from home"), label: msg("Travel speed at home (km/h)"), help: msg("How fast a home player's commander moves across the map toward where they tapped."), min: 5, max: 1000 },

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
  { key: "rushMinutesPerGem", group: msg("Rewards & economy"), label: msg("Rush: minutes per gem"), help: msg("Finishing a timer instantly costs 1 gem per this many minutes left."), min: 0.1, max: 600, step: 0.1 },

  { key: "buildTimeMult", group: msg("Base & army"), label: msg("Build time ×"), help: msg("Multiplies every construction timer."), min: 0.01, max: 20, step: 0.01 },
  { key: "trainTimeMult", group: msg("Base & army"), label: msg("Training time ×"), help: "", min: 0.01, max: 20, step: 0.01 },
  { key: "researchTimeMult", group: msg("Base & army"), label: msg("Research time ×"), help: "", min: 0.01, max: 20, step: 0.01 },
  { key: "buildCostMult", group: msg("Base & army"), label: msg("Building cost ×"), help: "", min: 0, max: 20, step: 0.05 },
  { key: "unitCostMult", group: msg("Base & army"), label: msg("Unit cost ×"), help: "", min: 0, max: 20, step: 0.05 },
  { key: "supplyPerLevelHour", group: msg("Base & army"), label: msg("Supply income (coins/hour per level)"), help: "", min: 0, max: 100000 },
  { key: "supplyCapHours", group: msg("Base & army"), label: msg("Supply storage (hours)"), help: "", min: 1, max: 168 },
  { key: "relocateCost", group: msg("Base & army"), label: msg("Move-base cost (coins)"), help: "", min: 0, max: 1000000 },
  { key: "shieldHours", group: msg("Base & army"), label: msg("Shield per star lost (hours)"), help: "", min: 0, max: 72, step: 0.25 },
  { key: "siegeCooldownMin", group: msg("Base & army"), label: msg("Siege cooldown (min)"), help: "", min: 0, max: 1440 },

  { key: "outpostIncomeHour", group: msg("Territory"), label: msg("Outpost income (coins/hour)"), help: "", min: 0, max: 100000 },
  { key: "flagIncomeHour", group: msg("Territory"), label: msg("Flag income (coins/hour)"), help: "", min: 0, max: 100000 },
  { key: "flagCost", group: msg("Territory"), label: msg("Flag cost (coins)"), help: "", min: 0, max: 100000 },
  { key: "flagCaptureSeconds", group: msg("Territory"), label: msg("Flag capture time (s)"), help: "", min: 5, max: 3600 },
  { key: "flagRadius", group: msg("Territory"), label: msg("Flag capture radius (m)"), help: "", min: 5, max: 500 },

  { key: "playerMaxHp", group: msg("Street combat"), label: msg("Commander HP"), help: "", min: 10, max: 10000 },
  { key: "hpRegenS", group: msg("Street combat"), label: msg("HP regen (seconds per HP)"), help: "", min: 0.1, max: 600, step: 0.1 },
  { key: "downedMin", group: msg("Street combat"), label: msg("Downed time (min)"), help: "", min: 0.1, max: 120, step: 0.1 },
  { key: "rookieLevel", group: msg("Street combat"), label: msg("Rookie protection below level"), help: msg("Players below this level can't be shot or shoot."), min: 1, max: 100 },
  { key: "downedCoinLoss", group: msg("Street combat"), label: msg("Coins lost when downed (share)"), help: msg("0.05 = 5%, capped at 300."), min: 0, max: 1, step: 0.01 },
  { key: "shootDmg", group: msg("Street combat"), label: msg("Street shot damage"), help: "", min: 1, max: 1000 },
  { key: "shootCooldownS", group: msg("Street combat"), label: msg("Shot cooldown (s)"), help: "", min: 0, max: 600 },

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
  { key: "healGems", group: msg("Store & ads"), label: msg("Instant heal (gems)"), help: msg("Full HP and get back up when downed.") },
  { key: "refreshGems", group: msg("Store & ads"), label: msg("Energy drink (gems)"), help: msg("Refills hunger, energy, social and fun.") },
  { key: "shieldGems", group: msg("Store & ads"), label: msg("4 h base shield (gems)"), help: "" },
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
  collect: msg("Items collected"),
  chest: msg("Chests opened"),
  derrick: msg("Derricks captured"),
  train: msg("Units trained"),
  build: msg("Buildings built/upgraded"),
  research: msg("Research started"),
  siege_win: msg("Sieges won"),
  breach_win: msg("Breaches won"),
  kills: msg("FPS kills"),
  boss_dmg: msg("Boss damage"),
  outpost: msg("Outposts captured"),
  run: msg("Timed runs finished"),
  arcade: msg("Mini-games played"),
  duel_win: msg("Mini-games won"),
  raiders: msg("Raiders killed"),
  tower: msg("Towers built/upgraded"),
  tower_down: msg("Enemy towers destroyed"),
  post: msg("Posts pinned"),
  walk_m: msg("Metres walked"),
  gps_game: msg("GPS games won"),
  story: msg("Story chapters finished"),
  ads: msg("Sponsor spots watched"),
};
