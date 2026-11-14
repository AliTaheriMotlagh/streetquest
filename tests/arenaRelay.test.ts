// Street Arena matches through the game server (lib/arena/relay, components/arena/relay):
// the wire formats, the clocks, and a whole join played in-process — a host's hub, a
// player joining it, and a tiny stand-in for /api/arena between them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localFrame, F_FOOT, G_BOT, type ServerMsg, type SnapEntity, type State } from "@/lib/arena/protocol";
import {
  capShots, ClockSync, decodeWorld, encodeWorld, Lateness, packTrail, pushSample, reframe, RELAY_REWIND_MS, toSample, toState, TRAIL_GAP_MS, TRAIL_MAX, unpackTrail, type Sample,
} from "@/lib/arena/relay";
import { Hub } from "../realtime/hub";
import { Mixer, RelayGuest, RelayHost, relayApi } from "../src/components/arena/relay";

const A = { lat: 35.7325, lng: 51.5352 };
const B = { lat: 35.7361, lng: 51.5411 }; // ~650 m away: another player's 3D city origin
const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);
const state = (x: number, z: number, extra: Partial<State> = {}): State => ({ flags: F_FOOT, vehicle: 0, weapon: 2, x, y: 0, z, yaw: 0.5, pitch: 0.1, vx: 1, vz: -1, ...extra });

describe("moves on the wire", () => {
  it("a sample taken in one city frame lands on the same street in another", () => {
    const fa = localFrame(A), fb = localFrame(B);
    const s = toSample(fa, state(120, -80), 1000);
    const there = toState(fb, s);
    const direct = fb.toXZ(fa.toLL(120, -80).lat, fa.toLL(120, -80).lng);
    near(there.x, direct.x, 1e-6);
    near(there.z, direct.z, 1e-6);
    // And back, within the wire's rounding (1e-7°, about a centimetre).
    const back = toState(fa, unpackTrail(packTrail([s]))[0]);
    near(back.x, 120, 0.02);
    near(back.z, -80, 0.02);
  });

  it("trails: rows that aren't numbers are dropped, values clamped, oldest first", () => {
    const good = packTrail([toSample(localFrame(A), state(1, 2), 2000), toSample(localFrame(A), state(3, 4), 1000)]);
    const rows = unpackTrail([...good, ["x", 1], [1, 2], [1, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0], [5000, A.lat, A.lng, 9999, 0, 9, 999, 0, 1, 2, 0]]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.at), [1000, 2000, 5000]);
    assert.equal(rows[2].y, 400);
    assert.equal(rows[2].pitch, 1.6);
    assert.equal(rows[2].vx, 150);
    assert.deepEqual(unpackTrail("nope"), []);
  });

  it("pushSample keeps the newest sample, spaced ones before it, and only the last few", () => {
    const tr: Sample[] = [];
    const f = localFrame(A);
    for (let t = 0; t < 3000; t += 20) pushSample(tr, toSample(f, state(t / 100, 0), t));
    assert.equal(tr.length, TRAIL_MAX);
    for (let i = 1; i < tr.length - 1; i++) assert.ok(tr[i].at - tr[i - 1].at >= TRAIL_GAP_MS - 20, `${tr[i].at - tr[i - 1].at}`);
    assert.equal(tr[tr.length - 1].at, 2980, "the freshest is always there");
  });
});

describe("the host's snapshots", () => {
  const ent = (sid: number, x: number, z: number, extra: Partial<SnapEntity> = {}): SnapEntity => ({ ...state(x, z), sid, hp: 80, flags2: 0, team: 1, ...extra });
  it("pack a few snapshots and unpack them exactly (in the match frame)", () => {
    const snaps = [
      { t: 1000, list: [ent(1, 10, 20), ent(2, -30, 5, { flags2: G_BOT, team: 2 })] },
      { t: 1100, list: [ent(1, 11, 21)] },
      { t: 1200, list: [] },
    ];
    const out = decodeWorld(encodeWorld(snaps));
    assert.deepEqual(out.map((s) => s.t), [1000, 1100, 1200]);
    assert.equal(out[0].list.length, 2);
    near(out[0].list[1].x, -30, 1e-4);
    assert.equal(out[0].list[1].flags2, G_BOT);
    assert.equal(out[0].list[1].team, 2);
    assert.deepEqual(decodeWorld("@@not base64@@"), []);
    assert.deepEqual(decodeWorld(null), []);
  });
  it("reframe puts a match-frame entity into my own metres", () => {
    const e = reframe(ent(1, 50, -40), A, localFrame(B));
    const ll = localFrame(A).toLL(50, -40);
    const want = localFrame(B).toXZ(ll.lat, ll.lng);
    near(e.x, want.x, 1e-6);
    near(e.z, want.z, 1e-6);
  });
});

