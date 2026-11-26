// Store products' 3D models (lib/product3d/* has the rules): the queue the reconstruction runner works from, what it
// reports back, what the game asks for, and the admin's controls (Admin → Product models).
//
// Feeding the queue: every Snappfood menu the game reads (server/localData.ts vendorMenu → queueMenu, at most once per
// vendor in 6 h) and a full sweep of the cached menus (backfill: the runner asks for one at the start of each run, the
// admin has a button). The runner (scripts/product3d/worker.ts, .github/workflows/product3d.yml) talks to
// /api/product3d/work with PRODUCT3D_TOKEN; the game reads /api/product3d?keys=…; models are stored like Admin →
// Objects' uploads (R2 `UPLOADS` on Cloudflare, Vercel Blob, else public/uploads in dev).
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type Product3D } from "@prisma/client";
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { checkGlb } from "../lib/glbCheck";
import { classify, CONFIDENT, isKind, KIND_NAMES, KINDS, type ProductKind } from "../lib/product3d/kinds";
import { afterFailure, AUTO_LIVE, claimable, fullPhoto, gameLook, isProductKey, LEASE_MS, MODEL_LIMITS, PIPE_V, productKey, scoreModel, statusForScore, STATUSES, type Failure, type ModelStats, type Status } from "../lib/product3d/pipeline";
import { storeKind, STORE_KINDS, type StoreKind } from "../lib/storeKinds";
import type { Menu } from "../lib/localData";
import { cfEnv, MODEL_PREFIX } from "./cf";
import { HttpError } from "./http";

type LogEntry = { at: string; what: string; by: string; note?: string };
const LOG_MAX = 12;
const logOf = (r: { log: Prisma.JsonValue }) => (Array.isArray(r.log) ? (r.log as LogEntry[]) : []);
const withLog = (r: { log: Prisma.JsonValue }, e: Omit<LogEntry, "at">) => [...logOf(r), { at: new Date().toISOString(), ...e }].slice(-LOG_MAX) as Prisma.InputJsonValue;

export type ProductIn = { title: string; section?: string; about?: string; photo?: string };

/** Put products in the queue (new ones only; ones already there are marked seen). Returns how many were new. */
export async function ingest(items: ProductIn[], store: StoreKind): Promise<number> {
  const rows = new Map<string, Prisma.Product3DCreateManyInput>();
  for (const it of items) {
    const title = it.title?.trim();
    if (!title || title.length > 200) continue;
    const key = productKey(it);
    const prev = rows.get(key);
    if (prev) {
      prev.stores = (prev.stores ?? 1) + 1;
      continue;
    }
    const c = classify(it, store);
    const photo = fullPhoto(it.photo ?? "");
    rows.set(key, {
      key, title, section: (it.section ?? "").slice(0, 120), about: (it.about ?? "").slice(0, 300), storeKind: store, photo, image: photo, imageFrom: photo ? "menu" : "",
      kind: c.kind, kindBy: c.by, conf: c.conf, stores: 1,
    });
  }
  if (!rows.size) return 0;
  const data = [...rows.values()];
  const made = await prisma.product3D.createMany({ data, skipDuplicates: true });
  await prisma.product3D.updateMany({ where: { key: { in: [...rows.keys()] } }, data: { seenAt: new Date() } });
  return made.count;
}

const lastQueued = new Map<string, number>();
/** A menu the game just read: its products into the queue (once per vendor in 6 h; never holds the menu up). */
export function queueMenu(m: Menu | null) {
  if (!m?.vendor?.code || process.env.PRODUCT3D === "off") return;
  const now = Date.now();
  if (now - (lastQueued.get(m.vendor.code) ?? 0) < 6 * 3600_000) return;
  lastQueued.set(m.vendor.code, now);
  if (lastQueued.size > 5000) lastQueued.clear();
  const store = storeKind(m.vendor.kind === "food" ? "restaurant" : m.vendor.kind, m.vendor.title);
  const items = m.sections.flatMap((s) => s.items.map((i) => ({ title: i.title, section: s.title, about: i.about, photo: i.image || i.photo })));
  ingest(items, store).catch((e) => console.warn("product3d queue", (e as Error).message));
}

