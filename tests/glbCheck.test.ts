import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGlb, quarterTurns, SCAN_LIMITS } from "../src/lib/glbCheck";

/** A .glb with this JSON and an empty binary chunk. */
function glb(json: unknown, total?: number): Uint8Array {
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  js = new Uint8Array([...js, ...new Array(pad).fill(0x20)]);
  const len = total ?? 12 + 8 + js.length;
  const out = new Uint8Array(12 + 8 + js.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, len, true);
  dv.setUint32(12, js.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  return out;
}
const room = (tris: number, extra: object = {}) => ({
  asset: { version: "2.0" },
  meshes: [{ primitives: [{ indices: 1, attributes: { POSITION: 0 } }] }],
  accessors: [{ count: tris * 3 }, { count: tris * 3 }],
  images: [{}, {}],
  materials: [{}],
  ...extra,
});

test("a good scan passes and says how heavy it is", () => {
  const c = checkGlb(glb(room(120_000, { extensionsRequired: ["EXT_meshopt_compression", "KHR_mesh_quantization", "EXT_texture_webp"] })));
  assert.ok(c.ok);
  if (c.ok) assert.deepEqual([c.info.triangles, c.info.textures, c.info.meshes], [120_000, 2, 1]);
});

test("anything else is turned away with a reason", () => {
  assert.equal(checkGlb(new TextEncoder().encode("hello, not a model at all")).ok, false);
  assert.equal(checkGlb(glb(room(10), 9999)).ok, false, "length doesn't add up");
  assert.equal(checkGlb(glb({ ...room(10), asset: { version: "1.0" } })).ok, false);
  assert.equal(checkGlb(glb(room(10, { extensionsRequired: ["KHR_texture_basisu"] }))).ok, false, "no basis loader in the game");
  assert.equal(checkGlb(glb(room(SCAN_LIMITS.triangles + 1))).ok, false);
  assert.equal(checkGlb(glb({ asset: { version: "2.0" } })).ok, false, "empty");
  const big = new Uint8Array(SCAN_LIMITS.bytes + 1);
  assert.equal(checkGlb(big).ok, false);
});

test("quarter turns wrap round", () => {
  assert.deepEqual([0, 1, 4, 5, -1, "2", null].map(quarterTurns), [0, 1, 0, 1, 3, 2, 0]);
});
