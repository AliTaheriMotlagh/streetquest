// Admin → Product models (components/AdminProduct3D.tsx): the pipeline's rows with their photo, kind, status and
// model (GET, filters), the admin's decisions (POST: approve, reject, retry, kind, picture, template/AI, sweep the
// menus, start the runner) and their own .glb for a product (PUT, multipart: key, model). server/product3d.ts.
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { audit } from "@/server/audit";
import { body, HttpError, route } from "@/server/http";
import { adminAct, adminList, adminStats, adminUpload, type AdminAct } from "@/server/product3d";
import { MODEL_LIMITS } from "@/lib/product3d/pipeline";
import { t } from "@/lib/i18n";

export const GET = route(async (req) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams;
  const [list, stats] = await Promise.all([
    adminList({ status: q.get("status") ?? undefined, kind: q.get("kind") ?? undefined, q: q.get("q")?.slice(0, 80) || undefined, low: q.get("low") === "1", cursor: q.get("cursor") ?? undefined }),
    q.get("cursor") ? null : adminStats(),
  ]);
  return { ...list, stats };
});

const Key = z.string().regex(/^[pt][0-9a-f]{16}$/);
const Act = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "reject", "retry", "unlock", "template"]), key: Key }),
  z.object({ action: z.literal("kind"), key: Key, kind: z.string().max(30) }),
  z.object({ action: z.literal("image"), key: Key, image: z.string().max(500) }),
  z.object({ action: z.literal("strategy"), key: Key, strategy: z.enum(["", "ai", "template"]) }),
  z.object({ action: z.literal("retryFailed") }),
  z.object({ action: z.literal("backfill") }),
  z.object({ action: z.literal("dispatch"), limit: z.number().int().min(1).max(2000).optional() }),
]);

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const a = (await body(req, Act)) as AdminAct;
  const out = await adminAct(a, admin.username);
  await audit(admin, `product3d.${a.action}`, { type: "product", id: "key" in a ? a.key : "pipeline" }, "", { ...a }).catch(() => {});
  return out;
});

export const PUT = route(async (req) => {
  const admin = await requireAdmin();
  if (Number(req.headers.get("content-length") ?? 0) > MODEL_LIMITS.bytes + 64 * 1024) throw new HttpError(413, t("The model is too large ({kb} KB, at most {max} KB)", { kb: Math.round(Number(req.headers.get("content-length")) / 1024), max: MODEL_LIMITS.bytes / 1024 }));
  const form = await req.formData().catch(() => null);
  const key = form?.get("key"), file = form?.get("model");
  if (typeof key !== "string" || !Key.safeParse(key).success) throw new HttpError(404, t("Unknown product"));
  if (!(file instanceof Blob)) throw new HttpError(400, t("Choose a .glb file"));
  const out = await adminUpload(key, new Uint8Array(await file.arrayBuffer()), admin.username);
  await audit(admin, "product3d.upload", { type: "product", id: key }).catch(() => {});
  return out;
});
