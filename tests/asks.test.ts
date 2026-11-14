import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askOfTag, asksFrom, friendTag, MAX_ASKS, mergeAsks, partyTag } from "@/lib/asks";

describe("requests answered in place", () => {
  it("reads the server's tags, and nothing else", () => {
    assert.deepEqual(askOfTag(friendTag("ck1")), { kind: "friend", key: "friendreq:ck1", friendshipId: "ck1", name: "", avatar: "" });
    assert.equal((askOfTag(partyTag("ab12cd")) as { code: string }).code, "AB12CD");
    for (const x of ["levelup", "incoming", null, "friendreq:", "partyinv:a b"]) assert.equal(askOfTag(x), null);
  });
  it("queues each request once, keeps answered ones away, caps the queue", () => {
    const open = asksFrom([{ friendshipId: "f1", username: "Mina", avatar: "🦊" }], [{ code: "ABC123", host: "Reza", players: 3 }]);
    const a = mergeAsks([askOfTag(friendTag("f1"))!], open, new Set());
    assert.equal(a.length, 2);
    assert.equal(a[0].name, "Mina");
    assert.deepEqual(mergeAsks([], open, new Set([partyTag("ABC123")])).map((x) => x.key), ["friendreq:f1"]);
    const many = asksFrom(Array.from({ length: 6 }, (_, i) => ({ friendshipId: `f${i}`, username: `u${i}`, avatar: "" })), []);
    assert.equal(mergeAsks([], many, new Set()).length, MAX_ASKS);
  });
});
