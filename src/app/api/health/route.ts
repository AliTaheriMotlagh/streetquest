// Deployment check: open /api/health on your deployed site to see what's misconfigured.
// Reports which settings exist (never their values) and whether the database works.
// /api/health?ext=1 also checks that this server can reach Snappfood, Torob and Divar
// (they often refuse servers abroad: then the store layers stay empty).
import { prisma } from "@/lib/db";
import { turnConfigured } from "@/server/calls";
import { extHealth } from "@/server/localData";

export const dynamic = "force-dynamic";

const short = (e: unknown) => {
  const err = e as { code?: string; name?: string; message?: string };
  return `${err.code ?? err.name ?? "Error"}: ${(err.message ?? "").trim().split("\n").filter(Boolean).pop()?.slice(0, 200)}`;
};

export async function GET(req: Request) {
  const env = process.env;
  const ext = new URL(req.url).searchParams.get("ext") === "1" ? await extHealth() : undefined;
  const settings = {
    database: !!(env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL),
    authSecret: !!env.AUTH_SECRET && env.AUTH_SECRET !== "change-me",
    siteUrl: !!(env.NEXT_PUBLIC_SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL),
    adminKey: !!env.ADMIN_KEY,
    cronSecret: !!env.CRON_SECRET,
    callRelay: turnConfigured(),
  };
  const problems: string[] = [];
  if (!settings.database) problems.push("No database connected. Vercel: Storage → connect a Postgres (Neon) database, then redeploy.");
  if (!settings.authSecret) problems.push("AUTH_SECRET is not set. Add a long random value in Settings → Environment Variables.");
  if (!settings.siteUrl) problems.push("NEXT_PUBLIC_SITE_URL is not set (links/SEO use localhost).");
  if (!settings.callRelay) problems.push("No TURN relay for video calls: calls only connect when both phones are on the same network. Set CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN (see .env.example).");

  let database = "skipped";
  let schema = "skipped";
  if (settings.database) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
      try {
        await Promise.all([prisma.user.count(), prisma.base.count(), prisma.match.count(), prisma.bossState.count()]);
        schema = "ok";
      } catch (e) {
        schema = short(e);
        problems.push("Database tables are missing or outdated. Redeploy (the build runs the schema sync), or run `npx prisma db push` against this database.");
      }
    } catch (e) {
      database = short(e);
      problems.push("Can't connect to the database. Check the DATABASE_URL value.");
    }
  }
  if (ext)
    for (const [site, r] of Object.entries(ext))
      if (!r.ok && r.status !== "off") problems.push(`This server can't reach ${site} (${r.status}): its store data stays empty. Run relay/relay.mjs on a server in Iran and set ${site.toUpperCase()}_URL to it (README → Deploy), or host the app in Iran.`);
  const ok = database === "ok" && schema === "ok";
  return Response.json({ ok, settings, database, schema, problems, ...(ext ? { external: ext } : {}) }, { status: ok ? 200 : 503 });
}