/** Every cached menu into the queue (new products only). */
export async function backfill(): Promise<{ menus: number; added: number }> {
  let menus = 0, added = 0, cursor: string | undefined;
  for (;;) {
    const page = await prisma.extCache.findMany({ where: { key: { startsWith: "sf:menu" } }, orderBy: { key: "asc" }, take: 50, ...(cursor ? { cursor: { key: cursor }, skip: 1 } : {}), select: { key: true, data: true } });
    if (!page.length) break;
    for (const r of page) {
      const m = r.data as unknown as Menu;
      if (!m?.sections?.length) continue;
      menus++;
      const store = storeKind(m.vendor?.kind === "food" ? "restaurant" : m.vendor?.kind ?? "", m.vendor?.title ?? "");
      added += await ingest(m.sections.flatMap((s) => (s.items ?? []).map((i) => ({ title: i.title, section: s.title, about: i.about, photo: i.image || i.photo }))), store);
    }
    cursor = page[page.length - 1].key;
  }
  // A product without a photo borrows one from a product of the same name that has one.
  await prisma.$executeRaw`
    UPDATE "Product3D" t SET image = p.photo, "imageFrom" = 'same-name'
    FROM (SELECT DISTINCT ON (lower(title)) lower(title) lt, photo FROM "Product3D" WHERE photo <> '' ORDER BY lower(title), stores DESC) p
    WHERE t.image = '' AND t.locked = false AND lower(t.title) = p.lt`;
  return { menus, added };
}

/** Kinds whose look is worth reconstructing (lib/product3d/kinds.ts `ai`); the rest are templates unless an admin says. */
const AI_KINDS = KIND_NAMES.filter((k) => KINDS[k].ai);

const toJob = (r: Product3D) => ({ status: r.status as Status, attempts: r.attempts, nextTry: r.nextTry.getTime(), leaseUntil: r.leaseUntil?.getTime() ?? null, v: r.v, locked: r.locked, kind: r.kind, strategy: r.strategy, image: r.image, en: r.en });

/** The runner takes up to `n` jobs: leased to it for LEASE_MS (a runner that dies gives them back by timing out). */
export async function claim(n: number, worker: string) {
  const now = new Date();
  // Candidates by priority (Postgres picks; the pure rule double-checks each one), locked so two runners never get
  // the same row: SKIP LOCKED leaves rows another claim is holding.
  const keys = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ key: string }[]>`
      SELECT key FROM "Product3D"
      WHERE locked = false AND (image <> '' OR en <> '') AND strategy <> 'template' AND (kind IN (${Prisma.join(AI_KINDS)}) OR strategy = 'ai') AND (
        (status = 'queued' AND "nextTry" <= ${now}) OR
        (status = 'failed' AND "nextTry" <= ${now}) OR
        (status = 'working' AND "leaseUntil" < ${now}) OR
        (status IN ('live','review','template') AND v < ${PIPE_V} AND attempts < 99))
      ORDER BY stores DESC, (CASE WHEN "imageFrom" = 'menu' THEN 0 ELSE 1 END), "seenAt" DESC
      LIMIT ${Math.min(200, n * 3)}
      FOR UPDATE SKIP LOCKED`;
    const full = await tx.product3D.findMany({ where: { key: { in: rows.map((r) => r.key) } } });
    const ok = full.filter((r) => claimable(toJob(r), now.getTime())).slice(0, n);
    for (const r of ok)
      await tx.product3D.update({ where: { key: r.key }, data: { status: "working", leaseUntil: new Date(now.getTime() + LEASE_MS), worker: worker.slice(0, 60), attempts: { increment: 1 }, log: withLog(r, { what: "claimed", by: worker.slice(0, 60) }) } });
    return ok;
  });
  return keys.map((r) => ({ key: r.key, title: r.title, section: r.section, about: r.about, kind: r.kind, en: r.en, image: r.image, imageFrom: r.imageFrom, attempt: r.attempts + 1 }));
}

