// A .cube colour lookup table (the format grading tools export) read into numbers: `size`³
// RGB triples, red changing fastest — the order the file lists them and the order a 3D
// texture wants. Pure; the 3D city's renderer turns it into a texture (engine.setLut).

export type Lut = { size: number; data: Float32Array };

/** Parse a .cube file's text. Null when it isn't one (no size, wrong row count, bad numbers). */
export function parseCube(text: string): Lut | null {
  let size = 0, lo = 0, hi = 1;
  const rows: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
    if (p[0] === "LUT_3D_SIZE") size = Number(p[1]) | 0;
    else if (p[0] === "LUT_1D_SIZE") return null;
    else if (p[0] === "DOMAIN_MIN") lo = Number(p[1]);
    else if (p[0] === "DOMAIN_MAX") hi = Number(p[1]);
    else if (/^[-+.\d]/.test(p[0])) {
      if (p.length < 3) return null;
      for (let i = 0; i < 3; i++) {
        const v = Number(p[i]);
        if (!Number.isFinite(v)) return null;
        rows.push(v);
      }
    }
  }
  // 2…64: bigger than any grading tool exports, small enough for a phone's 3D texture.
  if (size < 2 || size > 64 || rows.length !== size * size * size * 3 || !(hi > lo)) return null;
  const data = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) data[i] = Math.min(1, Math.max(0, (rows[i] - lo) / (hi - lo)));
  return { size, data };
}

/** The table that changes nothing (for tests, and as a start for a hand-made one). */
export function identityLut(size: number): Lut {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) (data[i++] = r / (size - 1)), (data[i++] = g / (size - 1)), (data[i++] = b / (size - 1));
  return { size, data };
}
