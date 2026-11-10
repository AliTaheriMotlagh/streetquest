// Development only: a saved raw line, to listen to on /dev/voices (?file=<id>-<voice>.wav).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BARKS, barkFile } from "@/lib/street/barks";

const NAMES = new Set(BARKS.flatMap((b) => b.voices.map((v) => barkFile(b, v).replace(/\.mp3$/, ".wav"))));

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file") ?? "";
  const path = join(process.cwd(), "assets/voices/raw", file);
  if (process.env.NODE_ENV === "production" || !NAMES.has(file) || !existsSync(path)) return new Response(null, { status: 404 });
  return new Response(readFileSync(path), { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
}
