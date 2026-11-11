// Admin → Car lab (components/AdminCars.tsx): every vehicle as players see it, checked.
// Also the recipe for looking at cars from a script: window.__carLab (pick, set, view, lineup, shot, check, real).
import { expect, test } from "@playwright/test";
import { ADMIN_KEY } from "../../playwright.config";

const octet = () => Math.floor(Math.random() * 250) + 1;

test("the car lab shows the real models with nothing wrong, and takes a screenshot", async ({ page }) => {
  test.setTimeout(180_000);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  await page.request.post("/api/auth/guest");
  await page.request.get(`/admin?key=${ADMIN_KEY}`, { maxRedirects: 0 });
  await page.goto("/admin?tab=cars&car=xantia");
  await expect(page.locator(".carlab-stage canvas")).toBeVisible({ timeout: 90_000 });
  // Every real model arrives (preloaded one by one), then each is checked.
  await expect.poll(() => page.evaluate(() => (window as any).__carLab.keys.filter((k: string) => (window as any).__carLab.check(k) && !(window as any).__carLab.real(k)).length), { timeout: 90_000 }).toBeLessThanOrEqual(
    await page.evaluate(() => (window as any).__carLab.keys.filter((k: string) => (window as any).__carLab.check(k)).length - 8),
  );
  const problems = await page.evaluate(() =>
    (window as any).__carLab.keys
      .filter((k: string) => (window as any).__carLab.real(k))
      .flatMap((k: string) => ((window as any).__carLab.check(k).issues as { code: string }[]).filter((i) => i.code !== "heavy").map((i) => `${k}: ${i.code}`)),
  );
  expect(problems).toEqual([]);
  await expect(page.getByText("✅ Real 3D model")).toBeVisible();
  const png = await page.evaluate(() => (window as any).__carLab.shot() as string);
  expect(png.startsWith("data:image/png;base64,")).toBe(true);
  expect(png.length).toBeGreaterThan(20_000);
});
