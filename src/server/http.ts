import { ZodError } from "zod";
import { ensureSettings } from "./settings";
import { withUserLock } from "./lock";
import { SESSION_COOKIE, verifySession } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };
type Opts = {
  /**
   * Game actions that spend or grant something: run one at a time per player, so a
   * double-tap or a network retry can't charge twice or duplicate units.
   */
  exclusive?: boolean;
};

/** The signed-in player's id from the request cookie (no DB lookup). */
async function sessionUserId(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return verifySession(token ? decodeURIComponent(token) : undefined);
}

/** Wrap a route handler: JSON response + uniform error handling. */
export function route<T>(fn: (req: Request, ctx: Ctx) => Promise<T>, opts: Opts = {}) {
  return async (req: Request, ctx: Ctx) => {
    try {
      await ensureSettings();
      const userId = opts.exclusive ? await sessionUserId(req) : null;
      const data = userId ? await withUserLock(userId, () => fn(req, ctx)) : await fn(req, ctx);
      return data instanceof Response ? data : Response.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return Response.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      const code = (e as { code?: string }).code;
      // Lost a race with another request (the row it wanted was just removed or created):
      // that's a stale screen, not a server crash.
      if (code === "P2025") return Response.json({ error: "That's no longer there — refresh and try again" }, { status: 404 });
      if (code === "P2002") return Response.json({ error: "That was already done" }, { status: 409 });
      console.error(e);
      // Turn the common deploy mistakes into messages that say what to fix.
      if ((e as Error).name === "PrismaClientInitializationError")
        return Response.json({ error: "Database unavailable — check the DATABASE_URL setting (details at /api/health)" }, { status: 503 });
      if (code === "P2021" || code === "P2022")
        return Response.json({ error: "Database tables are missing or outdated — redeploy so the schema sync runs (details at /api/health)" }, { status: 503 });
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
}

/** A game action (spends or grants something): one at a time per player. */
export const actionRoute = <T>(fn: (req: Request, ctx: Ctx) => Promise<T>) => route(fn, { exclusive: true });

export async function body<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  return schema.parse(await req.json().catch(() => ({})));
}
