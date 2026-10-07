// Live game settings. Every tunable the admin panel can edit lives here with its
// default. The server loads overrides from the database (GameConfig) and the client
// receives them with /api/me; both call applySettings(), which mutates `S` in place,
// so game code just reads `S.someKey` at call time. Pure, no imports.

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
    { key: "w_collect", title: "Operation Scavenge", emoji: "🌍", metric: "collect", target: 5000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_boss", title: "Operation Titanfall", emoji: "🐉", metric: "boss_dmg", target: 250000, reward: { xp: 600, coins: 400, gems: 15 } },
    { key: "w_walk", title: "Operation Long March", emoji: "🥾", metric: "walk_m", target: 2_000_000, reward: { xp: 500, coins: 300, gems: 10 } },
    { key: "w_raiders", title: "Operation Iron Wall", emoji: "🛡️", metric: "raiders", target: 20000, reward: { xp: 500, coins: 300, gems: 10 } },
  ] as GoalDef[],
  factionGoals: [
    { key: "f_outpost", title: "Hold the Line", emoji: "🚩", metric: "outpost", target: 60, reward: { xp: 300, coins: 250, gems: 5 } },
    { key: "f_train", title: "Mass Mobilization", emoji: "🪖", metric: "train", target: 3000, reward: { xp: 300, coins: 250, gems: 5 } },
    { key: "f_siege", title: "Total War", emoji: "⚔️", metric: "siege_win", target: 150, reward: { xp: 350, coins: 300, gems: 6 } },
    { key: "f_collect", title: "Supply Run", emoji: "📦", metric: "collect", target: 1500, reward: { xp: 300, coins: 200, gems: 5 } },
  ] as GoalDef[],
  personalGoals: [
    { key: "p_walk", title: "Road Warrior", emoji: "🥾", metric: "walk_m", tiers: [1000, 5000, 20000, 50000, 100000], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_collect", title: "Scavenger", emoji: "🎒", metric: "collect", tiers: [10, 50, 200, 500, 1000], reward: { xp: 120, coins: 80, gems: 2 } },
    { key: "p_siege", title: "Conqueror", emoji: "⚔️", metric: "siege_win", tiers: [1, 5, 20, 50, 100], reward: { xp: 200, coins: 150, gems: 3 } },
    { key: "p_train", title: "Warlord", emoji: "🪖", metric: "train", tiers: [10, 50, 200, 500, 1000], reward: { xp: 120, coins: 100, gems: 2 } },
    { key: "p_boss", title: "Titan Slayer", emoji: "🐉", metric: "boss_dmg", tiers: [500, 2500, 10000, 50000], reward: { xp: 250, coins: 200, gems: 4 } },
    { key: "p_gps", title: "Explorer", emoji: "🧭", metric: "gps_game", tiers: [1, 5, 15, 40, 100], reward: { xp: 150, coins: 100, gems: 3 } },
    { key: "p_kills", title: "Sharpshooter", emoji: "🎯", metric: "kills", tiers: [5, 25, 100, 300], reward: { xp: 200, coins: 120, gems: 3 } },
    { key: "p_story", title: "Storyteller", emoji: "📖", metric: "story", tiers: [1, 3, 6, 10], reward: { xp: 250, coins: 150, gems: 5 } },
  ] as MilestoneDef[],

  // ---- store & ads (monetization)
  storeEnabled: true,
  gemPacks: [
    { key: "pouch", gems: 80, priceCents: 99, label: "Pouch of Gems" },
    { key: "bag", gems: 500, priceCents: 499, label: "Bag of Gems", bonus: "+25%" },
    { key: "box", gems: 1200, priceCents: 999, label: "Box of Gems", bonus: "Popular" },
    { key: "chest", gems: 2800, priceCents: 1999, label: "Chest of Gems", bonus: "+40%" },
    { key: "vault", gems: 7500, priceCents: 4999, label: "Vault of Gems", bonus: "Best value" },
  ] as GemPack[],
  gemOffers: [
    { key: "coins_s", gems: 10, coins: 500, label: "Coin Pouch" },
    { key: "coins_m", gems: 45, coins: 2500, label: "Coin Sack" },
    { key: "coins_l", gems: 160, coins: 10000, label: "Coin Crate" },
  ] as GemOffer[],
  healGems: 5,
  refreshGems: 5,
  shieldGems: 30,
  currency: "usd",
  adsEnabled: true,
  adSeconds: 15,
  adGems: 3,
  adCoins: 50,
  adDailyLimit: 5,
  adCreatives: [] as AdCreative[],

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
  { key: "interactRadius", group: "Players & map", label: "Player reach (m)", help: "How close a player must be to collect, start runs, play arcades and finish missions.", min: 10, max: 500 },
  { key: "claimSlack", group: "Players & map", label: "GPS slack (m)", help: "Extra metres the server forgives on top of the reach, to absorb GPS error.", min: 0, max: 200 },
  { key: "spawnMin", group: "Players & map", label: "Spawns per area (min)", help: "Fewest spawns in each ~450 m map cell per 20-minute window.", min: 0, max: 20 },
  { key: "spawnMax", group: "Players & map", label: "Spawns per area (max)", help: "Most spawns in each map cell per window.", min: 1, max: 30 },
  { key: "goldenHourMult", group: "Players & map", label: "Golden-hour XP ×", help: "Spawn XP multiplier at dawn and dusk.", min: 1, max: 10, step: 0.1 },
  { key: "maxSpeedKmh", group: "Players & map", label: "Anti-cheat max speed (km/h)", help: "GPS jumps faster than this are ignored. Cars and trains are fine at the default.", min: 50, max: 2000 },
  { key: "footSpeedKmh", group: "Players & map", label: "On-foot speed limit (km/h)", help: "Movement faster than this doesn't count toward walking goals and sprints (so driving doesn't count).", min: 5, max: 200 },
  { key: "viewRadiusKm", group: "Players & map", label: "Map view radius (km)", help: "How far away other players, bases and events show on the map.", min: 1, max: 50, step: 0.5 },
  { key: "breachRange", group: "Players & map", label: "FPS breach range (m)", help: "Walk this close to an enemy base or boss to fight it in first person.", min: 20, max: 2000 },
  { key: "siegeRange", group: "Players & map", label: "Army range from base (m)", help: "Armies can siege and march this far from your base.", min: 500, max: 50000 },
  { key: "shootRange", group: "Players & map", label: "Street-combat range (m)", help: "Shoot rival commanders, towers and squads within this distance.", min: 10, max: 500 },
  { key: "baseSpacing", group: "Players & map", label: "Min distance between bases (m)", help: "", min: 0, max: 5000 },
  { key: "testMode", group: "Players & map", label: "Test mode for everyone", help: "Instant teleports with full rewards — for testing. Off by default in production (admins always have it; local dev always has it). Players use Play from home instead." },

  { key: "remoteEnabled", group: "Play from home", label: "Play from home on", help: "Players who don't want to walk can play from the couch: they move by tapping the map and travel at a capped speed." },
  { key: "remoteRewardMult", group: "Play from home", label: "Reward multiplier at home", help: "XP and coins earned from home are multiplied by this (0.5 = half). Walking players always get full rewards.", min: 0, max: 1, step: 0.05 },
  { key: "remoteSpeedKmh", group: "Play from home", label: "Travel speed at home (km/h)", help: "How fast a home player's commander moves across the map toward where they tapped.", min: 5, max: 1000 },

  { key: "xpMult", group: "Rewards & economy", label: "Global XP ×", help: "Multiplies all XP players earn (events, weekends…).", min: 0, max: 20, step: 0.1 },
  { key: "coinMult", group: "Rewards & economy", label: "Global coin ×", help: "Multiplies coins created by the game (not transfers between players or refunds).", min: 0, max: 20, step: 0.1 },
  { key: "sellMult", group: "Rewards & economy", label: "Item sell price ×", help: "Multiplies what items in the bag sell for.", min: 0, max: 20, step: 0.1 },
  { key: "startCoins", group: "Rewards & economy", label: "Starting coins", help: "Coins a new player starts with.", min: 0, max: 100000 },
  { key: "startGems", group: "Rewards & economy", label: "Starting gems", help: "", min: 0, max: 10000 },
  { key: "referralCoins", group: "Rewards & economy", label: "Referral bonus (coins)", help: "Paid to both the inviter and the new player.", min: 0, max: 100000 },
  { key: "dailyCoinsBase", group: "Rewards & economy", label: "Daily reward coins (base)", help: "Daily coins = base + step × streak (capped).", min: 0, max: 100000 },
  { key: "dailyCoinsStep", group: "Rewards & economy", label: "Daily reward coins (per streak day)", help: "", min: 0, max: 10000 },
  { key: "dailyXpBase", group: "Rewards & economy", label: "Daily reward XP (base)", help: "", min: 0, max: 100000 },
  { key: "dailyXpStep", group: "Rewards & economy", label: "Daily reward XP (per streak day)", help: "", min: 0, max: 10000 },
  { key: "dailyStreakCap", group: "Rewards & economy", label: "Daily streak cap (days)", help: "Streak bonus stops growing after this many days.", min: 1, max: 365 },
  { key: "dailyGems", group: "Rewards & economy", label: "Daily reward gems", help: "Gems in every daily drop (doubled on day 7+).", min: 0, max: 1000 },
  { key: "levelUpGems", group: "Rewards & economy", label: "Gems per level-up", help: "", min: 0, max: 1000 },
  { key: "achievementGems", group: "Rewards & economy", label: "Gems per achievement", help: "", min: 0, max: 1000 },
  { key: "questGemsCampaign", group: "Rewards & economy", label: "Gems per campaign quest", help: "", min: 0, max: 1000 },
  { key: "questGemsDaily", group: "Rewards & economy", label: "Gems per daily quest", help: "", min: 0, max: 1000 },
  { key: "rushMinutesPerGem", group: "Rewards & economy", label: "Rush: minutes per gem", help: "Finishing a timer instantly costs 1 gem per this many minutes left.", min: 0.1, max: 600, step: 0.1 },

  { key: "buildTimeMult", group: "Base & army", label: "Build time ×", help: "Multiplies every construction timer.", min: 0.01, max: 20, step: 0.01 },
  { key: "trainTimeMult", group: "Base & army", label: "Training time ×", help: "", min: 0.01, max: 20, step: 0.01 },
  { key: "researchTimeMult", group: "Base & army", label: "Research time ×", help: "", min: 0.01, max: 20, step: 0.01 },
  { key: "buildCostMult", group: "Base & army", label: "Building cost ×", help: "", min: 0, max: 20, step: 0.05 },
  { key: "unitCostMult", group: "Base & army", label: "Unit cost ×", help: "", min: 0, max: 20, step: 0.05 },
  { key: "supplyPerLevelHour", group: "Base & army", label: "Supply income (coins/hour per level)", help: "", min: 0, max: 100000 },
  { key: "supplyCapHours", group: "Base & army", label: "Supply storage (hours)", help: "", min: 1, max: 168 },
  { key: "relocateCost", group: "Base & army", label: "Move-base cost (coins)", help: "", min: 0, max: 1000000 },
  { key: "shieldHours", group: "Base & army", label: "Shield per star lost (hours)", help: "", min: 0, max: 72, step: 0.25 },
  { key: "siegeCooldownMin", group: "Base & army", label: "Siege cooldown (min)", help: "", min: 0, max: 1440 },

  { key: "outpostIncomeHour", group: "Territory", label: "Outpost income (coins/hour)", help: "", min: 0, max: 100000 },
  { key: "flagIncomeHour", group: "Territory", label: "Flag income (coins/hour)", help: "", min: 0, max: 100000 },
  { key: "flagCost", group: "Territory", label: "Flag cost (coins)", help: "", min: 0, max: 100000 },
  { key: "flagCaptureSeconds", group: "Territory", label: "Flag capture time (s)", help: "", min: 5, max: 3600 },
  { key: "flagRadius", group: "Territory", label: "Flag capture radius (m)", help: "", min: 5, max: 500 },

  { key: "playerMaxHp", group: "Street combat", label: "Commander HP", help: "", min: 10, max: 10000 },
  { key: "hpRegenS", group: "Street combat", label: "HP regen (seconds per HP)", help: "", min: 0.1, max: 600, step: 0.1 },
  { key: "downedMin", group: "Street combat", label: "Downed time (min)", help: "", min: 0.1, max: 120, step: 0.1 },
  { key: "rookieLevel", group: "Street combat", label: "Rookie protection below level", help: "Players below this level can't be shot or shoot.", min: 1, max: 100 },
  { key: "downedCoinLoss", group: "Street combat", label: "Coins lost when downed (share)", help: "0.05 = 5%, capped at 300.", min: 0, max: 1, step: 0.01 },
  { key: "shootDmg", group: "Street combat", label: "Street shot damage", help: "", min: 1, max: 1000 },
  { key: "shootCooldownS", group: "Street combat", label: "Shot cooldown (s)", help: "", min: 0, max: 600 },

  { key: "huntMinM", group: "GPS games & story", label: "Treasure hunt: min distance (m)", help: "", min: 20, max: 5000 },
  { key: "huntMaxM", group: "GPS games & story", label: "Treasure hunt: max distance (m)", help: "", min: 20, max: 10000 },
  { key: "huntMinutes", group: "GPS games & story", label: "Treasure hunt: time limit (min)", help: "", min: 1, max: 240 },
  { key: "huntXp", group: "GPS games & story", label: "Treasure hunt: XP", help: "", min: 0, max: 100000 },
  { key: "huntCoins", group: "GPS games & story", label: "Treasure hunt: coins", help: "", min: 0, max: 100000 },
  { key: "sprintMeters", group: "GPS games & story", label: "Sprint: distance (m)", help: "", min: 50, max: 20000 },
  { key: "sprintMinutes", group: "GPS games & story", label: "Sprint: time limit (min)", help: "", min: 1, max: 240 },
  { key: "sprintXp", group: "GPS games & story", label: "Sprint: XP", help: "", min: 0, max: 100000 },
  { key: "sprintCoins", group: "GPS games & story", label: "Sprint: coins", help: "", min: 0, max: 100000 },
  { key: "rallyCheckpoints", group: "GPS games & story", label: "Rally: checkpoints", help: "", min: 2, max: 10 },
  { key: "rallyMinutes", group: "GPS games & story", label: "Rally: time limit (min)", help: "", min: 1, max: 240 },
  { key: "rallyXp", group: "GPS games & story", label: "Rally: XP", help: "", min: 0, max: 100000 },
  { key: "rallyCoins", group: "GPS games & story", label: "Rally: coins", help: "", min: 0, max: 100000 },
  { key: "gpsGameGems", group: "GPS games & story", label: "GPS game win: gems", help: "", min: 0, max: 1000 },
  { key: "gpsGameCooldownMin", group: "GPS games & story", label: "Cooldown between GPS games (min)", help: "", min: 0, max: 1440 },
  { key: "storyEnabled", group: "GPS games & story", label: "Story missions on", help: "" },

  { key: "goalsEnabled", group: "Goals", label: "Goals on", help: "World, faction and personal goals." },
  { key: "worldGoals", group: "Goals", label: "World operations (rotate weekly)", help: "Everyone works toward one goal per week; everyone who contributed claims the reward. Metrics: see the list under this section." },
  { key: "factionGoals", group: "Goals", label: "Faction goals (rotate weekly)", help: "Each faction works toward the same goal; members who contributed claim the reward." },
  { key: "personalGoals", group: "Goals", label: "Personal milestones", help: "Permanent tiers; each tier pays its reward × tier number." },

  { key: "storeEnabled", group: "Store & ads", label: "Gem store on", help: "Real-money purchases need STRIPE_SECRET_KEY set on the server." },
  { key: "gemPacks", group: "Store & ads", label: "Gem packs (real money)", help: "priceCents is in the currency below (e.g. 499 = 4.99)." },
  { key: "currency", group: "Store & ads", label: "Currency", help: "ISO code Stripe charges in, e.g. usd, eur, gbp." },
  { key: "gemOffers", group: "Store & ads", label: "Coin offers (paid in gems)", help: "" },
  { key: "healGems", group: "Store & ads", label: "Instant heal (gems)", help: "Full HP and get back up when downed." },
  { key: "refreshGems", group: "Store & ads", label: "Energy drink (gems)", help: "Refills hunger, energy, social and fun." },
  { key: "shieldGems", group: "Store & ads", label: "4 h base shield (gems)", help: "" },
  { key: "adsEnabled", group: "Store & ads", label: "Rewarded ads on", help: "Players watch a sponsor spot to earn gems and coins." },
  { key: "adSeconds", group: "Store & ads", label: "Ad length (s)", help: "", min: 3, max: 120 },
  { key: "adGems", group: "Store & ads", label: "Gems per ad", help: "", min: 0, max: 1000 },
  { key: "adCoins", group: "Store & ads", label: "Coins per ad", help: "", min: 0, max: 100000 },
  { key: "adDailyLimit", group: "Store & ads", label: "Ads per player per day", help: "", min: 0, max: 100 },
  { key: "adCreatives", group: "Store & ads", label: "Sponsor ads", help: "Ads players watch. With none, the game shows its own invite-a-friend spot." },
  { key: "catalog", group: "Game data", label: "Stat overrides", help: "Edited in the Game data tab." },
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
  collect: "Items collected",
  chest: "Chests opened",
  derrick: "Derricks captured",
  train: "Units trained",
  build: "Buildings built/upgraded",
  research: "Research started",
  siege_win: "Sieges won",
  breach_win: "Breaches won",
  kills: "FPS kills",
  boss_dmg: "Boss damage",
  outpost: "Outposts captured",
  run: "Timed runs finished",
  arcade: "Mini-games played",
  duel_win: "Mini-games won",
  raiders: "Raiders killed",
  tower: "Towers built/upgraded",
  tower_down: "Enemy towers destroyed",
  post: "Posts pinned",
  walk_m: "Metres walked",
  gps_game: "GPS games won",
  story: "Story chapters finished",
  ads: "Sponsor spots watched",
};
