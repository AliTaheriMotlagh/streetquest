// A line people say in the open city, spoken (server/tts.ts): ?id=<bark id>&v=m|f|cop&k=<key>.
// `k` is the line's own hash (barkKey): a new wording is a new address, so the year-long
// immutable cache (Vercel's CDN and every phone) never serves old words — and any other `k`
// is refused, so the cache can't be busted on purpose. No login: the answer is the same
// for everyone (that's what lets the CDN keep it).
import { barkById, barkKey, type VoiceKind } from "@/lib/street/barks";
import { speakBark, ttsReady } from "@/server/tts";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const b = barkById(q.get("id") ?? ""), v = q.get("v") as VoiceKind;
  if (!b || !b.voices.includes(v) || q.get("k") !== barkKey(b, v)) return new Response("Not a line", { status: 400 });
  // Not set up (or the service failed): a short-lived "no" (so it's asked again once there's a key).
  const none = () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
  if (!ttsReady()) return none();
  const audio = await speakBark(b, v);
  if (!audio) return none();
  return new Response(audio, {
    headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable", "content-length": String(audio.byteLength) },
  });
}
