// Development only (404 in production): /dev/voices asks a Hugging Face text-to-speech model for a
// line here (the token stays on the server). POST { model: "owner/name", text } → the audio.
// Needs HF_TOKEN in .env (a free read token from huggingface.co/settings/tokens). Models that
// Hugging Face doesn't serve answer with its own error, passed on as it is.
import { validHfModel } from "@/lib/voiceTools";

const off = () => process.env.NODE_ENV === "production";

export async function POST(req: Request) {
  if (off()) return new Response(null, { status: 404 });
  const token = process.env.HF_TOKEN;
  if (!token) return new Response("Put HF_TOKEN in .env (huggingface.co/settings/tokens) and restart the dev server", { status: 400 });
  const { model, text } = (await req.json().catch(() => ({}))) as { model?: string; text?: string };
  if (!model || !validHfModel(model) || !text || text.length > 600) return new Response("model (owner/name) and text (≤ 600 characters) please", { status: 400 });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "audio/*" },
      body: JSON.stringify({ inputs: text }),
      signal: ctl.signal,
    });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("audio/")) return new Response(`Hugging Face: ${r.status} ${(await r.text()).slice(0, 300)}`, { status: 502 });
    return new Response(await r.arrayBuffer(), { headers: { "content-type": type } });
  } catch (e) {
    return new Response(`Hugging Face didn't answer: ${(e as Error).message}`, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
