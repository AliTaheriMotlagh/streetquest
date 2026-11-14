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
import { encodeWav, ENGINE_TYPES, HF_MODELS, hfLicence, rawNameOf, toMono, trimSilence, ttsUrl, validHfModel, validTemplate, type VoiceEngine } from "@/lib/voiceTools";
import { haaniye } from "./haaniye";
import { piperRun } from "./piperRun";

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
const ENGINE_LABEL: Record<VoiceEngine["type"], string> = { piper: "Piper (in this browser)", server: "The game's speech server (Azure / OpenAI)", hf: "Hugging Face model", http: "Another TTS (HTTP)", record: "Record / upload only" };
/** One line's own engine, when it differs from its voice's (raw name → engine). */
const LINE_ENGINES_KEY = "sq_dev_line_engines";
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
const defaultEngine = (lang: VoiceLang, kind: VoiceKind): VoiceEngine => (MODELS.some((m) => m.lang === lang && m.kind === kind && (m.hf || m.url)) || (lang === "fa" && kind === "f") ? { type: "piper" } : { type: "server" });
/** A saved choice of Piper where there is no Piper voice (the old page offered it for Turkish) is the default instead. */
const usable = (e: VoiceEngine | undefined, lang: VoiceLang, kind: VoiceKind) => (e && !(e.type === "piper" && defaultEngine(lang, kind).type !== "piper") ? e : defaultEngine(lang, kind));

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
  const [lineEng, setLineEng] = useState<Record<string, VoiceEngine>>({});
  const [show, setShow] = useState<"all" | "missing" | "saved">("all");
  const [kindOnly, setKindOnly] = useState<VoiceKind | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  /** The take being compared: the raw one and the shipped one, side by side. */
  const [compare, setCompare] = useState<{ raw: string; file: string; text: string } | null>(null);
  const [err, setErr] = useState(false);
  /** Piper (and its runtime paths), loaded once; the voice that is running now (one at a time: a model is ~60 MB). */
  const engine = useRef<{ tts: Piper; ver: string; paths: Paths } | null>(null);
  const current = useRef<{ model: string; session: Session } | null>(null);
  const rec = useRef<{ raw: string; mr: MediaRecorder; chunks: Blob[] } | null>(null);
  const refresh = () => void fetch("/api/dev/voices").then((r) => r.json()).then((r: { saved: string[] }) => setSaved(new Set(r.saved)));
  useEffect(() => {
    refresh();
    try {
      setEngines(JSON.parse(localStorage.getItem(ENGINES_KEY) ?? "{}"));
      setLineEng(JSON.parse(localStorage.getItem(LINE_ENGINES_KEY) ?? "{}"));
    } catch {}
  }, []);
  /** A line's engine: its own, else its voice's. */
  const engineFor = (j: Job): VoiceEngine => lineEng[j.raw] ?? engineOf(j.lang, j.v);
  const setLineEngine = (raw: string, e: VoiceEngine | null) => {
    const next = { ...lineEng };
    if (e) next[raw] = e;
    else delete next[raw];
    setLineEng(next);
    try {
      localStorage.setItem(LINE_ENGINES_KEY, JSON.stringify(next));
    } catch {}
  };
  const engineOf = (l: VoiceLang, k: VoiceKind): VoiceEngine => usable(engines[`${l}:${k}`], l, k);
  const setEngine = (l: VoiceLang, k: VoiceKind, e: VoiceEngine) => {
    const next = { ...engines, [`${l}:${k}`]: e };
    setEngines(next);
    try {
      localStorage.setItem(ENGINES_KEY, JSON.stringify(next));
    } catch {}
  };

  const all = JOBS[lang];
  const q = filter.trim().toLowerCase();
  const jobs = all.filter(
    (j) =>
      (!q || `${j.raw} ${j.text} ${lineText(j.b, j.v, "en")} ${j.b.s}`.toLowerCase().includes(q)) &&
      (show === "all" || (show === "saved") === saved.has(j.raw)) &&
      (kindOnly === "all" || j.v === kindOnly),
  );
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
    } else if (MODELS.find((m) => m.id === model)?.url) {
      // A Piper voice the library doesn't list (the Turkish ones): this page's own runner.
      const say = await piperRun({
        model,
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
    const e = engineFor(j);
    if (e.type === "hf") {
      if (!validHfModel(e.model)) throw new Error("choose a Hugging Face model (owner/name) first");
      const r = await fetch("/api/dev/voices/hf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: e.model, text: j.text }) });
      if (!r.ok) throw new Error(await r.text());
      return toWav(await r.arrayBuffer(), true);
    }
    if (e.type === "record") return null;
    if (e.type === "server") {
      const r = await fetch(`/api/tts?id=${encodeURIComponent(j.b.id)}&v=${j.v}&k=${barkKey(j.b, j.v, j.lang)}${j.lang === "fa" ? "" : `&l=${j.lang}`}`);
      if (!r.ok) throw new Error(r.status === 404 ? "the speech server isn't set up: put AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (or OPENAI_API_KEY) in .env and restart" : `the speech server answered ${r.status} for ${j.raw}`);
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
      setErr(false);
      setStatus(`Done${byHand ? ` (${byHand} lines are made by hand: record or upload them)` : ""}. Now run: npm run assets:voices -- --from=assets/voices/raw${lang === "fa" ? "" : ` --lang=${lang}`}`);
    } catch (e) {
      setErr(true);
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
  /** The line again in another language, to check the words: English beside Persian and Turkish, Persian beside English. */
  const other: VoiceLang = lang === "en" ? "fa" : "en";
  const pickedJobs = jobs.filter((j) => picked.has(j.raw));
  const flip = (raw: string) => setPicked((p) => (p.has(raw) ? (p.delete(raw), new Set(p)) : new Set(p).add(raw)));

  // Keyboard: ↑/↓ (or j/k) move between lines, g generates, r records, p plays the raw take, c compares.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      const i = jobs.findIndex((j) => j.raw === focus);
      const j = jobs[i];
      if (e.key === "ArrowDown" || e.key === "j") (e.preventDefault(), setFocus(jobs[Math.min(jobs.length - 1, i + 1)]?.raw ?? null));
      else if (e.key === "ArrowUp" || e.key === "k") (e.preventDefault(), setFocus(jobs[Math.max(0, i - 1)]?.raw ?? null));
      else if (!j) return;
      else if (e.key === "g" && !busy) void make([j]);
      else if (e.key === "r") void record(j);
      else if (e.key === "p" && saved.has(j.raw)) play(`/api/dev/voices/play?file=${encodeURIComponent(j.raw)}`);
      else if (e.key === "c") setCompare({ raw: j.raw, file: j.file, text: j.text });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => void document.querySelector(`[data-line="${CSS.escape(focus ?? "")}"]`)?.scrollIntoView({ block: "nearest" }), [focus]);

  return (
    <main className="dev-main">
      <datalist id="hf-models">
        {HF_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{`${m.note} — ${m.licence}`}</option>
        ))}
      </datalist>
      <div className="row">
        <div className="grow">
          <h1>Street voices</h1>
          <p className="lead">
            Every line people say in the game, in each language. Pick how each voice is made — or one line at a time — then generate, record (🎙) or upload (⤒). Takes go to{" "}
            <code>assets/voices/raw/</code>; then <code>npm run assets:voices -- --from=assets/voices/raw{lang === "fa" ? "" : ` --lang=${lang}`}</code> and commit <code>public/sounds/voice/</code>.
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Language">
          {VOICE_LANGS.map((l) => (
            <button key={l} role="tab" aria-selected={lang === l} onClick={() => (setLang(l), setPicked(new Set()), setFocus(null))}>
              {LANG_LABEL[l]} <span className="pill">{JOBS[l].filter((j) => saved.has(j.raw)).length}/{JOBS[l].length}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="card">
        <h2>Voices · {LANG_LABEL[lang]}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {KINDS.map((k) => {
            const e = engineOf(lang, k), models = MODELS.filter((m) => m.lang === lang && m.kind === k);
            const sample = all.find((j) => j.v === k);
            const n = all.filter((j) => j.v === k), done = n.filter((j) => saved.has(j.raw)).length;
            return (
              <div key={k} className="row">
                <b style={{ minWidth: 96 }}>{KIND_LABEL[k]}</b>
                <EnginePick lang={lang} value={e} kind={k} onChange={(x) => x && setEngine(lang, k, x)} />
                <span className="muted small grow">
                  {e.type === "piper" ? models.filter((m) => m.hf || m.url || m.id === "haaniye").map((m) => `${m.label} — ${m.licence}`).join(" · ") : e.type === "server" ? `Azure ${lang}-… neural voices, else OpenAI (keys in .env)` : e.type === "hf" ? "HF_TOKEN in .env" : ""}
                </span>
                <span className="pill">{done}/{n.length}</span>
                {sample && e.type !== "record" && <button className="btn sm" disabled={busy} onClick={() => void tryLine(sample)} title="Hear a line in this voice (not saved)">▶ Try</button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card sticky" style={{ display: "grid", gap: 10 }}>
        <div className="row">
          <button className="btn primary" onClick={() => void make(redo ? jobs : left)} disabled={busy || (!redo && !left.length)}>
            {busy ? "Working…" : left.length ? `⚡ Generate missing (${left.length})` : redo ? "Generate again" : "All made ✔"}
          </button>
          <button className="btn" onClick={() => void make(pickedJobs)} disabled={busy || !pickedJobs.length}>Generate selected ({pickedJobs.length})</button>
          <label className="row small muted" style={{ gap: 4 }}>
            <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} disabled={busy} /> redo saved ones too
          </label>
          <label className="btn">
            ⤒ Upload many
            <input type="file" accept="audio/*" multiple hidden onChange={(e) => void uploadMany(e.target.files)} />
          </label>
          <span className="grow" />
          <div className="seg" aria-label="Show">
            {(["all", "missing", "saved"] as const).map((x) => (
              <button key={x} aria-pressed={show === x} onClick={() => setShow(x)}>{x === "all" ? "All" : x === "missing" ? "Missing" : "Made"}</button>
            ))}
          </div>
          <div className="seg" aria-label="Voice">
            {(["all", ...KINDS] as const).map((x) => (
              <button key={x} aria-pressed={kindOnly === x} onClick={() => setKindOnly(x)}>{x === "all" ? "Everyone" : KIND_LABEL[x]}</button>
            ))}
          </div>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a line or situation (shopCall, cop…)" style={{ flex: "1 1 220px" }} aria-label="Filter lines" />
        </div>
        <div className="bar" aria-label={`${doneCount} of ${all.length} made`}><i style={{ width: `${(doneCount / Math.max(1, all.length)) * 100}%` }} /></div>
        <div className="row small">
          <span className={`status grow ${err ? "err" : ""}`} aria-live="polite">{status || `${doneCount} of ${all.length} lines made · ${jobs.length} shown`}</span>
          <span className="muted hide-sm">
            <span className="kbd">↑</span><span className="kbd">↓</span> move · <span className="kbd">g</span> generate · <span className="kbd">r</span> record · <span className="kbd">p</span> play · <span className="kbd">c</span> compare
          </span>
        </div>
      </section>

      {compare && (
        <section className="card">
          <div className="row">
            <h2 className="grow">Compare · {compare.raw}</h2>
            <button className="btn sm" onClick={() => setCompare(null)}>Close</button>
          </div>
          <p className="muted" dir={rtl ? "rtl" : "ltr"} style={{ margin: "0 0 8px" }}>{compare.text}</p>
          <div className="grid2">
            <Take label="Raw take (assets/voices/raw)" url={`/api/dev/voices/play?file=${encodeURIComponent(compare.raw)}`} onPlay={play} />
            <Take label="Shipped (after assets:voices)" url={`/sounds/voice/${compare.file}`} onPlay={play} />
          </div>
        </section>
      )}

      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" aria-label="Select all shown" checked={!!jobs.length && jobs.every((j) => picked.has(j.raw))} onChange={(e) => setPicked(e.target.checked ? new Set(jobs.map((j) => j.raw)) : new Set())} />
              </th>
              <th>Line</th>
              <th>Text</th>
              <th className="hide-sm">{other === "fa" ? "Persian" : "English"}</th>
              <th>Engine</th>
              <th style={{ textAlign: "end" }}>Take</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const own = lineEng[j.raw] ?? null, e = engineFor(j);
              return (
                <tr key={j.raw} data-line={j.raw} className={[recording === j.raw ? "on" : "", picked.has(j.raw) || focus === j.raw ? "sel" : ""].join(" ")} onClick={() => setFocus(j.raw)}>
                  <td>
                    <input type="checkbox" checked={picked.has(j.raw)} onChange={() => flip(j.raw)} aria-label={`Select ${j.raw}`} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div>{j.v === "m" ? "👨" : j.v === "f" ? "👩" : "👮"} <code>{j.raw}</code></div>
                    <span className={`pill ${saved.has(j.raw) ? "ok" : ""}`}>{saved.has(j.raw) ? "made" : "missing"}</span>
                  </td>
                  <td dir={rtl ? "rtl" : "ltr"} style={{ minWidth: 200 }}>{j.text}</td>
                  <td className="hide-sm muted" dir={other === "fa" ? "rtl" : "ltr"} style={{ minWidth: 160 }}>{lineText(j.b, j.v, other)}</td>
                  <td>
                    <EnginePick lang={lang} value={own} kind={j.v} line onChange={(x) => setLineEngine(j.raw, x)} />
                    {!own && <div className="muted small">{ENGINE_LABEL[e.type]}{e.type === "hf" ? ` · ${e.model}` : ""}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "end" }}>
                    {e.type !== "record" && <button className="btn icon sm" onClick={() => void make([j])} disabled={busy} title="Generate this line (g)">↻</button>}{" "}
                    <button className={`btn icon sm ${recording === j.raw ? "rec" : ""}`} onClick={() => void record(j)} disabled={busy || (!!recording && recording !== j.raw)} title={recording === j.raw ? "Stop and save" : "Record with the microphone (r)"}>{recording === j.raw ? "■" : "🎙"}</button>{" "}
                    <label className="btn icon sm" title="Upload a file for this line (any audio)">
                      ⤒
                      <input type="file" accept="audio/*" hidden onChange={(ev) => void upload(j, ev.target.files?.[0])} />
                    </label>{" "}
                    <button className="btn icon sm" disabled={!saved.has(j.raw)} onClick={() => play(`/api/dev/voices/play?file=${encodeURIComponent(j.raw)}`)} title="Play the raw take (p)">▶</button>{" "}
                    <button className="btn icon sm" onClick={() => setCompare({ raw: j.raw, file: j.file, text: j.text })} title="Compare the raw and shipped takes (c)">⇄</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!jobs.length && <p className="muted" style={{ padding: 16 }}>Nothing matches.</p>}
      </section>
    </main>
  );
}

/** An engine picker (for a voice, or for one line with "voice default" first). */
function EnginePick({ value, onChange, kind, line, lang }: { value: VoiceEngine | null; onChange: (e: VoiceEngine | null) => void; kind: VoiceKind; line?: boolean; lang: VoiceLang }) {
  const models = MODELS.filter((m) => m.lang === lang && m.kind === kind);
  const types = ENGINE_TYPES.filter((t) => t !== "piper" || models.some((m) => m.hf || m.url) || (lang === "fa" && kind === "f"));
  return (
    <span className="row" style={{ gap: 6 }}>
      <select
        value={value?.type ?? ""}
        onChange={(ev) => {
          const t = ev.target.value;
          onChange(!t ? null : t === "http" ? { type: "http", url: (value?.type === "http" && value.url) || "" } : t === "hf" ? { type: "hf", model: (value?.type === "hf" && value.model) || HF_MODELS.find((m) => m.langs.includes(lang))?.id || "" } : ({ type: t } as VoiceEngine));
        }}
        aria-label={line ? "This line's engine" : `How ${kind} lines are made`}
      >
        {line && <option value="">Voice default</option>}
        {types.map((t) => (
          <option key={t} value={t}>{ENGINE_LABEL[t]}</option>
        ))}
      </select>
      {value?.type === "hf" && (
        <>
          <input list="hf-models" value={value.model} onChange={(ev) => onChange({ type: "hf", model: ev.target.value })} placeholder="owner/model" style={{ width: 230 }} dir="ltr" aria-label="Hugging Face model" />
          {(() => {
            const l = hfLicence(value.model);
            return l ? <span className={`pill ${l.ok ? "ok" : "bad"}`} title={l.note}>{l.licence}{l.ok ? "" : " · try only"}</span> : value.model ? <span className="pill warn">check its licence</span> : null;
          })()}
        </>
      )}
      {value?.type === "http" && <input value={value.url} onChange={(ev) => onChange({ type: "http", url: ev.target.value })} placeholder="http://localhost:5002/api/tts?text={text}&speaker_id={voice}&language_id={lang}" style={{ width: 340 }} dir="ltr" aria-label="TTS address" />}
    </span>
  );
}

/** One take: its waveform (drawn from the file), length and loudest peak, and ▶. */
function Take({ label, url, onPlay }: { label: string; url: string; onPlay: (u: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<string>("…");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status === 404 ? "not there yet" : `${r.status}`);
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        void ctx.close();
        if (!live) return;
        const d = buf.getChannelData(0), c = ref.current!, g = c.getContext("2d")!;
        const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = 70 * devicePixelRatio);
        g.clearRect(0, 0, W, H);
        g.fillStyle = "#f0c05a";
        let peak = 0;
        for (let x = 0; x < W; x++) {
          let m = 0;
          const a = Math.floor((x / W) * d.length), b = Math.floor(((x + 1) / W) * d.length);
          for (let i = a; i < b; i++) m = Math.max(m, Math.abs(d[i]));
          peak = Math.max(peak, m);
          g.fillRect(x, H / 2 - (m * H) / 2, 1, Math.max(1, m * H));
        }
        setInfo(`${buf.duration.toFixed(2)} s · peak ${(20 * Math.log10(peak || 1e-6)).toFixed(1)} dBFS`);
      } catch (e) {
        if (live) setInfo(`(${(e as Error).message})`);
      }
    })();
    return () => void (live = false);
  }, [url]);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="row">
        <b className="grow small">{label}</b>
        <span className="muted small">{info}</span>
        <button className="btn icon sm" onClick={() => onPlay(url)} aria-label={`Play: ${label}`}>▶</button>
      </div>
      <canvas ref={ref} style={{ width: "100%", height: 70, background: "#0b0d12", borderRadius: 8, border: "1px solid var(--line)" }} />
    </div>
  );
}
