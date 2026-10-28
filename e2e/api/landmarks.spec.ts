// Stores' own 3D buildings: only admins manage them, the model file is checked before
// it's stored, drive mode lists them around a spot (only while a linked store's plan is
// paid, when that's asked), and the model is served at an address that never changes.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot } from "../helpers";

/** The smallest valid .glb: a header and a JSON chunk with an empty scene. */
function tinyGlb(): Buffer {
  let json = JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 });
  while (json.length % 4) json += " ";
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + json.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, Buffer.from(json)]);
}
const META = { hull: [-5, -5, 5, -5, 5, 5, -5, 5], height: 12, stats: { triangles: 1200, materials: 3, textures: 1, texturePx: 1024, meshes: 1, bytes: 100 } };
const upload = (p: Player, id: string, file: Buffer, meta: object = META) =>
  p.ctx.put(`/api/admin/landmarks?id=${id}`, { multipart: { model: { name: "store.glb", mimeType: "model/gltf-binary", buffer: file }, meta: JSON.stringify(meta) } });

test("admin places a 3D store; players near it get it, with a cacheable model", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const player = await Player.create(baseURL!);
  const at = randomSpot();
  const fields = { action: "save", name: "Test Bakery", businessId: null, lat: at.lat, lng: at.lng, yaw: 30, scale: 1, lift: 0, active: true, paidOnly: true };
  // Players can't manage them.
  expect((await player.post("/api/admin/landmarks", fields)).status).toBe(403);
  const { data } = expectOk(await admin.post<{ id: string }>("/api/admin/landmarks", fields));

  // Not a model, or too heavy for phones: refused.
  expect((await upload(admin, data.id, Buffer.from("not a model at all, just text"))).status()).toBe(400);
  expect((await upload(admin, data.id, tinyGlb(), { ...META, stats: { ...META.stats, triangles: 5_000_000 } })).status()).toBe(400);
  const up = await upload(admin, data.id, tinyGlb());
  expect(up.status()).toBe(200);
  const url = (await up.json()).url as string;
  expect(url).toMatch(/^\/landmark\/[a-z0-9]+\/[a-f0-9]{16}\.glb$/);

  // Near: listed with its outline; 5 km away: not.
  const near = expectOk(await player.get<{ landmarks: { id: string; url: string; hull: number[]; yaw: number }[] }>(`/api/landmarks?lat=${at.lat}&lng=${at.lng}`));
  const mine = near.data.landmarks.find((l) => l.id === data.id);
  expect(mine).toMatchObject({ url, yaw: 30 });
  expect(mine!.hull).toHaveLength(8);
  const far = offset(at, 5000);
  expect(expectOk(await player.get<{ landmarks: { id: string }[] }>(`/api/landmarks?lat=${far.lat}&lng=${far.lng}`)).data.landmarks.some((l) => l.id === data.id)).toBe(false);

  // The model: binary glTF, cached for good; a stale address is gone.
  const glb = await player.ctx.get(url);
  expect(glb.status()).toBe(200);
  expect(glb.headers()["content-type"]).toBe("model/gltf-binary");
  expect(glb.headers()["cache-control"]).toContain("immutable");
  expect((await player.ctx.get(url.replace(/[a-f0-9]{16}\.glb$/, "0000000000000000.glb"))).status()).toBe(404);

  // Switched off: gone from drive mode.
  expectOk(await admin.post("/api/admin/landmarks", { ...fields, id: data.id, active: false }));
  expect(expectOk(await player.get<{ landmarks: { id: string }[] }>(`/api/landmarks?lat=${at.lat}&lng=${at.lng}`)).data.landmarks.some((l) => l.id === data.id)).toBe(false);
  expectOk(await admin.post("/api/admin/landmarks", { action: "delete", id: data.id }));
});

test("a store's 3D building shows only while its plan is paid", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const owner = await Player.create(baseURL!);
  const at = randomSpot();
  await owner.goTo(at);
  const biz = expectOk(await owner.post<{ id: string }>("/api/business", { action: "create", name: "Corner Cafe", category: "cafe" })).data;
  const fields = { action: "save", name: "Corner Cafe", businessId: biz.id, lat: at.lat, lng: at.lng, yaw: 0, scale: 1, lift: 0, active: true, paidOnly: true };
  const { data } = expectOk(await admin.post<{ id: string }>("/api/admin/landmarks", fields));
  expect((await upload(admin, data.id, tinyGlb())).status()).toBe(200);
  const listed = async () => expectOk(await owner.get<{ landmarks: { id: string }[] }>(`/api/landmarks?lat=${at.lat}&lng=${at.lng}`)).data.landmarks.some((l) => l.id === data.id);
  // Free plan: hidden. On the trial (a paid plan): shown. Not tied to the plan: shown.
  expect(await listed()).toBe(false);
  expectOk(await owner.post("/api/business", { action: "trial", businessId: biz.id }));
  expect(await listed()).toBe(true);
  expectOk(await admin.post("/api/admin/landmarks", { action: "delete", id: data.id }));
});
