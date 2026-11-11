// Site visit analytics (server/visits.ts): a visit counts once per network per half hour, the
// home page shows the count, and admins get per-day visits / unique visitors / players / new users.
import { expect, request, test } from "@playwright/test";
import { adminPlayer, expectOk, Player } from "../helpers";

const octet = () => Math.floor(Math.random() * 250) + 1;
type Visits = { total: number; today: number; counted?: boolean };

test("a visit counts once per network, and the home page shows the count", async ({ baseURL }) => {
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` } });
  const before = (await (await ctx.get("/api/visits")).json()) as Visits;
  const first = (await (await ctx.post("/api/visits")).json()) as Visits;
  expect(first.counted).toBe(true);
  expect(first.total).toBeGreaterThanOrEqual(before.total + 1);
  expect(first.today).toBeGreaterThanOrEqual(1);
  // Reloading doesn't run it up.
  const again = (await (await ctx.post("/api/visits")).json()) as Visits;
  expect(again.counted).toBe(false);
  const html = await (await ctx.get("/")).text();
  expect(html).toContain("lp-visits");
  await ctx.dispose();
});

type Day = { day: string; visits: number; home: number; play: number; visitors: number; players: number; newUsers: number };
type Admin = { days: number; series: Day[]; today: Day; week: { total: { visits: number } }; month: { avg: { visits: number } } };

test("admin sees per-day visits and unique visitors; others can't", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const base = expectOk(await admin.get<Admin>("/api/admin/visits?days=30")).data.today;
  // An anonymous browser (cookie jar kept) opens the game once.
  const anon = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` } });
  await anon.post("/api/visits", { data: { path: "play" } });
  await anon.dispose();
  const player = await Player.create(baseURL!);
  await player.post("/api/visits", { path: "/play" });
  const after = expectOk(await admin.get<Admin>("/api/admin/visits?days=90")).data;
  expect(after.series).toHaveLength(90);
  expect(after.today.play).toBeGreaterThanOrEqual(base.play + 2);
  expect(after.today.visitors).toBeGreaterThanOrEqual(base.visitors + 2);
  expect(after.today.players).toBeGreaterThanOrEqual(base.players + 1);
  expect(after.today.newUsers).toBeGreaterThanOrEqual(base.newUsers + 1);
  // The same signed-in player again is not another unique.
  await player.post("/api/visits", { path: "/play" });
  expect(expectOk(await admin.get<Admin>("/api/admin/visits?days=90")).data.today.players).toBe(after.today.players);
  // Not for players.
  expect((await player.get("/api/admin/visits")).status).toBe(403);
});
