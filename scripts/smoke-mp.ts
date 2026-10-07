// Multiplayer / tower-defense / field-army end-to-end test against a running dev
// server (start it with GAME_SPEED=600). Uses the DB directly only to fast-forward
// time and give the test players resources.  `npx tsx scripts/smoke-mp.ts`
import { prisma } from "../src/lib/db";
import { offset } from "../src/lib/geo";
import { defuseScore } from "../src/lib/minigames";

const BASE = process.env.BASE ?? "http://localhost:3000";
type Client = { cookie: string; id?: string; name?: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Each run looks like its own network so the per-IP guest limit doesn't trip.
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

// A random empty patch of the world so runs don't collide.
const home = { lat: 40 + Math.random() * 5, lng: -100 + Math.random() * 5 };
const A: Client = { cookie: "" };
const B: Client = { cookie: "" };
for (const c of [A, B]) {
  const r = await call(c, "/api/auth/guest", {});
  c.name = r.data.username;
  c.id = (await call(c, "/api/me")).data.id;
  await prisma.user.update({ where: { id: c.id }, data: { xp: 2000, coins: 50_000, scrap: 200, gems: 500 } });
}
check("two guest players", !!A.id && !!B.id && A.id !== B.id);

// ---------------------------------------------------------------- lobbies: arcade duel
await go(A, home);
let w = (await call(A, `/api/world?lat=${home.lat}&lng=${home.lng}`)).data;
const find = (k: string) => (w.spawns as { id: string; kind: string; lat: number; lng: number; run?: { target: { lat: number; lng: number } } }[]).find((s) => s.kind === k);
let arcade = find("arcade");
for (let i = 0; !arcade && i < 6; i++) {
  const p = offset(home, 1200 * (i + 1), 90);
  await go(A, p);
  w = (await call(A, `/api/world?lat=${p.lat}&lng=${p.lng}`)).data;
  arcade = find("arcade");
}
check("found an arcade spawn", !!arcade);
if (arcade) {
  await go(A, arcade);
  await go(B, arcade);
  check("plain claim of arcade is refused", (await call(A, "/api/claim", { spawnId: arcade.id })).status === 400);
  const la = await call(A, "/api/lobby", { action: "open", spawnId: arcade.id });
  check("A opens a range lobby", la.status === 200 && la.data.lobby.kind === "range", la.data);
  const lb = await call(B, "/api/lobby", { action: "open", spawnId: arcade.id });
  check("B joins the same lobby", lb.data.lobby?.id === la.data.lobby.id && lb.data.lobby.players.length === 2, lb.data);
  const notes = (await call(B, `/api/sync?since=${Date.now() - 20_000}`)).data.notifications as { title: string }[];
  check("B was pinged about the nearby lobby", notes.some((n) => n.title.includes("opened a Shooting Range")), notes);
  check("only host can start", (await call(B, "/api/lobby", { action: "start", lobbyId: la.data.lobby.id })).status === 403);
  const st = await call(A, "/api/lobby", { action: "start", lobbyId: la.data.lobby.id });
  check("host starts → LIVE", st.data.lobby.status === "LIVE", st.data);
  check("early score rejected", (await call(A, "/api/lobby", { action: "score", lobbyId: la.data.lobby.id, score: 50 })).status === 400);
  await sleep(3600);
  await call(A, "/api/lobby", { action: "score", lobbyId: la.data.lobby.id, score: 220 });
  const fin = await call(B, "/api/lobby", { action: "score", lobbyId: la.data.lobby.id, score: 999_999 });
  const pl = fin.data.lobby?.players as { userId: string; place: number; score: number }[];
  check("lobby ends when everyone scored", fin.data.lobby?.status === "ENDED", fin.data);
  check("forged score is capped and ranked", pl?.find((p) => p.userId === B.id)!.score < 999_999 && pl.every((p) => p.place >= 1), pl);
  check("can't replay the arcade", (await call(A, "/api/lobby", { action: "open", spawnId: arcade.id })).status === 409);
}

// ---------------------------------------------------------------- chest: solo defuse
let chest = find("chest");
if (chest) {
  await go(A, chest);
  const l = await call(A, "/api/lobby", { action: "open", spawnId: chest.id });
  await call(A, "/api/lobby", { action: "start", lobbyId: l.data.lobby.id });
  await sleep(3600);
  const r = await call(A, "/api/lobby", { action: "score", lobbyId: l.data.lobby.id, score: defuseScore(3, 12_000) });
  const me = (r.data.lobby.players as { userId: string; reward: string }[]).find((p) => p.userId === A.id)!;
  check("solo bomb defuse pays loot", r.data.lobby.status === "ENDED" && /Flawless/.test(me.reward ?? ""), r.data);
}

// ---------------------------------------------------------------- squad run (race)
const run = find("run");
if (run) {
  await go(A, run);
  await go(B, run);
  const l = await call(A, "/api/lobby", { action: "open", spawnId: run.id, mode: "race" });
  await call(B, "/api/lobby", { action: "open", spawnId: run.id });
  const st = await call(A, "/api/lobby", { action: "start", lobbyId: l.data.lobby.id });
  check("race started", st.data.lobby.status === "LIVE", st.data);
  const meA = (await call(A, "/api/me")).data;
  check("both runners have an active run", !!meA.activeRun && !!(await call(B, "/api/me")).data.activeRun);
  const pos = await call(A, `/api/lobby?id=${l.data.lobby.id}`);
  check("squadmates see each other's positions", (pos.data.lobby.players as { lat: number | null }[]).every((p) => p.lat != null), pos.data);
  await go(A, run.run!.target);
  const r1 = await call(A, "/api/runs", { runId: meA.activeRun.id, action: "complete" });
  check("A wins the race (🥇 +50%)", r1.status === 200 && /🥇/.test(r1.data.message), r1.data);
  await go(B, run.run!.target);
  const r2 = await call(B, "/api/runs", { runId: (await call(B, "/api/me")).data.activeRun.id, action: "complete" });
  check("B places second (🥈)", /🥈/.test(r2.data.message), r2.data);
}

// ---------------------------------------------------------------- bases, towers, players under fire
const baseA = home;
const baseB = offset(home, 1500, 0);
for (const [c, p, n] of [[A, baseA, "Fort A"], [B, baseB, "Fort B"]] as const) {
  await go(c, p);
  await call(c, "/api/base", { action: "faction", faction: "coalition" });
  const r = await call(c, "/api/base", { action: "found", name: n });
  check(`${n} planted`, r.status === 200, r.data);
}
for (let i = 0; i < 2; i++) await call(A, "/api/base", { action: "build", type: "hq" }), await sleep(1200);
await call(A, "/api/base", { action: "build", type: "camp" });
await call(B, "/api/base", { action: "build", type: "barracks" });
await call(B, "/api/base", { action: "build", type: "camp" });
await sleep(1500);
await call(B, "/api/base", { action: "build", type: "camp" });
await sleep(1500);
const tr = await call(B, "/api/base", { action: "train", unit: "ranger", qty: 10 });
check("B trains rangers", tr.status === 200, tr.data);

const towerSpot = offset(baseA, 60, 0);
await go(A, towerSpot);
let r = await call(A, "/api/towers", { action: "build", type: "mg" });
check("A builds an MG nest", r.status === 200, r.data);
check("towers keep their spacing", (await call(A, "/api/towers", { action: "build", type: "sniper" })).status === 400);
await go(A, offset(baseA, 5000, 0));
check("can't build outside territory", (await call(A, "/api/towers", { action: "build", type: "mg" })).status === 400);
await sleep(500);
const tower = (await call(A, "/api/towers")).data.towers[0];
check("tower listed", tower?.type === "mg", tower);

await go(B, offset(towerSpot, 10, 90));
await sleep(2500);
r = await go(B, offset(towerSpot, 12, 90));
check("walking into a hostile tower draws fire", r.data.fire?.hits?.length > 0 && r.data.fire.hp < r.data.fire.maxHp, r.data);
await prisma.user.update({ where: { id: B.id }, data: { hp: 1 } });
await sleep(1500);
r = await go(B, offset(towerSpot, 11, 90));
check("B gets downed and A gets the bounty", r.data.fire?.downed?.by === A.name, r.data);
check("downed players can't loot", /You're down/.test((await call(B, "/api/towers", { action: "sabotage", towerId: tower.id, score: 3 })).data.error ?? ""));
r = await go(B, offset(towerSpot, 12, 90));
check("respawn cover after being downed", !!r.data.fire?.protectedReason, r.data);

await prisma.user.update({ where: { id: B.id }, data: { downedUntil: null, hp: 100 } });
r = await call(B, "/api/towers", { action: "sabotage", towerId: tower.id, score: 3 });
check("B plants C4 on the tower", r.status === 200 && /Charge hit|destroyed/.test(r.data.message), r.data);
check("sabotage has a cooldown", (await call(B, "/api/towers", { action: "sabotage", towerId: tower.id, score: 3 })).status === 429);

// ---------------------------------------------------------------- field squads (RTS on the map)
await sleep(1000);
const sq = await call(B, "/api/squads");
check("B has rangers at home", (sq.data.home.ranger ?? 0) >= 10, sq.data);
r = await call(B, "/api/squads", { action: "deploy", units: { ranger: 4 }, to: offset(baseB, 200, 180) });
check("B deploys a guard squad", r.status === 200, r.data);
const guardId = r.data.squadId;
r = await call(B, "/api/squads", { action: "deploy", units: { ranger: 6 }, target: { kind: "tower", id: tower.id } });
check("B sends a squad at A's tower", r.status === 200, r.data);
const atkNote = (await call(A, `/api/sync?since=${Date.now() - 5000}`)).data.notifications as { title: string }[];
check("A is warned the squad is marching", atkNote.some((n) => n.title.includes("marching on")), atkNote);
w = (await call(A, `/api/world?lat=${baseA.lat}&lng=${baseA.lng}`)).data;
check("enemy squads are visible on A's map (fog hides units)", (w.squads as { mine: boolean; units: unknown }[]).some((s) => !s.mine && s.units === null), w.squads);
await sleep(2500);
await call(B, "/api/squads"); // settles arrivals
const towerLeft = await prisma.tower.findUnique({ where: { id: tower.id } });
const battleNote = (await call(B, `/api/sync?since=${Date.now() - 6000}`)).data.notifications as { title: string }[];
check("squad assault on the tower resolved", battleNote.some((n) => /tower|Tower|Nest|Squad|squad/.test(n.title)), { battleNote, towerLeft });
const guard = await prisma.squad.findUnique({ where: { id: guardId } });
check("guard squad is holding position", guard?.status === "HOLD" && guard.order === "guard", guard);
const bv = (await call(B, "/api/base")).data;
check("deployed squads still use Army Camp housing", bv.housing.used >= 4, bv.housing);

// A's squad attacks B's guard squad
await call(A, "/api/base", { action: "build", type: "barracks" });
await sleep(1500);
await call(A, "/api/base", { action: "train", unit: "ranger", qty: 10 });
await sleep(1500);
r = await call(A, "/api/squads", { action: "deploy", target: { kind: "squad", id: guardId } });
check("A sends the whole army at B's guards", r.status === 200, r.data);
await sleep(2500);
await call(A, "/api/squads");
const sk = await prisma.battle.findFirst({ where: { attackerId: A.id, kind: "skirmish" } });
check("squad-vs-squad skirmish fought", !!sk, sk);

// Squad siege of a base (march → siege on arrival)
const mine = await prisma.squad.findFirst({ where: { ownerId: A.id } });
if (mine) {
  r = await call(A, "/api/squads", { action: "attack", squadId: mine.id, target: { kind: "base", id: (await prisma.base.findUnique({ where: { ownerId: B.id } }))!.id } });
  check("redirect a squad to siege B's base", r.status === 200, r.data);
  await sleep(2500);
  await call(A, "/api/squads");
  check("siege by marching squad recorded", !!(await prisma.battle.findFirst({ where: { attackerId: A.id, kind: "siege" } })));
}

// ---------------------------------------------------------------- raider waves
await go(A, baseA);
await call(A, "/api/towers", { action: "build", type: "mg" });
r = await call(A, "/api/waves", { action: "provoke" });
check("A provokes a raider wave", r.status === 200, r.data);
const waveId = r.data.waveId;
check("provoke has a cooldown", (await call(A, "/api/waves", { action: "provoke" })).status === 429);
const wv = await prisma.wave.findUniqueOrThrow({ where: { id: waveId } });
const shift = wv.startAt.getTime() - Date.now() + 5000; // start 5s ago
await prisma.wave.update({ where: { id: waveId }, data: { startAt: new Date(wv.startAt.getTime() - shift), endAt: new Date(wv.endAt.getTime() - shift) } });
r = await call(A, "/api/waves", { action: "strike", waveId, lat: baseA.lat, lng: baseA.lng });
check("A calls in an airstrike", r.status === 200, r.data);
check("strikes have a cooldown", (await call(A, "/api/waves", { action: "strike", waveId, lat: baseA.lat, lng: baseA.lng })).status === 429);
check("strangers can't strike", (await call(B, "/api/waves", { action: "strike", waveId, lat: baseA.lat, lng: baseA.lng })).status === 403);
w = (await call(A, `/api/world?lat=${baseA.lat}&lng=${baseA.lng}`)).data;
check("live wave is on the map", (w.waves as { id: string }[]).some((x) => x.id === waveId), w.waves);
check("base buildings are on the map", ((w.bases as { mine: boolean; buildings: unknown[] }[]).find((b) => b.mine)?.buildings.length ?? 0) >= 3);
await prisma.wave.update({ where: { id: waveId }, data: { startAt: new Date(Date.now() - 20 * 60_000), endAt: new Date(Date.now() - 1000) } });
const res = await call(A, `/api/waves?id=${waveId}`);
check("finished wave is resolved", !!res.data.wave?.result && res.data.wave.resolvedAt, res.data);
console.log("   wave result:", JSON.stringify(res.data.wave?.result));

// ---------------------------------------------------------------- pings
r = await call(A, "/api/pings", { kind: "rally" });
check("crew ping", r.status === 200, r.data);
w = (await call(A, `/api/world?lat=${baseA.lat}&lng=${baseA.lng}`)).data;
check("own ping visible", (w.pings as unknown[]).length >= 1);

console.log(fails ? `\n${fails} check(s) failed` : "\nAll multiplayer checks passed");
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
