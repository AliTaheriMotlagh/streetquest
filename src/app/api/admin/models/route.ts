// Admin → Objects: the catalog of every object (GET), upload a replacement .glb as a draft
// (PUT, multipart: slot, model, note — checked by lib/modelCheck.ts), and publish / roll back /
// go back to the built-in / discard a draft (POST). See server/modelOverrides.ts.
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { adminLandmarks } from "@/server/landmarks";
import { activate, discardDraft, listOverrides, uploadDraft, useBuiltin } from "@/server/modelOverrides";
import { buildCatalog, buildSlots } from "@/lib/objectCatalog";
import { allSlots, MODEL_MAX_BYTES, slotRule } from "@/lib/modelCheck";
import { t } from "@/lib/i18n";

export const GET = route(async () => {
  await requireAdmin();
  const [landmarks, overrides] = await Promise.all([adminLandmarks(), listOverrides()]);
  const objects = buildCatalog({ landmarks: landmarks.map((l) => ({ id: l.id, name: l.name, url: l.url, height: l.height, stats: l.stats?.triangles ? { triangles: l.stats.triangles ?? 0, bytes: l.stats.bytes ?? 0 } : null })) });
  return { objects, slots: buildSlots(objects), overrides, maxBytes: MODEL_MAX_BYTES, storage: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local" };
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), id: z.string().max(40) }),
  z.object({ action: z.literal("rollback"), id: z.string().max(40) }),
  z.object({ action: z.literal("builtin"), slot: z.string().max(60) }),
  z.object({ action: z.literal("discard"), id: z.string().max(40) }),
]);

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const d = await body(req, Action);
  if (d.action === "publish" || d.action === "rollback") return { ok: true, ...(await activate(d.id, admin.username)) };
  if (d.action === "builtin") {
    if (!allSlots().includes(d.slot)) throw new HttpError(404, t("Unknown model slot"));
    await useBuiltin(d.slot);
  } else await discardDraft(d.id);
  return { ok: true };
});

export const PUT = route(async (req) => {
  const admin = await requireAdmin();
  if (Number(req.headers.get("content-length") ?? 0) > MODEL_MAX_BYTES + 64 * 1024) throw new HttpError(413, t("The model is too large — keep it under 4 MB (Draco compression and WebP textures help)"));
  const form = await req.formData().catch(() => null);
  const slot = form?.get("slot");
  const file = form?.get("model");
  const note = form?.get("note");
  if (typeof slot !== "string" || !slotRule(slot)) throw new HttpError(404, t("Unknown model slot"));
  if (!(file instanceof Blob)) throw new HttpError(400, t("Choose a .glb file"));
  return uploadDraft(slot, new Uint8Array(await file.arrayBuffer()), typeof note === "string" ? note : "", admin.username);
});
