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

let r = await call(A, "/api/auth/signup", { username: name, email: `${name}@test.dev`, password: "password123", timezone: "Asia/Tehran" });
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

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
