import { PrismaClient } from "@prisma/client";

// Accept the env var names Vercel's Postgres/Neon integrations create, not just DATABASE_URL.
const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
if (url) {
  process.env.DATABASE_URL ??= url;
  process.env.DATABASE_URL_UNPOOLED ??= process.env.POSTGRES_URL_NON_POOLING || url;
}

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = (g.__prisma ??= new PrismaClient(url ? { datasourceUrl: url } : undefined));
