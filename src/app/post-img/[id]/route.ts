// Feed photos. Posts are public, so the photo is too; a post's photo never changes
// (editing isn't possible), so it can be cached for long. Outside /api so it isn't no-store.
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = /^[a-z0-9]{10,40}$/.test(id) ? await prisma.post.findUnique({ where: { id }, select: { photo: true, photoType: true, hidden: true } }).catch(() => null) : null;
  if (!p?.photo || !p.photoType || p.hidden) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(p.photo), {
    headers: { "content-type": p.photoType, "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
