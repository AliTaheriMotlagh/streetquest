// The product → 3D model pipeline's rules (pure; tests/product3d.test.ts). One row per distinct product (server/
// product3d.ts, model Product3D), shared by every store that sells it: the same Snappfood photo is one job however many
// menus list it, and a product without a photo is one job per name. The runner (scripts/product3d/worker.ts on GitHub
// Actions) claims jobs, the server leases them, takes the result back, scores it and decides what the game shows.
//
//   queued ──claim──▶ working ──result ok, score ≥ AUTO_LIVE──▶ live         (the game loads its model)
//                        │      └──────── ok, score ≥ REVIEW ───▶ review       (shown as the template until approved)
//                        │      └──────── ok, score < REVIEW ───▶ template     (kept for the admin, the game uses the template)
//                        └──error──▶ failed ──backoff──▶ queued … after MAX_ATTEMPTS ──▶ template
//   a lease that runs out (the runner died) puts the job back; a new PIPE_V redoes every unlocked job;
//   an admin's approve / reject / upload locks the row: the pipeline never touches it again until unlocked.
import { KINDS, isKind, normText, wantsAi, type ProductKind } from "./kinds";

/** Bump when the recipe changes (model, resolution, optimiser): every job made with an older one is done again. */
export const PIPE_V = 1;
export const MAX_ATTEMPTS = 4;
/** How long a claimed job is the runner's (one reconstruction is ~1–3 min on a 4-vCPU runner; a batch is claimed at once). */
export const LEASE_MS = 30 * 60_000;
/** Scores (0–1): at or over AUTO_LIVE a model goes straight into the game; between REVIEW and it, an admin decides. */
export const AUTO_LIVE = 0.72;
export const REVIEW = 0.45;
/** Caps for one product's model: what a shelf of 100 of them can afford on a phone. */
export const MODEL_LIMITS = { bytes: 400 * 1024, triangles: 8000 } as const;

export type Status = "queued" | "working" | "review" | "live" | "template" | "failed" | "rejected";
export const STATUSES: Status[] = ["queued", "working", "review", "live", "template", "failed", "rejected"];

