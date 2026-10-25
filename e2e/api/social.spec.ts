// The social network: posts, follows, likes, comments, reports, profiles and the
// mutual-follow DMs.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, Player, randomSpot, uploadPlaces } from "../helpers";

type Post = { id: string; body: string; kind: string; likes: number; comments: number; liked: boolean; mine: boolean; place: { name: string } | null; author: { id: string } };
type Feed = { posts: Post[]; next: string | null };

test.describe("social", () => {
  test("post, follow, see it in the feed, like once, comment", async ({ baseURL }) => {
    const [a, b] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
    const here = randomSpot();
    await Promise.all([a.goTo(here), b.goTo(here)]);
    const aId = (await a.me()).id;
    expect((await a.post("/api/social", { action: "post", body: "" })).status).toBe(400);
    const { data } = expectOk(await a.post<{ id: string }>("/api/social", { action: "post", body: "Hello street 👋" }));
    expect((await b.post("/api/social", { action: "follow", userId: (await b.me()).id, on: true })).status).toBe(400);
    expectOk(await b.post("/api/social", { action: "follow", userId: aId, on: true }));

    const feed = (await b.get<Feed>("/api/social?tab=following")).data;
    const post = feed.posts.find((p) => p.id === data.id)!;
    expect(post.body).toBe("Hello street 👋");
    expect(post.mine).toBe(false);
    // Nearby works too (posts carry a ~100 m location).
    expect((await b.get<Feed>(`/api/social?tab=nearby&lat=${here.lat}&lng=${here.lng}`)).data.posts.some((p) => p.id === data.id)).toBe(true);

    // A double-tap on ❤️ counts once.
    await Promise.all([b.post("/api/social", { action: "like", postId: data.id, on: true }), b.post("/api/social", { action: "like", postId: data.id, on: true })]);
    let mine = (await a.get<Feed>("/api/social?tab=following")).data.posts.find((p) => p.id === data.id)!;
    expect(mine.likes).toBe(1);
    expectOk(await b.post("/api/social", { action: "comment", postId: data.id, body: "Nice!" }));
    mine = (await a.get<Feed>("/api/social?tab=following")).data.posts.find((p) => p.id === data.id)!;
    expect(mine.comments).toBe(1);
    const comments = (await a.get<{ comments: { body: string }[] }>(`/api/social?view=comments&postId=${data.id}`)).data.comments;
    expect(comments.map((c) => c.body)).toEqual(["Nice!"]);

    // Unlike, profile counts, only the author deletes.
    expectOk(await b.post("/api/social", { action: "like", postId: data.id, on: false }));
    const prof = (await b.get<{ profile: { followers: number; isFollowing: boolean; posts: number } }>(`/api/social?view=profile&id=${aId}`)).data.profile;
    expect(prof).toMatchObject({ followers: 1, isFollowing: true, posts: 1 });
    expect((await b.post("/api/social", { action: "delete", postId: data.id })).status).toBe(403);
    expectOk(await a.post("/api/social", { action: "delete", postId: data.id }));
    await Promise.all([a.dispose(), b.dispose()]);
  });

  test("three reports hide a post", async ({ baseURL }) => {
    const author = await Player.create(baseURL!);
    const { data } = expectOk(await author.post<{ id: string }>("/api/social", { action: "post", body: "spam spam" }));
    const reporters = await Promise.all([1, 2, 3].map(() => Player.create(baseURL!)));
    // The same player reporting twice counts once.
    await reporters[0].post("/api/social", { action: "report", postId: data.id });
    await reporters[0].post("/api/social", { action: "report", postId: data.id });
    expect((await author.get<Feed>("/api/social?tab=following")).data.posts.some((p) => p.id === data.id)).toBe(true);
    for (const r of reporters.slice(1)) await r.post("/api/social", { action: "report", postId: data.id });
    expect((await author.get<Feed>("/api/social?tab=following")).data.posts.some((p) => p.id === data.id)).toBe(false);
    await Promise.all([author.dispose(), ...reporters.map((r) => r.dispose())]);
  });

  test("check-in tags the real place you're at", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const tile = await uploadPlaces(admin, randomSpot(), 4);
    const p = await Player.create(baseURL!);
    await p.goTo(tile.places[1]);
    const r = expectOk(await p.post("/api/social", { action: "post", body: "Best shop", checkin: true }));
    expect(r.data.message).toContain(tile.places[1].name);
    const feed = (await p.get<Feed>("/api/social?tab=following")).data;
    expect(feed.posts[0]).toMatchObject({ kind: "checkin", place: { name: tile.places[1].name } });
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("players who follow each other can message", async ({ baseURL }) => {
    const [a, b] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
    const [aId, bId] = [(await a.me()).id, (await b.me()).id];
    const room = `dm:${[aId, bId].sort().join(":")}`;
    expectOk(await a.post("/api/social", { action: "follow", userId: bId, on: true }));
    expect((await a.post("/api/chat", { room, body: "hi" })).status).toBe(403); // one-way follow
    expectOk(await b.post("/api/social", { action: "follow", userId: aId, on: true }));
    expectOk(await a.post("/api/chat", { room, body: "hi" }));
    await Promise.all([a.dispose(), b.dispose()]);
  });
});
