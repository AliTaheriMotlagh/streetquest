import { PrismaClient } from "@prisma/client";

// Accept the env var names Vercel's Postgres/Neon integrations create, not just DATABASE_URL.
const raw = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
if (raw) {
  process.env.DATABASE_URL ??= raw;
  process.env.DATABASE_URL_UNPOOLED ??= process.env.POSTGRES_URL_NON_POOLING || raw;
}

/**
 * Serverless (Vercel) runs many instances, and each one opens its own Prisma pool
 * (several connections by default). Against a direct, un-pooled Postgres URL that
 * quickly exhausts the database ("too many connections"). So on serverless we cap
 * each instance's pool unless the URL already sets a limit or goes through a pooler.
 * Override with DB_CONNECTION_LIMIT.
 */
function withPoolLimit(u: string | undefined) {
  if (!u || !/^postgres(ql)?:\/\//.test(u)) return u; // prisma+postgres:// (Accelerate) pools for us
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const limit = process.env.DB_CONNECTION_LIMIT || (serverless ? "1" : "");
  if (!limit || /[?&]connection_limit=/.test(u)) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}connection_limit=${limit}${/[?&]pool_timeout=/.test(u) ? "" : "&pool_timeout=20"}`;
}

const url = withPoolLimit(raw);
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = (g.__prisma ??= new PrismaClient(url ? { datasourceUrl: url } : undefined));
