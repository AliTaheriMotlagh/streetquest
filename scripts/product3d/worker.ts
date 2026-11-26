// The product → 3D model runner (GitHub Actions: .github/workflows/product3d.yml; or a Mac: `npm run product3d`).
// Talks to the game's server (APP_URL, PRODUCT3D_TOKEN → /api/product3d/work), never to the database:
//
//   1. sweep the cached menus into the queue (BACKFILL=1)
//   2. classify: products the rules weren't sure of → the small LLM (scripts/product3d/ai-server.sh, LLM_URL), 25 a
//      request, answers held to a JSON schema; also gives each an English name to search a photo by
//   3. reconstruct: claim a few jobs at a time → get the photo (direct, else through the server's relay, else search
//      Torob / Wikimedia Commons for a product without one) → reconstruct.py (TripoSR, kept loaded) → simplify +
//      compress (gltf-transform + meshoptimizer) → report the .glb and its measurements (the server scores it)
//
// Every step retries what's worth retrying, a stuck reconstruction is killed after JOB_TIMEOUT and reported, a photo
// that fails is reported (the server backs off), and nothing is claimed once less than 8 minutes of BUDGET_MIN is left
// (claimed jobs that never come back return to the queue when their lease runs out). Prints a summary and, on GitHub,
// writes it to the step summary and `left=<n>` to $GITHUB_OUTPUT (the workflow starts another run while work is left).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import * as F from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { readAnswer, SCHEMA, searchText, SYSTEM, userPrompt, type ToClassify } from "../../src/lib/product3d/classifyPrompt";
import { KINDS, isKind } from "../../src/lib/product3d/kinds";
import { MODEL_LIMITS } from "../../src/lib/product3d/pipeline";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.PRODUCT3D_TOKEN ?? "";
const P3D_DIR = process.env.P3D_DIR ?? path.join(process.env.HOME ?? ".", ".cache/streetquest-3d");
const LLM_URL = process.env.LLM_URL ?? ""; // e.g. http://127.0.0.1:8080 (ai-server.sh); empty = skip classifying
const LIMIT = Number(process.env.LIMIT ?? 300);
const BUDGET_MS = Number(process.env.BUDGET_MIN ?? 300) * 60_000;
const BATCH = Number(process.env.BATCH ?? 4);
const RES = Number(process.env.MC_RES ?? 192);
const JOB_TIMEOUT = Number(process.env.JOB_TIMEOUT_S ?? 420) * 1000;
const WORKER = (process.env.WORKER ?? (process.env.GITHUB_RUN_ID ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : `local-${process.pid}`)).slice(0, 60);
const UA = `StreetQuest-3D/1.0${process.env.P3D_CONTACT ? ` (${process.env.P3D_CONTACT})` : ""}`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const started = Date.now();
const left = () => BUDGET_MS - (Date.now() - started);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** fetch with retries on network errors and 429/5xx (1 s, 4 s, 9 s), a timeout per try. */
async function fetchRetry(url: string, init: RequestInit = {}, tries = 3, timeoutMs = 30_000): Promise<Response> {
  let last: unknown;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status !== 429 && r.status < 500) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    if (i < tries) await sleep(i * i * 1000);
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function work<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetchRetry(`${APP}/api/product3d/work`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) }, 4, 90_000);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(`${body.op}: ${r.status} ${j.error ?? ""}`);
  return j;
}

// ── 2. Classify ──────────────────────────────────────────────────────────────────────────────────────────────────

