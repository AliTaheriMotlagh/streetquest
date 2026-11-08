// Find and fetch 3D models from Sketchfab for the game's asset pipelines (assets:cars, and the
// weapons / characters / props ones to come). Sources land in assets/models/<kind>/ (big, not
// in git); every download is credited in assets/credits.json (in git), so a build can put the
// credit on /credits.
//
//   npm run assets:find -- "assault rifle"                 CC BY / CC0 downloadable models, most liked first
//   npm run assets:find -- "sedan" --max-faces=60000 --n=20
//   npm run assets:get -- <uid> --kind=weapon [--as=rifle]  download one (needs SKETCHFAB_TOKEN)
//
// Only CC BY and CC0 models are listed or downloaded, and nothing that names another game or
// calls itself a rip (lib/assetLicense). Downloading needs your own API token (free account:
// sketchfab.com → Settings → Password & API → API token) in .env as SKETCHFAB_TOKEN.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { licenseSlug, looksRipped, OK_LICENSES, slugify, usableLicense, type Credit } from "../src/lib/assetLicense";

const ROOT = path.resolve(import.meta.dirname, "..");
const CREDITS = path.join(ROOT, "assets/credits.json");
const API = "https://api.sketchfab.com/v3";
const KINDS = ["weapon", "character", "car", "prop", "building", "fx"];

type Model = {
  uid: string;
  name: string;
  description?: string;
  viewerUrl: string;
  faceCount: number;
  likeCount: number;
  isDownloadable: boolean;
  license?: { slug?: string; label?: string } | null;
  user: { username: string; displayName?: string };
  tags?: { name: string }[];
};

// argv: [node, script, "find" | "get", ...words and --flags]
const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const words = rest.filter((a) => !a.startsWith("--"));

async function getJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json", ...(token ? { authorization: `Token ${token}` } : {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url.replace(/token=[^&]+/, "token=…")}`);
  return (await res.json()) as T;
}

const ripText = (m: Model) => [m.name, m.description ?? "", ...(m.tags ?? []).map((t) => t.name)].join(" ");

async function find() {
  const q = words.join(" ");
  if (!q) throw new Error('Say what to look for: npm run assets:find -- "assault rifle"');
  const max = Number(arg("max-faces") ?? 150_000), n = Number(arg("n") ?? 15);
  const out: Model[] = [];
  // Sketchfab filters one license per query; ask for each one we accept.
  for (const license of Object.keys(OK_LICENSES)) {
    let url: string | null = `${API}/search?type=models&downloadable=true&license=${license}&sort_by=-likeCount&count=24&q=${encodeURIComponent(q)}&max_face_count=${max}`;
    for (let page = 0; url && page < 3; page++) {
      const r: { results: Model[]; next: string | null } = await getJson(url);
      out.push(...r.results);
      url = r.next;
    }
  }
  const seen = new Set<string>();
  const ok = out
    .filter((m) => !seen.has(m.uid) && seen.add(m.uid))
    .filter((m) => m.isDownloadable && usableLicense(m.license) && !looksRipped(ripText(m)))
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, n);
  if (!ok.length) return console.log("Nothing usable (CC BY / CC0, not from another game) — try other words.");
  for (const m of ok) console.log([m.uid, `${m.likeCount}♥`.padStart(6), `${Math.round(m.faceCount / 1000)}k tris`.padStart(10), OK_LICENSES[licenseSlug(m.license)!].padEnd(10), `${m.name} — ${m.user.displayName || m.user.username}`].join("  "));
  console.log(`\nnpm run assets:get -- <uid> --kind=${KINDS.join("|")}`);
}

async function get() {
  const uid = words[0];
  const kind = arg("kind") ?? "";
  if (!uid || !KINDS.includes(kind)) throw new Error(`npm run assets:get -- <uid> --kind=${KINDS.join("|")} [--as=name]`);
  const token = process.env.SKETCHFAB_TOKEN;
  if (!token) throw new Error("Set SKETCHFAB_TOKEN in .env (sketchfab.com → Settings → Password & API → API token).");
  const m = await getJson<Model>(`${API}/models/${uid}`);
  // Checked again here: a uid can come from anywhere.
  if (!usableLicense(m.license)) throw new Error(`${m.name}: license "${m.license?.label ?? "?"}" isn't CC BY or CC0 — not usable.`);
  if (looksRipped(ripText(m))) throw new Error(`${m.name}: looks like it comes from another game — not usable.`);
  const dl = await getJson<{ glb?: { url: string; size: number }; gltf?: { url: string; size: number } }>(`${API}/models/${uid}/download`, token);
  if (!dl.glb) throw new Error(`${m.name}: no .glb offered (only ${Object.keys(dl).join(", ")}) — pick another model.`);
  const name = slugify(arg("as") ?? m.name);
  const dir = path.join(ROOT, "assets/models", kind);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.glb`);
  const res = await fetch(dl.glb.url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, bytes);
  const credits: Credit[] = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, "utf8")) : [];
  const credit: Credit = {
    uid, title: m.name, author: m.user.displayName || m.user.username, url: m.viewerUrl, license: OK_LICENSES[licenseSlug(m.license)!],
    kind, file: path.relative(ROOT, file), faces: m.faceCount, at: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(CREDITS, JSON.stringify([...credits.filter((c) => c.uid !== uid), credit].sort((a, b) => a.file.localeCompare(b.file)), null, 2) + "\n");
  console.log(`${credit.file}  ${(bytes.length / 1e6).toFixed(1)} MB  ${m.faceCount} tris  ${credit.license}  by ${credit.author}`);
}

(command === "get" ? get : find)().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
