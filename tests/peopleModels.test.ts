// The real people on the pavements (scripts/people.ts → public/models/people, lib/peopleModels.ts):
// every file the manifest names is there, unchanged, light enough for a phone, licensed so the
// game may use it, and holds a skinned figure with the clips the street plays.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { PEOPLE_MODELS } from "@/lib/peopleModels";

const PUBLIC = path.join(import.meta.dirname, "..", "public");

/** The JSON chunk of a .glb. */
function gltfJson(buf: Buffer) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "binary glTF");
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
}

describe("people models", () => {
  it("has a few, so a street isn't one man cloned", () => {
    assert.ok(PEOPLE_MODELS.length >= 3);
    assert.equal(new Set(PEOPLE_MODELS.map((p) => p.key)).size, PEOPLE_MODELS.length);
  });

  for (const p of PEOPLE_MODELS) {
    describe(p.key, () => {
      const file = path.join(PUBLIC, p.url);
      const buf = existsSync(file) ? readFileSync(file) : null;

      it("is on disk, unchanged (the hash in its name is its bytes'), and light", () => {
        assert.ok(buf, `${p.url} is missing — run npm run assets:people`);
        assert.equal(buf!.length, p.bytes);
        const hash = /\.([a-f0-9]{10})\.glb$/.exec(p.url)?.[1];
        assert.equal(hash, createHash("sha256").update(buf!).digest("hex").slice(0, 10));
        assert.ok(p.bytes < 350_000, `${p.bytes} bytes`);
        assert.ok(p.tris <= 8_000, `${p.tris} triangles`);
        assert.ok(p.height > 1.5 && p.height < 2, `${p.height} m tall`);
      });

      it("may be used in the game, and says by whom", () => {
        assert.ok(p.credit, "credited in assets/credits.json");
        assert.ok(["CC-BY-4.0", "CC0-1.0"].includes(p.credit!.license), p.credit!.license);
        assert.ok(p.credit!.author && p.credit!.title);
        assert.match(p.credit!.url, /^https:\/\//);
      });

      it("is a skinned figure with the street's clips (and nothing else), compressed", () => {
        const j = gltfJson(buf!);
        assert.deepEqual([...(j.extensionsRequired ?? [])].sort(), ["EXT_meshopt_compression", "EXT_texture_webp", "KHR_mesh_quantization"]);
        assert.ok(j.skins?.length >= 1, "rigged");
        const clips = (j.animations ?? []).map((a: { name: string }) => a.name).sort();
        assert.deepEqual(clips, [...p.clips].sort());
        for (const c of ["walk", "run", "idle"] as const) assert.ok(clips.includes(c), c);
        assert.ok(p.pace.run > p.pace.walk * 2, "running is quicker than walking");
        // Base colour (and normal map) only, small textures.
        assert.ok((j.images ?? []).length <= 2);
        for (const im of j.images ?? []) assert.equal(im.mimeType, "image/webp");
      });
    });
  }
});
