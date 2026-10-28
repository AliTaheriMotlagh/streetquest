// Crew video calls: who may call whom, the ring → answer → hang-up lifecycle, and the
// signaling relay (each side only ever receives the other side's signals, in order).
import { expect, test } from "@playwright/test";
import { Player } from "../helpers";

async function crew(baseURL: string) {
  const [a, b] = await Promise.all([Player.create(baseURL), Player.create(baseURL)]);
  await a.post("/api/friends", { action: "request", username: b.username });
  const inc = await b.get<{ incoming: { friendshipId: string }[] }>("/api/friends");
  await b.post("/api/friends", { action: "accept", friendshipId: inc.data.incoming[0].friendshipId });
  return { a, b, aId: (await a.me()).id, bId: (await b.me()).id };
}

test("only crew members can be called", async ({ baseURL }) => {
  const [a, stranger] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
  const r = await a.post("/api/calls", { action: "start", userId: (await stranger.me()).id });
  expect(r.status).toBe(403);
  expect((await a.post("/api/calls", { action: "start", userId: (await a.me()).id })).status).toBe(400);
});

test("ring, answer, exchange signals, hang up", async ({ baseURL }) => {
  const { a, b, bId, aId } = await crew(baseURL!);
  const start = await a.post<{ callId: string; iceServers: unknown[] }>("/api/calls", { action: "start", userId: bId });
  expect(start.status).toBe(200);
  expect(start.data.iceServers.length).toBeGreaterThan(0);
  const id = start.data.callId;

  // The callee's regular sync poll rings with the caller's identity.
  const sync = await b.get<{ call: { id: string; peer: { id: string } } | null }>(`/api/sync?since=${Date.now()}`);
  expect(sync.data.call).toMatchObject({ id, peer: { id: aId } });

  // The caller's offer + ICE wait on the server until the callee answers.
  await a.post("/api/calls", { action: "signal", callId: id, signals: [{ kind: "offer", data: "v=0 offer" }, { kind: "ice", data: "{}" }] });
  expect((await b.post("/api/calls", { action: "accept", callId: id })).status).toBe(200);
  expect((await a.post("/api/calls", { action: "accept", callId: id })).status).toBe(400); // not the callee

  const got = await b.get<{ status: string; signals: { id: number; kind: string }[] }>(`/api/calls?id=${id}`);
  expect(got.data.status).toBe("ACTIVE");
  expect(got.data.signals.map((s) => s.kind)).toEqual(["offer", "ice"]);
  // Polling from the last seen id returns nothing new, and nobody sees their own signals.
  expect((await b.get<{ signals: unknown[] }>(`/api/calls?id=${id}&after=${got.data.signals[1].id}`)).data.signals).toEqual([]);
  expect((await a.get<{ signals: unknown[] }>(`/api/calls?id=${id}`)).data.signals).toEqual([]);

  await b.post("/api/calls", { action: "signal", callId: id, signals: [{ kind: "answer", data: "v=0 answer" }] });
  expect((await a.get<{ signals: { kind: string }[] }>(`/api/calls?id=${id}`)).data.signals.map((s) => s.kind)).toEqual(["answer"]);

  // Ringing stops once answered.
  expect((await b.get<{ call: unknown }>(`/api/sync?since=${Date.now()}`)).data.call).toBeNull();

  // Hanging up sends the phone's connection diagnostics along (what Call.tsx reports).
  const diag = { local: { "host/udp": 2, "relay/udp": 1 }, remote: {}, restarts: 0, iceState: "connected", gather: "complete" };
  expect((await a.post("/api/calls", { action: "end", callId: id, diag })).status).toBe(200);
  const after = await b.get<{ status: string; endReason: string }>(`/api/calls?id=${id}`);
  expect(after.data).toMatchObject({ status: "ENDED", endReason: "hangup" });
  expect((await b.post("/api/calls", { action: "signal", callId: id, signals: [{ kind: "ice", data: "{}" }] })).status).toBe(410);
});

test("busy, declined and cancelled calls", async ({ baseURL }) => {
  const { a, b, bId } = await crew(baseURL!);
  // A third player, also in b's crew.
  const c = await Player.create(baseURL!);
  await c.post("/api/friends", { action: "request", username: b.username });
  const inc = await b.get<{ incoming: { friendshipId: string }[] }>("/api/friends");
  await b.post("/api/friends", { action: "accept", friendshipId: inc.data.incoming[0].friendshipId });

  const first = await a.post<{ callId: string }>("/api/calls", { action: "start", userId: bId });
  // b is already being rung by a.
  const second = await c.post("/api/calls", { action: "start", userId: bId });
  expect(second.status).toBe(409);

  await b.post("/api/calls", { action: "decline", callId: first.data.callId });
  expect((await a.get(`/api/calls?id=${first.data.callId}`)).data).toMatchObject({ status: "ENDED", endReason: "declined" });

  // Caller gives up before an answer: the callee gets a missed-call notification.
  const since = Date.now() - 1000;
  const third = await c.post<{ callId: string }>("/api/calls", { action: "start", userId: bId });
  expect(third.status).toBe(200);
  await c.post("/api/calls", { action: "end", callId: third.data.callId });
  const n = await b.get<{ notifications: { title: string }[] }>(`/api/sync?since=${since}`);
  expect(n.data.notifications.map((x) => x.title)).toContain("📵 Missed video call");
});
