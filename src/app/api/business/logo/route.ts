// A business's logo (uploaded in the Business center): on its 3D sign, its billboard and its
// map pin. Public — it's the store's own branding. `v` (the logo's hash) makes each version
// its own URL, so it caches for good.
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { HttpError, route } from "@/server/http";

export const GET = route(async (req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const b = id ? await prisma.business.findUnique({ where: { id }, select: { logo: true, logoType: true } }) : null;
  if (!b?.logo) throw new HttpError(404, t("No logo"));
  return new Response(new Uint8Array(b.logo), { headers: { "content-type": b.logoType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
});
