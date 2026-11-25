// One shop with everything on its shelves (the owner also sees hidden products).
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { PRODUCT_SELECT, SHOP_SELECT, shopView } from "@/server/shops";

export const GET = route(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const here = sp.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const s = await prisma.shop.findUnique({
    where: { id },
    select: { ...SHOP_SELECT, products: { select: PRODUCT_SELECT, orderBy: [{ featured: "desc" }, { createdAt: "desc" }] } },
  });
  if (!s) throw new HttpError(404, t("This shop doesn't exist any more"));
  const { products, ...shop } = s;
  // Its owner's 3D scan, if there is one (the file itself: /shop-scan/<id>?v=<version>).
  const scan = await prisma.shopScan.findUnique({ where: { shopId: id }, select: { version: true, turn: true, bytes: true, triangles: true } }).catch(() => null);
  return { shop: { ...shopView(shop, products, u.id, here), scan } };
});
