// The game's files to download (lib/gameDownload.ts): every model, the 3D decoder, the fonts and the
// sounds under public/, with their sizes and one version for the whole set. Built with the app (it
// reads the folders once, at build time), so it costs nothing to ask.
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { GAME_DIRS, type GameFile, type GameFiles } from "@/lib/gameDownload";

export const dynamic = "force-static";
/** What the game loads (licence texts and notes stay on the server). */
const GAME_EXT = /\.(glb|gltf|bin|wasm|js|woff2?|mp3|ogg|m4a|json|ktx2|png|jpe?g|webp)$/i;

async function walk(dir: string, base: string, out: GameFile[]) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile() && GAME_EXT.test(e.name)) out.push({ u: `/${path.relative(base, full).split(path.sep).join("/")}`, b: (await stat(full)).size });
  }
}

export async function GET() {
  const pub = path.join(process.cwd(), "public"), files: GameFile[] = [];
  for (const d of GAME_DIRS) await walk(path.join(pub, d), pub, files);
  files.sort((a, b) => a.u.localeCompare(b.u));
  const version = createHash("sha1").update(files.map((f) => `${f.u}:${f.b}`).join("\n")).digest("hex").slice(0, 12);
  return Response.json({ version, files } satisfies GameFiles);
}
