"use client";
// The /dev/voices page: Piper (@mintplex-labs/piper-tts-web, MIT — loaded from the CDN in
// this browser only) speaks each line; each WAV goes to /api/dev/voices. The models
// (~60 MB each) download once and stay in the browser's private storage.
// Everything big comes from this dev server (/api/dev/voices/lib — it downloads each file
// once and keeps it): a 13 MB runtime or a 60 MB model fetched by the browser from the CDNs is
// often cut off on Iran's connections ("WebAssembly compilation aborted").
// Two things the library gets wrong, put right here:
//  - it points the ONNX runtime at the files of 1.18.0, but the runtime it loads is newer
//    (it asks for a file 1.18.0 doesn't have): the files of the version it really loads
//    are used instead (read from its own bundle);
//  - it keeps one model for the whole page whatever voice is asked for: the session is
//    started again for each voice.
import { useEffect, useRef, useState } from "react";
import { jobsFor, lineText, MODELS, VOICE_LANGS, type Job, type VoiceLang } from "@/lib/street/voiceLang";
import { barkKey, type VoiceKind } from "@/lib/street/barks";
import { encodeWav, ENGINE_TYPES, rawNameOf, toMono, trimSilence, ttsUrl, validTemplate, type VoiceEngine } from "@/lib/voiceTools";
import { haaniye } from "./haaniye";

const LIB = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm";
/** This server's copies of the big files (absolute: the runtime resolves them from its own address). */
const local = (path: string) => `${location.origin}/api/dev/voices/lib/${path}`;
/** The voice is chosen per line (lib/street/voiceLang.ts MODELS): Persian men amir, police gyro, women Mimic 3's haaniye (Piper has none — haaniye.ts); English men John/Norman, women LJ Speech/Alba, police Bryce. */
const PHONEMIZER = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js/+esm";
type Session = { predict: (text: string) => Promise<Blob> };
type Piper = {
  TtsSession: { _instance: unknown; WASM_LOCATIONS: { onnxWasm: string; piperData: string; piperWasm: string }; create: (o: { voiceId: string; wasmPaths?: { onnxWasm: string; piperData: string; piperWasm: string } }) => Promise<Session> };
};

const JOBS: Record<VoiceLang, Job[]> = { fa: jobsFor("fa"), en: jobsFor("en"), tr: jobsFor("tr") };
const LANG_LABEL: Record<VoiceLang, string> = { fa: "فارسی · fa", en: "English · en", tr: "Türkçe · tr" };
const KINDS: VoiceKind[] = ["m", "f", "cop"];
const KIND_LABEL: Record<VoiceKind, string> = { m: "👨 Men", f: "👩 Women", cop: "👮 Police" };
const ENGINE_LABEL: Record<VoiceEngine["type"], string> = { piper: "Piper (in this browser)", server: "The game's speech server", http: "Another TTS (HTTP)", record: "Record / upload only" };
const ENGINES_KEY = "sq_dev_voice_engines";
/** Rate the game's voice files are made at (assets:voices resamples anyway). */
const RATE = 22050;

/** Any audio (a recording, an upload, another TTS's answer) → the 16-bit mono WAV the pipeline reads. */
async function toWav(data: ArrayBuffer, trim = false): Promise<ArrayBuffer> {
  const ctx = new AudioContext();
  try {
    const src = await ctx.decodeAudioData(data.slice(0));
    const off = new OfflineAudioContext(1, Math.ceil(src.duration * RATE), RATE);
    const node = off.createBufferSource();
    node.buffer = src;
    node.connect(off.destination);
    node.start();
    const out = await off.startRendering();
    const mono = toMono([out.getChannelData(0)]);
    return encodeWav(trim ? trimSilence(mono, RATE) : mono, RATE);
  } finally {
    void ctx.close();
  }
}

/** The default way each voice is made: Piper where there's a permissive model, else by hand (Turkish). */
const defaultEngine = (lang: VoiceLang, kind: VoiceKind): VoiceEngine => (MODELS.some((m) => m.lang === lang && m.kind === kind && m.hf) || (lang === "fa" && kind === "f") ? { type: "piper" } : { type: "record" });

