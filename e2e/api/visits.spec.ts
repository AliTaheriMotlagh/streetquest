// The home page's visit counter (server/visits.ts): a visit counts once per network per
// half hour, and the page shows the total and today's.
import { expect, request, test } from "@playwright/test";

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
