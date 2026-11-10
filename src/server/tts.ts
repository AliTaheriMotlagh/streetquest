// Spoken Persian for what people in the open city say (lib/street/barks.ts), made on the
// server — Vercel's servers abroad can reach the speech services that phones in Iran can't —
// and then cached by everyone: /api/tts answers each line once per voice with a year-long,
// immutable cache header, so Vercel's CDN keeps it and every phone keeps its own copy.
// Only the game's own lines are ever spoken (never text from the request), so it can't be
// used to run up the bill. A provider, in this order:
//  - Azure Speech (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION): real Persian neural voices —
//    fa-IR-FaridNeural (a man; the police too, a little firmer) and fa-IR-DilaraNeural
//    (a woman). The free tier (0.5 M characters a month) covers every line many times over.
//  - OpenAI (OPENAI_API_KEY): gpt-4o-mini-tts, told to speak colloquial Tehrani Persian.
// With neither, null (the game shows the speech bubble and stays quiet, or uses recordings).
import type { Bark, VoiceKind } from "../lib/street/barks";

const TIMEOUT_MS = 15_000;
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Is any speech service set up? */
export const ttsReady = () => !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) || !!process.env.OPENAI_API_KEY;

async function post(url: string, headers: Record<string, string>, body: string): Promise<ArrayBuffer | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctl.signal });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 200 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function azure(b: Bark, v: VoiceKind) {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return Promise.resolve(null);
  const voice = v === "f" ? "fa-IR-DilaraNeural" : "fa-IR-FaridNeural";
  // A shout a touch faster; the police firmer and lower.
  const rate = b.fa.includes("!") ? "+8%" : "+0%", pitch = v === "cop" ? "-6%" : "+0%";
  const ssml = `<speak version="1.0" xml:lang="fa-IR"><voice name="${voice}"><prosody rate="${rate}" pitch="${pitch}">${esc(b.fa)}</prosody></voice></speak>`;
  return post(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "StreetQuest" },
    ssml,
  );
}

function openai(b: Bark, v: VoiceKind) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve(null);
  const who = v === "f" ? "a woman from Tehran" : v === "cop" ? "a Tehran police officer giving orders, firm and loud" : "a man from Tehran";
  return post(
    "https://api.openai.com/v1/audio/speech",
    { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: v === "f" ? "nova" : "onyx",
      input: b.fa,
      instructions: `Speak in natural, colloquial Tehrani Persian (Farsi), as ${who} on the street. Short and expressive, not like a newsreader.`,
      response_format: "mp3",
    }),
  );
}

/** The line spoken in this voice (mp3), or null (no provider, or it failed). */
export async function speakBark(b: Bark, v: VoiceKind): Promise<ArrayBuffer | null> {
  return (await azure(b, v)) ?? (await openai(b, v));
}
