// Admin → 3D stores: list landmarks and the stores that can have one (GET), create, edit
// and delete them (POST, JSON), and upload a model (PUT, multipart: the .glb plus the
// outline and stats the panel measured). See server/landmarks.ts.
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { adminLandmarks, deleteLandmark, landmarkBusinesses, saveLandmark, uploadModel } from "@/server/landmarks";
import { HULL_MAX_POINTS, LANDMARK_LIMITS, LANDMARK_MAX_BYTES } from "@/lib/landmarks";
import { t } from "@/lib/i18n";

export const GET = route(async () => {
  await requireAdmin();
  const [landmarks, businesses] = await Promise.all([adminLandmarks(), landmarkBusinesses()]);
  return { landmarks, businesses };
});

const Fields = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2).max(LANDMARK_LIMITS.name),
  businessId: z.string().max(40).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  yaw: z.number().min(-720).max(720),
  scale: z.number().min(0.05).max(20),
  lift: z.number().min(-30).max(30),
  active: z.boolean(),
  paidOnly: z.boolean(),
});
const Action = z.discriminatedUnion("action", [Fields.extend({ action: z.literal("save") }), z.object({ action: z.literal("delete"), id: z.string().max(40) })]);

export const POST = route(async (req) => {
  await requireAdmin();
  const d = await body(req, Action);
  if (d.action === "delete") {
    await deleteLandmark(d.id);
    return { ok: true };
  }
  const { action: _a, ...fields } = d;
  return saveLandmark(fields);
});

const Meta = z.object({
  hull: z.array(z.number()).min(6).max(HULL_MAX_POINTS * 2),
  height: z.number().min(0).max(1000),
  stats: z.object({ triangles: z.number().int().min(0), materials: z.number().int().min(0), textures: z.number().int().min(0), texturePx: z.number().int().min(0), meshes: z.number().int().min(0), bytes: z.number().int().min(0) }),
});

export const PUT = route(async (req) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{10,40}$/.test(id)) throw new HttpError(400, t("id required"));
  if (Number(req.headers.get("content-length") ?? 0) > LANDMARK_MAX_BYTES + 64 * 1024) throw new HttpError(413, t("The model is too large — keep it under 4 MB (Draco compression and WebP textures help)"));
  const form = await req.formData().catch(() => null);
  const file = form?.get("model");
  const meta = form?.get("meta");
  if (!(file instanceof Blob) || typeof meta !== "string") throw new HttpError(400, t("Choose a .glb file"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(meta);
  } catch {
    throw new HttpError(400, t("Choose a .glb file"));
  }
  return uploadModel(id, new Uint8Array(await file.arrayBuffer()), Meta.parse(parsed));
});
