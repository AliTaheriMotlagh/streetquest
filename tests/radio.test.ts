import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveStations, radioVolume, remixtEmbed, remixtState, remixtStation, stationAfter, STATIONS } from "@/lib/radio";

describe("car radio", () => {
  it("cycles off → each station → off", () => {
    const live = [{ id: "a" }, { id: "b" }];
    assert.equal(stationAfter(null, live), "a");
    assert.equal(stationAfter("a", live), "b");
    assert.equal(stationAfter("b", live), null);
    assert.equal(stationAfter("gone", live), "a");
    assert.equal(stationAfter(null, []), null);
  });
  it("keeps only our stations with https streams, in our order and names", () => {
    const [p, w] = [STATIONS[0], STATIONS[3]];
    const rows = [
      { stationuuid: w.id, name: "whatever", url_resolved: "https://w.example/stream" },
      { stationuuid: p.id, url_resolved: "http://insecure.example/s", url: "https://p.example/s" },
      { stationuuid: "not-ours", url_resolved: "https://x.example" },
      { stationuuid: STATIONS[1].id, url_resolved: "https://dead.example", lastcheckok: 0 },
    ];
    const live = liveStations(rows);
    assert.deepEqual(live.map((s) => s.id), [p.id, w.id]);
    assert.equal(live[0].url, "https://p.example/s");
    assert.equal(live[1].name, w.name);
    assert.deepEqual(liveStations("nope"), []);
  });
  it("plays under the game, follows the mixer, silent when muted", () => {
    assert.equal(radioVolume({ master: 1, radio: 1 }, true), 0);
    assert.ok(radioVolume({ master: 1, radio: 1 }, false) <= 0.7);
    assert.ok(radioVolume({ master: 1, radio: 0.5 }, false) < radioVolume({ master: 1, radio: 1 }, false));
  });
  it("is music only: Persian and international", () => {
    assert.ok(STATIONS.some((s) => s.group === "persian") && STATIONS.some((s) => s.group === "world"));
    for (const s of STATIONS) assert.match(s.id, /^[0-9a-f-]{36}$/);
  });
});

describe("the stations' stream addresses", () => {
  it("asks the directory once for all our stations, falls back to the next mirror, and keeps the answer", async () => {
    const { radioStations, resetRadio } = await import("@/server/radio");
    resetRadio();
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      if (asked.length === 1) return new Response("busy", { status: 503 });
      return Response.json([{ stationuuid: STATIONS[0].id, url_resolved: "https://p.example/s" }]);
    }) as unknown as typeof fetch;
    const list = await radioStations(fake, 1000);
    assert.deepEqual(list.map((s) => s.id), ["remixt", STATIONS[0].id], "Remixt Radio first, without a lookup");
    assert.equal(asked.length, 2, "second mirror after the first failed");
    assert.ok(asked[1].includes(STATIONS[5].id), "every station in one request");
    await radioStations(fake, 2000);
    assert.equal(asked.length, 2, "cached");
  });
});

describe("Remixt Radio", () => {
  it("plays through the station's embed for games, https and a /radio/<slug> page only", () => {
    assert.deepEqual(remixtEmbed("https://remixt-free.vercel.app/radio/remixt-radio"), { url: "https://remixt-free.vercel.app/radio/remixt-radio/embed?autoplay=1", origin: "https://remixt-free.vercel.app" });
    assert.equal(remixtEmbed("http://remixt-free.vercel.app/radio/remixt-radio"), null);
    assert.equal(remixtEmbed("https://evil.example/radio/x/../../steal"), null);
    assert.equal(remixtEmbed("https://a:b@remixt.example/radio/x"), null);
    assert.equal(remixtEmbed("javascript:alert(1)"), null);
    assert.equal(remixtEmbed(""), null);
    const st = remixtStation()!;
    assert.equal(st.id, "remixt");
    assert.equal(st.embed, true);
    assert.equal(remixtStation(""), null, "an empty address switches it off");
  });
  it("reads only well-formed state messages from the embed", () => {
    assert.deepEqual(remixtState({ type: "remixt-radio:state", playing: true, now: { title: "  Club   Groove ", artist: "Minh Vo" } }), { playing: true, title: "Club Groove", artist: "Minh Vo" });
    assert.deepEqual(remixtState({ type: "remixt-radio:state", playing: false, now: null }), { playing: false, title: "", artist: "" });
    assert.equal(remixtState({ type: "remixt-radio:state", playing: "yes" }), null);
    assert.equal(remixtState({ type: "other", playing: true }), null);
    assert.equal(remixtState("remixt-radio:state"), null);
    assert.equal(remixtState(null), null);
    // The 2026-11 embed also tells the song after and the listener count (cover/station/timing are ignored).
    const full = { type: "remixt-radio:state", playing: true, station: { slug: "remixt-radio", name: "Remixt Radio" }, now: { title: "A", artist: "B", cover: "https://x/c.jpg", startedAt: 1, endsAt: 2 }, next: { title: " Up   Next ", artist: "C", startsAt: 2 }, listeners: 12.7 };
    assert.deepEqual(remixtState(full), { playing: true, title: "A", artist: "B", next: "Up Next", listeners: 12 });
    assert.deepEqual(remixtState({ ...full, next: null, listeners: -3 }), { playing: true, title: "A", artist: "B" });
    assert.equal(remixtState({ ...full, listeners: "many" })!.listeners, undefined);
    assert.equal(remixtState({ type: "remixt-radio:state", playing: true, now: { title: "x".repeat(500) } })!.title.length, 120);
  });
});
