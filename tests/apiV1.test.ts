import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { API_PATHS, envelope, hashKey, keyHint, keyOf, newKey, openApi, sourcesFor, take, type Window } from "@/lib/apiV1";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("the public data API", () => {
  it("keys: shown once, stored as a hash, read from the headers only", () => {
    const k = newKey(Buffer.alloc(24, 7));
    assert.match(k, /^sq_live_[A-Za-z0-9_-]{32}$/);
    assert.equal(hashKey(k).length, 64);
    assert.notEqual(hashKey(k), k);
    assert.equal(keyHint(k), k.slice(0, 12));
    assert.equal(keyOf(headers({ authorization: `Bearer ${k}` })), k);
    assert.equal(keyOf(headers({ "x-api-key": k })), k);
    assert.equal(keyOf(headers({ authorization: "Bearer nope" })), null);
    assert.equal(keyOf(headers({})), null);
  });
  it("a fixed minute per key: the limit, then 429 until it resets", () => {
    const w = new Map<string, Window>();
    for (let i = 0; i < 3; i++) assert.equal(take(w, "k", 3, 1000 + i).ok, true);
    const over = take(w, "k", 3, 2000);
    assert.equal(over.ok, false);
    assert.equal(over.remaining, 0);
    assert.ok(over.resetS > 0 && over.resetS <= 60);
    assert.equal(take(w, "k", 3, 61_001).ok, true);
    assert.equal(take(w, "other", 3, 2000).ok, true);
  });
  it("every answer names its sources with their licences; the document lists every path", () => {
    const e = envelope([1], sourcesFor("osm", "iett", "nope"));
    assert.deepEqual(e.meta.sources.map((s) => s.id), ["osm", "iett"]);
    assert.ok(e.meta.sources.every((s) => s.licence.length > 10));
    const doc = openApi("https://x.test") as { paths: Record<string, unknown>; servers: { url: string }[] };
    assert.deepEqual(Object.keys(doc.paths).sort(), [...API_PATHS].sort());
    assert.equal(doc.servers[0].url, "https://x.test/api/v1");
  });
});
