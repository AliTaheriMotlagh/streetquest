// A shop's 3D scan (.glb), public like its photos (shops are storefronts). Asked for with ?v=<version>, so it can be
// cached forever — a new upload has a new version. Lives outside /api so it isn't marked no-store.
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = /^[a-z0-9]{10,40}$/.test(id) ? await prisma.shopScan.findUnique({ where: { shopId: id }, select: { data: true } }).catch(() => null) : null;
  if (!scan) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(scan.data), {
    headers: { "content-type": "model/gltf-binary", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
