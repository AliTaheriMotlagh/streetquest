// End-to-end smoke test against a running dev server: `npx tsx scripts/smoke.ts`
export {};

const BASE = process.env.BASE ?? "http://localhost:3000";
type Client = { cookie: string; name: string };

async function call(c: Client, path: string, body?: unknown, method?: string) {
  const r = await fetch(BASE + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { cookie: c.cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set?.includes("sq_session=")) c.cookie = set.split(";")[0];
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

let fails = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}`, ok ? "" : JSON.stringify(extra));
  if (!ok) fails++;
}

async function goTo(c: Client, p: { lat: number; lng: number }) {
  await call(c, "/api/loc", { ...p, sim: true });
}
async function notifications(c: Client, since: number) {
  return (await call(c, `/api/sync?since=${since}`)).data.notifications as { title: string }[];
}

const start = { lat: 51.5079, lng: -0.0877 };
const name = `tester${Date.now() % 100000}`;
const A: Client = { cookie: "sq_ref=VEERUNNER", name };
const B: Client = { cookie: "", name: "KaiNight" };
const ADMIN: Client = { cookie: "", name: "admin" };

// No-login guest flow
const G: Client = { cookie: "", name: "guest" };
check("no session → 401", (await call(G, "/api/me")).status === 401);
let r = await call(G, "/api/auth/guest", {});
check("guest account created", r.status === 200 && G.cookie.startsWith("sq_session="), r);
const gName = r.data.username;
check("guest can play", (await call(G, "/api/me")).data.username === gName);
check("guest call is idempotent", (await call(G, "/api/auth/guest", {})).data.username === gName);
const newName = `cmdr${Date.now() % 100000}`;
check("rename callsign", (await call(G, "/api/me", { username: newName }, "PATCH")).status === 200 && (await call(G, "/api/me")).data.username === newName);
check("guest is not admin", (await call(G, "/api/admin")).status === 403);
check("health check", (await call(G, "/api/health")).data.ok === true);

r = await call(A, "/api/auth/signup", { username: name, email: `${name}@test.dev`, password: "password123", timezone: "Asia/Tehran" });
check("signup with referral", r.status === 200, r);
r = await call(A, "/api/me");
check("referral bonus coins (250)", r.data.coins === 250, r.data.coins);
check("timezone stored", r.data.timezone === "Asia/Tehran");
check("login B", (await call(B, "/api/auth/login", { login: "KaiNight", password: "password123" })).status === 200);
check("login admin", (await call(ADMIN, "/api/auth/login", { login: "admin", password: "password123" })).status === 200);

await goTo(A, start);

r = await call(A, "/api/world?lat=" + start.lat + "&lng=" + start.lng);
check("world loads spawns", r.data.spawns?.length > 10, r);
check("world has admin mission", r.data.missions?.length >= 1);
check("world has seeded event", r.data.events?.length >= 1);
const spawns = r.data.spawns as { id: string; kind: string; lat: number; lng: number; run?: { target: { lat: number; lng: number } } }[];

// too far
const item = spawns.find((s) => s.kind === "item")!;
r = await call(A, "/api/claim", { spawnId: item.id });
check("claim rejected when far", r.status === 400 || item && Math.abs(item.lat - start.lat) < 0.0003, r);
await goTo(A, item);
r = await call(A, "/api/claim", { spawnId: item.id });
check("claim item when close", r.status === 200, r);
r = await call(A, "/api/claim", { spawnId: item.id });
check("double claim blocked", r.status === 409, r);
check("forged spawn id rejected", (await call(A, "/api/claim", { spawnId: "1.0_0.0" })).status === 410);

const chest = spawns.find((s) => s.kind === "chest");
if (chest) {
  await goTo(A, chest);
  check("chest fails with score 0", (await call(A, "/api/claim", { spawnId: chest.id, score: 0 })).status === 400);
  r = await call(A, "/api/claim", { spawnId: chest.id, score: 3 });
  check("chest opens with perfect pick", r.status === 200, r);
}

const run = spawns.find((s) => s.kind === "run");
if (run) {
  await goTo(A, run);
  r = await call(A, "/api/claim", { spawnId: run.id });
  check("run starts", r.status === 200 && r.data.run, r);
  const runId = r.data.run.id;
  check("run not complete away from target", (await call(A, "/api/runs", { runId, action: "complete" })).status === 400);
  await goTo(A, run.run!.target);
  r = await call(A, "/api/runs", { runId, action: "complete" });
  check("run completes at target", r.status === 200, r);
}

const m = (await call(A, `/api/world?lat=${start.lat}&lng=${start.lng}`)).data.missions[0];
await goTo(A, m);
r = await call(A, "/api/claim", { spawnId: `m:${m.id}` });
check("admin mission claim", r.status === 200, r);

// geo note
await goTo(A, start);
r = await call(A, "/api/notes", { body: "Secret tacos here", radiusM: 50 });
check("drop geo note", r.status === 200, r);
await goTo(B, { lat: start.lat + 0.005, lng: start.lng });
let w = (await call(B, `/api/world?lat=${start.lat}&lng=${start.lng}`)).data;
let note = w.notes.find((n: { body: string | null; author: { username: string } }) => n.author.username === name);
check("note locked when far", note && note.unlocked === false && note.body === null, note);
await goTo(B, { lat: start.lat + 0.0002, lng: start.lng });
w = (await call(B, `/api/world?lat=${start.lat}&lng=${start.lng}`)).data;
note = w.notes.find((n: { author: { username: string } }) => n.author.username === name);
check("note readable when near", note?.body === "Secret tacos here", note);
check("B sees A as nearby player", w.players.some((p: { username: string }) => p.username === name));

// deliveries
const pickup = { lat: start.lat + 0.001, lng: start.lng };
const drop = { lat: start.lat + 0.004, lng: start.lng + 0.003 };
const before = (await call(A, "/api/me")).data.coins;
r = await call(A, "/api/deliveries", { title: "Book for Sam", description: "small", pickupLabel: "Cafe", pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLabel: "Library", dropoffLat: drop.lat, dropoffLng: drop.lng, reward: 40 });
check("create delivery (escrow)", r.status === 200 && (await call(A, "/api/me")).data.coins === before - 40, r);
const del = r.data.delivery;
const t0 = Date.now() - 1;
check("B accepts", (await call(B, `/api/deliveries/${del.id}`, { action: "accept" })).status === 200);
check("A notified via sync", (await notifications(A, t0)).some((n) => n.title.includes("Courier assigned")));
check("pickup rejected when away", (await call(B, `/api/deliveries/${del.id}`, { action: "pickup" })).status === 400);
await goTo(B, pickup);
check("pickup at point", (await call(B, `/api/deliveries/${del.id}`, { action: "pickup" })).status === 200);
await goTo(B, drop);
check("wrong code rejected", (await call(B, `/api/deliveries/${del.id}`, { action: "deliver", code: "0000" })).status === 400);
r = await call(B, `/api/deliveries/${del.id}`, { action: "deliver", code: del.dropoffCode });
check("delivered with code", r.status === 200, r);
const carrying = (await call(B, "/api/deliveries")).data.carrying[0];
check("courier never sees code", carrying && !("dropoffCode" in carrying));

// friends + DM chat
check("friend request", (await call(A, "/api/friends", { action: "request", username: "KaiNight" })).status === 200);
const inc = (await call(B, "/api/friends")).data.incoming[0];
check("B accepts friend", (await call(B, "/api/friends", { action: "accept", friendshipId: inc.friendshipId })).status === 200);
const fl = (await call(A, "/api/friends")).data.friends;
check("friend shows online", fl.find((f: { username: string }) => f.username === "KaiNight")?.online === true, fl);
const meA = (await call(A, "/api/me")).data;
const meB = (await call(B, "/api/me")).data;
const room = `dm:${[meA.id, meB.id].sort().join(":")}`;
const t1 = Date.now() - 1;
check("DM send", (await call(A, "/api/chat", { room, body: "yo" })).status === 200);
check("DM unread badge for B", (await call(B, `/api/sync?since=${t1}`)).data.unread >= 1);
check("chat rate limit", (await call(A, "/api/chat", { room, body: "spam" })).status === 429);
check("DM history", (await call(B, `/api/chat?room=${room}`)).data.messages?.length >= 1);
check("stranger blocked from DM", (await call(ADMIN, `/api/chat?room=${room}`)).status === 403);

// events
r = await call(A, "/api/events", { title: "Park sweep", description: "", lat: start.lat, lng: start.lng, startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), maxPlayers: 10, isPublic: true });
check("create event", r.status === 200, r);
await goTo(A, start);
r = await call(A, `/api/events/${r.data.event.id}`, { action: "checkin" });
check("event check-in", r.status === 200, r);
const seeded = (await call(A, `/api/world?lat=${start.lat}&lng=${start.lng}`)).data.events.find((e: { slug: string }) => e.slug === "launch-night-hunt");
check("join seeded event", (await call(A, `/api/events/${seeded.id}`, { action: "join" })).status === 200);
check("early check-in blocked", (await call(A, `/api/events/${seeded.id}`, { action: "checkin" })).status === 400);

// daily, leaderboard, inventory, admin
check("daily claim", (await call(A, "/api/daily", {})).status === 200);
check("daily twice blocked", (await call(A, "/api/daily", {})).status === 400);
check("leaderboard", (await call(A, "/api/leaderboard")).data.top?.length > 0);
const inv = (await call(A, "/api/me")).data.inventory[0];
check("sell item", (await call(A, "/api/inventory", { action: "sell", itemKey: inv.key, qty: 1 })).status === 200);
check("achievements unlocked", (await call(A, "/api/me")).data.achievements.length >= 3);
check("player blocked from admin", (await call(A, "/api/admin")).status === 403);
r = await call(ADMIN, "/api/admin");
check("admin dashboard", r.status === 200 && r.data.stats.users >= 5, r.data.error);
check("admin sees referral source", r.data.bySource.some((s: { source: string }) => s.source === "referral"));

// anti-cheat: a non-admin player can't use the simulator flag in production; unauthenticated calls rejected
check("unauthenticated location rejected", (await call({ cookie: "", name: "anon" }, "/api/loc", start)).status === 401);
const t2 = Date.now() - 1;
check("admin broadcast", (await call(ADMIN, "/api/admin", { action: "broadcast", title: "Test push" })).status === 200);
check("broadcast reaches active player", (await notifications(B, t2)).some((n) => n.title === "Test push"));

// ---------------------------------------------------------------- strategy layer
// Run the dev server with GAME_SPEED=600 so construction/training finish in a blink.
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
// Each run plays on fresh ground so bases from earlier runs don't collide.
const so = { lat: start.lat + 0.02 + ((Date.now() / 1000) % 300) * 0.003, lng: start.lng };
const C: Client = { cookie: "", name: `rival${Date.now() % 100000}` };
check("signup rival", (await call(C, "/api/auth/signup", { username: C.name, email: `${C.name}@test.dev`, password: "password123" })).status === 200);
const meC = (await call(C, "/api/me")).data;
await goTo(A, so);
check("build blocked without faction", (await call(A, "/api/base", { action: "found", name: "Nope" })).status === 400);
check("pick faction", (await call(A, "/api/base", { action: "faction", faction: "insurgency" })).status === 200);
r = await call(A, "/api/base", { action: "found", name: "Fort Test" });
check("plant base", r.status === 200, r);
await goTo(C, { lat: so.lat + 0.0005, lng: so.lng });
check("rival picks faction", (await call(C, "/api/base", { action: "faction", faction: "coalition" })).status === 200);
check("second base too close is rejected", (await call(C, "/api/base", { action: "found", name: "Too Close" })).status === 400);
r = await call(A, "/api/base", { action: "build", type: "barracks" });
check("build barracks", r.status === 200, r);
check("dozer busy", (await call(A, "/api/base", { action: "build", type: "turret" })).status === 400);
await sleep(1200);
r = await call(A, "/api/base", { action: "train", unit: "ranger", qty: 2 });
check("train rangers", r.status === 200, r);
await sleep(600);
let bv = (await call(A, "/api/base")).data;
check("rangers trained", bv.army.ranger === 2, bv.army);
check("base view has power + defense", bv.base?.power && bv.base?.defense, bv.base);

const bPos = { lat: so.lat + 0.004, lng: so.lng };
await goTo(C, bPos);
r = await call(C, "/api/base", { action: "found", name: "Rival Keep" });
check("rival plants base 450 m away", r.status === 200, r);
w = (await call(A, `/api/world?lat=${so.lat}&lng=${so.lng}`)).data;
const rivalBase = w.bases.find((b: { owner: { id: string } }) => b.owner.id === meC.id);
check("world shows bases", !!rivalBase && w.bases.some((b: { mine: boolean }) => b.mine), w.bases);
r = await call(A, "/api/battle", { kind: "siege", targetId: rivalBase.id });
check("siege auto-resolves", r.status === 200 && typeof r.data.won === "boolean" && r.data.result?.rounds?.length > 0, r);
check("siege cooldown", (await call(A, "/api/battle", { kind: "siege", targetId: rivalBase.id })).status >= 400);

// ---------------------------------------------------------------- life-sim layer
await goTo(A, so);
let needs = (await call(A, "/api/me")).data;
check("me has needs + mood", typeof needs.needs?.hunger === "number" && needs.mood?.label, needs.mood);
r = await call(A, "/api/sims", { action: "rest" });
check("rest at base", r.status === 200, r);
check("rest cooldown", (await call(A, "/api/sims", { action: "rest" })).status === 429);
check("can't eat a diamond", (await call(A, "/api/sims", { action: "eat", itemKey: "diamond" })).status === 400);
await goTo(C, { lat: so.lat + 0.0005, lng: so.lng });
r = await call(A, "/api/sims", { action: "socialize", userId: meC.id });
check("hang out with nearby player", r.status === 200, r);

// ---------------------------------------------------------------- FPS layer: breach
await goTo(A, { lat: bPos.lat - 0.001, lng: bPos.lng });
await goTo(C, bPos);
r = await call(A, "/api/match", { kind: "breach", targetId: rivalBase.id });
const breachOk = r.status === 200 && !!r.data.matchId;
check("breach opens when owner is online", breachOk || r.data.error?.includes("shield"), r);
if (breachOk) {
  const mid = r.data.matchId;
  check("defender joins as D", (await call(C, "/api/match", { kind: "breach", targetId: rivalBase.id })).data.matchId === mid);
  let mv = (await call(A, `/api/match/${mid}`)).data;
  check("match has garrison bots", mv.players.filter((p: { bot: boolean }) => p.bot).length >= 2, mv.players);
  const meRow = (v: typeof mv, key: string) => v.players.find((p: { key: string }) => p.key === key);
  const aRow = meRow(mv, meA.id);
  await sleep(300);
  mv = (await call(A, `/api/match/${mid}`, { x: aRow.x, z: aRow.z, yaw: 0, hits: [{ key: "bot:0", dmg: 9999 }] })).data;
  check("hit damage capped at headshot max", meRow(mv, "bot:0").hp === 70 - 40, meRow(mv, "bot:0"));
  check("first poller becomes host", mv.host === true);
  const cRow = meRow(mv, meC.id);
  for (let i = 0; i < 4 && mv.status === "LIVE"; i++) {
    await sleep(500);
    mv = (await call(C, `/api/match/${mid}`, { x: cRow.x, z: cRow.z, yaw: Math.PI, hits: [{ key: meA.id, dmg: 40 }, { key: meA.id, dmg: 40 }] })).data;
  }
  check("defender wins when attackers are wiped", mv.status === "ENDED" && mv.winner === "D", { status: mv.status, winner: mv.winner, a: meRow(mv, meA.id) });
}

// ---------------------------------------------------------------- bosses
w = (await call(A, `/api/world?lat=${so.lat}&lng=${so.lng}`)).data;
const boss = w.bosses[0];
if (boss) {
  await goTo(A, boss);
  r = await call(A, "/api/match", { kind: "raid", targetId: boss.id });
  check("boss raid opens", r.status === 200, r);
  const rid = r.data.matchId;
  let rv = (await call(A, `/api/match/${rid}`)).data;
  const me2 = rv.players.find((p: { key: string }) => p.key === meA.id);
  await sleep(300);
  rv = (await call(A, `/api/match/${rid}`, { x: me2.x, z: me2.z, yaw: 0, hits: [{ key: "boss", dmg: 40 }] })).data;
  const w2 = (await call(A, `/api/world?lat=${so.lat}&lng=${so.lng}`)).data;
  check("boss damage is shared world state", w2.bosses.find((b: { id: string }) => b.id === boss.id)?.hp === boss.hp - 40, { before: boss.hp, after: w2.bosses.find((b: { id: string }) => b.id === boss.id)?.hp });
  check("raid shows as live on map", w2.bosses.find((b: { id: string }) => b.id === boss.id)?.liveMatch === rid);
} else console.log("(no boss in range this window — skipped boss checks)");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
