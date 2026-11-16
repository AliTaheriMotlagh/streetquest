// Iranian number plates (pure; tests/plate.test.ts): two digits, a letter, three digits, and the
// region's two digits in the «ایران» box — «۱۲ ب ۳۴۵ | ۶۷». White with the blue I.R. IRAN strip;
// a taxi's is yellow. The same seed gives the same plate (your car keeps its number).

/** Letters used on private and taxi plates. */
export const PLATE_LETTERS = ["ب", "ج", "د", "س", "ص", "ط", "ق", "ل", "م", "ن", "و", "ه", "ی"] as const;
const FA = "۰۱۲۳۴۵۶۷۸۹";
export const faDigits = (s: string) => s.replace(/[0-9]/g, (d) => FA[+d]);

export type Plate = { two: string; letter: string; three: string; region: string; taxi: boolean };

/** A plate from a seed: digits never start with 0 (as on real plates); region 10–99. */
export function plateFor(seed: number, taxi = false): Plate {
  let h = (seed | 0) ^ 0x5bd1e995;
  const next = (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h + Math.imul(h ^ (h >>> 7), 0x297a2d39);
    return ((h ^ (h >>> 14)) >>> 0) % n;
  };
  const two = String(11 + next(89));
  const letter = taxi ? "ت" : PLATE_LETTERS[next(PLATE_LETTERS.length)];
  const three = String(111 + next(889));
  const region = String(10 + next(90));
  return { two, letter, three, region, taxi };
}

/** As it reads, left to right on the plate (Persian digits). */
export const plateText = (p: Plate) => `${faDigits(p.two)} ${p.letter} ${faDigits(p.three)} | ${faDigits(p.region)}`;
