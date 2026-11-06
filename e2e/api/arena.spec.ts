// Street Arena matches between players without the realtime server: a match runs in its
// host's browser and the others link to it through /api/arena (server/arenaRelay.ts).
// Here the browsers are played by hand: rooms, who may join, the polls both ways, the
// result — and the party side: its match, going to the host, inviting players nearby.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot, type LatLng } from "../helpers";

type Peer = { userId: string; name: string; anchor: LatLng; trail: number[][]; joinedAt: number };
type HostPoll = { now: number; msgs: { id: number; from: string; body: { at: number; m: Record<string, unknown> }[] }[]; peers: Peer[] };
type GuestPoll = { now: number; clock: number; snap: string | null; origin: LatLng; msgs: { id: number; body: string[] }[]; peers: { userId: string; trail: number[][] }[] };
type Room = { id: string; kind: string; party: boolean; mode: string; hostName: string; players: number; dist: number };
type PartyView = { id: string; code: string; hostId: string; members: { userId: string; dist: number | null }[]; arena: { id: string; kind: string; mode: string } | null };

/** A guest playing from home, in the 3D city at `at`. */
async function homePlayer(baseURL: string, at: LatLng) {
  const p = await Player.create(baseURL);
  expectOk(await p.post("/api/me", { remotePlay: true }, "PATCH"));
  await p.goTo(at);
  expectOk(await p.post("/api/drive", { ...at, yaw: 0, speed: 0, vehicle: "car" }));
  return p;
}
const sample = (at: LatLng, t: number) => [t, at.lat, at.lng, 0, 0, 0, 0, 0, 1, 2, 0];
const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "x");