async function classifyAll(maxMs: number) {
  if (!LLM_URL) return say("classify: no LLM_URL, skipped");
  const until = Date.now() + maxMs;
  let done = 0, asked = 0;
  while (Date.now() < until) {
    const { items } = await work<{ items: ToClassify[] }>({ op: "toClassify", n: 25 });
    if (!items.length) break;
    asked += items.length;
    let answers: ReturnType<typeof readAnswer> = [];
    for (let attempt = 1; attempt <= 2 && !answers.length; attempt++) {
      try {
        const r = await fetchRetry(`${LLM_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt(items) }],
            temperature: 0, max_tokens: 1800, cache_prompt: true,
            response_format: { type: "json_schema", json_schema: { name: "kinds", schema: SCHEMA } },
            chat_template_kwargs: { enable_thinking: false },
          }),
        }, 2, 240_000);
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        answers = readAnswer(items, j.choices?.[0]?.message?.content ?? "");
      } catch (e) {
        say("classify: LLM", (e as Error).message);
      }
    }
    if (!answers.length) {
      say("classify: no usable answer for a batch; stopping");
      break;
    }
    const { applied } = await work<{ applied: number }>({ op: "kinds", worker: WORKER, answers });
    done += applied;
    say(`classify: ${applied}/${items.length}`, answers.slice(0, 3).map((a) => `${a.kind}:${a.en}`).join(", "));
    // The same rows would come back if none were applied (e.g. all locked meanwhile): don't loop on them.
    if (!applied) break;
  }
  say(`classify: ${done} of ${asked} named`);
  return { done, asked };
}

// ── 3. Reconstruct ───────────────────────────────────────────────────────────────────────────────────────────────

type Job = { key: string; title: string; section: string; about: string; kind: string; en: string; image: string; imageFrom: string; attempt: number };
type PyOut = { id: string; ok: boolean; why?: string; error?: string; fg?: number; parts?: number; colorVar?: number; box?: [number, number, number]; triangles?: number; seconds?: number };

/** The Python side (TripoSR loaded once). Restarted after a timeout or a crash. */
class Recon {
  private p: ChildProcessWithoutNullStreams | null = null;
  private waiting = new Map<string, (o: PyOut) => void>();
  private ready: Promise<void> | null = null;
  start() {
    if (this.ready) return this.ready;
    const py = path.join(P3D_DIR, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const p = spawn(py, ["-I", path.join(HERE, "reconstruct.py")], { env: { ...process.env, P3D_DIR }, stdio: ["pipe", "pipe", "pipe"] });
    this.p = p;
    p.stderr.on("data", (d) => process.stderr.write(`  [py] ${d}`));
    this.ready = new Promise((resolve, reject) => {
      const rl = createInterface({ input: p.stdout });
      rl.on("line", (line) => {
        let o: PyOut & { ready?: boolean };
        try {
          o = JSON.parse(line);
        } catch {
          return;
        }
        if (o.ready) return resolve();
        this.waiting.get(o.id)?.(o);
        this.waiting.delete(o.id);
      });
      p.on("exit", (code) => {
        reject(new Error(`reconstruct.py exited (${code})`));
        for (const [id, cb] of this.waiting) cb({ id, ok: false, why: "reconstruct", error: `the reconstructor stopped (${code})` });
        this.waiting.clear();
        this.p = null;
        this.ready = null;
      });
    });
    return this.ready;
  }
  stop() {
    this.p?.kill("SIGKILL");
    this.p = null;
    this.ready = null;
  }
  async run(id: string, image: string, out: string): Promise<PyOut> {
    await this.start();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        this.stop();
        resolve({ id, ok: false, why: "timeout", error: `over ${JOB_TIMEOUT / 1000}s` });
      }, JOB_TIMEOUT);
      this.waiting.set(id, (o) => (clearTimeout(timer), resolve(o)));
      this.p!.stdin.write(JSON.stringify({ id, image, out, res: RES }) + "\n");
    });
  }
}

/** The photo's bytes: straight from its host, else through the game's server (which reaches Iranian hosts via the relay). */
async function getPhoto(url: string): Promise<Uint8Array> {
  const ok = async (r: Response) => {
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) throw new Error(`HTTP ${r.status} ${type}`);
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length < 2000) throw new Error("too small");
    return b;
  };
  try {
    return await ok(await fetchRetry(url, { headers: { "user-agent": UA } }, 2, 20_000));
  } catch {
    return ok(await fetchRetry(`${APP}/api/product3d/work?u=${encodeURIComponent(url)}`, { headers: { authorization: `Bearer ${TOKEN}` } }, 2, 40_000));
  }
}

let torobCalls = 0;
const TOROB_MAX = Number(process.env.TOROB_MAX ?? 150);
/** A photo for a product its menu has none of: Torob's product shots (packaged goods, by the Persian name; politely
 *  spaced, capped per run), else Wikimedia Commons (by the English name). */
async function findPhoto(j: Job): Promise<{ image: string; from: string } | null> {
  const packaged = isKind(j.kind) && ["front"].includes(KINDS[j.kind].photo) && !["fruit", "melon", "herbs", "meat"].includes(j.kind);
  const q = searchText(j.title);
  if (packaged && q && torobCalls < TOROB_MAX) {
    torobCalls++;
    await sleep(3000);
    try {
      const r = await fetchRetry(`https://api.torob.com/v4/base-product/search/?q=${encodeURIComponent(q)}&page=0&size=5`, { headers: { "user-agent": UA, accept: "application/json" } }, 2, 20_000);
      const d = (await r.json()) as { results?: { image_url?: string; name1?: string }[] };
      const hit = d.results?.find((x) => x.image_url?.startsWith("https://"));
      if (hit?.image_url) return { image: hit.image_url, from: "search:torob" };
    } catch {
      /* next source */
    }
  }
  if (j.en) {
    try {
      const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(`${j.en} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=640`;
      const r = await fetchRetry(u, { headers: { "user-agent": UA } }, 2, 20_000);
      const d = (await r.json()) as { query?: { pages?: Record<string, { index?: number; imageinfo?: { thumburl?: string; mime?: string }[] }> } };
      const pages = Object.values(d.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const hit = pages.map((p) => p.imageinfo?.[0]).find((i) => i?.thumburl && /jpeg|png|webp/.test(i.mime ?? ""));
      if (hit?.thumburl) return { image: hit.thumburl, from: "search:commons" };
    } catch {
      /* none */
    }
  }
  return null;
}

let io: NodeIO | null = null;
/** Raw TripoSR mesh → welded, simplified to the triangle budget, quantised, meshopt-compressed (the game's loader reads it). */
export async function optimise(raw: Uint8Array): Promise<Uint8Array> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  io ??= new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.readBinary(raw);
  await doc.transform(F.dedup(), F.prune(), F.weld());
  // A product is a few centimetres on screen: 2 % of its size is invisible error. Still over budget (noisy meshes),
  // a second pass may go to 6 %.
  const target = MODEL_LIMITS.triangles * 0.75;
  const count = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + Math.floor((p.getIndices()?.getCount() ?? 0) / 3), 0), 0);
  for (const error of [0.02, 0.06]) {
    const now = count();
    if (now <= target) break;
    await doc.transform(F.simplify({ simplifier: MeshoptSimplifier, ratio: target / now, error, lockBorder: false }));
  }
  // TripoSR's colours are baked lighting on a matte object: no metal (glTF's default metalness is 1 — black without
  // an environment), fairly rough, white base so the vertex colours show as they are.
  for (const m of doc.getRoot().listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.75).setBaseColorFactor([1, 1, 1, 1]);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await doc.transform(F.prune(), F.meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return io.writeBinary(doc);
}

async function reconstructAll() {
  const recon = new Recon();
  const dir = mkdtempSync(path.join(tmpdir(), "p3d-"));
  const tally = { made: 0, failed: 0, statuses: {} as Record<string, number>, seconds: [] as number[] };
  let claimed = 0;
  try {
    await recon.start();
    while (claimed < LIMIT && left() > 8 * 60_000) {
      const { jobs } = await work<{ jobs: Job[] }>({ op: "claim", n: Math.min(BATCH, LIMIT - claimed), worker: WORKER });
      if (!jobs.length) break;
      claimed += jobs.length;
      for (const j of jobs) {
        const t0 = Date.now();
        let image = j.image, imageFrom = j.imageFrom;
        const fail = async (why: string, error: string) => {
          tally.failed++;
          const r = await work<{ status: string }>({ op: "result", worker: WORKER, result: { key: j.key, ok: false, why, error: error.slice(0, 400), ...(image !== j.image ? { image, imageFrom } : {}) } }).catch((e) => ({ status: `report failed: ${(e as Error).message}` }));
          tally.statuses[r.status] = (tally.statuses[r.status] ?? 0) + 1;
          say(`✗ ${j.key} ${j.kind} «${j.title}» ${why}: ${error.slice(0, 100)} → ${r.status}`);
        };
        if (!image) {
          const found = await findPhoto(j);
          if (!found) {
            await fail("image", "no photo found");
            continue;
          }
          (image = found.image), (imageFrom = found.from);
        }
        const src = path.join(dir, `${j.key}.img`), out = path.join(dir, `${j.key}.glb`);
        try {
          writeFileSync(src, await getPhoto(image));
        } catch (e) {
          await fail("image", (e as Error).message);
          continue;
        }
        const py = await recon.run(j.key, src, out);
        if (!py.ok) {
          await fail(py.why ?? "reconstruct", py.error ?? "");
          continue;
        }
        let glb: Uint8Array;
        try {
          glb = await optimise(new Uint8Array(readFileSync(out)));
        } catch (e) {
          await fail("optimize", (e as Error).message);
          continue;
        }
        const stats = { triangles: 0, bytes: glb.length, box: py.box!, fg: py.fg!, parts: py.parts!, colorVar: py.colorVar! };
        const r = await work<{ status: string; score?: number }>({ op: "result", worker: WORKER, result: { key: j.key, ok: true, glb: Buffer.from(glb).toString("base64"), stats, seconds: (Date.now() - t0) / 1000, ...(image !== j.image ? { image, imageFrom } : {}) } }).catch((e) => ({ status: `report failed: ${(e as Error).message}`, score: undefined }));
        tally.made++;
        tally.seconds.push((Date.now() - t0) / 1000);
        tally.statuses[r.status] = (tally.statuses[r.status] ?? 0) + 1;
        say(`✓ ${j.key} ${j.kind} «${j.title}» ${Math.round(glb.length / 1024)} KB, ${py.seconds}s recon → ${r.status}${r.score != null ? ` (${r.score})` : ""}`);
        rmSync(src, { force: true });
        rmSync(out, { force: true });
      }
    }
  } finally {
    recon.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  return { claimed, ...tally };
}

async function main() {
  if (TOKEN.length < 16) throw new Error("PRODUCT3D_TOKEN is missing (16+ characters, the same as the server's)");
  say(`runner ${WORKER} → ${APP}; limit ${LIMIT}, budget ${BUDGET_MS / 60_000} min, batch ${BATCH}, mc ${RES}`);
  if (process.env.BACKFILL === "1") say("backfill", await work({ op: "backfill" }));
  const cls = process.env.SKIP_CLASSIFY === "1" ? null : await classifyAll(Math.min(left() / 4, 45 * 60_000));
  if (process.env.CLASSIFY_ONLY === "1") return;
  const r = process.env.SKIP_RECON === "1" ? null : await reconstructAll();
  const p = await work<{ jobs: number; classify: number }>({ op: "pending" });
  const avg = r?.seconds.length ? Math.round(r.seconds.reduce((a, b) => a + b, 0) / r.seconds.length) : 0;
  const summary = [
    `### Product models — ${WORKER}`,
    `| | |`, `|---|---|`,
    `| classified | ${cls ? `${cls.done} of ${cls.asked}` : "skipped"} |`,
    `| claimed | ${r?.claimed ?? 0} |`, `| made | ${r?.made ?? 0} (avg ${avg}s) |`, `| failed | ${r?.failed ?? 0} |`,
    `| outcome | ${Object.entries(r?.statuses ?? {}).map(([k, v]) => `${k} ${v}`).join(", ") || "-"} |`,
    `| left | ${p.jobs} to make, ${p.classify} to classify |`,
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  // Chain only when this run got something done (never loop on jobs that can't be done).
  const progress = (r?.made ?? 0) + (r?.failed ?? 0) + (cls?.done ?? 0);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `left=${progress > 0 ? p.jobs + p.classify : 0}\n`);
}

// Run as a script (not when a test imports optimise).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
