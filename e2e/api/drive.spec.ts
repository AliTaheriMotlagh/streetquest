// The 3D city together: who sees whose vehicle (privacy), the anti-teleport check,
// the garage's level locks, and party rounds refereed by the server.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type Other = { id: string; vehicle: string; lat: number; lng: number; friend: boolean; party: boolean; flags: number; hp: number; passive: boolean };
type ArenaMe = { hp: number; dead: boolean; respawnAt: number; passive: boolean; events: { from: string; dmg: number; kill: boolean }[] };
type PartyState = { game: string; round: number; ids: string[]; progress: Record<string, number>; finished: Record<string, number>; it?: string | null; taken?: Record<string, string> };
type Party = {
  id: string;
  code: string;
  hostId: string;
  status: "LOBBY" | "LIVE" | "ENDED";
  startsAt: number | null;
  members: { userId: string; place: number | null; reward: string | null }[];
  state: PartyState | null;
  warp: (LatLng & { yaw: number; round: number }) | null;
};
type DriveRes = { serverTime: number; vehicle: string; rejected: boolean; others: Other[]; party: Party | null; me: ArenaMe | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A guest playing from home, parked at `at`. */
async function homePlayer(baseURL: string, at: LatLng) {
  const p = await Player.create(baseURL);
  expectOk(await p.post("/api/me", { remotePlay: true }, "PATCH"));
  await p.goTo(at);
  return p;
}

const drive = (p: Player, at: LatLng, extra: Record<string, unknown> = {}) => p.post<DriveRes>("/api/drive", { ...at, yaw: 0, speed: 10, vehicle: "car", ...extra });

async function befriend(a: Player, b: Player) {
  expectOk(await a.post("/api/friends", { action: "request", username: b.username }));
  const inc = await b.get<{ incoming: { friendshipId: string }[] }>("/api/friends");
  expectOk(await b.post("/api/friends", { action: "accept", friendshipId: inc.data.incoming[0].friendshipId }));
}

/** Drive from `from` to `to` in legs the server accepts (~55 m a second). */
async function driveTo(p: Player, from: LatLng, to: LatLng, stepM = 55) {
  const dLat = to.lat - from.lat, dLng = to.lng - from.lng;
  const distM = Math.hypot(dLat * 110_540, dLng * 111_320 * Math.cos((from.lat * Math.PI) / 180));
  const n = Math.max(1, Math.ceil(distM / stepM));
  let last: DriveRes | null = null;
  for (let i = 1; i <= n; i++) {
    await sleep(1000);
    const r = await drive(p, { lat: from.lat + (dLat * i) / n, lng: from.lng + (dLng * i) / n });
    expect(r.status).toBe(200);
    expect(r.data.rejected).toBe(false);
    last = r.data;
  }
  return last!;
}

test.describe("3D city presence", () => {
  test("friends see each other; strangers only once they've driven away from where they started", async ({ baseURL }) => {
    test.slow();
    const here = randomSpot();
    const [a, b, c] = await Promise.all([homePlayer(baseURL!, here), homePlayer(baseURL!, offset(here, 50)), homePlayer(baseURL!, offset(here, 100))]);
    await befriend(a, b);
    const meA = await a.me(), meB = await b.me(), meC = await c.me();
    expectOk(await drive(b, offset(here, 50)));
    expectOk(await drive(c, offset(here, 100)));
    let seen = (await drive(a, here)).data.others;
    expect(seen.find((o) => o.id === meB.id)?.friend).toBe(true);
    // C is a stranger still right where they started (probably home): hidden.
    expect(seen.some((o) => o.id === meC.id)).toBe(false);

    await driveTo(c, offset(here, 100), offset(here, 100, 380));
    seen = (await drive(a, here)).data.others;
    const cSeen = seen.find((o) => o.id === meC.id);
    expect(cSeen).toBeTruthy();
    expect(cSeen!.friend).toBe(false);
    // And everyone stays out of their own list.
    expect(seen.some((o) => o.id === meA.id)).toBe(false);
    await Promise.all([a.dispose(), b.dispose(), c.dispose()]);
  });

  test("teleports are refused, the whole garage is free, unknown vehicles fall back to the hatchback, GPS players only watch", async ({ baseURL }) => {
    const here = randomSpot();
    const p = await homePlayer(baseURL!, here);
    const first = await drive(p, here, { vehicle: "heli", alt: 80 });
    expect(first.status).toBe(200);
    // Free by default (S.garageFree): a level-1 guest flies the helicopter, or drives a Pride.
    expect(first.data.vehicle).toBe("heli");
    expect((await drive(p, here, { vehicle: "pride" })).data.vehicle).toBe("pride");
    expect((await drive(p, here, { vehicle: "tank" })).data.vehicle).toBe("car");
    const jump = await drive(p, offset(here, 2000));
    expect(jump.data.rejected).toBe(true);

    // A player following real GPS can look, not broadcast.
    const gps = await Player.create(baseURL!);
    await gps.goTo(here);
    expect((await gps.post("/api/drive", { ...here, vehicle: "car" })).status).toBe(403);
    const look = await gps.post<DriveRes>("/api/drive", { here, vehicle: "car" });
    expect(look.status).toBe(200);
    expect(Array.isArray(look.data.others)).toBe(true);
    // Leaving the city hides you at once.
    expectOk(await p.ctx.fetch("/api/drive", { method: "DELETE" }).then(async (r) => ({ status: r.status(), data: await r.json() })));
    await Promise.all([p.dispose(), gps.dispose()]);
  });
});

test.describe("Street Arena without the realtime server", () => {
  test("players on foot see each other's soldier and fight over HTTP: passive, hits, a kill, respawn", async ({ baseURL }) => {
    test.slow();
    const here = randomSpot();
    const [a, b, admin] = await Promise.all([homePlayer(baseURL!, here), homePlayer(baseURL!, offset(here, 10)), adminPlayer(baseURL!)]);
    await befriend(a, b);
    const meA = await a.me(), meB = await b.me();
    // Fighting in the open city needs level 3.
    for (const id of [meA.id, meB.id]) expectOk(await admin.post("/api/admin", { action: "grant", userId: id, coins: 0, xp: 500 }));
    const foot = { flags: 1, weapon: 3, pitch: 0, speed: 0 }; // F_FOOT, the sniper
    expectOk(await drive(a, here, foot));
    const seen = (await drive(b, offset(here, 10), foot)).data.others.find((o) => o.id === meA.id);
    expect(seen && seen.flags & 1).toBeTruthy();
    expect(seen!.passive).toBe(true);

    // Both passive (the default): no damage.
    expect((await a.post<{ ok: boolean }>("/api/drive/arena", { action: "hit", target: meB.id, weapon: "pistol", zone: "body", pellets: 1 })).data.ok).toBe(false);
    expectOk(await a.post("/api/drive/arena", { action: "passive", on: false }));
    expectOk(await b.post("/api/drive/arena", { action: "passive", on: false }));
    await Promise.all([drive(a, here, foot), drive(b, offset(here, 10), foot)]);

    const body = expectOk(await a.post<{ ok: boolean; hp: number; kill: boolean }>("/api/drive/arena", { action: "hit", target: meB.id, weapon: "pistol", zone: "body", pellets: 1 })).data;
    expect(body.ok).toBe(true);
    expect(body.hp).toBeLessThan(100);
    await sleep(1000);
    const head = expectOk(await a.post<{ ok: boolean; kill: boolean }>("/api/drive/arena", { action: "hit", target: meB.id, weapon: "sniper", zone: "head", pellets: 1 })).data;
    expect(head.kill).toBe(true);

    // B hears about it on their next report, can't come back at once, then can.
    const bMe = (await drive(b, offset(here, 10), foot)).data.me!;
    expect(bMe.dead).toBe(true);
    expect(bMe.events.filter((e) => e.from === meA.id).length).toBe(2);
    expect((await drive(a, here, foot)).data.others.find((o) => o.id === meB.id)!.hp).toBe(0);
    expect((await b.post("/api/drive/arena", { action: "respawn" })).status).toBe(409);
    await sleep(5000);
    expect(expectOk(await b.post<{ hp: number }>("/api/drive/arena", { action: "respawn" })).data.hp).toBe(100);
    // Just fought: going passive waits a little.
    expect((await a.post("/api/drive/arena", { action: "passive", on: true })).status).toBe(409);
    await Promise.all([a.dispose(), b.dispose(), admin.dispose()]);
  });
});

test.describe("street-map tiles", () => {
  test("only zoom-14 tiles inside the world are proxied", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    for (const bad of ["/api/vt/13/10/10", "/api/vt/14/-1/5", "/api/vt/14/16384/5", "/api/vt/14/x/5"]) expect((await p.get(bad)).status, bad).toBe(400);
    await p.dispose();
  });
});