test.describe("Street Arena through the game server", () => {
  test("a room: who may join, moves one hop, the referee's messages both ways, a result paid once", async ({ baseURL }) => {
    test.slow();
    const here = randomSpot();
    const [host, guest, far] = await Promise.all([homePlayer(baseURL!, here), homePlayer(baseURL!, offset(here, 120)), homePlayer(baseURL!, offset(here, 6000))]);
    const [hostMe, guestMe] = await Promise.all([host.me(), guest.me()]);
    const id = newId();

    // A match far from where the host is can't be opened; one where they stand can.
    expect((await host.post("/api/arena", { action: "open", id, mode: "tdm", radius: 250, ...offset(here, 9000), bots: 4, anchor: here })).status).toBe(400);
    expectOk(await host.post("/api/arena", { action: "open", id, mode: "tdm", radius: 250, ...here, bots: 4, anchor: here }));

    // Listed for players close by, not for someone 6 km away (who can't join either).
    const list = expectOk(await guest.post<{ rooms: Room[] }>("/api/arena", { action: "list", ...offset(here, 120) })).data.rooms;
    const mine = list.find((r) => r.id === id);
    expect(mine).toMatchObject({ kind: "relay", mode: "tdm", hostName: hostMe.username, party: false });
    expect(mine!.dist).toBeGreaterThan(80);
    expect(expectOk(await far.post<{ rooms: Room[] }>("/api/arena", { action: "list", ...offset(here, 6000) })).data.rooms.some((r) => r.id === id)).toBe(false);
    expect((await far.post("/api/arena", { action: "join", id, anchor: offset(here, 6000) })).status).toBe(403);
    // Polls are only for people in the room.
    expect((await far.post("/api/arena", { action: "guest", id, ack: 0, trail: [], up: [] })).status).toBe(410);
    expect((await guest.post("/api/arena", { action: "host", id, ack: 0, out: [], trail: [], phase: "lobby", humans: 1, bots: 4, clock: 0 })).status).toBe(410);

    expectOk(await guest.post("/api/arena", { action: "join", id, anchor: offset(here, 120) }));
    const t0 = Date.now();
    // The guest's first poll: its trail and a message for the host.
    const g1 = expectOk(await guest.post<GuestPoll>("/api/arena", { action: "guest", id, ack: 0, trail: [sample(offset(here, 120), t0)], up: [{ at: t0, m: { t: "look", color: "#123456" } }] })).data;
    expect(g1.msgs).toEqual([]);

    // The host hears it: the guest (with their city origin and trail) and their message.
    const h1 = expectOk(await host.post<HostPoll>("/api/arena", { action: "host", id, ack: 0, out: [], trail: [sample(here, t0)], snap: "AAAA", phase: "lobby", humans: 2, bots: 4, clock: 42 })).data;
    const peer = h1.peers.find((p) => p.userId === guestMe.id)!;
    expect(peer.anchor.lat).toBeCloseTo(offset(here, 120).lat, 6);
    expect(peer.trail[0][1]).toBeCloseTo(offset(here, 120).lat, 6);
    expect(h1.msgs).toHaveLength(1);
    expect(h1.msgs[0]).toMatchObject({ from: guestMe.id, body: [{ m: { t: "look", color: "#123456" } }] });

    // The referee answers; acknowledged messages aren't sent again.
    const welcome = JSON.stringify({ t: "welcome", sid: 7, now: t0, passive: false });
    const h2 = expectOk(await host.post<HostPoll>("/api/arena", { action: "host", id, ack: h1.msgs[0].id, out: [{ to: guestMe.id, body: [welcome] }], trail: [sample(here, t0 + 100)], phase: "lobby", humans: 2, bots: 4, clock: 42 })).data;
    expect(h2.msgs).toEqual([]);
    const g2 = expectOk(await guest.post<GuestPoll>("/api/arena", { action: "guest", id, ack: 0, trail: [sample(offset(here, 121), t0 + 200)], up: [] })).data;
    expect(g2.msgs.flatMap((m) => m.body)).toEqual([welcome]);
    expect(g2.clock).toBe(42);
    expect(g2.snap).toBe("AAAA");
    expect(g2.origin.lat).toBeCloseTo(here.lat, 6);
    // Everyone's moves, one hop: the host's own trail.
    expect(g2.peers.find((p) => p.userId === hostMe.id)!.trail[0][0]).toBe(t0 + 100);
    const g3 = expectOk(await guest.post<GuestPoll>("/api/arena", { action: "guest", id, ack: g2.msgs[0].id, trail: [], up: [] })).data;
    expect(g3.msgs).toEqual([]);

    // The result: only people who were in the room count, and it pays once.
    const row = (userId: string, place: number, won: boolean) => ({ userId, kills: 3, botKills: 1, deaths: 1, score: 30, place, won, rounds: 0 });
    const res = expectOk(await host.post<{ rewards: Record<string, { xp: number; coins: number } | null>; practice: boolean }>("/api/arena", {
      action: "result", id, mode: "tdm", players: 6, results: [row(hostMe.id, 1, true), row(guestMe.id, 2, false), row("someone-else", 3, false)],
    })).data;
    expect(res.practice).toBe(false);
    expect(res.rewards[hostMe.id]!.coins).toBeGreaterThan(0);
    expect(res.rewards[guestMe.id]!.xp).toBeGreaterThan(0);
    expect("someone-else" in res.rewards).toBe(false);
    const again = expectOk(await host.post<{ rewards: Record<string, unknown> }>("/api/arena", { action: "result", id, mode: "tdm", players: 6, results: [row(hostMe.id, 1, true)] })).data;
    expect(again.rewards).toEqual({});

    // Leaving, then closing: the guest's polls say it's over.
    expectOk(await guest.post("/api/arena", { action: "leave", id }));
    expect((await guest.post("/api/arena", { action: "guest", id, ack: 0, trail: [], up: [] })).status).toBe(410);
    expectOk(await host.post("/api/arena", { action: "close", id }));
    expect((await host.post("/api/arena", { action: "host", id, ack: 0, out: [], trail: [], phase: "lobby", humans: 1, bots: 0, clock: 0 })).status).toBe(410);
    await Promise.all([host.dispose(), guest.dispose(), far.dispose()]);
  });

  test("a host alone with bots is practice: no pay", async ({ baseURL }) => {
    const here = randomSpot();
    const host = await homePlayer(baseURL!, here);
    const me = await host.me();
    const id = newId();
    expectOk(await host.post("/api/arena", { action: "open", id, mode: "ffa", radius: 150, ...here, bots: 6, anchor: here }));
    const r = expectOk(await host.post<{ practice: boolean; rewards: object }>("/api/arena", { action: "result", id, mode: "ffa", players: 7, results: [{ userId: me.id, kills: 9, botKills: 9, deaths: 0, score: 90, place: 1, won: true, rounds: 0 }] })).data;
    expect(r.practice).toBe(true);
    expect(r.rewards).toEqual({});
    await host.dispose();
  });

  test("a party: the host's match is the party's (members join from anywhere), members go to the host, players nearby can be invited", async ({ baseURL }) => {
    test.slow();
    const here = randomSpot();
    const [host, member, nearby] = await Promise.all([homePlayer(baseURL!, here), homePlayer(baseURL!, offset(here, 4000)), homePlayer(baseURL!, offset(here, 300))]);
    const [hostMe, memberMe, nearbyMe] = await Promise.all([host.me(), member.me(), nearby.me()]);
    const party = expectOk(await host.post<{ party: PartyView }>("/api/party", { action: "create" })).data.party;
    expectOk(await member.post("/api/party", { action: "join", code: party.code }));

    // 4 km apart: the member sees how far the host is, and goes there.
    expectOk(await host.post("/api/drive", { ...here, yaw: 0, speed: 0, vehicle: "car" }));
    const before = expectOk(await member.post<{ party: PartyView }>("/api/drive", { ...offset(here, 4000), yaw: 0, speed: 0, vehicle: "car" })).data.party;
    expect(before.members.find((m) => m.userId === hostMe.id)!.dist).toBeGreaterThan(3500);
    const went = expectOk(await member.post<{ at: LatLng & { yaw: number } }>("/api/party", { action: "gather" })).data.at;
    expect(Math.abs(went.lat - here.lat) * 110_540).toBeLessThan(60);
    // The next report from there isn't refused as a teleport, and the host is right there.
    const after = expectOk(await member.post<{ rejected: boolean; party: PartyView; others: { id: string }[] }>("/api/drive", { ...went, speed: 0, vehicle: "car" })).data;
    expect(after.rejected).toBe(false);
    expect(after.party.members.find((m) => m.userId === hostMe.id)!.dist).toBeLessThan(60);
    expect(after.others.some((o) => o.id === hostMe.id)).toBe(true);

    // The host's match is the party's: members see it (and may join from anywhere).
    const id = newId();
    expectOk(await host.post("/api/arena", { action: "open", id, mode: "bomb", radius: 250, ...here, bots: 2, anchor: here, party: true }));
    const seen = expectOk(await member.post<{ party: PartyView }>("/api/drive", { ...went, speed: 0, vehicle: "car" })).data.party;
    expect(seen.arena).toEqual({ id, kind: "relay", mode: "bomb" });
    const rooms = expectOk(await member.post<{ rooms: Room[] }>("/api/arena", { action: "list", ...offset(here, 20000) })).data.rooms;
    expect(rooms.find((r) => r.id === id)?.party).toBe(true);
    expectOk(await member.post("/api/arena", { action: "join", id, anchor: offset(here, 20000) }));
    // Closing it clears it from the party.
    expectOk(await host.post("/api/arena", { action: "close", id }));
    expect(expectOk(await member.post<{ party: PartyView }>("/api/drive", { ...went, speed: 0, vehicle: "car" })).data.party.arena).toBeNull();

    // A player online near the host can be invited (once); a stranger far away can't.
    const far = await homePlayer(baseURL!, offset(here, 30000));
    const farMe = await far.me();
    expectOk(await host.post("/api/party", { action: "invite", partyId: party.id, userId: nearbyMe.id }));
    expect((await host.post("/api/party", { action: "invite", partyId: party.id, userId: farMe.id })).status).toBe(403);
    const inv = expectOk(await nearby.get<{ invites: { code: string }[] }>("/api/party")).data.invites;
    expect(inv.map((i) => i.code)).toContain(party.code);
    void memberMe;
    await Promise.all([host.dispose(), member.dispose(), nearby.dispose(), far.dispose()]);
  });
});
