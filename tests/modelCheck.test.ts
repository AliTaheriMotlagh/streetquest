// The model-replace validator (lib/modelCheck.ts): every shipped model passes its own slot's
// rules, and broken uploads are refused with a reason.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { allSlots, checkModel, inspectGlb, slotRule } from "@/lib/modelCheck";
import { buildCatalog, buildSlots } from "@/lib/objectCatalog";

/** A tiny binary glTF: named nodes, one mesh with `tris` triangles and POSITION bounds, optional skin and clips. */
function glb(o: { names?: string[]; tris?: number; min?: number[]; max?: number[]; joints?: string[]; clips?: string[]; scale?: number; uri?: boolean; extras?: boolean }): Uint8Array {
  const names = o.names ?? [];
  const nodes: Record<string, unknown>[] = names.map((name, i) => ({ name, ...(i === 0 ? { mesh: 0, scale: [o.scale ?? 1, o.scale ?? 1, o.scale ?? 1] } : {}) }));
  const jointIdx = (o.joints ?? []).map((name) => nodes.push({ name }) - 1);
  const json: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i), ...(o.extras === false ? {} : { extras: { wheelR: 0.3, wheels: [], lamp: {}, roof: {} } }) }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 8, min: o.min ?? [-0.5, 0, -2], max: o.max ?? [0.5, 1.5, 2], componentType: 5126 }, { count: (o.tris ?? 12) * 3, componentType: 5123 }],
    buffers: [o.uri ? { byteLength: 4, uri: "x.bin" } : { byteLength: 4 }],
  };
  if (jointIdx.length) json.skins = [{ joints: jointIdx }];
  if (o.clips) json.animations = o.clips.map((name) => ({ name }));
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jb = new TextEncoder().encode(text);
  const out = new Uint8Array(20 + jb.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, jb.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  return out;
}

const CAR = ["paint", "kit", "head", "tail", "wheel"].flatMap((p) => [p, `${p}_far`]);

describe("inspectGlb", () => {
  it("counts triangles, bounds, bones and clips", () => {
    const i = inspectGlb(glb({ names: ["a"], tris: 100, joints: ["spine"], clips: ["walk"] }));
    assert.ok(!("error" in i));
    if ("error" in i) return;
    assert.equal(i.tris, 100);
    assert.deepEqual(i.joints, ["spine"]);
    assert.deepEqual(i.clips, ["walk"]);
    assert.deepEqual(i.bbox, { min: [-0.5, 0, -2], max: [0.5, 1.5, 2] });
  });
  it("applies a node's scale to the bounds", () => {
    const i = inspectGlb(glb({ names: ["a"], scale: 100 }));
    assert.ok(!("error" in i) && i.bbox && i.bbox.max[1] === 150);
  });
  it("refuses what isn't a glb", () => {
    assert.ok("error" in inspectGlb(new Uint8Array(40)));
  });
});

describe("checkModel", () => {
  it("accepts a car with the parts the game looks up", () => {
    const r = checkModel("car:pars", glb({ names: CAR, tris: 20_000 }));
    assert.deepEqual(r.errors, []);
  });
  it("refuses missing parts, with their names", () => {
    const r = checkModel("car:pars", glb({ names: ["paint"], tris: 100 }));
    assert.ok(r.errors.some((e) => e.params?.names && String(e.params.names).includes("wheel_far")));
  });
  it("needs a car's wheel positions in the scene properties", () => {
    const r = checkModel("car:pars", glb({ names: CAR, extras: false }));
    assert.ok(r.errors.some((e) => String(e.params?.names).includes("wheels")));
  });
  it("refuses a model over the triangle budget and warns near it", () => {
    assert.ok(checkModel("car:pars", glb({ names: CAR, tris: 200_000 })).errors.length);
    const r = checkModel("car:pars", glb({ names: CAR, tris: 50_000 }));
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1);
  });
  it("refuses a model exported in centimetres", () => {
    assert.ok(checkModel("car:pars", glb({ names: CAR, scale: 100 })).errors.length);
  });
  it("needs a skeleton, bones and clips for people and soldiers", () => {
    const bare = checkModel("person:casual", glb({ names: ["body"], min: [-0.3, 0, -0.2], max: [0.3, 1.7, 0.2] }));
    assert.ok(bare.errors.length >= 2);
    const ok = checkModel("person:casual", glb({ names: ["body"], min: [-0.3, 0, -0.2], max: [0.3, 1.7, 0.2], joints: ["hips"], clips: ["walk", "idle"] }));
    assert.deepEqual(ok.errors, []);
    const noSpine = checkModel("arena:soldier", glb({ names: ["body"], min: [-0.3, 0, -0.2], max: [0.3, 1.8, 0.2], joints: ["hips"], clips: ["Idle", "Walk", "Run", "Death"] }));
    assert.ok(noSpine.errors.some((e) => e.params?.names === "spine"));
  });
  it("needs a node for every gun", () => {
    const r = checkModel("arena:weapons", glb({ names: ["fp_pistol"], min: [0, 0, 0], max: [0.1, 0.2, 0.6] }));
    assert.ok(r.errors.some((e) => String(e.params?.names).includes("fp_sniper")));
  });
  it("refuses outside files and unknown slots", () => {
    assert.ok(checkModel("car:pars", glb({ names: CAR, uri: true })).errors.length);
    assert.ok(checkModel("car:nope", glb({})).errors.length);
    assert.equal(slotRule("nope"), null);
  });
  it("refuses an oversize file before reading it", () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    assert.ok(checkModel("car:pars", big).errors.length);
  });
});

describe("the shipped models", () => {
  it("every slot has a rule and every slot's built-in file passes it", () => {
    const slots = buildSlots(buildCatalog());
    assert.deepEqual(slots.map((s) => s.slot).sort(), allSlots().sort());
    for (const s of slots) {
      const r = checkModel(s.slot, new Uint8Array(readFileSync(`public${s.file}`)));
      assert.deepEqual(r.errors, [], s.slot);
    }
  });
});