test.describe("party games", () => {
  async function party(baseURL: string) {
    const here = randomSpot();
    const host = await homePlayer(baseURL, here);
    const guest = await homePlayer(baseURL, offset(here, 40));
    expectOk(await drive(host, here));
    expectOk(await drive(guest, offset(here, 40)));
    const made = await host.post<{ party: Party }>("/api/party", { action: "create" });
    expectOk(made);
    expect((await guest.post("/api/party", { action: "join", code: "nope" })).status).toBe(400);
    expect((await guest.post("/api/party", { action: "join", code: "ZZZZZZ" })).status).toBe(404);
    const joined = await guest.post<{ party: Party }>("/api/party", { action: "join", code: made.data.party.code });
    expectOk(joined);
    expect(joined.data.party.members).toHaveLength(2);
    return { here, host, guest, partyId: made.data.party.id, hostId: (await host.me()).id, guestId: (await guest.me()).id };
  }

  test("checkpoint race: course limits, the start grid, checkpoints in order, a podium that pays", async ({ baseURL }) => {
    test.slow();
    const { here, host, guest, partyId, hostId, guestId } = await party(baseURL!);
    const cps = [offset(here, 150), offset(here, 300), offset(here, 450)];
    const start = { ...here, yaw: Math.PI }; // facing north
    // Only the host starts, and the course has to be sane.
    expect((await guest.post("/api/party", { action: "start", partyId, game: "race", start, points: cps })).status).toBe(403);
    expect((await host.post("/api/party", { action: "start", partyId, game: "race", start, points: [offset(here, 150), offset(here, 3000), offset(here, 3100)] })).status).toBe(400);
    const coinsBefore = { host: (await host.me()).coins, guest: (await guest.me()).coins };

    expectOk(await host.post("/api/party", { action: "start", partyId, game: "race", start, points: cps }));
    // Both are put on the grid: the host on pole, the guest behind.
    const rHost = (await drive(host, here)).data;
    const gHost = rHost.party!;
    const gGuest = (await drive(guest, here)).data.party!;
    expect(gHost.status).toBe("LIVE");
    expect(gHost.warp!.round).toBe(1);
    const warpHost = gHost.warp!, warpGuest = gGuest.warp!;
    expect(Math.abs(warpGuest.lat - warpHost.lat)).toBeGreaterThan(0);
    expectOk(await drive(guest, warpGuest));
    await sleep(Math.max(0, gHost.startsAt! - rHost.serverTime) + 300);

    // The guest skips checkpoint 1: passing 2 first doesn't count.
    await driveTo(guest, warpGuest, { lat: cps[1].lat, lng: cps[1].lng + 0.002 });
    let s = (await drive(guest, { lat: cps[1].lat, lng: cps[1].lng + 0.002 })).data.party!.state!;
    expect(s.progress[guestId] ?? 0).toBe(0);
    // Now properly: 1, 2, 3 — and the host follows behind.
    await driveTo(guest, { lat: cps[1].lat, lng: cps[1].lng + 0.002 }, cps[0]);
    await driveTo(guest, cps[0], cps[1]);
    await driveTo(guest, cps[1], cps[2]);
    s = (await drive(guest, cps[2])).data.party!.state!;
    expect(s.finished[guestId]).toBeGreaterThan(0);
    await driveTo(host, warpHost, cps[0]);
    await driveTo(host, cps[0], cps[1]);
    const end = await driveTo(host, cps[1], cps[2]);
    const final = end.party!.status === "ENDED" ? end.party! : (await drive(host, cps[2])).data.party!;
    expect(final.status).toBe("ENDED");
    expect(final.members.find((m) => m.userId === guestId)!.place).toBe(1);
    expect(final.members.find((m) => m.userId === hostId)!.place).toBe(2);
    expect(final.members.find((m) => m.userId === guestId)!.reward).toContain("🥇");
    expect((await guest.me()).coins).toBeGreaterThan(coinsBefore.guest);
    expect((await host.me()).coins).toBeGreaterThan(coinsBefore.host);
    await Promise.all([host.dispose(), guest.dispose()]);
  });

  test("tag passes IT on touch (not in the first seconds), coin rush counts grabs", async ({ baseURL }) => {
    test.slow();
    const { here, host, guest, partyId, hostId, guestId } = await party(baseURL!);
    expectOk(await host.post("/api/party", { action: "start", partyId, game: "tag", start: { ...here, yaw: Math.PI } }));
    const hp = (await drive(host, here)).data.party!;
    const gp = (await drive(guest, here)).data.party!;
    const it = hp.state!.it!;
    const [chaser, runner] = it === hostId ? [host, guest] : [guest, host];
    const runnerSpot = it === hostId ? gp.warp! : hp.warp!;
    const chaserSpot = it === hostId ? hp.warp! : gp.warp!;
    expectOk(await drive(chaser, chaserSpot));
    // Nobody can be tagged in the first seconds after the start.
    await sleep(4500);
    expectOk(await drive(runner, runnerSpot));
    expect((await drive(chaser, runnerSpot)).data.party!.state!.it).toBe(it);
    expectOk(await drive(chaser, chaserSpot));
    await sleep(3000);
    // Then the chaser drives into the runner, who's standing still: IT passes on.
    expectOk(await drive(runner, runnerSpot));
    await sleep(600);
    const tagged = (await drive(chaser, runnerSpot)).data.party!.state!;
    expect(tagged.it).toBe(it === hostId ? guestId : hostId);
    await Promise.all([host.dispose(), guest.dispose()]);

    // Coin Rush, in a fresh party: drive through coins to grab them.
    const c = await party(baseURL!);
    const coins = Array.from({ length: 8 }, (_, i) => offset(c.here, 60 + i * 40));
    expectOk(await c.host.post("/api/party", { action: "start", partyId: c.partyId, game: "coins", start: { ...c.here, yaw: Math.PI }, points: coins }));
    const w = (await drive(c.guest, c.here)).data.party!.warp!;
    await sleep(4300);
    await driveTo(c.guest, w, coins[1]);
    const st = (await drive(c.guest, coins[1])).data.party!.state!;
    expect(st.progress[c.guestId]).toBeGreaterThanOrEqual(2);
    expect(Object.values(st.taken ?? {}).every((id) => id === c.guestId)).toBe(true);
    await Promise.all([c.host.dispose(), c.guest.dispose()]);
  });
});
