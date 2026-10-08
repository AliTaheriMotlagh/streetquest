// End-to-end tests: `npm run test:e2e` (starts its own dev server on a separate
// database, so it never touches your dev data). See "End-to-end tests" in README.md.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/streetquest_e2e";
export const ADMIN_KEY = "e2e-admin-key";

export default defineConfig({
  testDir: "./e2e",
  // The dev server compiles each route on first hit; give the first calls room.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Server behaviour: money, races, anti-cheat, auth. Fast, no browser.
    { name: "api", testMatch: /api\/.*\.spec\.ts/ },
    // Real browser flows on a phone-sized screen. Uses the installed Google Chrome
    // (PW_CHANNEL=chromium to use Playwright's own build instead).
    {
      name: "mobile",
      testMatch: /ui\/.*\.spec\.ts/,
      use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Schema first (the health check below needs the tables), then the app.
        command: `node e2e/prepare-db.mjs && npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}/api/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: E2E_DB,
          DATABASE_URL_UNPOOLED: E2E_DB,
          NEXT_DIST_DIR: ".next-e2e",
          AUTH_SECRET: "e2e-secret-not-for-production",
          ADMIN_KEY,
          NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
          // Real timers: tests rely on construction taking minutes, not milliseconds.
          GAME_SPEED: "1",
          // No real push notifications or payments from tests.
          VAPID_PUBLIC_KEY: "",
          VAPID_PRIVATE_KEY: "",
          STRIPE_SECRET_KEY: "",
        },
      },
});
