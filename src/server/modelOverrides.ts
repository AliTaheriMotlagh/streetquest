// Replacing built-in 3D models without a deploy (Admin → Objects). An upload is checked
// (lib/modelCheck.ts), stored (Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else
// public/uploads/models in dev) and kept as a draft ModelOverride; publishing makes it the
// slot's active version, rolling back activates an earlier one. `modelManifest` is what
// /api/models serves and the client loaders consult (components/drive/modelOverride.ts).
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelOverride } from "@prisma/client";
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { checkModel, slotRule, type Problem } from "../lib/modelCheck";
import { HttpError } from "./http";

export const slotFile = (slot: string) => slot.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

/** Put the file somewhere the browser can fetch it, at an address that never changes for these bytes. */
export async function storeModel(slot: string, version: number, bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const name = `${slotFile(slot)}/v${version}-${hash}.glb`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const { put } = await import("@vercel/blob");
    try {
      const blob = await put(`models/${name}`, Buffer.from(bytes), { access: "public", token, contentType: "model/gltf-binary", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
      return blob.url;
    } catch (e) {
      throw new HttpError(502, t("The file storage refused the upload ({status})", { status: (e as Error).message.slice(0, 80) }));
    }
  }
  if (process.env.VERCEL) throw new HttpError(500, t("File storage isn't set up: add BLOB_READ_WRITE_TOKEN"));
  const dir = path.join(process.cwd(), "public", "uploads", "models", slotFile(slot));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `v${version}-${hash}.glb`), bytes);
  return `/uploads/models/${name}`;
}

export type OverrideView = { id: string; slot: string; url: string; bytes: number; tris: number; version: number; active: boolean; note: string; createdBy: string; createdAt: string; publishedBy: string | null; publishedAt: string | null };
const view = (r: ModelOverride): OverrideView => ({ id: r.id, slot: r.slot, url: r.url, bytes: r.bytes, tris: r.tris, version: r.version, active: r.active, note: r.note, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), publishedBy: r.publishedBy, publishedAt: r.publishedAt?.toISOString() ?? null });

export async function listOverrides(): Promise<OverrideView[]> {
  const rows = await prisma.modelOverride.findMany({ orderBy: [{ slot: "asc" }, { version: "desc" }], take: 1000 });
  return rows.map(view);
}

const say = (p: Problem) => t(p.msg, p.params as Record<string, string | number> | undefined);

/** Check and store an upload as a draft (not live until published). Refuses with every reason at once. */
export async function uploadDraft(slot: string, bytes: Uint8Array, note: string, by: string) {
  if (!slotRule(slot)) throw new HttpError(404, t("Unknown model slot"));
  const check = checkModel(slot, bytes);
  if (check.errors.length || !check.info) throw new HttpError(422, check.errors.map(say).join(" · "));
  const last = await prisma.modelOverride.findFirst({ where: { slot }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const url = await storeModel(slot, version, bytes);
  const row = await prisma.modelOverride.create({ data: { slot, url, bytes: bytes.length, tris: check.info.tris, version, note: note.slice(0, 200), createdBy: by } });
  invalidateManifest();
  return { override: view(row), warnings: check.warnings.map(say) };
}

/** Make a version the slot's live one (publish a draft, or roll back to an earlier version). */
export async function activate(id: string, by: string) {
  const row = await prisma.modelOverride.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, t("That's no longer there — refresh and try again"));
  await prisma.$transaction([
    prisma.modelOverride.updateMany({ where: { slot: row.slot, active: true }, data: { active: false } }),
    prisma.modelOverride.update({ where: { id }, data: { active: true, publishedBy: by, publishedAt: new Date() } }),
  ]);
  invalidateManifest();
  return { slot: row.slot, version: row.version };
}

/** Back to the file the game ships with. */
export async function useBuiltin(slot: string) {
  await prisma.modelOverride.updateMany({ where: { slot, active: true }, data: { active: false } });
  invalidateManifest();
}

/** Throw a never-published draft away. */
export async function discardDraft(id: string) {
  const row = await prisma.modelOverride.findUnique({ where: { id } });
  if (!row) return;
  if (row.active || row.publishedAt) throw new HttpError(409, t("Only drafts that were never published can be discarded"));
  await prisma.modelOverride.delete({ where: { id } });
  invalidateManifest();
}

// ---------------------------------------------------------------- manifest
export type ModelManifest = { models: Record<string, { url: string; version: number; tris: number; bytes: number }> };
const TTL_MS = 30_000;
let cache: { at: number; value: ModelManifest } | null = null;
const invalidateManifest = () => (cache = null);

/** The active override of every slot. Cached for 30 s per server instance; a publish clears this instance's copy at once. */
export async function modelManifest(): Promise<ModelManifest> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.modelOverride.findMany({ where: { active: true } });
  const value: ModelManifest = { models: Object.fromEntries(rows.map((r) => [r.slot, { url: r.url, version: r.version, tris: r.tris, bytes: r.bytes }])) };
  cache = { at: Date.now(), value };
  return value;
}
