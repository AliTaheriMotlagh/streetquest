// Subtitles that run with the voice (pure; tests/subtitle.test.ts): how much of a line shows at
// `k` (0…1 of the way through saying it). Whole words only — a Persian word cut in half changes
// its letters' shapes — and longer words take longer, as they do when spoken.

/** The start of `text` said by `k` (0 = nothing, 1 = all), ending on a whole word. */
export function revealWords(text: string, k: number): string {
  if (k >= 1) return text;
  if (k <= 0) return "";
  const parts = text.split(/(\s+)/);
  // Weight each word by its letters (+1 for the pause after it).
  const words = parts.filter((p, i) => i % 2 === 0);
  const total = words.reduce((s, w) => s + w.length + 1, 0);
  const want = k * total;
  let got = 0, out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const w = parts[i];
    if (got > 0 && got + (w.length + 1) / 2 > want) break;
    out += (i ? parts[i - 1] : "") + w;
    got += w.length + 1;
    if (got >= want) break;
  }
  return out;
}
