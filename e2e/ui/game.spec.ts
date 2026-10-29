// The game in a real (phone-sized) Chrome: first visit, GPS, panels, and the
// double-tap protection on buttons.
import { expect, test as base, type Page } from "@playwright/test";
import { Player, randomSpot, type LatLng } from "../helpers";

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
    // HUD: callsign, the toman wallet first, coins, and the bottom nav.
    await expect(page.locator(".player-card")).toBeVisible();
    await expect(page.locator(".hud-right .chip").first()).toContainText("💵");
    await expect(page.locator(".hud-right .coin-chip")).toContainText("🪙");
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
      ["Wallet", /wallet/i],
      ["Play", /play|game/i],
      ["Profile", /profile/i],
    ] as const) {
      await page.locator("nav.nav").getByRole("button", { name: new RegExp(label) }).click();
      const sheet = page.locator(".sheet[role=dialog]");
      await expect(sheet).toBeVisible();
      await expect(sheet.locator("h2").first()).toHaveText(title);
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).toHaveCount(0);
    }
  });

  test("panels fit the phone on every tab, and a swipe down closes them", async ({ page, context }) => {
    const sheet = page.locator(".sheet[role=dialog]");
    // Content wider than the panel let it slide sideways; a tab tap could knock it upward.
    for (const label of ["Play", "Profile", "Market", "Wallet"]) {
      await page.locator("nav.nav").getByRole("button", { name: new RegExp(label) }).click();
      await expect(sheet).toBeVisible();
      const tabs = sheet.locator(".tabs button");
      for (let i = 0; i < (await tabs.count()); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(400);
        const m = await sheet.evaluate((s) => {
          const b = s.querySelector(".sheet-body")!;
          return { wide: b.scrollWidth - b.clientWidth, bottom: Math.round(s.getBoundingClientRect().bottom), vh: innerHeight };
        });
        expect(m.wide, `${label} tab ${i} is wider than the panel`).toBeLessThanOrEqual(1);
        expect(m.bottom, `${label} tab ${i} moved off the bottom`).toBe(m.vh);
      }
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).toHaveCount(0);
    }
    // Drag the header down and let go.
    await page.locator("nav.nav").getByRole("button", { name: /Nearby/ }).click();
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const top = (await sheet.boundingBox())!.y;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: top + 30 }] });
    for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: top + 30 + i * 25 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(sheet).toHaveCount(0);
  });

  test("daily reward: a frantic double-tap pays exactly once", async ({ page }) => {
    // The daily drop waits in the Ready tray under the profile card.
    await page.locator(".ready-tray.has-items").click();
    const gift = page.locator(".rl-item", { hasText: "Daily reward" });
    await expect(gift).toBeVisible();
    const replies: number[] = [];
    page.on("response", (r) => r.url().endsWith("/api/daily") && replies.push(r.status()));
    await gift.dblclick();
    await expect(page.locator(".cel-card")).toBeVisible();
    await expect(gift).toHaveCount(0);
    expect(replies.filter((s) => s === 200)).toHaveLength(1);
    await expect(page.locator(".toast.error")).toHaveCount(0);
  });

  test("store: buying coins with gems updates the wallet", async ({ page }) => {
    await page.locator(".gem-chip").click();
    const store = page.locator(".sheet[role=dialog]");
    await expect(store.locator("h2").first()).toContainText("Store");
    // Starting gems (25) cover the 10-gem Coin Pouch.
    const coins = page.locator(".hud-right .coin-chip");
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

test.describe("map on a phone", () => {
  test("the game layer shows money and store jobs — at most 14 of them", async ({ page }) => {
    await returningPlayer(page);
    await withGps(page);
    await page.goto("/play");
    // Jobs, not the plain place / vendor / Divar signs that share the .place look.
    const items = page.locator(".leaflet-marker-icon .mk.money, .leaflet-marker-icon .mk.place:not(.spot):not(.vendor):not(.divar), .leaflet-marker-icon .mk.biz");
    await expect.poll(() => page.locator(".leaflet-marker-icon .mk.money").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await items.count()).toBeLessThanOrEqual(14);
    // None of the old war-game layers.
    await expect(page.locator(".mk.base, .mk.tower, .mk.boss, .mk.outpost, .mk.flag, .mk.item, .mk.chest")).toHaveCount(0);
    // Tap one: its card shows the amount in toman.
    await page.locator(".leaflet-marker-icon .mk.money").first().click();
    await expect(page.locator(".sheet[role=dialog]")).toContainText(/toman/);
  });

  test("map style: every look is in the picker, and the choice switches tiles and sticks", async ({ page }) => {
    await returningPlayer(page);
    await withGps(page);
    await page.goto("/play");
    await expect(page.locator(".map.fantasy")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /Map style/ }).click();
    const looks = page.locator(".more-menu.styles [role=menuitemradio]");
    await expect(looks).toHaveCount(17);
    await expect(looks.filter({ hasText: "Fantasy" })).toHaveAttribute("aria-checked", "true");
    // Satellite + names: Esri photos with a second layer of place names on top.
    await looks.filter({ hasText: "Satellite + names" }).click();
    await expect(page.locator(".map.photo .leaflet-tile[src*='World_Imagery']").first()).toBeAttached();
    await expect(page.locator(".map .labels .leaflet-tile[src*='World_Boundaries_and_Places']").first()).toBeAttached();
    await expect(page.locator(".fantasy-fx")).toHaveCount(0);
    // Terrain swaps the provider; Blueprint is the street tiles under a filter.
    await looks.filter({ hasText: "Terrain" }).click();
    await expect(page.locator(".map .leaflet-tile[src*='opentopomap.org']").first()).toBeAttached();
    await expect(page.locator(".map .labels")).toHaveCount(0);
    await looks.filter({ hasText: "Blueprint" }).click();
    await expect(page.locator(".map.blueprint")).toBeVisible();
    // Remembered after a reload.
    await page.reload();
    await expect(page.locator(".map.blueprint")).toBeVisible({ timeout: 30_000 });
  });

  test("map style: a provider that won't load (blocked in the country) says so instead of a black map", async ({ page }) => {
    await returningPlayer(page);
    await withGps(page);
    await page.route(/server\.arcgisonline\.com/, (r) => r.fulfill({ status: 403, body: "blocked from your country" }));
    await page.addInitScript(() => localStorage.setItem("sq_map_look", "satellite"));
    await page.goto("/play");
    await expect(page.getByText(/Satellite map can't load on this connection/)).toBeVisible({ timeout: 30_000 });
  });

  test("offline page renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.locator("body")).toContainText(/offline/i);
  });
});
