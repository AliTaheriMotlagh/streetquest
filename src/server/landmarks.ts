// Landmarks on the server: what drive mode loads around a player, and the admin side
// (list, save, upload, delete). The model bytes are only ever read by the /landmark
// route; every other query leaves them out.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, type LatLng } from "../lib/geo";
import { activePlan } from "../lib/business";
import { t } from "../lib/i18n";
import { BUDGET, glbProblem, HULL_MAX_POINTS, LANDMARK_LIST_M, LANDMARK_MAX_BYTES, modelUrl, type LandmarkView, type ModelStats } from "../lib/landmarks";
import { HttpError } from "./http";

const META = {
  id: true,
  name: true,
  businessId: true,
  lat: true,
  lng: true,
  yaw: true,
  scale: true,
  lift: true,
  active: true,
  paidOnly: true,
  hull: true,
  height: true,
  modelHash: true,
  modelSize: true,
  stats: true,
  createdAt: true,
  updatedAt: true,
  business: { select: { id: true, name: true, emoji: true, plan: true, planUntil: true, verified: true } },
} satisfies Prisma.LandmarkSelect;
type Row = Prisma.LandmarkGetPayload<{ select: typeof META }>;

const numbers = (v: Prisma.JsonValue): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []);
/** Paid up (or not tied to a plan): drive mode shows it. */
const showing = (r: Row, now: number) => r.active && !!r.modelHash && (!r.paidOnly || !r.business || activePlan(r.business, now).key !== "free");

const view = (r: Row): LandmarkView => ({
  id: r.id,
  name: r.name,
  businessId: r.businessId,
  emoji: r.business?.emoji ?? "🏪",
  lat: r.lat,
  lng: r.lng,
  yaw: r.yaw,
  scale: r.scale,
  lift: r.lift,
  hull: numbers(r.hull),
  height: r.height,
  url: modelUrl(r.id, r.modelHash),
});

/** Landmarks drive mode should know about around `here`. */
export async function landmarksAround(here: LatLng, radiusM = LANDMARK_LIST_M): Promise<LandmarkView[]> {
  const b = bbox(here, radiusM);
  const rows = await prisma.landmark.findMany({ where: { active: true, lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } }, select: META, take: 60 });
  const now = Date.now();
  return rows.filter((r) => showing(r, now)).map(view);
}

/** Every landmark, for the admin panel (with whether players can see it right now). */
export async function adminLandmarks() {
  const rows = await prisma.landmark.findMany({ select: META, orderBy: { updatedAt: "desc" }, take: 200 });
  const now = Date.now();
  return rows.map((r) => ({
    ...view(r),
    active: r.active,
    paidOnly: r.paidOnly,
    modelSize: r.modelSize,
    stats: r.stats as Partial<ModelStats>,
    updatedAt: r.updatedAt,
    showing: showing(r, now),
    business: r.business ? { id: r.business.id, name: r.business.name, plan: activePlan(r.business, now).key, verified: r.business.verified } : null,
  }));
}

/** Businesses an admin can give a 3D building to: paying ones first. */
export async function landmarkBusinesses() {
  const rows = await prisma.business.findMany({ select: { id: true, name: true, emoji: true, lat: true, lng: true, plan: true, planUntil: true, verified: true, address: true }, orderBy: { updatedAt: "desc" }, take: 300 });
  const now = Date.now();
  return rows
    .map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, lat: b.lat, lng: b.lng, address: b.address, verified: b.verified, plan: activePlan(b, now).key }))
    .sort((a, b) => Number(b.plan !== "free") - Number(a.plan !== "free"));
}

export type LandmarkInput = {
  id?: string;
  name: string;
  businessId: string | null;
  lat: number;
  lng: number;
  yaw: number;
  scale: number;
  lift: number;
  active: boolean;
  paidOnly: boolean;
};

export async function saveLandmark(d: LandmarkInput) {
  if (d.businessId && !(await prisma.business.findUnique({ where: { id: d.businessId }, select: { id: true } }))) throw new HttpError(404, t("That store doesn't exist anymore"));
  const data = { name: d.name, businessId: d.businessId, lat: d.lat, lng: d.lng, yaw: ((d.yaw % 360) + 360) % 360, scale: d.scale, lift: d.lift, active: d.active, paidOnly: d.paidOnly };
  if (d.id) {
    const r = await prisma.landmark.update({ where: { id: d.id }, data, select: { id: true } }).catch(() => null);
    if (!r) throw new HttpError(404, t("That 3D building doesn't exist anymore"));
    return r;
  }
  return prisma.landmark.create({ data, select: { id: true } });
}

export async function deleteLandmark(id: string) {
  await prisma.landmark.delete({ where: { id } }).catch(() => null);
}

/**
 * Store a new model for a landmark. `hull`, `height` and `stats` were measured in the
 * admin's browser (it has three.js and the decoders); the server checks the file itself
 * and keeps the numbers within bounds.
 */
export async function uploadModel(id: string, bytes: Uint8Array, meta: { hull: number[]; height: number; stats: ModelStats }) {
  if (bytes.length > LANDMARK_MAX_BYTES) throw new HttpError(413, t("The model is too large — keep it under 4 MB (Draco compression and WebP textures help)"));
  const problem = glbProblem(bytes);
  if (problem) throw new HttpError(400, t(problem));
  const s = meta.stats;
  if (s.triangles > BUDGET.triangles.max || s.materials > BUDGET.materials.max || s.texturePx > BUDGET.texturePx.max || s.textures > BUDGET.textures.max)
    throw new HttpError(400, t("The model is too heavy for phones — see the budget in the panel"));
  const hull = meta.hull.slice(0, HULL_MAX_POINTS * 2);
  if (hull.length < 6 || hull.some((n) => !Number.isFinite(n) || Math.abs(n) > 500)) throw new HttpError(400, t("The model has no ground outline — is it standing at the origin?"));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const r = await prisma.landmark
    .update({
      where: { id },
      data: { model: Buffer.from(bytes), modelHash: hash, modelSize: bytes.length, hull, height: Math.max(1, Math.min(300, meta.height)), stats: { ...s, bytes: bytes.length } },
      select: { id: true, modelHash: true },
    })
    .catch(() => null);
  if (!r) throw new HttpError(404, t("That 3D building doesn't exist anymore"));
  return { id: r.id, url: modelUrl(r.id, r.modelHash) };
}
