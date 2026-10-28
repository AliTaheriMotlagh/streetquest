// What other sites know about real stores (server/localData.ts). One GET, four questions:
//   ?near=1&lat&lng            Snappfood vendors around a point (the map layer)
//   ?menu=<code>&lat&lng       one vendor's menu / catalog
//   ?store=place|biz|shop      a store card's menu, Torob listings and links
//                              (place: name, lat, lng, cat · biz / shop: id)
//   ?torob=<query>             Torob prices for a product
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { t } from "@/lib/i18n";
import type { StoreData } from "@/lib/localData";
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { storeData, torobSearch, vendorMenu, vendorsAround } from "@/server/localData";

const num = z.coerce.number().finite();
const Query = z.union([
  z.object({ near: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ menu: z.string().regex(/^[0-9a-z]{6}$/), lat: num.optional(), lng: num.optional() }),
  z.object({ store: z.literal("place"), id: z.string().max(40).optional(), name: z.string().trim().min(1).max(120), lat: num, lng: num, cat: z.string().max(20) }),
  z.object({ store: z.enum(["biz", "shop"]), id: z.string().max(40) }),
  z.object({ torob: z.string().trim().min(2).max(60) }),
]);

const empty: StoreData = { menu: null, torob: [], torobQuery: "", links: [] };

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (!S.localDataEnabled) return "near" in q ? { vendors: [] } : "menu" in q ? { menu: null } : "torob" in q ? { items: [] } : empty;

  if ("near" in q) return { vendors: (await vendorsAround(q)).slice(0, 120) };
  if ("menu" in q) {
    const menu = await vendorMenu(q.menu, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined);
    if (!menu) throw new HttpError(503, t("Couldn't load the menu — try again in a moment"));
    return { menu };
  }
  if ("torob" in q) return { items: await torobSearch(q.torob) };
  if (q.store === "place") {
    // A business that claimed this place has its own links: they win over the guess.
    const biz = q.id ? await prisma.business.findFirst({ where: { osmId: q.id } }) : null;
    return storeData(biz ? { ...biz, cat: biz.category } : { name: q.name, lat: q.lat, lng: q.lng, cat: q.cat });
  }
  if (q.store === "biz") {
    const b = await prisma.business.findUnique({ where: { id: q.id } });
    if (!b) throw new HttpError(404, t("Business not found"));
    return storeData({ ...b, cat: b.category });
  }
  const s = await prisma.shop.findUnique({ where: { id: q.id } });
  if (!s) throw new HttpError(404, t("Shop not found"));
  return storeData({ ...s, cat: s.category });
});
