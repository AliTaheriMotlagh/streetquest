// A real video call between two browsers with fake cameras: the WebRTC handshake goes
// through /api/calls polling and the two pages end up streaming to each other.
import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });
// Each test drives two browsers that poll the dev server every second: run them one at a time.
test.describe.configure({ mode: "default" });

const octet = () => Math.floor(Math.random() * 250) + 1;

async function open(browser: Browser, opts: { blockCamera?: boolean; noRoute?: boolean } = {}) {
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
  // Simulate a camera the browser has blocked (Chrome stops asking after a few denials).
  if (opts.blockCamera)
    await page.addInitScript(() => {
      const w = window as unknown as { __blockCam: boolean };
      w.__blockCam = true;
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => (w.__blockCam ? Promise.reject(new DOMException("Permission denied", "NotAllowedError")) : real(c));
    });
  // Simulate a network where the phones can never reach each other: no ICE candidates get through.
  if (opts.noRoute)
    await page.addInitScript(() => {
      RTCPeerConnection.prototype.addIceCandidate = () => Promise.resolve();
    });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play");
  await expect(page.locator(".player-card")).toBeVisible({ timeout: 60_000 }); // dev server may still be compiling
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
  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
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

test("crew members can voice call each other: sound only, no cameras", async ({ browser }) => {
  const [a, b] = await Promise.all([open(browser), open(browser)]);
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
  await a.page.getByRole("button", { name: `Voice call ${b.username}` }).click();
  const aCall = a.page.getByRole("dialog", { name: `Voice call with ${b.username}` });
  const bCall = b.page.getByRole("dialog", { name: `Voice call with ${a.username}` });
  await expect(bCall).toContainText("Incoming voice call", { timeout: 15_000 });
  await bCall.getByRole("button", { name: "Answer" }).click();

  for (const d of [aCall, bCall]) await expect(d).toHaveClass(/\blive\b/, { timeout: 30_000 });
  for (const p of [a.page, b.page]) {
    // Audio flows, no video is sent, and there's no camera button.
    await expect.poll(() => p.locator("video.call-remote").evaluate((v: HTMLVideoElement) => (v.srcObject as MediaStream | null)?.getAudioTracks().length ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await p.locator("video.call-remote").evaluate((v: HTMLVideoElement) => (v.srcObject as MediaStream).getVideoTracks().length)).toBe(0);
    await expect(p.getByRole("button", { name: "Camera off" })).toHaveCount(0);
  }

  await a.page.getByRole("button", { name: "Hang up" }).click();
  await expect(bCall).toContainText("Call ended", { timeout: 10_000 });
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test("mobile data drops requests: every lost handshake message is resent and the call still connects", async ({ browser }) => {
  const [a, b] = await Promise.all([open(browser), open(browser)]);
  // The first try of every offer / answer / ICE batch fails, as a weak LTE link does.
  for (const p of [a.page, b.page]) {
    const tried = new Set<string>();
    await p.route("**/api/calls", (r) => {
      const body = r.request().postData() ?? "";
      if (r.request().method() === "POST" && body.includes('"action":"signal"') && !tried.has(body)) {
        tried.add(body);
        return r.abort("failed");
      }
      return r.continue();
    });
  }
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
  await a.page.getByRole("button", { name: `Video call ${b.username}` }).click();
  const aCall = a.page.getByRole("dialog", { name: `Video call with ${b.username}` });
  const bCall = b.page.getByRole("dialog", { name: `Video call with ${a.username}` });
  await bCall.getByRole("button", { name: "Answer" }).click({ timeout: 15_000 });
  for (const d of [aCall, bCall]) await expect(d).toHaveClass(/\blive\b/, { timeout: 30_000 });
  await expect.poll(() => b.page.locator("video.call-remote").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await a.page.getByRole("button", { name: "Hang up" }).click();
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test("a blocked camera explains how to fix it, and the call goes on once allowed", async ({ browser }) => {
  const [a, b] = await Promise.all([open(browser), open(browser, { blockCamera: true })]);
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
  await a.page.getByRole("button", { name: `Video call ${b.username}` }).click();
  const bCall = b.page.getByRole("dialog", { name: `Video call with ${a.username}` });
  await bCall.getByRole("button", { name: "Answer" }).click();

  // Blocked: steps for this browser, and retrying while still blocked keeps the card up.
  const help = b.page.getByRole("alertdialog", { name: "Camera & mic are blocked" });
  await expect(help).toBeVisible();
  await expect(help.locator(".steps li").first()).toBeVisible();
  await help.getByRole("button", { name: "Try again" }).click();
  await expect(help).toBeVisible();

  // The player allows the camera in settings and tries again: the call connects.
  await b.page.evaluate(() => ((window as unknown as { __blockCam: boolean }).__blockCam = false));
  await help.getByRole("button", { name: "Try again" }).click();
  await expect(help).toHaveCount(0);
  await expect(bCall).toHaveClass(/\blive\b/, { timeout: 30_000 });
  await expect.poll(() => a.page.locator("video.call-remote").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test("a call that can't connect gives up with a reason instead of hanging", async ({ browser }) => {
  test.setTimeout(240_000); // setup + a 40 s give-up, on a dev server that may be busy
  const [a, b] = await Promise.all([open(browser, { noRoute: true }), open(browser, { noRoute: true })]);
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
  await a.page.getByRole("button", { name: `Video call ${b.username}` }).click();
  const aCall = a.page.getByRole("dialog", { name: `Video call with ${b.username}` });
  const bCall = b.page.getByRole("dialog", { name: `Video call with ${a.username}` });
  await bCall.getByRole("button", { name: "Answer" }).click();
  // No relay in the test setup, so both sides name the relay as the problem.
  // Each phone shows it for a moment before closing, so watch both at once.
  await Promise.all([aCall, bCall].map((d) => expect(d).toContainText("Couldn't connect", { timeout: 60_000 })));
  await expect(aCall).toHaveCount(0, { timeout: 10_000 });
});

test("answering from the notification opens the game straight into the call", async ({ browser }) => {
  const [a, b] = await Promise.all([open(browser), open(browser)]);
  await json(a.page, "/api/friends", { action: "request", username: b.username });
  const fr = await b.page.evaluate(() => fetch("/api/friends").then((r) => r.json()));
  await json(b.page, "/api/friends", { action: "accept", friendshipId: fr.incoming[0].friendshipId });

  await a.page.locator("[data-tour=nav-social]").click();
  await a.page.getByRole("button", { name: "Crew & chat" }).click();
  await a.page.getByRole("button", { name: `Video call ${b.username}` }).click();
  // The notification's Answer button opens /play?call=<id>&answer=1.
  const callId = await expect.poll(() => b.page.evaluate(() => fetch(`/api/sync?since=${Date.now()}`).then((r) => r.json()).then((r) => r.call?.id ?? null))).not.toBeNull().then(() =>
    b.page.evaluate(() => fetch(`/api/sync?since=${Date.now()}`).then((r) => r.json()).then((r) => r.call.id as string)),
  );
  await b.page.goto(`/play?call=${callId}&answer=1`);
  const bCall = b.page.getByRole("dialog", { name: `Video call with ${a.username}` });
  await expect(bCall).toHaveClass(/\blive\b/, { timeout: 30_000 });
  await expect(b.page).toHaveURL(/\/play$/);
  await b.page.getByRole("button", { name: "Hang up" }).click();
});
