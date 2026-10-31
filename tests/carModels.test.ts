// The street cars' real 3D models (scripts/cars.ts → public/models/cars, lib/carModels.ts):
// every file the manifest names is there, unchanged, small enough for a phone, licensed so
// the game may use it, and holds what drive mode reads out of it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { CAR_MODELS } from "@/lib/carModels";
import { FLEET } from "@/lib/fleet";

const PUBLIC = path.join(import.meta.dirname, "..", "public");
const models = Object.values(CAR_MODELS);
const PARTS = ["paint", "kit", "head", "tail", "wheel"];

/** The JSON chunk of a .glb. */
function gltfJson(buf: Buffer) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "binary glTF");
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
}

describe("street car models", () => {
  it("has some, each for a kind of car in traffic", () => {
    assert.ok(models.length >= 5);
    for (const m of models) assert.ok(FLEET[m!.key], m!.key);
  });

  for (const m of models) {
    describe(m!.key, () => {
      const file = path.join(PUBLIC, m!.file);
      const buf = existsSync(file) ? readFileSync(file) : null;

      it("is on disk, unchanged (the hash in its name is its bytes'), and light", () => {
        assert.ok(buf, `${m!.file} is missing — run npm run assets:cars`);
        assert.equal(buf!.length, m!.bytes);
        const hash = /\.([a-f0-9]{10})\.glb$/.exec(m!.file)?.[1];
        assert.equal(hash, createHash("sha256").update(buf!).digest("hex").slice(0, 10));
        assert.ok(m!.bytes < 400_000, `${m!.bytes} bytes`);
        assert.ok(m!.tris[0] <= 25_000 && m!.tris[1] <= 8_000 && m!.tris[1] < m!.tris[0], `triangles ${m!.tris}`);
      });

      it("may be used in the game, and says by whom", () => {
        assert.equal(m!.credit.license, "CC-BY-4.0", "only CC BY (no NonCommercial models in a game with paid features)");
        assert.ok(m!.credit.author && m!.credit.title);
        assert.match(m!.credit.url, /^https:\/\//);
      });

      it("holds every part near and far, compressed, with the car's frame", () => {
        const j = gltfJson(buf!);
        assert.deepEqual([...(j.extensionsRequired ?? [])].sort(), ["EXT_meshopt_compression", "KHR_mesh_quantization"]);
        const names = new Set(j.nodes.map((n: { name: string }) => n.name));
        for (const p of PARTS) {
          assert.ok(names.has(p), p);
          assert.ok(names.has(`${p}_far`), `${p}_far`);
        }
        const meta = j.scenes[j.scene ?? 0].extras;
        const { len, wid } = FLEET[m!.key];
        assert.equal(meta.wheels.length, 4);
        // Two each side, two front and two back, on axles under the body.
        assert.equal(meta.wheels.filter((w: { x: number }) => w.x < 0).length, 2);
        assert.equal(meta.wheels.filter((w: { steers: boolean }) => w.steers).length, 2);
        for (const w of meta.wheels) {
          assert.ok(Math.abs(w.z) < len / 2 && Math.abs(w.x) < wid / 2 + 0.1, JSON.stringify(w));
          assert.ok(Math.abs(w.y - meta.wheelR) < 0.03, "wheels stand on the ground");
        }
        assert.ok(meta.wheelR > 0.25 && meta.wheelR < 0.45, `wheel radius ${meta.wheelR}`);
        assert.ok(meta.lamp.z < -len / 4, "head lamps at the front (−z)");
        assert.ok(meta.roof.y > 1.1 && meta.roof.y < 2.1, `roof ${meta.roof.y}`);
        assert.ok(Math.abs(meta.len - len) < 0.05, `length ${meta.len} vs ${len}`);
      });
    });
  }
});
