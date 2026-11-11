// Development only: a saved raw line, to listen to on /dev/voices (?file=<id>-<voice>.wav).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jobsFor, VOICE_LANGS } from "@/lib/street/voiceLang";

const NAMES = new Set(VOICE_LANGS.flatMap((l) => jobsFor(l).map((j) => j.raw)));

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file") ?? "";
  const path = join(process.cwd(), "assets/voices/raw", file);
  if (process.env.NODE_ENV === "production" || !NAMES.has(file) || !existsSync(path)) return new Response(null, { status: 404 });
  return new Response(readFileSync(path), { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
}
