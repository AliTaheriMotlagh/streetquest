// Shop banners and product photos. An image row never changes (a new photo gets a
// new id), so browsers and the service worker can keep it forever. Public on
// purpose: shops are storefronts. Lives outside /api so it isn't marked no-store.
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = /^[a-z0-9]{10,40}$/.test(id) ? await prisma.shopImage.findUnique({ where: { id }, select: { data: true, type: true } }).catch(() => null) : null;
  if (!img) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(img.data), {
    headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
