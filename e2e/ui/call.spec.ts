// A real video call between two browsers with fake cameras: the WebRTC handshake goes
// through /api/calls polling and the two pages end up streaming to each other.
import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

const octet = () => Math.floor(Math.random() * 250) + 1;

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` } });
  await ctx.grantPermissions(["camera", "microphone", "geolocation"]);
  await ctx.setGeolocation({ latitude: 40 + Math.random(), longitude: -70 - Math.random(), accuracy: 10 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("sq_tour_v2", "1");
    localStorage.setItem("sq_mode_never", "1");
    localStorage.setItem("sq_push_asked", "1");
    const hide = () => document.head?.insertAdjacentHTML("beforeend", "<style>nextjs-portal{display:none!important}</style>");
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play");
  await expect(page.locator(".player-card")).toBeVisible();
  const me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  return { page, errors, id: me.id as string, username: me.username as string };
}

const json = (page: Page, path: string, body: object) =>
  page.evaluate(([p, b]) => fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()), [path, body] as const);

test("crew members can video call each other", async ({ browser }) => {
  const [a, b] = await Promise.all([open(browser), open(browser)]);
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  // A calls B from the Crew panel.
  await a.page.locator("[data-tour=nav-crew]").click();
  await a.page.getByRole("button", { name: `Video call ${b.username}` }).click();
  const aCall = a.page.getByRole("dialog", { name: `Video call with ${b.username}` });
  await expect(aCall).toContainText(/Calling|Connecting/);

  // B's phone rings within a sync poll, and B answers.
  const bCall = b.page.getByRole("dialog", { name: `Video call with ${a.username}` });
  await expect(bCall).toContainText("Incoming video call", { timeout: 15_000 });
  await bCall.getByRole("button", { name: "Answer" }).click();

  // Both sides connect peer-to-peer and receive the other's video.
  for (const d of [aCall, bCall]) await expect(d).toHaveClass(/\blive\b/, { timeout: 30_000 });
  for (const p of [a.page, b.page])
    await expect.poll(() => p.locator("video.call-remote").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);

  // Muting shows on the other side.
  await a.page.getByRole("button", { name: "Mute" }).click();
  await expect(bCall).toContainText("🔇", { timeout: 10_000 });

  // A hangs up; B's screen closes on its own.
  await a.page.getByRole("button", { name: "Hang up" }).click();
  await expect(bCall).toContainText("Call ended", { timeout: 10_000 });
  await expect(bCall).toHaveCount(0, { timeout: 10_000 });
  expect([...a.errors, ...b.errors]).toEqual([]);
});
