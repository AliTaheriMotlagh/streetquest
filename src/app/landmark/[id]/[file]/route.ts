// A store's 3D model (.glb). The address carries the file's hash, so a given address
// never changes and browsers, the CDN and the service worker keep it for good; a new
// upload gets a new address. Public on purpose, like shop photos: it's a storefront.
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const hash = /^([a-f0-9]{16})\.glb$/.exec(file)?.[1];
  const row = hash && /^[a-z0-9]{10,40}$/.test(id) ? await prisma.landmark.findUnique({ where: { id }, select: { model: true, modelHash: true } }).catch(() => null) : null;
  if (!row?.model || row.modelHash !== hash) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(row.model), {
    headers: { "content-type": "model/gltf-binary", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
