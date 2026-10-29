// Who's online (/api/online, the HUD's 🟢 chip): friends anywhere come first, players
// around you after them with a rounded distance — measured to their fuzzed spot, so it
// can't be used to find them — and nobody's position is ever in the answer.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot } from "../helpers";

type Online = { total: number; players: { id: string; username: string; friend: boolean; distM: number | null; level: number }[] };

test("who's online: friends first, then strangers around you, never a position", async ({ baseURL }) => {
  const here = randomSpot();
  const [me, near, far, pal] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!), Player.create(baseURL!), Player.create(baseURL!)]);
  await me.goTo(here);
  await near.goTo(offset(here, 900));
  await far.goTo(offset(here, 20_000));
  await pal.goTo(offset(here, -40_000));
  // A friend 40 km away.
  expectOk(await me.post("/api/friends", { action: "request", username: pal.username }));
  const incoming = (await pal.get<{ incoming: { friendshipId: string }[] }>("/api/friends")).data.incoming;
  expectOk(await pal.post("/api/friends", { action: "accept", friendshipId: incoming[0].friendshipId }));

  const r = expectOk(await me.get<Online>("/api/online")).data;
  const names = r.players.map((p) => p.username);
  expect(names[0]).toBe(pal.username);
  expect(names).toContain(near.username);
  expect(names).not.toContain(far.username);
  expect(names).not.toContain(me.username);

  const stranger = r.players.find((p) => p.username === near.username)!;
  expect(stranger.friend).toBe(false);
  // 900 m away, measured to a spot 60–150 m off, in 250 m steps.
  expect(stranger.distM! % 250).toBe(0);
  expect(stranger.distM!).toBeGreaterThanOrEqual(750);
  expect(stranger.distM!).toBeLessThanOrEqual(1000);
  const friend = r.players.find((p) => p.username === pal.username)!;
  expect(friend).toMatchObject({ friend: true, distM: 40_000 });
  expect(r.total).toBeGreaterThan(0);
  expect(JSON.stringify(r)).not.toMatch(/"lat"|"lng"/);

  // The world carries the count for the HUD chip.
  const w = expectOk(await me.get<{ onlineTotal: number }>(`/api/world?lat=${here.lat}&lng=${here.lng}`)).data;
  expect(w.onlineTotal).toBeGreaterThan(0);
  await Promise.all([me.dispose(), near.dispose(), far.dispose(), pal.dispose()]);
});

test("the online list needs a player", async ({ request }) => {
  expect((await request.get("/api/online")).status()).toBe(401);
});
