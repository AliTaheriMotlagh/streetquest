// Development only (404 in production): /dev/voices saves the lines it speaks here, into
// assets/voices/raw/<id>-<voice>.wav, for `npm run assets:voices -- --from=assets/voices/raw`.
//   GET            the lines already saved
//   POST ?file=    one line's WAV (only the game's own file names)
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BARKS, barkFile } from "@/lib/street/barks";

const DIR = join(process.cwd(), "assets/voices/raw");
const NAMES = new Set(BARKS.flatMap((b) => b.voices.map((v) => barkFile(b, v).replace(/\.mp3$/, ".wav"))));
const off = () => process.env.NODE_ENV === "production";

export async function GET() {
  if (off()) return new Response(null, { status: 404 });
  mkdirSync(DIR, { recursive: true });
  return Response.json({ saved: readdirSync(DIR).filter((f) => NAMES.has(f)) });
}

export async function POST(req: Request) {
  if (off()) return new Response(null, { status: 404 });
  const file = new URL(req.url).searchParams.get("file") ?? "";
  if (!NAMES.has(file)) return new Response("Not a line", { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  // A WAV, and not an absurd one.
  if (buf.length < 1000 || buf.length > 5_000_000 || buf.subarray(0, 4).toString() !== "RIFF") return new Response("Not a WAV", { status: 400 });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, file), buf);
  return Response.json({ ok: true });
}