describe("batches and clocks", () => {
  it("a batch keeps the newest tracers and every other message, in order", () => {
    const shot = (i: number) => JSON.stringify({ t: "shot", sid: i, w: "rifle", x: 0, y: 0, z: 0, ex: 0, ey: 0, ez: 0 });
    const msgs = [JSON.stringify({ t: "kill", killer: 1 }), ...Array.from({ length: 40 }, (_, i) => shot(i)), JSON.stringify({ t: "match", m: null })];
    const out = capShots(msgs, 5);
    assert.equal(out.length, 7);
    assert.equal(JSON.parse(out[0]).t, "kill");
    assert.deepEqual(out.slice(1, 6).map((m) => JSON.parse(m).sid), [35, 36, 37, 38, 39]);
    assert.equal(JSON.parse(out[6]).t, "match");
  });
  it("ClockSync finds the server's clock from round trips (first sample jumps, then glides)", () => {
    const c = new ClockSync();
    const truth = 5_000;
    c.sample(0, 200, 100 + truth);
    assert.equal(c.offset, truth);
    for (let i = 0; i < 50; i++) c.sample(1000 * i, 1000 * i + 300, 1000 * i + 150 + truth + (i % 2 ? 40 : -40));
    near(c.offset, truth, 25);
  });
  it("Lateness draws relayed players as late as their news arrives plus a poll, and shrugs off one stall", () => {
    const l = new Lateness();
    let now = 0;
    // A poll every 200 ms, its newest sample 150–300 ms old on arrival.
    for (let i = 0; i < 40; i++) l.add(150 + (i % 4) * 50, (now += 200));
    assert.ok(l.delay >= 450 && l.delay <= 600, String(l.delay));
    // One request stalls for 5 s: hardly matters; a run of slow polls does.
    l.add(5000, (now += 5000));
    assert.ok(l.delay < 700, `one stall: ${l.delay}`);
    for (let i = 0; i < 25; i++) l.add(1200, (now += 600));
    assert.ok(l.delay > 1500, `slow network: ${l.delay}`);
    for (let i = 0; i < 80; i++) l.add(150 + (i % 4) * 50, (now += 200));
    assert.ok(l.delay < 650, `back to normal: ${l.delay}`);
    // Two sources in one poll don't count as a burst of polls.
    const m = new Lateness();
    for (let i = 0; i < 30; i++) (m.add(100, (now += 300)), m.add(100, now + 1));
    assert.ok(m.delay >= 450, String(m.delay));
    for (let i = 0; i < 60; i++) m.add(0, (now += 10));
    assert.ok(m.delay >= 220, "never below the floor");
  });
});

describe("Mixer", () => {
  it("draws humans from their own trails (with the referee's health and team) and bots from the referee", () => {
    const pushed: { sid: number; t: number; hp: number; team: number; x: number }[] = [];
    const f = localFrame(A);
    const mx = new Mixer(f, () => 1, (e, t) => pushed.push({ sid: e.sid, t, hp: e.hp, team: e.team, x: e.x }));
    mx.roster([{ sid: 2, id: "u2", name: "Two", avatar: "🙂", level: 3, color: "#fff", friend: false, bot: false }, { sid: 9, id: "bot:x:0", name: "Bot", avatar: "🤖", level: 1, color: "#fff", friend: false, bot: true }], []);
    mx.world(1000, [{ ...state(5, 5), sid: 2, hp: 40, flags2: 0, team: 2 }, { ...state(7, 7), sid: 9, hp: 100, flags2: G_BOT, team: 1 }, { ...state(0, 0), sid: 1, hp: 100, flags2: 0, team: 1 }], 300);
    assert.deepEqual(pushed.map((p) => p.sid), [9], "only the bot is drawn from the referee; never me");
    const tr = [toSample(f, state(10, 0), 900), toSample(f, state(11, 0), 1000)];
    mx.trail("u2", tr, 1500);
    mx.trail("u2", tr, 1600); // nothing new
    const two = pushed.filter((p) => p.sid === 2);
    assert.equal(two.length, 2);
    assert.equal(two[1].hp, 40);
    assert.equal(two[1].team, 2);
    near(two[1].x, 11, 0.02);
  });
});