/** Snappfood's thumbnails come in sizes (`/200x201/…`); the 640 one is the photo the model is made from. */
export function fullPhoto(url: string): string {
  if (!url) return "";
  return url.replace(/(cdn\.snappfood\.ir)\/\d+x\d+\//, "$1/640x640/");
}

/** FNV-1a, two seeds → 16 hex digits: short, stable, no crypto needed (keys only have to not collide by accident). */
function hash64(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** A product's identity: its photo (the same picture is the same thing, in any store), else its name. */
export function productKey(it: { title: string; photo?: string }): string {
  const p = it.photo ? fullPhoto(it.photo).replace(/^https?:\/\//, "").replace(/[?#].*$/, "") : "";
  return p ? `p${hash64(p)}` : `t${hash64(normText(it.title))}`;
}
export const isProductKey = (s: string) => /^[pt][0-9a-f]{16}$/.test(s);

export type Job = {
  status: Status;
  attempts: number;
  nextTry: number;
  leaseUntil: number | null;
  v: number;
  locked: boolean;
  kind: string;
  strategy: string;
  image: string;
  /** English name (the LLM's): a product without a photo is searched for by it. */
  en: string;
};

/** The runner may take this job now (one with no photo only once it has an English name to search a photo by). */
export function claimable(j: Job, now: number): boolean {
  if (j.locked || !isKind(j.kind) || !wantsAi(j.kind, j.strategy) || (!j.image && !j.en)) return false;
  if (j.status === "queued") return j.nextTry <= now;
  if (j.status === "failed") return j.attempts < MAX_ATTEMPTS && j.nextTry <= now;
  if (j.status === "working") return (j.leaseUntil ?? 0) < now;
  // Made by an older recipe: done again (an admin's choice is locked above).
  if (j.status === "live" || j.status === "review" || j.status === "template") return j.v < PIPE_V;
  return false;
}

/** Waiting before the next try: 10 min, 40 min, 2.7 h, 10.7 h (×4), never past a day; spread by the key so a bad
 *  batch doesn't come back all at once. */
export function backoffMs(attempts: number, key = ""): number {
  const base = Math.min(24 * 3600_000, 10 * 60_000 * 4 ** Math.max(0, attempts - 1));
  const jitter = ((parseInt(key.slice(1, 5) || "0", 16) % 1000) / 1000) * 0.2;
  return Math.round(base * (1 + jitter));
}

/** Why a reconstruction failed, as the runner reports it: some are worth a retry, some never will be. */
export type Failure = "image" | "cutout" | "reconstruct" | "optimize" | "check" | "upload" | "timeout" | "other";
const PERMANENT = new Set<Failure>(["cutout", "check"]);

/** What a failure does to the job. A permanent one (no object in the photo, a model the checks refuse) goes
 *  straight to the template; the rest wait and try again, up to MAX_ATTEMPTS. */
export function afterFailure(j: { attempts: number }, why: Failure, key: string, now: number): { status: Status; nextTry: number } {
  if (PERMANENT.has(why) || j.attempts >= MAX_ATTEMPTS) return { status: "template", nextTry: now };
  return { status: "failed", nextTry: now + backoffMs(j.attempts, key) };
}

/** What the runner measured about a finished model (scripts/product3d/reconstruct.py + worker.ts). */
export type ModelStats = {
  triangles: number;
  bytes: number;
  /** Bounding box (any unit — only the proportions are compared). */
  box: [number, number, number];
  /** Share of the photo that is the object after the background is cut (0–1). */
  fg: number;
  /** Separate pieces in the mesh (a clean object is 1–3; dozens = noise). */
  parts: number;
  /** Spread of the vertex colours (0 = all one grey: the colour didn't come through). */
  colorVar: number;
};

/** 0–1: does this look like a usable model of a thing of this kind? Five checks, each 0–1, weighted. */
export function scoreModel(kind: ProductKind, s: ModelStats): { score: number; why: string[] } {
  const why: string[] = [];
  const [w, h, d] = KINDS[kind].size;
  // Proportions: height against the wider side, compared with the kind's (a can is ~1.8× taller than wide).
  const want = h / Math.max(w, d);
  const got = s.box[1] / Math.max(1e-6, Math.max(s.box[0], s.box[2]));
  const ratio = Math.min(want, got) / Math.max(want, got);
  const shape = Math.min(1, ratio * 1.6);
  if (shape < 0.6) why.push("proportions");
  const fg = s.fg < 0.04 ? 0 : s.fg > 0.97 ? 0.2 : s.fg < 0.1 ? 0.5 : 1;
  if (fg < 1) why.push("cutout");
  const parts = s.parts <= 3 ? 1 : s.parts <= 8 ? 0.6 : s.parts <= 20 ? 0.3 : 0;
  if (parts < 1) why.push("pieces");
  const color = Math.min(1, s.colorVar / 0.06);
  if (color < 0.5) why.push("colour");
  const tris = s.triangles < 200 ? 0.2 : s.triangles > MODEL_LIMITS.triangles ? 0.4 : 1;
  const bytes = s.bytes > MODEL_LIMITS.bytes ? 0.3 : 1;
  if (tris < 1 || bytes < 1) why.push("size");
  const score = 0.35 * shape + 0.2 * fg + 0.2 * parts + 0.15 * color + 0.05 * tris + 0.05 * bytes;
  return { score: Math.round(score * 100) / 100, why };
}

/** Where a finished model goes by its score. */
export const statusForScore = (score: number): Status => (score >= AUTO_LIVE ? "live" : score >= REVIEW ? "review" : "template");

/** What the game draws for a product: its model when live, else the template (with the photo when there is one). */
export function gameLook(row: { status: string; url: string; kind: string } | null | undefined): { model: string | null; kind: ProductKind | null } {
  if (!row) return { model: null, kind: null };
  return { model: row.status === "live" && row.url ? row.url : null, kind: isKind(row.kind) ? row.kind : null };
}

/** The order jobs are worked in: products more stores sell first, then ones with a photo, then the newest. */
export function priority(r: { stores: number; image: string; seenAt: number }): number {
  return Math.log2(1 + r.stores) * 10 + (r.image ? 5 : 0) + r.seenAt / 1e13;
}