/** Shared look: dark buttons with light icons (the browser's own were white on white). */
const iconBtn: React.CSSProperties = { verticalAlign: "middle", minWidth: 34, height: 30, padding: "0 8px", marginInlineEnd: 4, borderRadius: 6, border: "1px solid #3a3f49", background: "#23262d", color: "#f2f2f2", fontSize: 14, cursor: "pointer" };
type Paths = { onnxWasm: string; piperData: string; piperWasm: string };

/**
 * Put a model where the library looks for it (the browser's private storage, folder
 * "piper", by file name), from this server — so it never downloads it from Hugging Face.
 */
async function prime(model: string, progress: (s: string) => void) {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("piper", { create: true });
  for (const name of [`${model}.onnx.json`, `${model}.onnx`]) {
    const have = await dir.getFileHandle(name).then((h) => h.getFile()).catch(() => null);
    if (have && have.size > 1000) continue;
    progress(`Getting ${name} from the dev server (the first time it downloads it: a minute or two)…`);
    const res = await fetch(local(`model/${name}`));
    if (!res.ok) throw new Error(`${name}: ${await res.text()}`);
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body!.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      if (total) progress(`${name}: ${Math.round((got * 100) / total)}%`);
    }
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(new Blob(parts as BlobPart[]));
    await w.close();
  }
}

/** The ONNX runtime version the library's bundle really imports (the CDN resolves it). */
async function ortVersion() {
  const src = await (await fetch(LIB)).text();
  return src.match(/onnxruntime-web@([\d.]+)/)?.[1] ?? "1.27.0";
}