describe("deliberate jumps of the car", () => {
  it("a warp in the open city moves me without the referee bouncing me back (shielded a moment); a plain jump is put back", () => {
    const hub = new Hub(() => {});
    const msgs: ServerMsg[] = [];
    const sock = { readyState: 1, bufferedAmount: 0, close() {}, send: (d: string | ArrayBuffer) => typeof d === "string" && msgs.push(JSON.parse(d)) };
    const p = hub.join(sock, { id: "u1", name: "One", avatar: "🙂", level: 5, friends: [], virtual: true }, A);
    const t0 = Date.now();
    hub.state(p, state(0, 0, { flags: 0 }), t0);
    hub.state(p, state(3000, 0, { flags: 0 }), t0 + 50); // 3 km in 50 ms: not believed
    assert.ok(msgs.some((m) => m.t === "spawn"), "put back");
    near(p.frame.toXZ(p.lat, p.lng).x, 0, 0.01);
    msgs.length = 0;
    hub.message(p, { t: "warp", x: 3000, y: 0, z: 0, yaw: 1 }, t0 + 2000);
    hub.state(p, state(3001, 0, { flags: 0 }), t0 + 2050);
    near(p.frame.toXZ(p.lat, p.lng).x, 3001, 0.01);
    assert.equal(msgs.filter((m) => m.t === "spawn").length, 0, "no bounce after a warp");
    assert.ok(p.shieldUntil > t0 + 2000);
    // Not again right away, and never inside a match.
    hub.message(p, { t: "warp", x: 0, y: 0, z: 0, yaw: 0 }, t0 + 2100);
    near(p.frame.toXZ(p.lat, p.lng).x, 3001, 0.01);
  });
});

describe("party members in the open city", () => {
  it("see each other like friends — but only when both list each other", () => {
    const hub = new Hub(() => {});
    const sock = { readyState: 1, bufferedAmount: 0, close() {}, send() {} };
    const a = hub.join(sock, { id: "a", name: "A", avatar: "🙂", level: 5, friends: [], virtual: true }, A);
    const b = hub.join(sock, { id: "b", name: "B", avatar: "🙂", level: 5, friends: [], virtual: true }, A);
    hub.state(a, state(0, 0, { flags: 0 }));
    hub.state(b, state(20, 0, { flags: 0 }));
    // Both still at home: strangers don't see each other.
    assert.equal(hub.world.shows(b, a), false);
    hub.message(a, { t: "party", ids: ["b"] });
    assert.equal(hub.world.shows(b, a), false, "one side claiming isn't enough");
    hub.message(b, { t: "party", ids: ["a"] });
    assert.equal(hub.world.shows(b, a), true);
    assert.equal(hub.world.shows(a, b), true);
    hub.message(b, { t: "party", ids: [] });
    assert.equal(hub.world.shows(b, a), false, "left the party");
  });
});

// ---------------------------------------------------------------- a whole join, in-process
/** /api/arena in a few lines (server/arenaRelay.ts semantics), for one room. */
function fakeServer() {
  type Peer = { userId: string; name: string; avatar: string; level: number; color: string; anchor: { lat: number; lng: number }; trail: unknown; seenAt: number; joinedAt: number };
  const room = { id: "", hostId: "", clock: 0, snap: null as string | null, lat: 0, lng: 0, open: false };
  const peers = new Map<string, Peer>();
  const msgs: { id: number; to: string; from: string; body: unknown }[] = [];
  let nextId = 1;
  let caller = "";
  const handle = (b: Record<string, unknown>) => {
    const now = Date.now();
    switch (b.action) {
      case "open":
        Object.assign(room, { id: b.id, hostId: caller, lat: b.lat, lng: b.lng, open: true });
        peers.set(caller, { userId: caller, name: "Host", avatar: "😎", level: 5, color: "#ff0000", anchor: b.anchor as Peer["anchor"], trail: [], seenAt: now, joinedAt: now });
        return { id: b.id };
      case "join":
        peers.set(caller, { userId: caller, name: "Guest", avatar: "🙂", level: 4, color: "#00ff00", anchor: b.anchor as Peer["anchor"], trail: [], seenAt: now, joinedAt: now });
        return { id: room.id };
      case "leave":
        peers.delete(caller);
        return { ok: true };
      case "host": {
        if (!room.open) return { error: "gone", status: 410 };
        Object.assign(room, { clock: b.clock, snap: b.snap ?? room.snap });
        peers.get(caller)!.trail = b.trail;
        for (const o of b.out as { to: string; body: string[] }[]) msgs.push({ id: nextId++, to: o.to, from: caller, body: o.body });
        for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].to === "" && msgs[i].id <= (b.ack as number)) msgs.splice(i, 1);
        return { now, msgs: msgs.filter((m) => m.to === "" && m.id > (b.ack as number)), peers: [...peers.values()] };
      }
      case "guest": {
        const me = peers.get(caller);
        if (!me) return { error: "gone", status: 410 };
        me.trail = b.trail;
        if ((b.up as unknown[]).length) msgs.push({ id: nextId++, to: "", from: caller, body: b.up });
        for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].to === caller && msgs[i].id <= (b.ack as number)) msgs.splice(i, 1);
        return { now, clock: room.clock, snap: room.snap, origin: { lat: room.lat, lng: room.lng }, msgs: msgs.filter((m) => m.to === caller && m.id > (b.ack as number)), peers: [...peers.values()].filter((p) => p.userId !== caller) };
      }
    }
    return {};
  };
  const fetchStub = (async (_url: string, init: { body: string }) => {
    const r = handle(JSON.parse(init.body)) as { status?: number };
    return { ok: !r.status, status: r.status ?? 200, json: async () => r } as unknown as Response;
  }) as unknown as typeof fetch;
  return { room, peers, as: (who: string) => (caller = who), fetchStub };
}

