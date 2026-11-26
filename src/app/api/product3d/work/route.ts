// The reconstruction runner's API (scripts/product3d/worker.ts on GitHub Actions), with PRODUCT3D_TOKEN as a Bearer
// token: claim jobs, report each result (a .glb as base64, or why it failed), take products to classify and give the
// LLM's kinds back, sweep the cached menus into the queue, and ask how much is left (the workflow chains while some is).
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { applyKinds, backfill, claim, pending, photoVia, report, toClassify, type WorkResult } from "@/server/product3d";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function authed(req: Request) {
  const secret = process.env.PRODUCT3D_TOKEN ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (secret.length < 16 || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) throw new HttpError(401, t("Unauthorized"));
}

const Stats = z.object({ triangles: z.number(), bytes: z.number(), box: z.tuple([z.number(), z.number(), z.number()]), fg: z.number(), parts: z.number(), colorVar: z.number() });
const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("claim"), n: z.number().int().min(1).max(50), worker: z.string().max(60) }),
  z.object({
    op: z.literal("result"),
    worker: z.string().max(60),
    result: z.union([
      z.object({ key: z.string().max(20), ok: z.literal(true), glb: z.string().max(800_000), stats: Stats, image: z.string().max(500).optional(), imageFrom: z.string().max(40).optional(), seconds: z.number().optional() }),
      z.object({ key: z.string().max(20), ok: z.literal(false), why: z.enum(["image", "cutout", "reconstruct", "optimize", "check", "upload", "timeout", "other"]), error: z.string().max(500), image: z.string().max(500).optional(), imageFrom: z.string().max(40).optional() }),
    ]),
  }),
  z.object({ op: z.literal("toClassify"), n: z.number().int().min(1).max(200) }),
  z.object({ op: z.literal("kinds"), worker: z.string().max(60), answers: z.array(z.object({ key: z.string().max(20), kind: z.string().max(30), en: z.string().max(80).optional() })).max(200) }),
  z.object({ op: z.literal("backfill") }),
  z.object({ op: z.literal("pending") }),
]);

export const POST = route(async (req) => {
  authed(req);
  const d = await body(req, Op);
  switch (d.op) {
    case "claim":
      return { jobs: await claim(d.n, d.worker) };
    case "result":
      return report(d.result as WorkResult, d.worker);
    case "toClassify":
      return { items: await toClassify(d.n) };
    case "kinds":
      return { applied: await applyKinds(d.answers, `llm:${d.worker}`) };
    case "backfill":
      return backfill();
    case "pending":
      return pending();
  }
});

/** A product photo fetched by the server (through the Iran relay for Snappfood's CDN): GET ?u=<https url>. */
export const GET = route(async (req) => {
  authed(req);
  return photoVia(new URL(req.url).searchParams.get("u") ?? "");
});
