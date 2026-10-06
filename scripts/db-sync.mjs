// Runs during every build (Vercel, Render, local): makes the database tables match
// prisma/schema.prisma. Without this, a deploy can succeed and then every API call
// fails with "Server error" because the tables don't exist.
import { execSync } from "node:child_process";

try {
  process.loadEnvFile(".env"); // local builds; on Vercel/Render the platform provides env vars
} catch {}
const env = { ...process.env };
// Vercel's Neon / Postgres integrations use different names depending on setup.
const url = env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
if (!url) {
  if (env.VERCEL || env.RENDER) {
    console.error("\n✖ No database connected. In Vercel: Storage → Create/Connect a Postgres (Neon) database, then redeploy.\n");
    process.exit(1);
  }
  console.warn("⚠ DATABASE_URL not set — skipping schema sync (local build without a database).");
  process.exit(0);
}
env.DATABASE_URL = url;
env.DATABASE_URL_UNPOOLED ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED_URL || url;
execSync("npx prisma db push --skip-generate", { stdio: "inherit", env });
