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
import { useEffect, useState } from "react";
import { BARKS, barkFile, textOf, type VoiceKind } from "@/lib/street/barks";
import { haaniye } from "./haaniye";

const LIB = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm";
/** This server's copies of the big files (absolute: the runtime resolves them from its own address). */
const local = (path: string) => `${location.origin}/api/dev/voices/lib/${path}`;
/** Men: Piper's amir; the police: Piper's gyro; women: Mimic 3's haaniye (Piper has no Persian woman — haaniye.ts). */
const MODEL: Record<VoiceKind, string> = { m: "fa_IR-amir-medium", f: "haaniye", cop: "fa_IR-gyro-medium" };
const PHONEMIZER = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js/+esm";
type Session = { predict: (text: string) => Promise<Blob> };
type Piper = {
  TtsSession: { _instance: unknown; WASM_LOCATIONS: { onnxWasm: string; piperData: string; piperWasm: string }; create: (o: { voiceId: string; wasmPaths?: { onnxWasm: string; piperData: string; piperWasm: string } }) => Promise<Session> };
};

const JOBS = BARKS.flatMap((b) => b.voices.map((v) => ({ b, v, text: textOf(b, v), file: barkFile(b, v).replace(/\.mp3$/, ".wav") })));

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
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [redo, setRedo] = useState(false);
  useEffect(() => {
    void fetch("/api/dev/voices").then((r) => r.json()).then((r: { saved: string[] }) => setSaved(new Set(r.saved)));
  }, []);

  /** `again`: the voices to make again even where they're saved already. */
  const run = async (again: VoiceKind[] = redo ? ["m", "f", "cop"] : []) => {
    setBusy(true);
    try {
      setStatus("Loading Piper…");
      const [tts, ver] = await Promise.all([import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB) as Promise<Piper>, ortVersion()]);
      const paths = { onnxWasm: local(`ort/${ver}/`), piperData: local("piper/piper_phonemize.data"), piperWasm: local("piper/piper_phonemize.wasm") };
      // (Also for anything that makes its own session with the defaults.)
      Object.assign(tts.TtsSession.WASM_LOCATIONS, paths);
      const done = new Set(saved);
      for (const model of [...new Set(Object.values(MODEL))]) {
        const jobs = JOBS.filter((j) => MODEL[j.v] === model && (again.includes(j.v) || !done.has(j.file)));
        if (!jobs.length) continue;
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
        for (const j of jobs) {
          setStatus(`${done.size + 1}/${JOBS.length} · ${j.file} · ${j.text.fa}`);
          const wav = await session.predict(j.text.fa);
          const r = await fetch(`/api/dev/voices?file=${j.file}`, { method: "POST", body: wav });
          if (!r.ok) throw new Error(`${j.file}: ${await r.text()}`);
          done.add(j.file);
          setSaved(new Set(done));
        }
      }
      setStatus("Done. Now run: npm run assets:voices -- --from=assets/voices/raw");
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const play = (file: string) => void new Audio(`/api/dev/voices/play?file=${file}`).play().catch(() => {});

  return (
    <main style={{ maxWidth: 860, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#eee", background: "#16181d", borderRadius: 12 }}>
      <h1 style={{ marginTop: 0 }}>Make the street voices</h1>
      <p>
        Piper speaks each of the {JOBS.length} lines in this browser (free, offline after the first download of about 120 MB). Each one is saved to <code>assets/voices/raw/</code>; then run{" "}
        <code>npm run assets:voices -- --from=assets/voices/raw</code> and commit <code>public/sounds/voice/</code>. Women&apos;s lines have their own words, in a woman&apos;s voice (Mimic 3&apos;s haaniye).
      </p>
      <p>
        <button onClick={() => run()} disabled={busy} style={{ padding: "10px 18px", fontSize: 16, borderRadius: 8, border: 0, background: busy ? "#555" : "#f0c05a", color: "#1b1300", cursor: busy ? "default" : "pointer" }}>
          {busy ? "Working…" : saved.size ? `Make the rest (${JOBS.length - saved.size} left)` : "Make all the voices"}
        </button>
        <button onClick={() => run(["f"])} disabled={busy} style={{ marginInlineStart: 12, padding: "10px 14px", fontSize: 15, borderRadius: 8, border: "1px solid #f0c05a", background: "transparent", color: "#f0c05a" }}>
          👩 Remake the women&apos;s lines
        </button>
        <label style={{ marginInlineStart: 12 }}>
          <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} disabled={busy} /> make them all again
        </label>
      </p>
      <p style={{ minHeight: 24, opacity: 0.85 }}>{status}</p>
      <p>
        {saved.size}/{JOBS.length} saved
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {JOBS.map((j) => (
            <tr key={j.file} style={{ borderTop: "1px solid #2c2f36" }}>
              <td style={{ padding: 4 }}>{saved.has(j.file) ? "✅" : "·"}</td>
              <td style={{ padding: 4, whiteSpace: "nowrap" }}>{j.v === "m" ? "👨" : j.v === "f" ? "👩" : "👮"} {j.file}</td>
              <td style={{ padding: 4 }} dir="rtl">{j.text.fa}</td>
              <td style={{ padding: 4, opacity: 0.7 }}>{j.text.en}</td>
              <td style={{ padding: 4 }}>{saved.has(j.file) && <button onClick={() => play(j.file)}>▶</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
