// The film look's rules (lib/filmLook.ts) and the .cube colour table reader (lib/lut.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmLook, type FilmIn } from "@/lib/filmLook";
import { identityLut, parseCube } from "@/lib/lut";

const day: FilmIn = { speedK: 0.6, camera: "chase", night: 0, overcast: 0, sunHeight: 0.7 };

describe("film look", () => {
  it("blurs more the faster you go, and not at all standing still in a car", () => {
    assert.equal(filmLook({ ...day, speedK: 0 }).motionBlur, 0);
    const slow = filmLook({ ...day, speedK: 0.3 }).motionBlur, fast = filmLook({ ...day, speedK: 1 }).motionBlur;
    assert.ok(slow > 0 && fast > slow && fast <= 1);
  });
  it("blurs much less behind the wheel, and least from straight above", () => {
    const of = (camera: FilmIn["camera"]) => filmLook({ ...day, speedK: 1, camera }).motionBlur;
    assert.ok(of("cockpit") < of("chase") * 0.5);
    assert.ok(of("top") < of("cockpit"));
    assert.ok(of("far") < of("chase"));
    assert.ok(of("foot") > 0 && of("foot") < of("chase") * 0.5);
  });
  it("has no sun shafts or flare at night or under a closed sky", () => {
    for (const i of [{ ...day, night: 1 }, { ...day, night: 0.7 }, { ...day, overcast: 1 }, { ...day, overcast: 0.8 }]) {
      const f = filmLook(i);
      assert.equal(f.rays, 0);
      assert.equal(f.flare, 0);
    }
  });
  it("has the strongest shafts when the sun stands low", () => {
    const noon = filmLook({ ...day, sunHeight: 0.95 }), golden = filmLook({ ...day, sunHeight: 0.15, night: 0.2 });
    assert.ok(noon.rays > 0 && golden.rays > noon.rays);
  });
  it("fringes the corners more with speed, and grains more at night", () => {
    assert.ok(filmLook({ ...day, speedK: 1 }).aberration > filmLook({ ...day, speedK: 0 }).aberration * 2);
    assert.ok(filmLook({ ...day, night: 1 }).grain > filmLook(day).grain);
    assert.ok(filmLook({ ...day, night: 1 }).grain < 0.08);
  });
  it("leaves the cartoon city alone, and stays in range whatever it's fed", () => {
    assert.deepEqual(filmLook({ ...day, toon: true }), { motionBlur: 0, rays: 0, flare: 0, aberration: 0, grain: 0, split: 0 });
    for (const speedK of [-1, 0, 0.5, 1, 9]) for (const night of [-1, 0, 0.5, 1, 4]) for (const overcast of [0, 1, 3]) for (const camera of ["chase", "far", "top", "cockpit", "foot"] as const) {
      const f = filmLook({ speedK, night, overcast, camera, sunHeight: 0.4 });
      for (const [k, v] of Object.entries(f)) assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
    }
  });
});

describe(".cube colour tables", () => {
  const cube = (n: number, rows: string[], extra = "") => `# made by hand\nTITLE "t"\n${extra}LUT_3D_SIZE ${n}\n\n${rows.join("\n")}\n`;
  it("reads size and rows, red fastest", () => {
    const id = identityLut(2), rows: string[] = [];
    for (let i = 0; i < 8; i++) rows.push(`${id.data[i * 3]} ${id.data[i * 3 + 1]} ${id.data[i * 3 + 2]}`);
    const lut = parseCube(cube(2, rows))!;
    assert.equal(lut.size, 2);
    assert.deepEqual([...lut.data], [...id.data]);
    assert.deepEqual([...lut.data.slice(3, 6)], [1, 0, 0]); // second entry: red moved first
  });
  it("rescales a table with its own domain, and clamps", () => {
    const rows = Array.from({ length: 8 }, (_, i) => `${i * 100} 255 -5`);
    const lut = parseCube(cube(2, rows, "DOMAIN_MIN 0 0 0\nDOMAIN_MAX 255 255 255\n"))!;
    assert.ok(Math.abs(lut.data[3] - 100 / 255) < 1e-6);
    assert.equal(lut.data[1], 1);
    assert.equal(lut.data[2], 0);
    assert.equal(lut.data[21], 1);
  });
  it("refuses what isn't a 3D table", () => {
    assert.equal(parseCube(""), null);
    assert.equal(parseCube("<html>not found</html>"), null);
    assert.equal(parseCube(cube(2, ["0 0 0"])), null); // too few rows
    assert.equal(parseCube(cube(2, Array(8).fill("0 0 x"))), null);
    assert.equal(parseCube("LUT_1D_SIZE 4\n0 0 0\n"), null);
    assert.equal(parseCube(cube(200, [])), null);
  });
});
