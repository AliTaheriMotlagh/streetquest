// Developers (and admins on the live site): /dev/voices asks a Hugging Face text-to-speech model
// for a line (the token stays on the server). POST { model: "owner/name", text } → the audio.
// Needs HF_TOKEN (a token from huggingface.co/settings/tokens with "Make calls to Inference
// Providers"). Hugging Face no longer runs TTS models itself: the official client sends each
// model to whichever provider hosts it (fal-ai, DeepInfra, Together…), paid from the account's
// Inference Providers credits — when they run out, the error says so plainly.
import { InferenceClient } from "@huggingface/inference";
import { hfError, validHfModel } from "@/lib/voiceTools";
import { devAllowed } from "@/server/devAccess";

export async function POST(req: Request) {
  if (!(await devAllowed())) return new Response(null, { status: 404 });
  const token = process.env.HF_TOKEN;
  if (!token) return new Response("Put HF_TOKEN in .env (huggingface.co/settings/tokens) and restart the dev server", { status: 400 });
  const { model, text } = (await req.json().catch(() => ({}))) as { model?: string; text?: string };
  if (!model || !validHfModel(model) || !text || text.length > 600) return new Response("model (owner/name) and text (≤ 600 characters) please", { status: 400 });
  try {
    const audio = await new InferenceClient(token).textToSpeech({ model: model.trim(), provider: "auto", inputs: text }, { signal: AbortSignal.timeout(90_000) });
    return new Response(await audio.arrayBuffer(), { headers: { "content-type": audio.type || "audio/wav" } });
  } catch (e) {
    const { status, message } = hfError((e as Error).message);
    return new Response(message, { status });
  }
}
