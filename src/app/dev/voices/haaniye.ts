"use client";
// A woman's voice for /dev/voices: Piper has no Persian woman's voice, so the women's lines
// are spoken by Mycroft Mimic 3's «haaniye» (CC0; a VITS model like Piper's, same inputs).
// Mimic 3 numbers its phonemes its own way, so the pieces are put together here:
//  1. Piper's phonemizer (espeak-ng, WebAssembly) turns the Persian text into Piper's
//     phoneme ids; Piper's own table (amir's .onnx.json) turns them back into IPA symbols;
//  2. those become haaniye's ids as Mimic 3 does it (phonemes2ids: "^", a blank, each
//     phoneme followed by a blank, "#" and a blank between words, "$"; ! ? → "." and ; : → ",");
//  3. the model runs on the same ONNX runtime; its sound becomes a WAV.
// Pure parts (haaniyeIds) are tested in tests/voices.test.ts.

/** haaniye's phonemes, by id (its phonemes.txt). */
export const HAANIYE = "_ ^ $ , . # ˈ ˌ 1 a b d e f h i j k l m n o p q r s t u v x z ɑ ɡ ʃ ʒ ʔ ː".split(" ");
const ID = new Map(HAANIYE.map((p, i) => [p, i]));
const PUNCT: Record<string, string> = { "!": ".", "?": ".", ";": ",", ":": ",", "؟": ".", "،": ",", "؛": "," };

/** IPA symbols (one per codepoint, " " between words) → haaniye's ids, as Mimic 3's phonemes2ids makes them. */
export function haaniyeIds(symbols: string[]): number[] {
  const words: string[][] = [[]];
  for (const s of symbols) {
    if (s === " ") words.push([]);
    else words[words.length - 1].push(PUNCT[s] ?? s);
  }
  const blank = ID.get("_")!, ids = [ID.get("^")!, blank];
  for (const w of words) {
    const word = w.map((p) => ID.get(p)).filter((x): x is number => x != null);
    if (!word.length) continue;
    word.push(ID.get("#")!);
    for (const id of word) ids.push(id, blank);
  }
  ids.push(ID.get("$")!);
  return ids;
}

/** Float samples → a 16-bit mono WAV. */
export function wav(pcm: Float32Array, rate: number): Blob {
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  let peak = 0;
  for (const x of pcm) peak = Math.max(peak, Math.abs(x));
  const k = peak > 1 ? 1 / peak : 1;
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * k)) * 0x7fff, true);
  return new Blob([b], { type: "audio/wav" });
}

type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: unknown, dims: number[]) => unknown;
  InferenceSession: { create: (m: ArrayBuffer, o: object) => Promise<{ run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> }> };
};

/** A speaker for the women's lines: `say(text)` → WAV. */
export async function haaniye(o: { ortUrl: string; phonemizerUrl: string; onnxWasm: string; piperWasm: string; piperData: string; file: (name: string) => Promise<ArrayBuffer>; json: (name: string) => Promise<unknown> }) {
  const [ortMod, ph, piperCfg, model] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ o.ortUrl),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ o.phonemizerUrl),
    o.json("fa_IR-amir-medium.onnx.json") as Promise<{ phoneme_id_map: Record<string, number[]> }>,
    o.file("fa-haaniye-low.onnx"),
  ]);
  const ort = (ortMod.default ?? ortMod) as Ort;
  ort.env.wasm.wasmPaths = o.onnxWasm;
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  // Piper's id → symbol.
  const sym = new Map<number, string>();
  for (const [s, ids] of Object.entries(piperCfg.phoneme_id_map)) for (const id of ids) if (!sym.has(id)) sym.set(id, s);
  const createPiperPhonemize = (ph as { createPiperPhonemize: (o: object) => Promise<{ callMain: (a: string[]) => void }> }).createPiperPhonemize;

  const phonemes = (text: string) =>
    new Promise<string[]>((resolve, reject) => {
      void createPiperPhonemize({
        print: (line: string) => {
          try {
            const r = JSON.parse(line) as { phonemes?: (string | string[])[]; phoneme_ids: number[] };
            const given = (r.phonemes ?? []).flat();
            resolve(given.length ? given : r.phoneme_ids.map((id) => sym.get(id) ?? "").filter((s) => s && s !== "^" && s !== "$" && s !== "_"));
          } catch (e) {
            reject(e);
          }
        },
        printErr: () => {},
        locateFile: (u: string) => (u.endsWith(".wasm") ? o.piperWasm : u.endsWith(".data") ? o.piperData : u),
      }).then((m) => m.callMain(["-l", "fa", "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]), reject);
    });

  return async (text: string) => {
    const ids = haaniyeIds(await phonemes(text));
    const out = await session.run({
      input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor("float32", Float32Array.from([0.333, 1.0, 0.333]), [3]),
    });
    return wav(out.output.data, 22050);
  };
}
