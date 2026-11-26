import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

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

/**
 * Cloudflare Workers have no Node process, native engine or filesystem, so Prisma must go
 * through a driver adapter there. Neon's serverless driver speaks WebSocket (supported by
 * Workers) and supports the interactive transactions the game uses. Everywhere else — the
 * local Docker Postgres, a plain Node server — the normal Prisma engine stays in charge.
 */
function makeClient(): PrismaClient {
  if (url && /neon\.(tech|build)/i.test(url)) {
    // Workers expose a global WebSocket; Node 22+ does too. Plain queries go over HTTP
    // (poolQueryViaFetch); interactive transactions still use the WebSocket.
    if (typeof WebSocket !== "undefined") {
      neonConfig.webSocketConstructor = WebSocket;
      neonConfig.poolQueryViaFetch = true;
    }
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  }
  return new PrismaClient(url ? { datasourceUrl: url } : undefined);
}

/**
 * Workers forbid reusing an I/O object (a DB connection, a socket) across requests. So the
 * client is per request, not global. The Cloudflare ExecutionContext is unique per request,
 * which makes it a perfect cache key; server components use React's per-request cache, and
 * build scripts/prerendering fall back to one client for the process.
 */
const perRequest = new WeakMap<object, PrismaClient>();
const reactClient = cache(() => makeClient());
const g = globalThis as unknown as { __prisma?: PrismaClient };

/** Only the Neon driver (Workers) needs a client per request; the Node engine (local Docker Postgres) shares one. */
const perRequestNeeded = !!url && /neon\.(tech|build)/i.test(url);

function clientForRequest(): PrismaClient {
  // `next dev` with the OpenNext dev shim has a Cloudflare context on every request: a client (and its pool) each
  // time would leak connections until Postgres refuses more ("too many clients"). One client for the process.
  if (!perRequestNeeded) return (g.__prisma ??= makeClient());
  try {
    const { ctx } = getCloudflareContext();
    if (ctx && typeof ctx === "object") {
      let client = perRequest.get(ctx);
      if (!client) {
        client = makeClient();
        perRequest.set(ctx, client);
      }
      return client;
    }
  } catch {
    // Not inside a Cloudflare request (next dev without the adapter, next build, scripts).
  }
  try {
    return reactClient();
  } catch {
    return (g.__prisma ??= makeClient());
  }
}

/**
 * Same `prisma` API as before, but each request gets its own client behind the scenes.
 * Property access is forwarded to that client (functions stay bound to it).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = clientForRequest();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