/** Streets on a grid around A (host's frame), enough for an arena. */
const geo = () => {
  const roads: number[][] = [];
  for (let k = -300; k <= 300; k += 40) (roads.push([-300, k, 300, k]), roads.push([k, -300, k, 300]));
  return { roads, buildings: [] };
};

/** A host's hub with a match on the grid, a relay host for it, and a player 650 m away who joins it. */
async function hosted(server: ReturnType<typeof fakeServer>) {
  const hub = new Hub(() => {});
  const hostSock = { readyState: 1, bufferedAmount: 0, close() {}, send() {} };
  const host = hub.join(hostSock, { id: "host", name: "Host", avatar: "😎", level: 5, friends: [], virtual: true }, A);
  hub.state(host, state(0, 0));
  hub.message(host, { t: "create", mode: "ffa", radius: 120, bots: 0, difficulty: "normal", geo: geo() });
  const match = [...hub.matches.values()][0];
  assert.ok(match, "match made");
  const trails: string[] = [];
  server.as("host");
  const rh = new RelayHost(hub, match.id, host, localFrame(A), { trail: (u) => trails.push(u), ended: () => {}, error: (e) => assert.fail(e) });
  (rh as unknown as { schedule: () => void }).schedule = () => {};
  assert.equal(await rh.open({ party: true, color: "#ff0000", sim: true }), true);
  rh.mine(state(0, 0), Date.now());
  // A party member 650 m away (their own city frame): distance doesn't matter.
  const got: ServerMsg[] = [];
  const world: SnapEntity[][] = [];
  const ended: (string | null)[] = [];
  server.as("guest");
  await relayApi({ action: "join", id: match.id, anchor: B });
  const fb = localFrame(B);
  const guest = new RelayGuest(match.id, fb, { msg: (raw) => got.push(JSON.parse(raw)), world: (_t, list) => world.push(list), trail: (u) => trails.push(`g:${u}`), ended: (why) => ended.push(why), delay: () => 400 });
  (guest as unknown as { schedule: () => void }).schedule = () => {};
  const hostAtB = fb.toXZ(A.lat, A.lng);
  guest.state(state(hostAtB.x + 30, hostAtB.z));
  const pollGuest = () => (server.as("guest"), (guest as unknown as { poll: () => Promise<void> }).poll());
  const pollHost = () => (server.as("host"), (rh as unknown as { poll: () => Promise<void> }).poll());
  await pollGuest(); // my trail is up
  await pollHost(); // the host admits me: welcome, into the match, spawn
  hub.tick(Date.now());
  rh.afterTick(Date.now());
  await pollHost(); // delivers the referee's messages
  await pollGuest();
  return { hub, host, match, rh, guest, got, world, trails, ended, pollGuest, pollHost, me: hub.players.get("guest")! };
}

