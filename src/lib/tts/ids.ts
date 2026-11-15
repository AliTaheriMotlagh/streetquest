// Text → a voice model's input ids (pure; tests/tts.test.ts). Shared by /dev/voices (making the
// recorded lines) and the game's on-device voices (drive/tts/piper.worker.ts).
//  - Piper models: bos, pad, each phoneme followed by pad, eos (Piper's own phoneme_id_map);
//  - Mimic 3's Persian woman «haaniye»: Mimic 3's phonemes2ids — words of phonemes, each word
//    ended by "#", a blank between every symbol.

/** Phoneme symbols → a Piper model's input ids; unknown symbols are dropped. */
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
