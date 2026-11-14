import { expect, test } from "@playwright/test";
import { expectOk, Player } from "../helpers";

// One way to become friends: a request arrives as a tagged notification (the game shows it as
// a card with Accept / Decline — lib/asks.ts), and answering it anywhere clears it everywhere.
type Friends = { friends: { friendshipId: string; username: string }[]; incoming: { friendshipId: string; username: string }[]; outgoing: { friendshipId: string; username: string }[] };
type Inbox = { items: { tag: string | null; title: string }[] };

test.describe("friend requests", () => {
  test("a request is a tagged card for the other player; Accept makes both friends", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    expectOk(await a.post("/api/friends", { action: "request", username: b.username }));
    const inc = expectOk(await b.get<Friends>("/api/friends")).data.incoming;
    expect(inc).toEqual([expect.objectContaining({ username: a.username })]);
    // The notification carries the request's id, so the card answers it without a lookup.
    const inbox = expectOk(await b.get<Inbox>("/api/notifications")).data.items;
    expect(inbox.some((n) => n.tag === `friendreq:${inc[0].friendshipId}`)).toBe(true);
    expect(expectOk(await a.get<Friends>("/api/friends")).data.outgoing.map((f) => f.username)).toEqual([b.username]);

    // Only the one asked can accept.
    expect((await a.post("/api/friends", { action: "accept", friendshipId: inc[0].friendshipId })).status).toBe(400);
    expectOk(await b.post("/api/friends", { action: "accept", friendshipId: inc[0].friendshipId }));
    for (const [p, other] of [[a, b], [b, a]] as const) {
      const f = expectOk(await p.get<Friends>("/api/friends")).data;
      expect(f.friends.map((x) => x.username)).toEqual([other.username]);
      expect(f.incoming).toEqual([]);
      expect(f.outgoing).toEqual([]);
    }
    // Answered: a second tap on a stale card is refused, not a second friendship.
    expect((await a.post("/api/friends", { action: "request", username: b.username })).status).toBe(400);
    await a.dispose();
    await b.dispose();
  });

  test("Decline clears the request for both; asking back accepts at once", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    expectOk(await a.post("/api/friends", { action: "request", username: b.username }));
    const id = expectOk(await b.get<Friends>("/api/friends")).data.incoming[0].friendshipId;
    expectOk(await b.post("/api/friends", { action: "decline", friendshipId: id }));
    expect(expectOk(await a.get<Friends>("/api/friends")).data.outgoing).toEqual([]);
    expect(expectOk(await b.get<Friends>("/api/friends")).data.incoming).toEqual([]);
    // The card for it is gone on the server: answering it again is a 404 (the card then drops itself).
    expect((await b.post("/api/friends", { action: "accept", friendshipId: id })).status).toBe(404);

    // A asks again, and B asks A back instead of tapping Accept: that's a yes.
    expectOk(await a.post("/api/friends", { action: "request", username: b.username }));
    expectOk(await b.post("/api/friends", { action: "request", username: a.username }));
    expect(expectOk(await a.get<Friends>("/api/friends")).data.friends.map((x) => x.username)).toEqual([b.username]);
    await a.dispose();
    await b.dispose();
  });
});
