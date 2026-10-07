// End-to-end test for live settings, army delivery, bag multi-sell, goals, the
// store, rewarded ads and GPS games/story. Needs the dev server running (ideally
// GAME_SPEED=600). Uses the DB directly only to peek at hidden targets and to
// fast-forward.  `npx tsx scripts/smoke-features.ts`
import { prisma } from "../src/lib/db";
import { offset } from "../src/lib/geo";

const BASE = process.env.BASE ?? "http://localhost:3000";
type Client = { cookie: string; id?: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TEST_IP = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
async function call(c: Client, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { cookie: c.cookie, "x-forwarded-for": TEST_IP, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set?.includes("sq_session=")) c.cookie = set.split(";")[0];
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
let fails = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}`, ok ? "" : JSON.stringify(extra)?.slice(0, 400));
  if (!ok) fails++;
}
const go = (c: Client, p: { lat: number; lng: number }) => call(c, "/api/loc", { ...p, sim: true });

// Somewhere fresh so bases and spawns don't collide with other test runs.
const home = offset({ lat: 51.5079, lng: -0.0877 }, 3000 + Math.random() * 4000, Math.random() * 360);
const A: Client = { cookie: "" };
const ADMIN: Client = { cookie: "" };
await call(A, "/api/auth/guest", {});
A.id = (await call(A, "/api/me")).data.id;
check("login admin", (await call(ADMIN, "/api/auth/login", { login: "admin", password: "password123" })).status === 200);
await go(A, home);

// ---------------------------------------------------------------- live settings
let r = await call(ADMIN, "/api/admin");
check("admin sees settings", Array.isArray(r.data.config?.defs) && r.data.config.defs.length > 60, r.data.config?.defs?.length);
check("admin sees catalog", r.data.config?.catalog?.units?.length === 5);
check("admin sees revenue", typeof r.data.revenue?.last30?.cents === "number");
const before = r.data.config.overrides;
check("non-admin can't save settings", (await call(A, "/api/admin", { action: "saveSettings", data: {} })).status === 403);
r = await call(ADMIN, "/api/admin", { action: "saveSettings", data: { ...before, interactRadius: 120, adSeconds: 3, gpsGameCooldownMin: 0, catalog: { items: { cash: { value: 77 } } } } });
check("save settings", r.status === 200, r.data);
r = await call(A, "/api/me");
check("client receives overrides", r.data.settings?.interactRadius === 120 && r.data.settings?.catalog?.items?.cash?.value === 77, r.data.settings);
r = await call(ADMIN, "/api/admin", { action: "saveSettings", data: { interactRadius: "lots", spawnMax: 99999 } });
r = await call(A, "/api/me");
check("bad values are sanitized", r.data.settings?.interactRadius === undefined && r.data.settings?.spawnMax === 30, r.data.settings);
await call(ADMIN, "/api/admin", { action: "saveSettings", data: { ...before, interactRadius: 120, adSeconds: 3, gpsGameCooldownMin: 0, catalog: { items: { cash: { value: 77 } } } } });

// The bigger reach works on the server: claim an item 100 m away.
r = await call(A, `/api/world?lat=${home.lat}&lng=${home.lng}`);
const item = (r.data.spawns as { id: string; kind: string; lat: number; lng: number }[]).find((s) => s.kind === "item");
if (item) {
  await go(A, offset(item, 100, 90));
  r = await call(A, "/api/claim", { spawnId: item.id });
  check("claim from 100 m with reach 120", r.status === 200, r.data);
}

// ---------------------------------------------------------------- bag multi-sell
await prisma.inventoryItem.createMany({ data: [{ userId: A.id!, itemKey: "cash", qty: 3 }, { userId: A.id!, itemKey: "donut", qty: 4 }], skipDuplicates: true });
await prisma.inventoryItem.updateMany({ where: { userId: A.id!, itemKey: "cash" }, data: { qty: 3 } });
await prisma.inventoryItem.updateMany({ where: { userId: A.id!, itemKey: "donut" }, data: { qty: 4 } });
const coins0 = (await call(A, "/api/me")).data.coins;
r = await call(A, "/api/inventory", { action: "sellMany", items: [{ itemKey: "cash", qty: 2 }, { itemKey: "donut", qty: 4 }] });
check("sell many at once", r.status === 200, r.data);
r = await call(A, "/api/me");
check("multi-sell pays overridden price (2×77 + 4×5)", r.data.coins - coins0 === 2 * 77 + 4 * 5, r.data.coins - coins0);
check("sold-out items leave the bag", !r.data.inventory.some((i: { key: string }) => i.key === "donut") && r.data.inventory.find((i: { key: string }) => i.key === "cash")?.qty === 1, r.data.inventory);
check("can't oversell", (await call(A, "/api/inventory", { action: "sellMany", items: [{ itemKey: "cash", qty: 5 }] })).status === 400);
check("duplicate rows merged (no double sell)", (await call(A, "/api/inventory", { action: "sellMany", items: [{ itemKey: "cash", qty: 1 }, { itemKey: "cash", qty: 1 }] })).status === 400);

// ---------------------------------------------------------------- army: trickle delivery, no double counting
await call(A, "/api/base", { action: "faction", faction: "insurgency" });
r = await call(A, "/api/base", { action: "found", name: "Test Keep" });
check("base planted", r.status === 200, r.data);
await prisma.user.update({ where: { id: A.id! }, data: { coins: 20000, gems: 500 } });
await call(A, "/api/base", { action: "build", type: "barracks" });
await sleep(1500);
r = await call(A, "/api/base", { action: "train", unit: "ranger", qty: 5 });
check("train rangers", r.status === 200, r.data);
const order = await prisma.trainOrder.findFirst({ where: { userId: A.id! } });
check("order stores per-unit time", !!order && order.unitMs > 0, order);
// A slow batch: 3 units, one every 2 s.
await prisma.trainOrder.deleteMany({ where: { userId: A.id! } });
await sleep(300);
const armyBefore = (await call(A, "/api/base")).data.army.ranger ?? 0;
await prisma.trainOrder.create({ data: { userId: A.id!, unitType: "ranger", qty: 3, unitMs: 2000, readyAt: new Date(Date.now() + 6000) } });
await sleep(2600);
r = await call(A, "/api/base");
check("first unit of a batch joins the army early", (r.data.army.ranger ?? 0) === armyBefore + 1 && r.data.queue[0]?.qty === 2, { army: r.data.army, queue: r.data.queue });
const [x, y] = await Promise.all([call(A, "/api/base"), call(A, "/api/base")]);
check("concurrent reads don't double-deliver", x.data.army.ranger === armyBefore + 1 && y.data.army.ranger === armyBefore + 1, [x.data.army, y.data.army]);
await sleep(3800);
r = await call(A, "/api/base");
check("whole batch delivered", (r.data.army.ranger ?? 0) === armyBefore + 3 && r.data.queue.length === 0, { army: r.data.army, queue: r.data.queue });

// ---------------------------------------------------------------- goals
r = await call(A, "/api/goals");
check("goals load", r.status === 200 && r.data.world && r.data.personal?.length > 0, r.data);
const collect = r.data.personal.find((p: { metric: string }) => p.metric === "collect");
check("personal goal counted the claim", (collect?.value ?? 0) >= (item ? 1 : 0), collect);
await prisma.goalCounter.upsert({
  where: { scope_scopeId_period_metric: { scope: "user", scopeId: A.id!, period: "all", metric: "collect" } },
  create: { scope: "user", scopeId: A.id!, period: "all", metric: "collect", value: 10 },
  update: { value: 10 },
});
const gems0 = (await call(A, "/api/me")).data.gems;
r = await call(A, "/api/goals", { key: `p:${collect.key}:0` });
check("claim milestone tier", r.status === 200, r.data);
check("milestone paid gems", (await call(A, "/api/me")).data.gems > gems0);
check("milestone can't be claimed twice", (await call(A, "/api/goals", { key: `p:${collect.key}:0` })).status === 409);
check("unreached tier rejected", (await call(A, "/api/goals", { key: `p:${collect.key}:3` })).status === 400);
const world = (await call(A, "/api/goals")).data.world;
check("world goal can't be claimed before done", (await call(A, "/api/goals", { key: world.claimKey })).status === 400);

// ---------------------------------------------------------------- store
r = await call(A, "/api/store");
check("store loads", r.status === 200 && r.data.packs.length > 0 && r.data.offers.length > 0, r.data);
check("checkout explains when payments are off", process.env.STRIPE_SECRET_KEY ? true : (await call(A, "/api/store", { action: "checkout", pack: r.data.packs[0].key })).status === 503);
const m0 = (await call(A, "/api/me")).data;
r = await call(A, "/api/store", { action: "offer", key: "coins_s" });
const m1 = (await call(A, "/api/me")).data;
check("buy coins with gems", r.status === 200 && m1.gems === m0.gems - 10 && m1.coins === m0.coins + 500, { r: r.data, m0: [m0.gems, m0.coins], m1: [m1.gems, m1.coins] });
await prisma.user.update({ where: { id: A.id! }, data: { gems: 2 } });
check("not enough gems blocked", (await call(A, "/api/store", { action: "heal" })).status === 400);
await prisma.user.update({ where: { id: A.id! }, data: { gems: 100, hp: 10 } });
r = await call(A, "/api/store", { action: "heal" });
check("instant heal", r.status === 200 && (await call(A, "/api/me")).data.hp === (await call(A, "/api/me")).data.maxHp, r.data);
check("base shield", (await call(A, "/api/store", { action: "shield" })).status === 200);

// ---------------------------------------------------------------- rewarded ads
r = await call(A, "/api/ads", { action: "start" });
check("ad starts (house ad)", r.status === 200 && r.data.creative?.id === "house", r.data);
const viewId = r.data.viewId;
check("ad can't be claimed early", (await call(A, "/api/ads", { action: "claim", viewId })).status === 400);
await sleep(3200);
const g1 = (await call(A, "/api/me")).data.gems;
r = await call(A, "/api/ads", { action: "claim", viewId });
check("ad pays after watching", r.status === 200 && (await call(A, "/api/me")).data.gems === g1 + 3, r.data);
check("ad can't be claimed twice", (await call(A, "/api/ads", { action: "claim", viewId })).status === 409);

// ---------------------------------------------------------------- GPS games
const here = offset(home, 50, 180);
await go(A, here);
r = await call(A, "/api/gpsgame", { action: "start", kind: "rally" });
check("rally starts", r.status === 200, r.data);
check("only one GPS game at a time", (await call(A, "/api/gpsgame", { action: "start", kind: "hunt" })).status === 400);
r = await call(A, "/api/gpsgame");
const pts = r.data.active?.points as { lat: number; lng: number }[];
check("rally checkpoints visible", pts?.length === 3, r.data.active);
for (let i = 0; i < pts.length; i++) {
  await go(A, pts[i]);
  r = await call(A, "/api/gpsgame", { action: "check" });
}
check("rally won", r.data.won === true, r.data);

r = await call(A, "/api/gpsgame", { action: "start", kind: "hunt" });
check("treasure hunt starts", r.status === 200, r.data);
r = await call(A, "/api/gpsgame");
check("hidden spot never sent to the client", r.data.active && r.data.active.target === undefined && !!r.data.active.heat, r.data.active);
const hunt = await prisma.gpsGame.findFirst({ where: { userId: A.id!, status: "ACTIVE" } });
const spot = (hunt!.data as { target: { lat: number; lng: number } }).target;
await go(A, offset(spot, 70, 0));
await call(A, "/api/gpsgame", { action: "check" });
await go(A, offset(spot, 50, 0));
await call(A, "/api/gpsgame", { action: "check" });
r = await call(A, "/api/gpsgame");
check("detector gets warmer", r.data.active?.heat?.trend === 1 && r.data.active.heat.level >= 4, r.data.active?.heat);
await go(A, spot);
r = await call(A, "/api/gpsgame", { action: "check" });
check("treasure found", r.data.won === true, r.data);

r = await call(A, "/api/gpsgame", { action: "start", kind: "sprint" });
check("sprint starts", r.status === 200, r.data);
check("test-mode teleports don't count as walking", (await go(A, offset(here, 300, 0))).status === 200 && (await call(A, "/api/gpsgame", { action: "check" })).data.won === false);
check("quit game", (await call(A, "/api/gpsgame", { action: "quit" })).status === 200);

// Story chapter 1: go → find (hidden).
await go(A, here);
r = await call(A, "/api/gpsgame", { action: "start", kind: "story" });
check("story chapter starts", r.status === 200 && !!r.data.intro, r.data);
r = await call(A, "/api/gpsgame");
check("story step 1 shows the waypoint", !!r.data.active?.target && r.data.active.stepKind === "go", r.data.active);
await go(A, r.data.active.target);
r = await call(A, "/api/gpsgame", { action: "check" });
check("story advances", (await call(A, "/api/gpsgame")).data.active?.step === 1, r.data);
r = await call(A, "/api/gpsgame", { action: "reroute" });
check("reroute a waypoint", r.status === 200, r.data);
const st = await prisma.gpsGame.findFirst({ where: { userId: A.id!, status: "ACTIVE" } });
await go(A, (st!.data as { target: { lat: number; lng: number } }).target);
r = await call(A, "/api/gpsgame", { action: "check" });
check("story chapter complete", r.data.won === true && !!r.data.outro, r.data);
check("story progress saved", (await call(A, "/api/me")).data.storyChapter === 1);
r = await call(A, "/api/goals");
check("GPS wins count toward goals", r.data.personal.find((p: { metric: string }) => p.metric === "gps_game")?.value >= 2 && r.data.personal.find((p: { metric: string }) => p.metric === "story")?.value === 1, r.data.personal);

// ---------------------------------------------------------------- hero sheet
r = await call(A, "/api/hero");
check("hero sheet has a service record", typeof r.data.stats?.walkedM === "number" && r.data.stats.story === 1 && r.data.stats.gpsGames >= 2, r.data.stats);

// ---------------------------------------------------------------- play from home
const H: Client = { cookie: "" };
await call(H, "/api/auth/guest", {});
const hHome = offset(home, 400, 90);
check("switch to play from home", (await call(H, "/api/me", { remotePlay: true }, "PATCH")).status === 200);
r = await call(H, "/api/me");
check("me reports home mode", r.data.remotePlay === true, r.data.remotePlay);
check("home player picks a start point", (await go(H, hHome)).status === 200);
await sleep(3200);
check("home player travels at the capped speed", (await go(H, offset(hHome, 35, 0))).status === 200); // ~39 km/h
check("home player can't teleport", (await go(H, offset(hHome, 3000, 0))).status === 409);
const hm = (await call(H, "/api/me")).data;
r = await call(H, "/api/daily", {});
const hm2 = (await call(H, "/api/me")).data;
check("home rewards are reduced (daily coins ×0.5)", r.status === 200 && hm2.coins - hm.coins === Math.round(hm.dailyReward.coins * 0.5), { got: hm2.coins - hm.coins, full: hm.dailyReward.coins });
check("sprints need real walking", (await call(H, "/api/gpsgame", { action: "start", kind: "sprint" })).status === 400);
check("switch back to GPS", (await call(H, "/api/me", { remotePlay: false }, "PATCH")).status === 200);
r = await call(H, "/api/me");
check("GPS mode forgets the couch position", r.data.remotePlay === false && r.data.lastPos === null, r.data);

// Restore the admin settings this test changed.
await call(ADMIN, "/api/admin", { action: "saveSettings", data: before });
r = await call(A, "/api/me");
check("settings restored", JSON.stringify(r.data.settings) === JSON.stringify(before), r.data.settings);

await prisma.$disconnect();
console.log(fails ? `\n${fails} FAILED` : "\nALL FEATURE CHECKS PASSED");
process.exit(fails ? 1 : 0);
