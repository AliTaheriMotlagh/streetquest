// Runs before the e2e dev server starts: bring the e2e database's tables up to date.
// Never touches the dev database, and never wipes anything — tests don't need an empty
// database because each one plays as fresh players at random spots.
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (!/_e2e|_test/.test(new URL(url).pathname)) {
  console.error(`Refusing to use ${url}: the e2e database name must contain _e2e or _test`);
  process.exit(1);
}
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
