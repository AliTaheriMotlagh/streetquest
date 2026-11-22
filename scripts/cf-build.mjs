// Builds the app for Cloudflare Workers with the production settings from .env.prod
// (which is gitignored). Variables already in the environment win, so CI can provide them.
//   node scripts/cf-build.mjs            → build
//   node scripts/cf-build.mjs deploy     → build + deploy
//   node scripts/cf-build.mjs preview    → build + run locally in workerd
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const file = process.env.CF_ENV_FILE || ".env.prod";
try {
  const env = parseEnv(readFileSync(file, "utf8"));
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
} catch {
  console.warn(`⚠ ${file} not found — using the current environment`);
}

// The deployed origin, used by links/SEO and by the build id. Override with CF_SITE_URL.
process.env.NEXT_PUBLIC_SITE_URL = process.env.CF_SITE_URL || "https://streetquest.remixt.app";

const action = process.argv[2] || "build";
const cli = action === "build" ? ["opennextjs-cloudflare", "build"] : ["opennextjs-cloudflare", action];
const r = spawnSync("npx", cli, { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
