"use client";
// /dev/sounds: every sound in the game (lib/soundSlots.ts — the street, the fight, each gun, the
// interface), what plays now (a recording, or the synth when its slot is empty), and the tools
// to change it: ▶ hear it as the game plays it, ⤒ add takes, 🎙 record one, ✎ edit a take (trim,
// gain, fades — saved as a WAV source), 🗑 drop one, then Build (npm run assets:sounds: trims,
// levels and writes public/sounds + the manifest). The voices have their own page (/dev/voices).
import { useEffect, useMemo, useRef, useState } from "react";
import { STATIONS } from "@/lib/radio";
import { WEAPONS } from "@/lib/arena/weapons";
import type { SoundKey } from "@/lib/soundSlots";
import { encodeWav, toMono } from "@/lib/voiceTools";
import { sfx, type Sfx } from "@/components/game/sfx";
import * as gun from "@/components/arena/gunsound";
import "@/components/game/samples";

type Slot = { key: SoundKey; group: "street" | "fight" | "guns" | "ui"; what: string; search: string; loop?: boolean; stereo?: boolean; maxS: number; sources: string[]; shipped: string[] };
const GROUPS = [["street", "🚗 Street"], ["fight", "💥 Fight"], ["guns", "🔫 Guns"], ["ui", "🔔 Interface"]] as const;

/** The game's own call for a slot (recording if there is one, else its synth) — what a player hears. */
function inGame(key: SoundKey): (() => void) | null {
  if (key.startsWith("ui_")) return () => sfx(key.slice(3) as Sfx);
  if (key.startsWith("gun_")) {
    const w = WEAPONS[key.slice(4) as keyof typeof WEAPONS];
    return w ? () => gun.shotSound(w.sound, undefined, w.key) : null;
  }
  const at = undefined as unknown as Parameters<typeof gun.hornSound>[0];
  const map: Partial<Record<string, () => void>> = {
    crashLight: () => gun.crashSound(0.2), crashHeavy: () => gun.crashSound(0.95), explosion: () => gun.boomSound(undefined, 1), skid: () => gun.skidSound(0.8),
    horn: () => gun.hornSound(at), carAlarm: () => gun.carAlarmSound(at), carLock: () => gun.lockSound(), doorOpen: () => gun.doorSound(true), doorClose: () => gun.doorSound(false), thud: () => gun.thudSound(),
    reload: () => gun.reloadSound(2.3), hitMarker: () => gun.hitSound(false), kill: () => gun.killSound(), hurt: () => gun.hurtSound(), empty: () => gun.emptySound(), bombBeep: () => gun.beepSound(false), throw: () => gun.throwSound(), flashbang: () => gun.flashSound(at, 0),
  };
  return map[key] ?? null;
}

const RATE = 44100;
async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(data.slice(0));
  } finally {
    void ctx.close();
  }
}
/** A take as mono samples at RATE (what the editor works on). */
async function samplesOf(data: ArrayBuffer): Promise<Float32Array> {
  const src = await decode(data);
  const off = new OfflineAudioContext(1, Math.ceil(src.duration * RATE), RATE);
  const n = off.createBufferSource();
  n.buffer = src;
  n.connect(off.destination);
  n.start();
  return toMono([(await off.startRendering()).getChannelData(0)]);
}
const playBuf = (s: Float32Array) => {
  const ctx = new AudioContext();
  const b = ctx.createBuffer(1, s.length, RATE);
  b.copyToChannel(Float32Array.from(s), 0);
  const n = ctx.createBufferSource();
  n.buffer = b;
  n.connect(ctx.destination);
  n.onended = () => void ctx.close();
  n.start();
};

type Edit = { slot: SoundKey; name: string; data: Float32Array; start: number; end: number; gainDb: number; fadeIn: number; fadeOut: number; normalize: boolean };
/** The edit applied: the cut, the gain (or normalised to −1 dBFS), the fades. */
function render(e: Edit): Float32Array {
  const a = Math.floor(e.start * RATE), b = Math.max(a + 1, Math.floor(e.end * RATE));
  const out = e.data.slice(a, b);
  let g = 10 ** (e.gainDb / 20);
  if (e.normalize) {
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) g = 0.89 / peak;
  }
  const fi = Math.floor(e.fadeIn * RATE), fo = Math.floor(e.fadeOut * RATE);
  for (let i = 0; i < out.length; i++) {
    let k = g;
    if (i < fi) k *= i / fi;
    if (i > out.length - fo) k *= (out.length - i) / fo;
    out[i] *= k;
  }
  return out;
}

