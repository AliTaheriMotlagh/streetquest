import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveStations, radioVolume, stationAfter, STATIONS } from "@/lib/radio";

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
    assert.equal(list.length, 1);
    assert.equal(asked.length, 2, "second mirror after the first failed");
    assert.ok(asked[1].includes(STATIONS[5].id), "every station in one request");
    await radioStations(fake, 2000);
    assert.equal(asked.length, 2, "cached");
  });
});
