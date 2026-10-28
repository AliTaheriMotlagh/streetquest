// Sound on an Android phone: what players heard as noise and crackle.
//  - a sound asked for while audio is locked or asleep is dropped, never queued (a queue
//    of taps all firing at once when audio wakes up was the burst after picking a menu);
//  - Android gets the cheap mix (no convolution reverb, no oversampling, bigger buffer);
//  - one tap on a menu button plays one tap sound;
//  - every sound, through both mixes, stays under clipping and dies away to silence.
import { expect, test, devices, type Page } from "@playwright/test";
import { Player } from "../helpers";

test.use({ ...devices["Pixel 7"] });

type SfxHook = {
  stats: { played: number; dropped: number };
  state: () => string;
  cheap: () => boolean;
  names: () => string[];
  render: (n: string, cheap: boolean) => Promise<{ peak: number; tail: number; bad: number }>;
  lock: () => Promise<() => void>;
};
/** Run `fn` in the page with the sound engine's test hook (window.__sfx, dev builds). */
const hook = <T,>(page: Page, fn: (s: SfxHook) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.__sfx)`) as Promise<T>;

async function openGame(page: Page, baseURL: string) {
  const p = await Player.create(baseURL);
  await page.context().addCookies((await p.ctx.storageState()).cookies);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 35.7, longitude: 51.4, accuracy: 10 });
  await page.addInitScript(() => {
    localStorage.setItem("sq_tour_v2", "1");
    localStorage.setItem("sq_mode_never", "1");
    localStorage.setItem("sq_push_asked", "1");
    // Next's dev-tools badge sits on top of the bottom nav at phone width (dev only).
    const hide = () => document.head?.insertAdjacentHTML("beforeend", "<style>nextjs-portal{display:none!important}</style>");
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
  await page.goto("/play");
  await expect(page.locator("nav.nav button:visible").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => !!(window as unknown as { __sfx?: unknown }).__sfx);
}

test("a menu tap plays one tap sound, on the cheap Android mix", async ({ page, baseURL }) => {
  await openGame(page, baseURL!);
  await page.locator("nav.nav button:visible").first().tap();
  await expect.poll(() => hook(page, (s) => s.state())).toBe("running");
  expect(await hook(page, (s) => s.cheap())).toBe(true);
  const before = await hook(page, (s) => s.stats.played);
  await page.locator(".sheet .close:visible").first().tap();
  await expect.poll(() => hook(page, (s) => s.stats.played)).toBe(before + 1);
});

test("sounds asked for while audio is locked don't pile up and fire together", async ({ page, baseURL }) => {
  await openGame(page, baseURL!);
  await page.locator("nav.nav button:visible").first().tap();
  await expect.poll(() => hook(page, (s) => s.state())).toBe("running");
  const played = await page.evaluate(async () => {
    const s = (window as unknown as { __sfx: SfxHook }).__sfx;
    const release = await s.lock();
    const start = s.stats.played;
    // Three taps over a second while locked (the first taps on a phone, before audio may start).
    for (let i = 0; i < 3; i++) {
      document.querySelector<HTMLElement>("nav.nav button")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    }
    release();
    await new Promise((r) => setTimeout(r, 500));
    return s.stats.played - start;
  });
  // None of the stale taps play once audio is allowed (at most the latest, if it was fresh).
  expect(played).toBeLessThanOrEqual(1);
});

test("every sound stays under clipping and fades to silence, on both mixes", async ({ page, baseURL }) => {
  await openGame(page, baseURL!);
  await page.locator("nav.nav button:visible").first().tap();
  const results = await hook(page, async (s) => {
    const out: { name: string; cheap: boolean; peak: number; tail: number; bad: number }[] = [];
    for (const name of s.names()) for (const cheap of [true, false]) out.push({ name, cheap, ...(await s.render(name, cheap)) });
    return out;
  });
  // Long by design: they're still sounding at the end of the 3 s render.
  const LONG = ["siren", "nuke"];
  for (const r of results) {
    expect.soft(r.bad, `${r.name} (${r.cheap ? "cheap" : "full"}) has NaN samples`).toBe(0);
    expect.soft(r.peak, `${r.name} (${r.cheap ? "cheap" : "full"}) clips`).toBeLessThan(0.98);
    if (!LONG.includes(r.name)) expect.soft(r.tail, `${r.name} (${r.cheap ? "cheap" : "full"}) doesn't fade out`).toBeLessThan(0.005);
  }
});
