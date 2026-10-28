import { ZodError } from "zod";
import { t } from "../lib/i18n";
import { ensureSettings } from "./settings";
import { withUserLock } from "./lock";
import { SESSION_COOKIE, verifySession } from "./session";
import { localeOfRequest, withLocale } from "./i18n";

/**
 * A refusal the player sees. Write the message with t() so it's in their language:
 * throw new HttpError(400, t("Not enough coins")). Plain English still works — it's
 * looked up in the catalog on the way out.
 */
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

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Wrap a route handler: JSON response, the caller's language, uniform error handling. */
export function route<T>(fn: (req: Request, ctx: Ctx) => Promise<T>, opts: Opts = {}) {
  return (req: Request, ctx: Ctx) =>
    withLocale(localeOfRequest(req), async () => {
      try {
        await ensureSettings();
        const userId = opts.exclusive ? await sessionUserId(req) : null;
        const data = userId ? await withUserLock(userId, () => fn(req, ctx)) : await fn(req, ctx);
        return data instanceof Response ? data : Response.json(data ?? { ok: true });
      } catch (e) {
        if (e instanceof HttpError) return fail(e.status, t(e.message));
        if (e instanceof ZodError) {
          // A custom message on the schema is meant for players; zod's own are technical.
          const issue = e.issues[0];
          const custom = issue?.message && !/^(Expected|Required|Invalid|String must|Number must|Array must|Too big|Too small|Unrecognized)/.test(issue.message);
          return fail(400, custom ? t(issue.message) : t("Something you entered isn't valid ({field})", { field: issue?.path.join(".") || "?" }));
        }
        const code = (e as { code?: string }).code;
        // Lost a race with another request (the row it wanted was just removed or created):
        // that's a stale screen, not a server crash.
        if (code === "P2025") return fail(404, t("That's no longer there — refresh and try again"));
        if (code === "P2002") return fail(409, t("That was already done"));
        console.error(e);
        // Turn the common deploy mistakes into messages that say what to fix.
        if ((e as Error).name === "PrismaClientInitializationError")
          return fail(503, "Database unavailable — check the DATABASE_URL setting (details at /api/health)");
        if (code === "P2021" || code === "P2022")
          return fail(503, "Database tables are missing or outdated — redeploy so the schema sync runs (details at /api/health)");
        return fail(500, t("Server error — please try again"));
      }
    });
}

/** A game action (spends or grants something): one at a time per player. */
export const actionRoute = <T>(fn: (req: Request, ctx: Ctx) => Promise<T>) => route(fn, { exclusive: true });

export async function body<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  return schema.parse(await req.json().catch(() => ({})));
}
