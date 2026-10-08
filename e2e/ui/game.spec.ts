// The game in a real (phone-sized) Chrome: first visit, GPS, panels, and the
// double-tap protection on buttons.
import { expect, test as base, type Page } from "@playwright/test";
import { randomSpot } from "../helpers";

/** Every test fails on an uncaught error in the page, even if the UI looks fine. */
const test = base.extend<{ crashes: string[] }>({
  crashes: [
    async ({ page }, use) => {
      const crashes: string[] = [];
      page.on("pageerror", (e) => crashes.push(e.message));
      // Next's dev-tools badge sits on top of the bottom nav at phone width (dev only).
      await page.addInitScript(() => {
        const hide = () => document.head?.insertAdjacentHTML("beforeend", "<style>nextjs-portal{display:none!important}</style>");
        if (document.head) hide();
        else document.addEventListener("DOMContentLoaded", hide);
      });
      await use(crashes);
      expect(crashes, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

const octet = () => Math.floor(Math.random() * 250) + 1;

/** Skip the first-run tour and the "walking or from home?" prompt; one network per test. */
async function returningPlayer(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  await page.addInitScript(() => {
    localStorage.setItem("sq_tour_v2", "1");
    localStorage.setItem("sq_mode_never", "1");
    localStorage.setItem("sq_push_asked", "1");
  });
}

async function withGps(page: Page) {
  const spot = randomSpot();
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: spot.lat, longitude: spot.lng, accuracy: 10 });
  return spot;
}

test.describe("first visit", () => {
  test("landing → Play starts a guest game with no sign-up", async ({ page }) => {
    await returningPlayer(page);
    await withGps(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("game map");
    await page.getByRole("link", { name: /Play now — no sign-up/ }).click();
    await expect(page).toHaveURL(/\/play/);
    // HUD: callsign, coins and the bottom nav.
    await expect(page.locator(".player-card")).toBeVisible();
    await expect(page.locator(".hud-right .chip").first()).toContainText("🪙");
    await expect(page.locator("nav.nav")).toBeVisible();
    // A real map, not the location gate.
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator("#gate-title")).toHaveCount(0);
  });

  test("location blocked → clear help and a way to play anyway", async ({ page }) => {
    await returningPlayer(page);
    await page.context().clearPermissions();
    await page.goto("/play");
    await expect(page.locator("#gate-title")).toBeVisible();
    // Dev servers allow test mode for everyone; production shows Play from home instead.
    const testMode = page.getByRole("button", { name: /Test mode — no GPS/ });
    await expect(testMode).toBeVisible();
    await testMode.click();
    await expect(page.locator("#gate-title")).toHaveCount(0);
    await expect(page.locator(".hud-right").getByText("TEST", { exact: true })).toBeVisible();
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });
});

test.describe("in the game", () => {
  test.beforeEach(async ({ page }) => {
    await returningPlayer(page);
    await withGps(page);
    await page.goto("/play");
    await expect(page.locator(".player-card")).toBeVisible();
  });

  test("bottom nav opens and closes every panel", async ({ page }) => {
    for (const [label, title] of [
      ["Nearby", /nearby/i],
      ["Base", /base|faction/i],
      ["Play", /play|game/i],
      ["Hero", /.+/],
    ] as const) {
      await page.locator("nav.nav").getByRole("button", { name: new RegExp(label) }).click();
      const sheet = page.locator(".sheet[role=dialog]");
      await expect(sheet).toBeVisible();
      await expect(sheet.locator("h2").first()).toHaveText(title);
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).toHaveCount(0);
    }
  });

  test("daily reward: a frantic double-tap pays exactly once", async ({ page }) => {
    const gift = page.locator(".fab", { hasText: "🎁" });
    await expect(gift).toBeVisible();
    const replies: number[] = [];
    page.on("response", (r) => r.url().endsWith("/api/daily") && replies.push(r.status()));
    await gift.dblclick();
    await expect(page.locator(".toast.reward").filter({ hasText: /streak/i })).toBeVisible();
    await expect(gift).toHaveCount(0);
    expect(replies.filter((s) => s === 200)).toHaveLength(1);
    await expect(page.locator(".toast.error")).toHaveCount(0);
  });

  test("store: buying coins with gems updates the wallet; heal is off at full health", async ({ page }) => {
    await page.locator(".gem-chip").click();
    const store = page.locator(".sheet[role=dialog]");
    await expect(store.locator("h2").first()).toContainText("Store");
    await expect(store.getByRole("button", { name: /Instant heal/ })).toBeDisabled();
    // Starting gems (25) cover the 10-gem Coin Pouch.
    const coins = page.locator(".hud-right .chip").first();
    const before = Number((await coins.innerText()).replace(/\D/g, ""));
    await store.getByRole("button", { name: /Coin Pouch/ }).click();
    await expect(page.locator(".toast.reward").filter({ hasText: /coins/ })).toBeVisible();
    await expect.poll(async () => Number((await coins.innerText()).replace(/\D/g, ""))).toBe(before + 500);
    await expect(page.locator(".gem-chip")).toContainText("15");
  });

  test("the marker follows the GPS as the player walks", async ({ page }) => {
    const reports: { lat: number; lng: number }[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/loc") && r.method() === "POST") reports.push(JSON.parse(r.postData() ?? "{}"));
    });
    const here = randomSpot();
    // Jump somewhere new (the filter re-anchors after a few consistent fixes), then walk.
    for (let i = 0; i < 6; i++) {
      await page.context().setGeolocation({ latitude: here.lat + i * 0.0002, longitude: here.lng, accuracy: 8 });
      await page.waitForTimeout(1200);
    }
    await expect.poll(() => reports.some((r) => Math.abs(r.lat - (here.lat + 0.001)) < 0.0005 && Math.abs(r.lng - here.lng) < 0.001), { timeout: 30_000 }).toBe(true);
  });
});

test.describe("pages", () => {
  test("offline page renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.locator("body")).toContainText(/offline/i);
  });
});
