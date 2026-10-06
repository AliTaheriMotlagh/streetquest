// Deployment check: open /api/health on your deployed site to see what's misconfigured.
// Reports which settings exist (never their values) and whether the database works.
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const short = (e: unknown) => {
  const err = e as { code?: string; name?: string; message?: string };
  return `${err.code ?? err.name ?? "Error"}: ${(err.message ?? "").trim().split("\n").filter(Boolean).pop()?.slice(0, 200)}`;
};

export async function GET() {
  const env = process.env;
  const settings = {
    database: !!(env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL),
    authSecret: !!env.AUTH_SECRET && env.AUTH_SECRET !== "change-me",
    siteUrl: !!env.NEXT_PUBLIC_SITE_URL,
    adminKey: !!env.ADMIN_KEY,
  };
  const problems: string[] = [];
  if (!settings.database) problems.push("No database connected. Vercel: Storage → connect a Postgres (Neon) database, then redeploy.");
  if (!settings.authSecret) problems.push("AUTH_SECRET is not set. Add a long random value in Settings → Environment Variables.");
  if (!settings.siteUrl) problems.push("NEXT_PUBLIC_SITE_URL is not set (links/SEO use localhost).");

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
  const ok = database === "ok" && schema === "ok";
  return Response.json({ ok, settings, database, schema, problems }, { status: ok ? 200 : 503 });
}
