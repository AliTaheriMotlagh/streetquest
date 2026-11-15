// The sync poll's shortcut (lib/pulse.ts): a quiet poll answers { same: true } when nothing
// changed for the player, and a full answer as soon as a DM, a notification or a call lands.
import { expect, test } from "@playwright/test";
import { Player } from "../helpers";

type Sync = { now: number; same?: true; unread?: number; call?: { id: string } | null; notifications?: { title: string }[] };

async function crew(baseURL: string) {
  const [a, b] = await Promise.all([Player.create(baseURL), Player.create(baseURL)]);
  await a.post("/api/friends", { action: "request", username: b.username });
  const inc = await b.get<{ incoming: { friendshipId: string }[] }>("/api/friends");
  await b.post("/api/friends", { action: "accept", friendshipId: inc.data.incoming[0].friendshipId });
  return { a, b, aId: (await a.me()).id, bId: (await b.me()).id };
}

/** A `since` far enough past every stamp so far (the server counts stamps within 5 s of it as new). */
async function settled(p: Player) {
  const full = await p.get<Sync>(`/api/sync?since=${Date.now() - 60_000}`);
  expect(full.data.same).toBeUndefined();
  return full.data.now + 6000;
}

test("a quiet poll with nothing new answers same; without q=1 it is always full", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  const since = await settled(p);
  const quiet = await p.get<Sync>(`/api/sync?since=${since}&q=1`);
  expect(quiet.status).toBe(200);
  expect(quiet.data).toMatchObject({ same: true });
  expect(quiet.data.notifications).toBeUndefined();
  const full = await p.get<Sync>(`/api/sync?since=${since}`);
  expect(full.data.same).toBeUndefined();
  expect(Array.isArray(full.data.notifications)).toBe(true);
});

test("a DM and a call reach the next quiet poll", async ({ baseURL }) => {
  const { a, b, aId, bId } = await crew(baseURL!);
  let since = await settled(b);
  expect((await b.get<Sync>(`/api/sync?since=${since}&q=1`)).data.same).toBe(true);

  // A DM stamps the other side: their next quiet poll reads, and counts it unread.
  const room = `dm:${[aId, bId].sort().join(":")}`;
  expect((await a.post("/api/chat", { room, body: "salam" })).status).toBe(200);
  const dm = await b.get<Sync>(`/api/sync?since=${since - 6000}&q=1`);
  expect(dm.data.same).toBeUndefined();
  expect(dm.data.unread).toBe(1);

  // A call rings on the quiet poll too.
  since = dm.data.now;
  const start = await a.post<{ callId: string }>("/api/calls", { action: "start", userId: bId });
  expect(start.status).toBe(200);
  const ring = await b.get<Sync>(`/api/sync?since=${since}&q=1`);
  expect(ring.data.call).toMatchObject({ id: start.data.callId });
});
