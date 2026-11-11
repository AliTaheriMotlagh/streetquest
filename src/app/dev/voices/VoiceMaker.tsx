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

const JOBS: Record<VoiceLang, Job[]> = { fa: jobsFor("fa"), en: jobsFor("en") };
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
  /** Piper (and its runtime paths), loaded once; the voice that is running now (one at a time: a model is ~60 MB). */
  const engine = useRef<{ tts: Piper; ver: string; paths: Paths } | null>(null);
  const current = useRef<{ model: string; session: Session } | null>(null);
  useEffect(() => {
    void fetch("/api/dev/voices").then((r) => r.json()).then((r: { saved: string[] }) => setSaved(new Set(r.saved)));
  }, []);

  const jobs = JOBS[lang];
  const left = jobs.filter((j) => !saved.has(j.raw));
  const doneCount = jobs.length - left.length;

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

  /** Speak these lines, one voice at a time, saving each (the page stays usable: errors stop only this run). */
  const make = async (todo: Job[]) => {
    setBusy(true);
    try {
      const done = new Set(saved);
      let n = 0;
      for (const model of [...new Set(todo.map((j) => j.model.id))]) {
        const session = await speaker(model);
        for (const j of todo.filter((x) => x.model.id === model)) {
          setStatus(`${++n}/${todo.length} · ${j.raw} · ${j.text}`);
          const wav = await session.predict(j.text);
          const r = await fetch(`/api/dev/voices?file=${j.raw}`, { method: "POST", body: wav });
          if (!r.ok) throw new Error(`${j.raw}: ${await r.text()}`);
          done.add(j.raw);
          setSaved(new Set(done));
        }
      }
      setStatus(`Done. Now run: npm run assets:voices -- --from=assets/voices/raw${lang === "en" ? " --lang=en" : ""}`);
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const play = (url: string) => void new Audio(url).play().catch(() => {});
  const rtl = lang === "fa";
  const btn = (primary: boolean): React.CSSProperties => ({ padding: "10px 18px", fontSize: 16, borderRadius: 8, border: primary ? 0 : "1px solid #f0c05a", background: busy ? "#555" : primary ? "#f0c05a" : "transparent", color: primary ? "#1b1300" : "#f0c05a", cursor: busy ? "default" : "pointer" });

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#eee", background: "#16181d", borderRadius: 12 }}>
      <h1 style={{ marginTop: 0 }}>Make the street voices</h1>
      <p>
        Piper speaks each line in this browser (free, offline after the first download: about 60 MB per voice). Each one is saved to <code>assets/voices/raw/</code> (English in <code>en/</code>); then run{" "}
        <code>npm run assets:voices -- --from=assets/voices/raw</code> and commit <code>public/sounds/voice/</code>. Players hear the language they play in; English players hear the English files.
      </p>
      <p role="tablist" style={{ display: "flex", gap: 8 }}>
        {VOICE_LANGS.map((l) => (
          <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #f0c05a", background: lang === l ? "#f0c05a" : "transparent", color: lang === l ? "#1b1300" : "#f0c05a" }}>
            {l === "fa" ? "فارسی · fa" : "English · en"}
          </button>
        ))}
      </p>
      <p style={{ opacity: 0.8, fontSize: 13 }}>
        Voices ({lang}):{" "}
        {MODELS.filter((m) => m.lang === lang).map((m) => `${m.kind === "m" ? "👨" : m.kind === "f" ? "👩" : "👮"} ${m.label} — ${m.licence}`).join(" · ")}
      </p>
      <p>
        <button onClick={() => void make(redo ? jobs : left)} disabled={busy || (!redo && !left.length)} style={btn(true)}>
          {busy ? "Working…" : left.length ? `Generate all missing (${left.length} left)` : redo ? "Generate all again" : "All made ✔"}
        </button>
        <label style={{ marginInlineStart: 12 }}>
          <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} disabled={busy} /> make them all again
        </label>
        {lang === "fa" && (
          <button onClick={() => void make(jobs.filter((j) => j.v === "f"))} disabled={busy} style={{ ...btn(false), marginInlineStart: 12, padding: "10px 14px", fontSize: 15 }}>
            👩 Remake the women&apos;s lines
          </button>
        )}
      </p>
      <progress value={doneCount} max={jobs.length} style={{ width: "100%" }} />
      <p style={{ minHeight: 24, opacity: 0.85 }}>{status}</p>
      <p>
        {doneCount}/{jobs.length} saved ({lang})
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.raw} style={{ borderTop: "1px solid #2c2f36" }}>
              <td style={{ padding: 4 }}>{saved.has(j.raw) ? "✅" : "·"}</td>
              <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                {j.v === "m" ? "👨" : j.v === "f" ? "👩" : "👮"} {j.raw}
                <div style={{ opacity: 0.6, fontSize: 11 }}>{j.model.label}</div>
              </td>
              <td style={{ padding: 4 }} dir={rtl ? "rtl" : "ltr"}>{j.text}</td>
              <td style={{ padding: 4, opacity: 0.7 }} dir={rtl ? "ltr" : "rtl"}>{lineText(j.b, j.v, rtl ? "en" : "fa")}</td>
              <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                <button onClick={() => void make([j])} disabled={busy} title="Generate this line (again)">⟳</button>{" "}
                {saved.has(j.raw) && <button onClick={() => play(`/api/dev/voices/play?file=${j.raw}`)} title="Play the raw take">▶</button>}{" "}
                {/* The shipped, filtered file (after npm run assets:voices), to compare with the raw take. */}
                <button onClick={() => play(`/sounds/voice/${j.file}`)} title="Play the shipped file (after assets:voices), to compare">▶▶</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