const btn: React.CSSProperties = { verticalAlign: "middle", minWidth: 32, height: 30, padding: "0 9px", marginInlineEnd: 4, borderRadius: 6, border: "1px solid #3a3f49", background: "#23262d", color: "#f2f2f2", fontSize: 13, cursor: "pointer", textTransform: "none", letterSpacing: "normal", display: "inline-flex", alignItems: "center", gap: 4 };
const primary: React.CSSProperties = { ...btn, background: "#f0c05a", color: "#1b1300", border: 0, fontWeight: 700 };

export default function SoundsPanel() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [group, setGroup] = useState<(typeof GROUPS)[number][0] | "voices" | "radio">("street");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<SoundKey | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[] } | null>(null);
  const load = () => void fetch("/api/dev/sounds").then((r) => r.json()).then((r: { slots: Slot[] }) => setSlots(r.slots));
  useEffect(load, []);

  // ":missing" (the "Synth only" button) shows the slots still without a recording.
  const shown = useMemo(() => slots.filter((s) => s.group === group && (q === ":missing" || `${s.key} ${s.what}`.toLowerCase().includes(q.trim().toLowerCase()))), [slots, group, q]);
  const count = (g: string) => slots.filter((s) => s.group === g).length;
  const recorded = (g: string) => slots.filter((s) => s.group === g && (s.sources.length || s.shipped.length)).length;

  const save = async (slot: SoundKey, name: string, wav: ArrayBuffer) => {
    const r = await fetch(`/api/dev/sounds?slot=${slot}&name=${encodeURIComponent(name)}`, { method: "POST", body: wav });
    if (!r.ok) throw new Error(await r.text());
  };
  const freeName = (s: Slot, base: string) => {
    let n = 1;
    while (s.sources.includes(`${base}-${n}.wav`)) n++;
    return `${base}-${n}.wav`;
  };
  const upload = async (s: Slot, files: FileList | null) => {
    if (!files?.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        // Kept as given (the build converts any format); only the name is made safe.
        const name = f.name.replace(/[^\w .()-]/g, "_");
        await save(s.key, name, await f.arrayBuffer());
        ok++;
      } catch (e) {
        setStatus(`${f.name}: ${(e as Error).message}`);
      }
    }
    setStatus(`${ok} take(s) added to ${s.key} — press Build to hear them in the game.`);
    load();
  };
  const record = async (s: Slot) => {
    if (recRef.current) return recRef.current.mr.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const mr = new MediaRecorder(stream), chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setRec(null);
        const data = await samplesOf(await new Blob(chunks).arrayBuffer());
        // Straight into the editor: trim it, then save.
        setEdit({ slot: s.key, name: freeName(s, "rec"), data, start: 0, end: data.length / RATE, gainDb: 0, fadeIn: 0, fadeOut: 0.02, normalize: true });
      };
      recRef.current = { mr, chunks };
      setRec(s.key);
      mr.start();
      setStatus(`Recording a take for ${s.key}… press 🎙 again to stop.`);
    } catch (e) {
      setStatus(`No microphone: ${(e as Error).message}`);
    }
  };
  const open = async (s: Slot, name: string, shipped: boolean) => {
    try {
      const url = shipped ? `/sounds/${name}` : `/api/dev/sounds?src=${encodeURIComponent(`${s.key}/${name}`)}`;
      const data = await samplesOf(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
      // An edit of a shipped file becomes a new source take; a source's edit replaces it (as WAV).
      const out = shipped ? freeName(s, "edit") : name.replace(/\.\w+$/, ".wav");
      setEdit({ slot: s.key, name: out, data, start: 0, end: data.length / RATE, gainDb: 0, fadeIn: 0, fadeOut: 0, normalize: false });
    } catch (e) {
      setStatus(`Couldn't open ${name}: ${(e as Error).message}`);
    }
  };
  const remove = async (s: Slot, name: string) => {
    if (!confirm(`Remove ${name} from ${s.key}? (Build to take it out of the game.)`)) return;
    await fetch(`/api/dev/sounds?slot=${s.key}&name=${encodeURIComponent(name)}`, { method: "DELETE" });
    load();
  };
  const saveEdit = async () => {
    if (!edit) return;
    try {
      await save(edit.slot, edit.name, encodeWav(render(edit), RATE));
      setStatus(`Saved ${edit.slot}/${edit.name} — press Build to hear it in the game.`);
      setEdit(null);
      load();
    } catch (e) {
      setStatus(`Couldn't save: ${(e as Error).message}`);
    }
  };
  const build = async () => {
    setBusy(true);
    setStatus("Building (ffmpeg: trim, level, convert)…");
    try {
      const r = (await (await fetch("/api/dev/sounds?build=1", { method: "POST" })).json()) as { ok: boolean; log: string };
      setStatus(r.ok ? "Built ✔ — reload the game to hear the new sounds." : `Build failed:\n${r.log}`);
      load();
    } finally {
      setBusy(false);
    }
  };

  const missingOnly = q === ":missing";
  return (
    <main className="dev-main">
      <div className="row">
        <div className="grow">
          <h1>Every sound in the game</h1>
          <p className="lead">
            Each slot plays its recordings (a random take each time) or, while it has none, the game&apos;s own synth. Add, record or edit takes, then <b>Build</b> (needs ffmpeg): they&apos;re trimmed,
            levelled and written to <code>public/sounds/</code> — commit that. Sources stay in <code>assets/sounds/&lt;slot&gt;/</code> (not in git). Voices: <a href="/dev/voices">/dev/voices</a>.
          </p>
        </div>
        <button className="btn primary" onClick={() => void build()} disabled={busy}>{busy ? "Building…" : "⚙ Build"}</button>
      </div>

      <section className="card sticky" style={{ display: "grid", gap: 10 }}>
        <div className="row">
          <div className="seg" role="tablist" aria-label="Group">
            {GROUPS.map(([g, label]) => (
              <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)}>
                {label} <span className="pill">{recorded(g)}/{count(g)}</span>
              </button>
            ))}
            <button role="tab" aria-selected={group === "radio"} onClick={() => setGroup("radio")}>📻 Radio <span className="pill">{STATIONS.length}</span></button>
          </div>
          {group !== "voices" && group !== "radio" && (
            <>
              <input type="search" value={missingOnly ? "" : q} onChange={(e) => setQ(e.target.value)} placeholder="Find a sound…" style={{ flex: "1 1 200px" }} aria-label="Find a sound" />
              <button className={`btn sm ${missingOnly ? "primary" : ""}`} onClick={() => setQ(missingOnly ? "" : ":missing")} title="Slots still on the synth">Synth only</button>
            </>
          )}
        </div>
        {status && <pre className={`status ${/fail/i.test(status) ? "err" : ""}`} style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>{status}</pre>}
      </section>

      {group === "radio" && (
        <section className="card">
          <div className="grid2">
            {STATIONS.map((st) => (
              <div key={st.id} className="row">
                <b className="grow">{st.name}</b>
                <span className="pill">{st.genre}</span>
                <span className="pill">{st.group}</span>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Stations are streams (lib/radio.ts); change the list there.</p>
        </section>
      )}
      {group !== "voices" && group !== "radio" && (
        <div className="grid2">
          {(missingOnly ? shown.filter((s) => !s.shipped.length) : shown).map((s) => {
            const play = inGame(s.key);
            return (
              <section key={s.key} className="card" style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <div className="row">
                  <code>{s.key}</code>
                  <span className={`pill ${s.shipped.length ? "ok" : "warn"}`}>{s.shipped.length ? `${s.shipped.length} recording${s.shipped.length > 1 ? "s" : ""}` : "synth"}</span>
                  {s.loop && <span className="pill">loop</span>}
                  {s.stereo && <span className="pill">stereo</span>}
                  <span className="pill">≤ {s.maxS} s</span>
                </div>
                <div className="muted small">{s.what}</div>
                <div className="row">
                  {play && <button className="btn sm" onClick={play} title="Hear it as the game plays it now">▶ In game</button>}
                  <label className="btn sm" title="Add takes (any audio)">
                    ⤒ Add
                    <input type="file" accept="audio/*" multiple hidden onChange={(e) => void upload(s, e.target.files)} />
                  </label>
                  <button className={`btn sm ${rec === s.key ? "rec" : ""}`} disabled={!!rec && rec !== s.key} onClick={() => void record(s)}>{rec === s.key ? "■ Stop" : "🎙 Record"}</button>
                  <a className="btn sm" href={`https://freesound.org/search/?q=${encodeURIComponent(s.search)}&f=license:%22Creative+Commons+0%22`} target="_blank" rel="noreferrer" title="Find CC0 takes on Freesound">🔎 Freesound</a>
                  <a className="btn sm" href={`https://pixabay.com/sound-effects/search/${encodeURIComponent(s.search)}/`} target="_blank" rel="noreferrer" title="Find takes on Pixabay (free licence)">🔎 Pixabay</a>
                </div>
                {s.shipped.length > 0 && (
                  <div className="small" style={{ display: "grid", gap: 4 }}>
                    <span className="muted">In the game</span>
                    {s.shipped.map((f) => (
                      <div key={f} className="row" style={{ gap: 6 }}>
                        <button className="btn icon sm" onClick={() => void new Audio(`/sounds/${f}?t=${Date.now()}`).play()} aria-label={`Play ${f}`}>▶</button>
                        <span className="grow">{f}</span>
                        <button className="btn icon sm" onClick={() => void open(s, f, true)} title="Edit a copy (saved as a new source take)">✎</button>
                      </div>
                    ))}
                  </div>
                )}
                {s.sources.length > 0 && (
                  <div className="small" style={{ display: "grid", gap: 4 }}>
                    <span className="muted">Sources (built on ⚙ Build)</span>
                    {s.sources.map((f) => (
                      <div key={f} className="row" style={{ gap: 6 }}>
                        <button className="btn icon sm" onClick={() => void new Audio(`/api/dev/sounds?src=${encodeURIComponent(`${s.key}/${f}`)}`).play()} aria-label={`Play ${f}`}>▶</button>
                        <span className="grow">{f}</span>
                        <button className="btn icon sm" onClick={() => void open(s, f, false)} title="Edit">✎</button>
                        <button className="btn icon sm danger" onClick={() => void remove(s, f)} title="Remove">🗑</button>
                      </div>
                    ))}
                  </div>
                )}
                {!s.shipped.length && <div className="muted small">Look for: “{s.search}”</div>}
              </section>
            );
          })}
        </div>
      )}

      {edit && <Editor e={edit} set={setEdit} onSave={() => void saveEdit()} />}
    </main>
  );
}

/** The take's shape with the cut marked, sliders for the cut / gain / fades, ▶ to hear the result. */
function Editor({ e, set, onSave }: { e: Edit; set: (e: Edit | null) => void; onSave: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const len = e.data.length / RATE;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d")!, W = c.width, H = c.height, step = Math.max(1, Math.floor(e.data.length / W));
    g.fillStyle = "#0f1115";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#f0c05a";
    for (let x = 0; x < W; x++) {
      let peak = 0;
      for (let i = x * step; i < (x + 1) * step && i < e.data.length; i++) peak = Math.max(peak, Math.abs(e.data[i]));
      g.fillRect(x, H / 2 - (peak * H) / 2, 1, Math.max(1, peak * H));
    }
    g.fillStyle = "rgba(0,0,0,.6)";
    g.fillRect(0, 0, (e.start / len) * W, H);
    g.fillRect((e.end / len) * W, 0, W, H);
  }, [e.data, e.start, e.end, len]);
  const row = (label: string, v: number, min: number, max: number, stepV: number, on: (v: number) => void, fmt = (x: number) => `${x.toFixed(2)} s`) => (
    <label style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px", gap: 8, alignItems: "center", fontSize: 13 }}>
      {label}
      <input type="range" min={min} max={max} step={stepV} value={v} onChange={(x) => on(Number(x.target.value))} />
      <span>{fmt(v)}</span>
    </label>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: "var(--z-raised)" }} onClick={() => set(null)}>
      <div className="card" style={{ width: "min(720px, 94vw)", display: "grid", gap: 10 }} onClick={(x) => x.stopPropagation()}>
        <b>
          ✎ {e.slot} / {e.name}
        </b>
        <canvas ref={canvas} width={680} height={120} style={{ width: "100%", borderRadius: 6 }} />
        {row("Start", e.start, 0, len, 0.01, (v) => set({ ...e, start: Math.min(v, e.end - 0.02) }))}
        {row("End", e.end, 0, len, 0.01, (v) => set({ ...e, end: Math.max(v, e.start + 0.02) }))}
        {row("Gain", e.gainDb, -18, 18, 0.5, (v) => set({ ...e, gainDb: v, normalize: false }), (x) => `${x > 0 ? "+" : ""}${x} dB`)}
        {row("Fade in", e.fadeIn, 0, 1, 0.01, (v) => set({ ...e, fadeIn: v }))}
        {row("Fade out", e.fadeOut, 0, 2, 0.01, (v) => set({ ...e, fadeOut: v }))}
        <label className="row small">
          <input type="checkbox" style={{ width: "auto", margin: 0 }} checked={e.normalize} onChange={(x) => set({ ...e, normalize: x.target.checked })} /> Normalise (loudest point to −1 dB; the build levels loudness too)
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => playBuf(render(e))}>▶ Hear the edit</button>
          <button className="btn" onClick={() => set(null)}>Cancel</button>
          <button className="btn primary" onClick={onSave}>💾 Save take</button>
        </div>
      </div>
    </div>
  );
}
