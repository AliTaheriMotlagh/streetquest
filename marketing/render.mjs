// Renders whats-new.html to PNG in English and Persian: node marketing/render.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(join(dir, "whats-new.html")).href;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
for (const lang of ["en", "fa"]) {
  const p = await ctx.newPage();
  await p.goto(`${page}#${lang}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(dir, `whats-new-${lang}.png`), fullPage: true });
  console.log(`marketing/whats-new-${lang}.png`);
}
await browser.close();
