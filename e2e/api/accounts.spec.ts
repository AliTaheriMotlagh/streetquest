// Guest accounts, profile, admin access, bans and referrals.
import { expect, test } from "@playwright/test";
import { adminPlayer, Player } from "../helpers";

test.describe("accounts", () => {
  test("no session → 401; a guest account is created once and reused", async ({ request, baseURL }) => {
    expect((await request.get("/api/me")).status()).toBe(401);
    const p = await Player.create(baseURL!);
    const me = await p.me();
    expect(me.username).toBe(p.username);
    expect(me.coins).toBeGreaterThan(0);
    // Calling guest again with a session is a no-op, not a second account.
    const again = await p.post("/api/auth/guest");
    expect(again.data).toMatchObject({ ok: true, username: p.username });
    await p.dispose();
  });

  test("rename callsign: validated, unique", async ({ baseURL }) => {
    const a = await Player.create(baseURL!);
    const b = await Player.create(baseURL!);
    const name = `cmdr${Date.now() % 1_000_000}`;
    expect((await a.post("/api/me", { username: name }, "PATCH")).status).toBe(200);
    expect((await a.me()).username).toBe(name);
    expect((await b.post("/api/me", { username: name }, "PATCH")).status).toBe(409);
    expect((await b.post("/api/me", { username: "x" }, "PATCH")).status).toBe(400);
    expect((await b.post("/api/me", { username: "bad name!" }, "PATCH")).status).toBe(400);
    await Promise.all([a.dispose(), b.dispose()]);
  });

  test("players can't reach admin APIs; the admin key promotes once", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    expect((await p.get("/api/admin")).status).toBe(403);
    expect((await p.post("/api/admin", { action: "grant", userId: "x", coins: 1, xp: 0 })).status).toBe(403);
    // A wrong key (including a non-ASCII one) just bounces to the game.
    const wrong = await p.ctx.get(`/admin?key=${encodeURIComponent("wrong-key-ü")}`, { maxRedirects: 0 });
    expect([307, 308]).toContain(wrong.status());
    expect((await p.me()).role).toBe("PLAYER");

    const admin = await adminPlayer(baseURL!);
    expect((await admin.get("/api/admin")).status).toBe(200);
    await Promise.all([p.dispose(), admin.dispose()]);
  });

  test("a banned player is locked out and can't mint a fresh guest", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const p = await Player.create(baseURL!);
    const { id } = await p.me();
    expect((await admin.post("/api/admin", { action: "ban", userId: id, banned: true })).status).toBe(200);
    expect((await p.get("/api/me")).status).toBe(401);
    const again = await p.post("/api/auth/guest");
    expect(again.status).toBe(403);
    expect(again.data.error).toMatch(/banned/i);
    await Promise.all([p.dispose(), admin.dispose()]);
  });

  test("announcement links must be web links", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const bad = await admin.post("/api/admin", { action: "createAnnouncement", title: "x", body: "y", ctaUrl: "javascript:alert(1)" });
    expect(bad.status).toBe(400);
    const title = `e2e-${Date.now()}`;
    const ok = await admin.post("/api/admin", { action: "createAnnouncement", title, body: "y", ctaUrl: "/play", ctaLabel: "Go" });
    expect(ok.status).toBe(200);
    // Clean up so it doesn't cover the screen in the browser tests.
    const list = (await admin.get<{ announcements: { id: string; title: string }[] }>("/api/admin")).data.announcements;
    const mine = list.find((a) => a.title === title)!;
    expect((await admin.post("/api/admin", { action: "deleteAnnouncement", id: mine.id })).status).toBe(200);
    await admin.dispose();
  });

  test("referral pays both sides, capped at 10 a day", async ({ baseURL }) => {
    const ref = await Player.create(baseURL!);
    const code = (await ref.get<{ referralCode: string }>("/api/me")).data.referralCode;
    const before = (await ref.me()).coins;
    const plain = await Player.create(baseURL!);
    const base = (await plain.me()).coins;
    const friends: Player[] = [];
    for (let i = 0; i < 11; i++) friends.push(await Player.create(baseURL!, { cookies: { sq_ref: code } }));
    const coins = await Promise.all(friends.map(async (f) => (await f.me()).coins));
    const bonus = coins[0] - base;
    expect(bonus).toBeGreaterThan(0);
    expect(coins.slice(0, 10).every((c) => c === base + bonus)).toBe(true);
    // The 11th sign-up today is still welcome, but nobody is paid for it.
    expect(coins[10]).toBe(base);
    expect((await ref.me()).coins - before).toBe(10 * bonus);
    await Promise.all([ref, plain, ...friends].map((p) => p.dispose()));
  });
});
