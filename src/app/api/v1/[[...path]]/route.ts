// The public read-only data API (server/apiV1.ts; docs at /developers, OpenAPI at /api/v1/openapi.json).
import { handleV1 } from "@/server/apiV1";

type Ctx = { params: Promise<{ path?: string[] }> };
const run = async (req: Request, ctx: Ctx) => handleV1(req, (await ctx.params).path ?? []);
export const GET = run;
export const OPTIONS = run;
