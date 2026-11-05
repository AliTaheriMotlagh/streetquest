// Explore mode and friends (/api/explore): look around any spot without being there,
// see where an online friend is (friends only), and — playing from home — travel right
// next to them, once per cooldown.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot, uploadPlaces, adminPlayer, type LatLng } from "../helpers";

const metres = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

async function befriend(a: Player, b: Player) {
  expectOk(await a.post("/api/friends", { action: "request", username: b.username }));
  const inc = (await b.get<{ incoming: { friendshipId: string }[] }>("/api/friends")).data.incoming;
  expectOk(await b.post("/api/friends", { action: "accept", friendshipId: inc[0].friendshipId }));
}

test("exploring a far-away spot: its places and players, strangers still fuzzed", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const far = randomSpot();
  const { places } = await uploadPlaces(admin, far, 6);
  const [me, local] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
  await me.goTo(offset(far, 50_000));
  await local.goTo(far);
  const localId = (await local.me()).id;
  type E = { spots: { id: string }[]; players: (LatLng & { id: string; friend: boolean })[] };
  const r = expectOk(await me.get<E>(`/api/explore?lat=${far.lat}&lng=${far.lng}`)).data;
  // The test places sit in far's map cell: all within the explore radius of it.
  expect(r.spots.map((s) => s.id)).toEqual(expect.arrayContaining(places.filter((p: LatLng) => metres(p, far) < 1400).map((p: { id: string }) => p.id)));
  const seen = r.players.find((p) => p.id === localId)!;
  expect(seen.friend).toBe(false);
  expect(metres(seen, far)).toBeGreaterThan(55);
  expect((await me.get("/api/explore?lat=nope&lng=1")).status).toBe(400);
  await Promise.all([me.dispose(), local.dispose(), admin.dispose()]);
});

test("visit and travel to a friend: friends only, from home only, once per cooldown", async ({ baseURL }) => {
  const here = randomSpot();
  const palAt = offset(here, 30_000);
  const [me, pal, stranger] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!), Player.create(baseURL!)]);
  await me.goTo(here);
  await pal.goTo(palAt);
  await stranger.goTo(palAt);
  const palId = (await pal.me()).id;
  const strangerId = (await stranger.me()).id;

  // Not friends yet: nothing to see.
  expect((await me.get(`/api/explore?friend=${palId}`)).status).toBe(404);
  await befriend(me, pal);
  const spot = expectOk(await me.get<{ at: LatLng; username: string }>(`/api/explore?friend=${palId}`)).data;
  expect(metres(spot.at, palAt)).toBeLessThan(1);
  expect((await me.get(`/api/explore?friend=${strangerId}`)).status).toBe(404);

  // On GPS you walk; from home you can jump next to them.
  expect((await me.post("/api/explore", { friend: palId })).status).toBe(409);
  expectOk(await me.post("/api/me", { remotePlay: true }, "PATCH"));
  const t = expectOk(await me.post<{ at: LatLng }>("/api/explore", { friend: palId })).data;
  const d = metres(t.at, palAt);
  expect(d).toBeGreaterThan(5);
  expect(d).toBeLessThan(20);
  const mine = (await me.me()) as unknown as { lastPos: LatLng | null };
  expect(metres(mine.lastPos!, t.at)).toBeLessThan(1);
  // The next home report from there isn't a "too fast" jump.
  expect((await me.post("/api/loc", { ...offset(t.at, 3) })).status).toBe(200);
  // Once per cooldown.
  expect((await me.post("/api/explore", { friend: palId })).status).toBe(429);
  await Promise.all([me.dispose(), pal.dispose(), stranger.dispose()]);
});
