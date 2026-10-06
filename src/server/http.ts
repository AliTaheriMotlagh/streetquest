import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

/** Wrap a route handler: JSON response + uniform error handling. */
export function route<T>(fn: (req: Request, ctx: Ctx) => Promise<T>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const data = await fn(req, ctx);
      return data instanceof Response ? data : Response.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return Response.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  return schema.parse(await req.json().catch(() => ({})));
}
