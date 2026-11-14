"use client";
// Any Piper voice for /dev/voices, run here instead of through the piper-tts-web library (which
// only knows the voices on its own list — not the Turkish ones, Fahrettin and Fettah (CC0, withdrawn
// from Piper's list but kept elsewhere), nor ilkiz). The same pieces as haaniye.ts, generalised:
//  1. Piper's phonemizer (espeak-ng, WebAssembly) in the model's own espeak voice ("tr");
//  2. the phonemes → the model's ids as Piper does it (piperIds: "^", "_", each phoneme then "_", "$");
//  3. the model runs on the ONNX runtime with its own scales; its sound becomes a WAV.
import { wav } from "./haaniye";

export type PiperConfig = {
  espeak?: { voice?: string };
  audio?: { sample_rate?: number };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map: Record<string, number[]>;
};

/** Phoneme symbols → a Piper model's input ids (bos, pad, each phoneme followed by pad, eos); unknown symbols are dropped. */
export function piperIds(symbols: string[], map: Record<string, number[]>): number[] {
  const pad = map["_"] ?? [0];
  const ids = [...(map["^"] ?? [1]), ...pad];
  for (const s of symbols) {
    const id = map[s];
    if (id) ids.push(...id, ...pad);
  }
  ids.push(...(map["$"] ?? [2]));
  return ids;
}

type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: unknown, dims: number[]) => unknown;
  InferenceSession: { create: (m: ArrayBuffer, o: object) => Promise<{ run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> }> };
};

/** A speaker for one Piper model (its .onnx and .onnx.json by name): `say(text)` → WAV. */
export async function piperRun(o: { model: string; ortUrl: string; phonemizerUrl: string; onnxWasm: string; piperWasm: string; piperData: string; file: (name: string) => Promise<ArrayBuffer>; json: (name: string) => Promise<unknown> }) {
  const [ortMod, ph, cfg, model] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ o.ortUrl),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ o.phonemizerUrl),
    o.json(`${o.model}.onnx.json`) as Promise<PiperConfig>,
    o.file(`${o.model}.onnx`),
  ]);
  const ort = (ortMod.default ?? ortMod) as Ort;
  ort.env.wasm.wasmPaths = o.onnxWasm;
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  const voice = cfg.espeak?.voice ?? "en-us", rate = cfg.audio?.sample_rate ?? 22050;
  const inf = { noise: cfg.inference?.noise_scale ?? 0.667, length: cfg.inference?.length_scale ?? 1, w: cfg.inference?.noise_w ?? 0.8 };
  const createPiperPhonemize = (ph as { createPiperPhonemize: (o: object) => Promise<{ callMain: (a: string[]) => void }> }).createPiperPhonemize;

  const phonemes = (text: string) =>
    new Promise<string[]>((resolve, reject) => {
      void createPiperPhonemize({
        print: (line: string) => {
          try {
            const r = JSON.parse(line) as { phonemes?: (string | string[])[] };
            resolve((r.phonemes ?? []).flat());
          } catch (e) {
            reject(e);
          }
        },
        printErr: () => {},
        locateFile: (u: string) => (u.endsWith(".wasm") ? o.piperWasm : u.endsWith(".data") ? o.piperData : u),
      }).then((m) => m.callMain(["-l", voice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]), reject);
    });

  return async (text: string) => {
    const ids = piperIds(await phonemes(text), cfg.phoneme_id_map);
    const out = await session.run({
      input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor("float32", Float32Array.from([inf.noise, inf.length, inf.w]), [3]),
    });
    return wav(out.output.data, rate);
  };
}