describe("a match hosted in a browser, joined through the game server", () => {
  const withServer = async (fn: (server: ReturnType<typeof fakeServer>) => Promise<void>) => {
    const server = fakeServer();
    const realFetch = globalThis.fetch;
    globalThis.fetch = server.fetchStub;
    try {
      await fn(server);
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  it("the player is admitted, spawned, moves one hop, and is refereed with a long look-back", () =>
    withServer(async (server) => {
      const { hub, host, match, rh, guest, got, world, trails, ended, pollGuest, pollHost, me } = await hosted(server);
      assert.equal(rh.guestCount, 1);
      assert.equal(me.space, match, "in the match");
      assert.equal(me.rewindMs, RELAY_REWIND_MS);
      const kinds = got.map((m) => m.t);
      assert.ok(kinds.includes("welcome"), kinds.join());
      assert.ok(kinds.includes("spawn"), kinds.join());
      assert.ok(got.some((m) => m.t === "match" && m.m?.id === match.id), "the match view");
      assert.ok(trails.includes("g:host"), "the guest sees the host's own trail");
      assert.ok(world.length > 0, "and the referee's snapshots");

      // The guest moves (where the spawn put them) and says hello; the host's hub hears both, in order.
      const spawn = got.find((m) => m.t === "spawn") as Extract<ServerMsg, { t: "spawn" }>;
      guest.send({ t: "look", color: "#123456" });
      await new Promise((r) => setTimeout(r, TRAIL_GAP_MS + 5));
      guest.state(state(spawn.x + 1, spawn.z));
      await pollGuest();
      await pollHost();
      assert.equal(me.color, "#123456");
      const there = me.frame.toXZ(me.lat, me.lng);
      near(there.x, spawn.x + 1, 0.05);

      // A shot from the player, aimed where they saw the host a second ago (the host has
      // stepped aside since): the referee looks back that far for relayed players.
      match.phase = "live";
      host.shieldUntil = me.shieldUntil = 0;
      const T = Date.now();
      const P1 = { x: 0, z: 0 }, P2 = { x: 4, z: 0 }; // match frame
      const ll1 = match.frame.toLL(P1.x, P1.z), ll2 = match.frame.toLL(P2.x, P2.z);
      host.place(ll1, 0, 0, T - 1300);
      const h1 = host.frame.toXZ(ll1.lat, ll1.lng), h2 = host.frame.toXZ(ll2.lat, ll2.lng);
      hub.state(host, state(h1.x, h1.z, { vx: 0, vz: 0 }), T - 1200);
      hub.state(host, state(h1.x, h1.z, { vx: 0, vz: 0 }), T - 900);
      // (Where the default 350 ms look-back would put them: ~3 m east — a miss.)
      hub.state(host, state(h2.x, h2.z, { vx: 0, vz: 0 }), T - 200);
      me.place(match.frame.toLL(0, 12), 0, 0, T - 1500); // 12 m south of P1
      const at = (q: { lat: number; lng: number }) => me.frame.toXZ(q.lat, q.lng);
      const o = at(me.ll), aim = at(ll1);
      const d = [aim.x - o.x, 1.2 - 1.4, aim.z - o.z];
      const hpBefore = host.hp;
      guest.send({ t: "fire", w: "pistol", at: T - 1000, o: [o.x, 1.4, o.z], d: [d as [number, number, number]] });
      await pollGuest();
      await pollHost();
      assert.ok(host.hp < hpBefore, `hit across a second of look-back (hp ${host.hp})`);
      await pollHost();
      await pollGuest();
      assert.ok(got.some((m) => m.t === "hit" && m.to === host.sid), "the shooter hears the hit");

      // Leaving: the referee sends them back where they were, then lets them go.
      guest.send({ t: "leave" });
      await pollGuest();
      await pollHost();
      await pollHost();
      assert.equal(match.humans.length, 1, "only the host is left in the match");
      await pollGuest();
      assert.ok(got.some((m) => m.t === "match" && m.m === null), "told it's over for them");
      assert.deepEqual(ended, []);
      rh.stop(false);
    }));

  it("when the match is over, the host delivers everyone's way home before closing the room", () =>
    withServer(async (server) => {
      const { hub, match, rh, got, pollGuest, pollHost } = await hosted(server);
      got.length = 0;
      (hub as unknown as { disband: (m: typeof match) => void }).disband(match);
      assert.equal(hub.matches.size, 0);
      await pollHost(); // still open: the goodbyes go out
      assert.equal(server.room.open, true);
      await pollGuest();
      const kinds = got.map((m) => m.t);
      assert.ok(got.some((m) => m.t === "match" && m.m === null), kinds.join());
      assert.ok(kinds.includes("spawn"), "sent back where they were");
      rh.stop(true);
    }));
});
