// A shop owner's 3D scan of their store (/api/shops/scan, served at /shop-scan/<id>): only the owner uploads, turns
// or takes it down; anything that isn't a sound .glb is refused; players see it on the shop and download it, cached.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, Player, randomSpot } from "../helpers";

/** The smallest valid scan: one triangle. */
function tinyGlb(): Buffer {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const json = { asset: { version: "2.0" }, buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  const total = 12 + 8 + js.length + 8 + bin.length;
  head.writeUInt32LE(0x46546c67, 0), head.writeUInt32LE(2, 4), head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(js.length, 0), jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0), bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

test("the owner's scan: upload, turn, see, take down", async ({ baseURL }) => {
  const admin = await adminPlayer(baseURL!);
  const seller = await Player.create(baseURL!);
  const other = await Player.create(baseURL!);
  const spot = randomSpot();
  await seller.goTo(spot);
  await other.goTo(spot);
  await fund(admin, (await seller.me()).id, 5000);
  expectOk(await seller.post("/api/shops", { action: "create", name: "Scanned Corner" }));
  const shop = expectOk(await seller.get<{ shop: { id: string } }>("/api/shops/mine")).data.shop;
  const up = (p: Player, body: Buffer, q = "") => p.ctx.fetch(`/api/shops/scan?shop=${shop.id}${q}`, { method: "POST", data: body, headers: { "content-type": "model/gltf-binary" } });

  // Not a .glb; not the owner.
  expect((await up(seller, Buffer.from("not a model, just some text here"))).status()).toBe(400);
  expect((await up(other, tinyGlb())).status()).toBe(403);

  const r = await up(seller, tinyGlb(), "&turn=5");
  expect(r.status()).toBe(200);
  const scan = (await r.json()).scan as { version: string; turn: number; triangles: number };
  expect(scan.turn).toBe(1);
  expect(scan.triangles).toBe(1);

  // Anyone sees it on the shop, and gets the file, cached for good.
  const seen = expectOk(await other.get<{ shop: { scan: { version: string; turn: number } } }>(`/api/shops/${shop.id}`)).data.shop.scan;
  expect(seen.version).toBe(scan.version);
  const file = await other.ctx.get(`/shop-scan/${shop.id}?v=${scan.version}`);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("model/gltf-binary");
  expect(file.headers()["cache-control"]).toContain("immutable");
  expect((await file.body()).length).toBe(tinyGlb().length);

  expect(expectOk(await seller.post<{ scan: { turn: number } }>("/api/shops/scan", { shop: shop.id, turn: 3 }, "PATCH")).data.scan.turn).toBe(3);
  expect((await other.post("/api/shops/scan", { shop: shop.id, turn: 2 }, "PATCH")).status).toBe(403);

  expect((await seller.ctx.fetch(`/api/shops/scan?shop=${shop.id}`, { method: "DELETE" })).status()).toBe(200);
  expect(expectOk(await other.get<{ shop: { scan: unknown } }>(`/api/shops/${shop.id}`)).data.shop.scan).toBeNull();
  expect((await other.ctx.get(`/shop-scan/${shop.id}?v=${scan.version}`)).status()).toBe(404);
  for (const p of [admin, seller, other]) await p.dispose();
});
