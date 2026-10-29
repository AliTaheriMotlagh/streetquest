// What other sites know about real stores (server/localData.ts). One GET, six questions:
//   ?near=1&lat&lng            Snappfood vendors around a point (the map layer)
//   ?divar=1&lat&lng           the nearest Divar neighbourhoods and their latest ads (the map layer)
//   ?divar=<id>&city=<id>&cat  one neighbourhood's ads in a category (the Divar card's tabs)
//   ?menu=<code>&lat&lng       one vendor's menu / catalog
//   ?store=place|biz|shop      a store card's menu, Torob listings and links
//                              (place: name, lat, lng, cat · biz / shop: id)
//   ?torob=<query>[&shop=<id>] Torob prices for a product — everywhere, or in one Torob shop
//                              (an empty query there lists the shop's catalog)
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { DIVAR_CAT_KEYS, type StoreData } from "@/lib/localData";
import { requireUser } from "@/server/auth";
import { findPlace } from "@/server/city";
import { tileKey, tileOf } from "@/lib/city";
import { HttpError, route } from "@/server/http";
import { divarAround, divarPosts, storeData, torobSearch, vendorMenu, vendorsAround } from "@/server/localData";

const num = z.coerce.number().finite();
const Query = z.union([
  z.object({ near: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ divar: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ divar: z.string().regex(/^\d{1,9}$/), city: z.string().regex(/^\d{1,9}$/), cat: z.enum(DIVAR_CAT_KEYS).default("all") }),
  z.object({ menu: z.string().regex(/^[0-9a-z]{6}$/), lat: num.optional(), lng: num.optional() }),
  z.object({ store: z.literal("place"), id: z.string().max(40).optional(), name: z.string().trim().min(1).max(120), lat: num, lng: num, cat: z.string().max(20) }),
  z.object({ store: z.enum(["biz", "shop"]), id: z.string().max(40) }),
  z
    .object({ torob: z.string().trim().max(60), shop: z.coerce.number().int().positive().optional() })
    .refine((q) => q.shop || q.torob.length >= 2, { path: ["torob"], message: "Too short" }),
]);

const empty: StoreData = { menu: null, torob: [], torobQuery: "", torobShop: null, links: [], about: { photo: "", logo: "", address: "", hours: "" } };

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (!S.localDataEnabled) return "near" in q ? { vendors: [] } : "divar" in q ? (q.divar === "1" ? { areas: [] } : { posts: [] }) : "menu" in q ? { menu: null } : "torob" in q ? { items: [] } : empty;

  if ("near" in q) return { vendors: (await vendorsAround(q)).slice(0, 400) };
  if ("divar" in q) return "lat" in q ? { areas: await divarAround(q) } : { posts: await divarPosts(Number(q.city), Number(q.divar), q.cat) };
  if ("menu" in q) {
    const menu = await vendorMenu(q.menu, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined);
    if (!menu) throw new HttpError(503, t("Couldn't load the menu — try again in a moment"));
    return { menu };
  }
  if ("torob" in q) return { items: await torobSearch(q.torob, q.shop) };
  if (q.store === "place") {
    // A business that claimed this place has its own links: they win over the guess.
    // Otherwise the map's own record of the place has its phone, website, hours…
    const biz = q.id ? await prisma.business.findFirst({ where: { osmId: q.id } }) : null;
    if (biz) return storeData({ ...biz, cat: biz.category });
    const info = q.id ? (await findPlace(tileKey(tileOf(q).cx, tileOf(q).cy), q.id))?.info : undefined;
    return storeData({ name: q.name, lat: q.lat, lng: q.lng, cat: q.cat, website: info?.web, phone: info?.phone, instagram: info?.ig, hours: info?.hours, address: info?.addr, photo: info?.img });
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
