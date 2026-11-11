// Admin → Objects, Model update and Graphics: only admins see the catalog and replace models;
// an upload is checked, kept as a draft, published (the public /api/models manifest then lists
// it), rolled back and reverted to the built-in; graphics overrides are validated and reach players.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, Player } from "../helpers";

const GUNS = ["pistol", "smg", "rifle", "sniper", "shotgun", "deagle", "battle", "lmg", "dmr"];

/** A small binary glTF with a node per gun (what arena:weapons needs) and a believable size. */
function weaponsGlb(tris = 300): Buffer {
  const nodes = GUNS.map((g, i) => ({ name: `fp_${g}`, ...(i === 0 ? { mesh: 0 } : {}) }));
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 8, min: [0, 0, 0], max: [0.1, 0.2, 0.7], componentType: 5126 }, { count: tris * 3, componentType: 5123 }],
    buffers: [{ byteLength: 4 }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, Buffer.from(text)]);
}

const upload = (p: Player, slot: string, file: Buffer, note = "test") =>
  p.ctx.put("/api/admin/models", { multipart: { slot, note, model: { name: "m.glb", mimeType: "model/gltf-binary", buffer: file } } });
type Version = { id: string; version: number; active: boolean };
type Manifest = { models: Record<string, { version: number; url: string }> };

test("the object catalog is admin-only and lists every registry", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const player = await Player.create(baseURL!);
  expect((await player.get("/api/admin/models")).status).toBe(403);
  const { data } = expectOk(await admin.get<{ objects: { id: string; kind: string }[]; slots: { slot: string }[] }>("/api/admin/models"));
  const ids = data.objects.map((o) => o.id);
  for (const id of ["car:pars", "person:casual", "soldier:police", "weapon:rifle", "prop:tree", "loot:cash", "store:cafe"]) expect(ids).toContain(id);
  expect(data.slots.map((s) => s.slot)).toContain("arena:weapons");
});

test("upload → draft → publish → manifest → rollback → built-in, with checks and audit", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const player = await Player.create(baseURL!);
  const slot = "arena:weapons";
  // Players can't replace models.
  expect((await upload(player, slot, weaponsGlb())).status()).toBe(403);
  expect((await player.post("/api/admin/models", { action: "builtin", slot })).status).toBe(403);
  // Not a model, missing the guns' nodes, over the triangle budget, unknown slot: refused with a reason.
  expect((await upload(admin, slot, Buffer.from("just text, not a model"))).status()).toBeGreaterThanOrEqual(400);
  const bare = await upload(admin, slot, Buffer.from(weaponsGlb().toString("latin1").replaceAll("fp_sniper", "xx_sniper"), "latin1"));
  expect(bare.status()).toBe(422);
  expect(((await bare.json()).error as string).length).toBeGreaterThan(10);
  expect((await upload(admin, slot, weaponsGlb(500_000))).status()).toBe(422);
  expect((await upload(admin, "car:nope", weaponsGlb())).status()).toBe(404);

  // A good file is only a draft: the manifest doesn't list it yet.
  await admin.post("/api/admin/models", { action: "builtin", slot });
  const up = await upload(admin, slot, weaponsGlb(), "first");
  expect(up.status()).toBe(200);
  const v1 = (await up.json()).override as Version & { createdBy: string; url: string };
  expect(v1.active).toBe(false);
  expect(v1.createdBy).toBeTruthy();
  expect((await (await player.ctx.get("/api/models")).json() as Manifest).models[slot]).toBeUndefined();

  // Publish → players' manifest has it, with the audit on the row.
  expectOk(await admin.post("/api/admin/models", { action: "publish", id: v1.id }));
  expect((await (await player.ctx.get("/api/models")).json() as Manifest).models[slot].version).toBe(v1.version);
  const v2 = (await (await upload(admin, slot, weaponsGlb(400), "second")).json()).override as Version;
  expect(v2.version).toBe(v1.version + 1);
  expectOk(await admin.post("/api/admin/models", { action: "publish", id: v2.id }));
  const list = expectOk(await admin.get<{ overrides: (Version & { slot: string; publishedBy: string | null })[] }>("/api/admin/models")).data.overrides.filter((o) => o.slot === slot);
  expect(list.filter((o) => o.active).map((o) => o.version)).toEqual([v2.version]);
  expect(list.find((o) => o.id === v2.id)!.publishedBy).toBeTruthy();

  // Roll back to the first version, then to the built-in file.
  expectOk(await admin.post("/api/admin/models", { action: "rollback", id: v1.id }));
  expect((await (await player.ctx.get("/api/models")).json() as Manifest).models[slot].version).toBe(v1.version);
  expectOk(await admin.post("/api/admin/models", { action: "builtin", slot }));
  expect((await (await player.ctx.get("/api/models")).json() as Manifest).models[slot]).toBeUndefined();

  // A draft nobody published can be thrown away; a published version can't.
  const v3 = (await (await upload(admin, slot, weaponsGlb(), "third")).json()).override as Version;
  expect((await admin.post("/api/admin/models", { action: "discard", id: v1.id })).status).toBe(409);
  expectOk(await admin.post("/api/admin/models", { action: "discard", id: v3.id }));
});

test("graphics overrides are admin-only, validated, and reach players with the settings", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const player = await Player.create(baseURL!);
  expect((await player.post("/api/admin", { action: "saveSettings", data: { gfx: { all: { fogFar: 500 } } } })).status).toBe(403);
  const gfx = { all: { fogFar: 99999, bogus: 1, bloom: "yes" }, tiers: { low: { shadowMap: 2048, rainDrops: -3 }, nope: { fogFar: 1 } } };
  expectOk(await admin.post("/api/admin", { action: "saveSettings", data: { gfx } }));
  try {
    const cfg = expectOk(await admin.get<{ config: { values: { gfx: unknown } } }>("/api/admin")).data.config.values.gfx;
    expect(cfg).toEqual({ all: { fogFar: 3000 }, tiers: { low: { shadowMap: 2048, rainDrops: 0 } } });
    const me = expectOk(await player.get<{ settings: { gfx?: unknown } }>("/api/me")).data.settings;
    expect(me.gfx).toEqual(cfg);
  } finally {
    expectOk(await admin.post("/api/admin", { action: "saveSettings", data: {} }));
  }
});