export default function VoiceMaker() {
  const [lang, setLang] = useState<VoiceLang>("fa");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [redo, setRedo] = useState(false);
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [engines, setEngines] = useState<Record<string, VoiceEngine>>({});
  /** Piper (and its runtime paths), loaded once; the voice that is running now (one at a time: a model is ~60 MB). */
  const engine = useRef<{ tts: Piper; ver: string; paths: Paths } | null>(null);
  const current = useRef<{ model: string; session: Session } | null>(null);
  const rec = useRef<{ raw: string; mr: MediaRecorder; chunks: Blob[] } | null>(null);
  const refresh = () => void fetch("/api/dev/voices").then((r) => r.json()).then((r: { saved: string[] }) => setSaved(new Set(r.saved)));
  useEffect(() => {
    refresh();
    try {
      setEngines(JSON.parse(localStorage.getItem(ENGINES_KEY) ?? "{}"));
    } catch {}
  }, []);
  const engineOf = (l: VoiceLang, k: VoiceKind): VoiceEngine => engines[`${l}:${k}`] ?? defaultEngine(l, k);
  const setEngine = (l: VoiceLang, k: VoiceKind, e: VoiceEngine) => {
    const next = { ...engines, [`${l}:${k}`]: e };
    setEngines(next);
    try {
      localStorage.setItem(ENGINES_KEY, JSON.stringify(next));
    } catch {}
  };

  const all = JOBS[lang];
  const q = filter.trim().toLowerCase();
  const jobs = q ? all.filter((j) => `${j.raw} ${j.text} ${lineText(j.b, j.v, "en")} ${j.b.s}`.toLowerCase().includes(q)) : all;
  const left = jobs.filter((j) => !saved.has(j.raw));
  const doneCount = all.filter((j) => saved.has(j.raw)).length;

  /** A speaker for a voice (Piper loaded, the model fetched from this server, the session started). */
  const speaker = async (model: string): Promise<Session> => {
    if (current.current?.model === model) return current.current.session;
    current.current = null;
    if (!engine.current) {
      setStatus("Loading Piper…");
      const [tts, ver] = await Promise.all([import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB) as Promise<Piper>, ortVersion()]);
      const paths = { onnxWasm: local(`ort/${ver}/`), piperData: local("piper/piper_phonemize.data"), piperWasm: local("piper/piper_phonemize.wasm") };
      // (Also for anything that makes its own session with the defaults.)
      Object.assign(tts.TtsSession.WASM_LOCATIONS, paths);
      engine.current = { tts, ver, paths };
    }
    const { tts, ver, paths } = engine.current;
    setStatus(`Starting ${model} (the first time it fetches the model: a minute or two)…`);
    let session: Session;
    if (model === "haaniye") {
      const say = await haaniye({
        ortUrl: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ver}/wasm/+esm`,
        phonemizerUrl: PHONEMIZER,
        ...paths,
        file: async (n) => (await fetch(local(`model/${n}`))).arrayBuffer(),
        json: async (n) => (await fetch(local(`model/${n}`))).json(),
      });
      session = { predict: say };
    } else {
      await prime(model, setStatus);
      tts.TtsSession._instance = null;
      session = await tts.TtsSession.create({ voiceId: model, wasmPaths: paths });
    }
    current.current = { model, session };
    return session;
  };

  /** One line spoken by its voice's engine, as a WAV (null: that voice is made by hand). */
  const speak = async (j: Job): Promise<ArrayBuffer | null> => {
    const e = engineOf(j.lang, j.v);
    if (e.type === "record") return null;
    if (e.type === "server") {
      const r = await fetch(`/api/tts?id=${encodeURIComponent(j.b.id)}&v=${j.v}&k=${barkKey(j.b, j.v)}`);
      if (!r.ok || r.status === 204) throw new Error(`the speech server has no voice for ${j.raw} (${r.status})`);
      return toWav(await r.arrayBuffer());
    }
    if (e.type === "http") {
      if (!validTemplate(e.url)) throw new Error("set the TTS address first (with {text} in it)");
      const r = await fetch(ttsUrl(e.url, j.text, j.lang, j.v));
      if (!r.ok) throw new Error(`the TTS answered ${r.status} for ${j.raw}`);
      return toWav(await r.arrayBuffer());
    }
    const wav = await (await speaker(j.model.id)).predict(j.text);
    return wav.arrayBuffer();
  };

  const save = async (raw: string, wav: ArrayBuffer) => {
    const r = await fetch(`/api/dev/voices?file=${encodeURIComponent(raw)}`, { method: "POST", body: wav });
    if (!r.ok) throw new Error(`${raw}: ${await r.text()}`);
    setSaved((s) => new Set(s).add(raw));
  };

  /** Speak these lines, voice by voice, saving each (the page stays usable: errors stop only this run). */
  const make = async (todo: Job[]) => {
    setBusy(true);
    try {
      let n = 0, byHand = 0;
      // Piper keeps one model at a time: its lines go grouped by model.
      const ordered = [...todo].sort((a, b) => a.model.id.localeCompare(b.model.id));
      for (const j of ordered) {
        setStatus(`${++n}/${todo.length} · ${j.raw} · ${j.text}`);
        const wav = await speak(j);
        if (!wav) {
          byHand++;
          continue;
        }
        await save(j.raw, wav);
      }
      setStatus(`Done${byHand ? ` (${byHand} lines are made by hand: record or upload them)` : ""}. Now run: npm run assets:voices -- --from=assets/voices/raw${lang === "fa" ? "" : ` --lang=${lang}`}`);
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Hear a line through its voice's engine without saving it (to choose an engine). */
  const tryLine = async (j: Job) => {
    try {
      setStatus(`Trying ${j.raw}…`);
      const wav = await speak(j);
      if (!wav) return setStatus("That voice is recorded by hand: use 🎙 or ⤒ on a line.");
      play(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
      setStatus("");
    } catch (e) {
      setStatus(`Couldn't: ${(e as Error).message}`);
    }
  };

  /** 🎙: the first press starts the microphone, the second stops and saves the take (silence trimmed). */
  const record = async (j: Job) => {
    const r = rec.current;
    if (r) {
      r.mr.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        rec.current = null;
        setRecording(null);
        try {
          await save(j.raw, await toWav(await new Blob(chunks).arrayBuffer(), true));
          setStatus(`Saved your take of ${j.raw}.`);
        } catch (e) {
          setStatus(`Couldn't save: ${(e as Error).message}`);
        }
      };
      rec.current = { raw: j.raw, mr, chunks };
      setRecording(j.raw);
      mr.start();
      setStatus(`Recording ${j.raw}… say: «${j.text}» — press 🎙 again to stop.`);
    } catch (e) {
      setStatus(`No microphone: ${(e as Error).message}`);
    }
  };

  /** ⤒ one line from a file (any audio: another TTS's output, a studio take). */
  const upload = async (j: Job, f: File | undefined) => {
    if (!f) return;
    try {
      await save(j.raw, await toWav(await f.arrayBuffer()));
      setStatus(`Saved ${f.name} as ${j.raw}.`);
    } catch (e) {
      setStatus(`Couldn't use ${f.name}: ${(e as Error).message}`);
    }
  };

  /** Many files at once, matched to lines by name (greet-3-f.mp3 → that line in this language). */
  const uploadMany = async (files: FileList | null) => {
    if (!files) return;
    const names = new Set(all.map((j) => j.raw));
    let ok = 0, skipped = 0;
    for (const f of Array.from(files)) {
      const raw = rawNameOf(f.name, lang);
      if (!raw || !names.has(raw)) {
        skipped++;
        continue;
      }
      try {
        await save(raw, await toWav(await f.arrayBuffer()));
        ok++;
      } catch {
        skipped++;
      }
    }
    setStatus(`${ok} saved${skipped ? `, ${skipped} skipped (name them like greet-3-f.mp3)` : ""}.`);
  };

  const play = (url: string) => void new Audio(url).play().catch(() => {});
  const rtl = lang === "fa";
  const btn = (primary: boolean): React.CSSProperties => ({ padding: "10px 18px", fontSize: 16, borderRadius: 8, border: primary ? 0 : "1px solid #f0c05a", background: busy ? "#555" : primary ? "#f0c05a" : "transparent", color: primary ? "#1b1300" : "#f0c05a", cursor: busy ? "default" : "pointer" });
  const field: React.CSSProperties = { width: "auto", padding: "6px 8px", borderRadius: 6, border: "1px solid #3a3f49", background: "#0f1115", color: "#eee" };
  /** The site's own label style (small capitals) doesn't belong here. */
  const plain: React.CSSProperties = { textTransform: "none", letterSpacing: "normal", fontSize: 14, fontWeight: 400 };
  /** The line again in another language, to check the words: English beside Persian and Turkish, Persian beside English. */
  const other: VoiceLang = lang === "en" ? "fa" : "en";

  return (
    <main style={{ maxWidth: 980, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#eee", background: "#16181d", borderRadius: 12 }}>
      <h1 style={{ marginTop: 0 }}>Make the street voices</h1>
      <p>
        Every line people say in the game, in each language. Choose how each voice is made — Piper in this browser, the game&apos;s speech server, any other TTS you can reach over HTTP, or your own
        recordings — then generate, record (🎙) or upload (⤒). Each take is saved to <code>assets/voices/raw/</code>; then run <code>npm run assets:voices -- --from=assets/voices/raw</code> (add{" "}
        <code>--lang=en</code> / <code>--lang=tr</code>) and commit <code>public/sounds/voice/</code>.
      </p>
      <p role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VOICE_LANGS.map((l) => (
          <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #f0c05a", background: lang === l ? "#f0c05a" : "transparent", color: lang === l ? "#1b1300" : "#f0c05a" }}>
            {LANG_LABEL[l]} ({JOBS[l].filter((j) => saved.has(j.raw)).length}/{JOBS[l].length})
          </button>
        ))}
      </p>

      <section style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, background: "#1d2026", marginBottom: 12 }}>
        <b>Voices ({lang})</b>
        {KINDS.map((k) => {
          const e = engineOf(lang, k), models = MODELS.filter((m) => m.lang === lang && m.kind === k);
          const sample = all.find((j) => j.v === k);
          return (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ minWidth: 92 }}>{KIND_LABEL[k]}</span>
              <select value={e.type} onChange={(ev) => setEngine(lang, k, ev.target.value === "http" ? { type: "http", url: (e.type === "http" && e.url) || "" } : ({ type: ev.target.value } as VoiceEngine))} style={field} aria-label={`How ${k} lines are made`}>
                {ENGINE_TYPES.filter((t) => t !== "server" || lang === "fa").map((t) => (
                  <option key={t} value={t}>{ENGINE_LABEL[t]}</option>
                ))}
              </select>
              {e.type === "http" && (
                <input value={e.url} onChange={(ev) => setEngine(lang, k, { type: "http", url: ev.target.value })} placeholder="http://localhost:5002/api/tts?text={text}&speaker_id={voice}&language_id={lang}" style={{ ...field, flex: "1 1 320px" }} dir="ltr" aria-label="TTS address" />
              )}
              <span style={{ opacity: 0.6, fontSize: 12 }}>{e.type === "piper" ? models.map((m) => `${m.label} — ${m.licence}`).join(" · ") || "no Piper model: pick another way" : ""}</span>
              {sample && e.type !== "record" && (
                <button style={iconBtn} disabled={busy} onClick={() => void tryLine(sample)} title="Hear a line in this voice (not saved)">▶ Try</button>
              )}
            </div>
          );
        })}
      </section>

      <p style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => void make(redo ? jobs : left)} disabled={busy || (!redo && !left.length)} style={btn(true)}>
          {busy ? "Working…" : left.length ? `Generate missing (${left.length})` : redo ? "Generate again" : "All made ✔"}
        </button>
        <label style={plain}>
          <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} disabled={busy} /> again, even the saved ones
        </label>
        <label style={{ ...btn(false), ...plain, padding: "8px 14px", fontSize: 15 }}>
          ⤒ Upload many (named like greet-3-f.mp3)
          <input type="file" accept="audio/*" multiple hidden onChange={(e) => void uploadMany(e.target.files)} />
        </label>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a line, a situation (shopCall, cop…)…" style={{ ...field, flex: "1 1 220px" }} aria-label="Filter lines" />
      </p>
      <progress value={doneCount} max={all.length} style={{ width: "100%" }} />
      <p style={{ minHeight: 24, opacity: 0.85 }}>{status}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.raw} style={{ borderTop: "1px solid #2c2f36", background: recording === j.raw ? "#3a1d1d" : undefined }}>
              <td style={{ padding: 4 }}>{saved.has(j.raw) ? "✅" : "·"}</td>
              <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                {j.v === "m" ? "👨" : j.v === "f" ? "👩" : "👮"} {j.raw}
                <div style={{ opacity: 0.6, fontSize: 11 }}>{ENGINE_LABEL[engineOf(j.lang, j.v).type]}</div>
              </td>
              <td style={{ padding: 4 }} dir={rtl ? "rtl" : "ltr"}>{j.text}</td>
              <td style={{ padding: 4, opacity: 0.7 }} dir={other === "fa" ? "rtl" : "ltr"}>{lineText(j.b, j.v, other)}</td>
              <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                {engineOf(j.lang, j.v).type !== "record" && (
                  <button style={iconBtn} onClick={() => void make([j])} disabled={busy} title="Generate this line (again)">↻</button>
                )}
                <button style={{ ...iconBtn, background: recording === j.raw ? "#c0392b" : iconBtn.background }} onClick={() => void record(j)} disabled={busy || (!!recording && recording !== j.raw)} title={recording === j.raw ? "Stop and save" : "Record this line with the microphone"}>
                  {recording === j.raw ? "■" : "🎙"}
                </button>
                <label style={{ ...iconBtn, ...plain, display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle" }} title="Upload a file for this line (any audio)">
                  ⤒
                  <input type="file" accept="audio/*" hidden onChange={(e) => void upload(j, e.target.files?.[0])} />
                </label>
                {saved.has(j.raw) && (
                  <button style={iconBtn} onClick={() => play(`/api/dev/voices/play?file=${encodeURIComponent(j.raw)}`)} title="Play the raw take">▶</button>
                )}
                {/* The shipped, filtered file (after npm run assets:voices), to compare with the raw take. */}
                <button style={iconBtn} onClick={() => play(`/sounds/voice/${j.file}`)} title="Play the shipped file (after assets:voices), to compare">▶▶</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