/** Hosts the runner may fetch a product photo from through the server (Snappfood's CDN refuses some places abroad;
 *  the server reaches it through the Iran relay — lib/relayUrl.ts). */
const PHOTO_HOSTS = /^https:\/\/(cdn\.snappfood\.ir|static\.snappfood\.ir|storage\.torob\.com|image\.torob\.com|s3\.ir-thr-at1\.arvanstorage\.ir)\//;
export async function photoVia(u: string): Promise<Response> {
  if (!PHOTO_HOSTS.test(u)) throw new HttpError(400, t("Not an allowed picture address"));
  const { siteBase } = await import("../lib/relayUrl");
  const url = new URL(u);
  const base = siteBase("snappfood", undefined, url.origin) ?? url.origin;
  const r = await fetch(`${base}${url.pathname}`, { signal: AbortSignal.timeout(20_000) });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !type.startsWith("image/")) throw new HttpError(502, t("The picture couldn't be fetched ({status})", { status: r.status }));
  return new Response(r.body, { headers: { "content-type": type, "cache-control": "private, max-age=600" } });
}

/** Store a finished model where the browser can fetch it, at an address that never changes for these bytes. */
async function storeModel(key: string, bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const name = `products/${key}-${hash}.glb`;
  const cf = await cfEnv();
  if (cf?.UPLOADS) {
    const k = `${MODEL_PREFIX}${name}`;
    await cf.UPLOADS.put(k, bytes, { httpMetadata: { contentType: "model/gltf-binary", cacheControl: "public, max-age=31536000, immutable" } });
    return `/api/models/file/${k}`;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`models/${name}`, Buffer.from(bytes), { access: "public", token, contentType: "model/gltf-binary", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
    return blob.url;
  }
  if (process.env.VERCEL) throw new HttpError(500, t("File storage isn't set up: add BLOB_READ_WRITE_TOKEN"));
  const dir = path.join(process.cwd(), "public", "uploads", "models", "products");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}-${hash}.glb`), bytes);
  return `/uploads/models/${name}`;
}

/** Check a product model: a .glb the game can load, inside MODEL_LIMITS. */
export function checkProductModel(bytes: Uint8Array): { triangles: number } {
  if (bytes.length > MODEL_LIMITS.bytes) throw new HttpError(413, t("The model is too large ({kb} KB, at most {max} KB)", { kb: Math.round(bytes.length / 1024), max: MODEL_LIMITS.bytes / 1024 }));
  // The scan check reads the structure (magic, lengths, extensions the loader handles); the caps are a product's.
  const c = checkGlb(bytes);
  if (!c.ok) throw new HttpError(422, c.problem);
  if (c.info.triangles > MODEL_LIMITS.triangles) throw new HttpError(422, t("The model has too many triangles ({n}, at most {max})", { n: c.info.triangles, max: MODEL_LIMITS.triangles }));
  if (c.info.textures > 2) throw new HttpError(422, t("The model has too many textures (2 at most)"));
  return { triangles: c.info.triangles };
}

export type WorkResult =
  | { key: string; ok: true; glb: string; stats: ModelStats; image?: string; imageFrom?: string; seconds?: number }
  | { key: string; ok: false; why: Failure; error: string; image?: string; imageFrom?: string };

/** The runner's answer for one job. A model is checked, scored, stored, and goes live / to review / to the template. */
export async function report(r: WorkResult, worker: string) {
  const row = await prisma.product3D.findUnique({ where: { key: r.key } });
  if (!row) throw new HttpError(404, t("Unknown product"));
  // Taken back (an admin locked it meanwhile, or the lease ran out and another runner has it).
  if (row.locked || row.status !== "working" || (row.worker && row.worker !== worker.slice(0, 60))) return { status: row.status, dropped: true };
  const now = Date.now();
  const img = r.image && /^https:\/\//.test(r.image) ? { image: r.image.slice(0, 500), imageFrom: (r.imageFrom ?? "search").slice(0, 40) } : {};
  if (!r.ok) {
    const next = afterFailure(row, r.why, row.key, now);
    await prisma.product3D.update({ where: { key: r.key }, data: { ...img, status: next.status, nextTry: new Date(next.nextTry), leaseUntil: null, error: `${r.why}: ${r.error}`.slice(0, 300), log: withLog(row, { what: `failed (${r.why})`, by: worker, note: r.error.slice(0, 120) }) } });
    return { status: next.status };
  }
  const bytes = new Uint8Array(Buffer.from(r.glb, "base64"));
  let tris: number;
  try {
    tris = checkProductModel(bytes).triangles;
  } catch (e) {
    const next = afterFailure(row, "check", row.key, now);
    await prisma.product3D.update({ where: { key: r.key }, data: { status: next.status, leaseUntil: null, error: `check: ${(e as Error).message}`.slice(0, 300), log: withLog(row, { what: "refused", by: worker, note: (e as Error).message.slice(0, 120) }) } });
    return { status: next.status };
  }
  const kind: ProductKind = isKind(row.kind) ? row.kind : "standee";
  const stats = { ...r.stats, triangles: tris, bytes: bytes.length };
  const { score, why } = scoreModel(kind, stats);
  const status = statusForScore(score);
  const url = await storeModel(row.key, bytes);
  await prisma.product3D.update({
    where: { key: r.key },
    data: { ...img, status, url, bytes: bytes.length, tris, score, stats: { ...stats, why, seconds: r.ok ? r.seconds ?? null : null } as Prisma.InputJsonValue, v: PIPE_V, error: "", leaseUntil: null, log: withLog(row, { what: `made → ${status}`, by: worker, note: `score ${score}${why.length ? ` (${why.join(", ")})` : ""}` }) },
  });
  return { status, score };
}

/** Products the rules weren't sure about (or that need an English name to search a photo by): the runner's LLM names them. */
export async function toClassify(n: number) {
  const rows = await prisma.product3D.findMany({
    where: { locked: false, kindBy: { in: ["rules", "store"] }, OR: [{ conf: { lt: CONFIDENT } }, { image: "", en: "" }] },
    orderBy: [{ stores: "desc" }, { seenAt: "desc" }],
    take: Math.min(200, n),
    select: { key: true, title: true, section: true, about: true, storeKind: true, kind: true },
  });
  return rows.map((r) => ({ ...r, about: r.about.slice(0, 140) }));
}

/** The LLM's answers: a kind (from the list only) and an English name. */
export async function applyKinds(answers: { key: string; kind: string; en?: string }[], by: string) {
  let n = 0;
  for (const a of answers.slice(0, 200)) {
    if (!isProductKey(a.key) || !isKind(a.kind)) continue;
    const row = await prisma.product3D.findUnique({ where: { key: a.key }, select: { locked: true, kindBy: true, log: true, status: true } });
    if (!row || row.locked || row.kindBy === "admin") continue;
    await prisma.product3D.update({ where: { key: a.key }, data: { kind: a.kind, kindBy: "llm", conf: 0.8, en: (a.en ?? "").slice(0, 80), log: withLog(row, { what: `kind → ${a.kind}`, by }) } });
    n++;
  }
  return n;
}

/** Work left for the runner (it chains another run while there is some). */
export async function pending() {
  const now = new Date();
  const [jobs, classify] = await Promise.all([
    prisma.product3D.count({ where: { locked: false, strategy: { not: "template" }, AND: [{ OR: [{ kind: { in: AI_KINDS } }, { strategy: "ai" }] }, { OR: [{ image: { not: "" } }, { en: { not: "" } }] }], OR: [{ status: "queued" }, { status: "failed", nextTry: { lte: now } }, { status: "working", leaseUntil: { lt: now } }] } }),
    prisma.product3D.count({ where: { locked: false, kindBy: { in: ["rules", "store"] }, OR: [{ conf: { lt: CONFIDENT } }, { image: "", en: "" }] } }),
  ]);
  return { jobs, classify };
}

/** For the game: each product's kind and, when it's live, its model. Unknown keys are left out (the game classifies
 *  them itself with the same rules). */
export async function lookup(keys: string[]) {
  const ks = [...new Set(keys.filter(isProductKey))].slice(0, 300);
  if (!ks.length) return {};
  const rows = await prisma.product3D.findMany({ where: { key: { in: ks } }, select: { key: true, status: true, url: true, kind: true, kindBy: true } });
  const out: Record<string, { kind?: ProductKind; model?: string }> = {};
  for (const r of rows) {
    const g = gameLook(r);
    if (g.model || (g.kind && r.kindBy !== "rules" && r.kindBy !== "store")) out[r.key] = { ...(g.kind ? { kind: g.kind } : {}), ...(g.model ? { model: g.model } : {}) };
  }
  return out;
}

// ── Admin ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AdminFilter = { status?: string; kind?: string; q?: string; low?: boolean; cursor?: string; take?: number };

export async function adminList(f: AdminFilter) {
  const where: Prisma.Product3DWhereInput = {
    ...(f.status && STATUSES.includes(f.status as Status) ? { status: f.status } : {}),
    ...(f.kind && isKind(f.kind) ? { kind: f.kind } : {}),
    ...(f.low ? { conf: { lt: CONFIDENT }, kindBy: { in: ["rules", "store"] } } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { en: { contains: f.q, mode: "insensitive" } }, { key: f.q }] } : {}),
  };
  const take = Math.min(100, f.take ?? 40);
  const rows = await prisma.product3D.findMany({ where, orderBy: [{ stores: "desc" }, { key: "asc" }], take: take + 1, ...(f.cursor ? { cursor: { key: f.cursor }, skip: 1 } : {}) });
  return { rows: rows.slice(0, take).map(adminView), next: rows.length > take ? rows[take - 1].key : null };
}

export const adminView = (r: Product3D) => ({
  key: r.key, title: r.title, section: r.section, about: r.about, storeKind: r.storeKind, photo: r.photo, image: r.image, imageFrom: r.imageFrom,
  kind: r.kind, kindBy: r.kindBy, conf: r.conf, en: r.en, strategy: r.strategy, status: r.status, attempts: r.attempts, error: r.error,
  nextTry: r.nextTry.toISOString(), url: r.url, bytes: r.bytes, tris: r.tris, score: r.score, stats: r.stats, locked: r.locked, stores: r.stores,
  log: logOf(r), updatedAt: r.updatedAt.toISOString(),
});

export async function adminStats() {
  const [byStatus, byKind, total] = await Promise.all([
    prisma.product3D.groupBy({ by: ["status"], _count: true }),
    prisma.product3D.groupBy({ by: ["kind"], _count: true, orderBy: { _count: { kind: "desc" } }, take: 80 }),
    prisma.product3D.count(),
  ]);
  const p = await pending();
  return {
    total, pending: p,
    status: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    kinds: byKind.map((k) => ({ kind: k.kind, n: k._count })),
    runner: { token: !!process.env.PRODUCT3D_TOKEN, dispatch: !!(process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_REPO) },
    autoLive: AUTO_LIVE, version: PIPE_V, kindNames: KIND_NAMES, storeKinds: STORE_KINDS,
  };
}

export type AdminAct =
  | { action: "approve" | "reject" | "retry" | "unlock" | "template"; key: string }
  | { action: "kind"; key: string; kind: string }
  | { action: "image"; key: string; image: string }
  | { action: "strategy"; key: string; strategy: "" | "ai" | "template" }
  | { action: "retryFailed" }
  | { action: "backfill" }
  | { action: "dispatch"; limit?: number };

export async function adminAct(a: AdminAct, by: string) {
  if (a.action === "backfill") return backfill();
  if (a.action === "dispatch") return dispatchRunner(a.limit);
  if (a.action === "retryFailed") {
    const r = await prisma.product3D.updateMany({ where: { status: "failed", locked: false }, data: { status: "queued", nextTry: new Date(), attempts: 0 } });
    return { count: r.count };
  }
  const row = await prisma.product3D.findUnique({ where: { key: a.key } });
  if (!row) throw new HttpError(404, t("Unknown product"));
  const log = (what: string, note?: string) => withLog(row, { what, by, note });
  let data: Prisma.Product3DUpdateInput;
  switch (a.action) {
    case "approve":
      if (!row.url) throw new HttpError(400, t("There's no model to approve yet"));
      data = { status: "live", locked: true, log: log("approved") };
      break;
    case "reject":
      data = { status: "rejected", locked: true, log: log("rejected") };
      break;
    case "template":
      data = { status: "template", locked: true, log: log("template only") };
      break;
    case "retry":
      data = { status: "queued", locked: false, attempts: 0, nextTry: new Date(), error: "", log: log("retry") };
      break;
    case "unlock":
      data = { locked: false, log: log("unlocked") };
      break;
    case "kind":
      if (!isKind(a.kind)) throw new HttpError(400, t("Unknown product kind"));
      data = { kind: a.kind, kindBy: "admin", conf: 1, log: log(`kind → ${a.kind}`) };
      break;
    case "image":
      if (a.image && !/^https:\/\/[^\s]{8,490}$/.test(a.image)) throw new HttpError(400, t("A picture's address starts with https://"));
      // A new picture means a new model: back in the queue (unless the admin then locks it).
      data = { image: a.image, imageFrom: a.image ? "admin" : "", status: "queued", attempts: 0, nextTry: new Date(), locked: false, log: log("image", a.image.slice(0, 120)) };
      break;
    case "strategy":
      data = { strategy: a.strategy, ...(a.strategy === "ai" && !row.url ? { status: "queued", nextTry: new Date(), attempts: 0 } : {}), log: log(`strategy → ${a.strategy || "kind's"}`) };
      break;
  }
  return adminView(await prisma.product3D.update({ where: { key: a.key }, data }));
}

/** The admin's own model for a product (a .glb made elsewhere): checked, stored, live and locked. */
export async function adminUpload(key: string, bytes: Uint8Array, by: string) {
  const row = await prisma.product3D.findUnique({ where: { key } });
  if (!row) throw new HttpError(404, t("Unknown product"));
  const { triangles } = checkProductModel(bytes);
  const url = await storeModel(key, bytes);
  return adminView(await prisma.product3D.update({ where: { key }, data: { url, bytes: bytes.length, tris: triangles, score: 1, status: "live", locked: true, log: withLog(row, { what: "uploaded", by }) } }));
}

/** Start the runner now (GitHub workflow_dispatch) instead of waiting for its schedule. */
export async function dispatchRunner(limit = 300) {
  const token = process.env.GITHUB_DISPATCH_TOKEN, repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new HttpError(501, t("Set GITHUB_DISPATCH_TOKEN and GITHUB_REPO to start the runner from here"));
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/product3d.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "streetquest", "content-type": "application/json" },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME || "main", inputs: { limit: String(Math.max(1, Math.min(2000, limit))) } }),
  });
  if (r.status !== 204) throw new HttpError(502, t("GitHub refused to start the runner ({status})", { status: r.status }));
  return { started: true };
}
