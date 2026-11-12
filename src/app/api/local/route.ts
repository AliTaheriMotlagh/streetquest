// What other sites know about real stores (server/localData.ts). One GET, ten questions:
//   ?near=1&lat&lng            Snappfood vendors around a point (the map layer)
//   ?torobNear=1&lat&lng       Torob's walk-in stores around a point (the map layer)
//   ?divar=1&lat&lng           the nearest Divar neighbourhoods and their latest ads (the map layer)
//   ?divar=<id>&city=<id>&cat  one neighbourhood's ads in a category (the Divar card's tabs)
//   ?divarPost=<token>         one ad in full: its page in the game, before divar.ir
//   ?deals=1&lat&lng           stores with a deal or cashback on Takhfifan around a point (the map layer)
//   ?dealInfo=<id>             one Takhfifan store in full (photos, hours, contacts, every deal)
//   ?dealReviews=<id>&page     its comments, ten a page
//   ?menu=<code>&lat&lng       one vendor's menu / catalog, hours, phone and review counts
//   ?reviews=<code>&page       one vendor's reviews, ten to a page
//   ?torobPlace=<id>&lat&lng   a walk-in Torob store's page, what it was seen selling at its own
//                              prices (looked up where it stands) and the first page of its catalog
//   ?phone=1&name&lat&lng      a store's own number, waiting longer (a card that came back without one)
//   ?store=place|biz|shop      a store card's menu, Torob listings and links
//                              (place: name, lat, lng, cat · biz / shop: id)
//   ?torob=<query>[&shop=<id>] Torob prices for a product — everywhere, or in one Torob shop
//                              (an empty query there lists the shop's catalog)
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { DIVAR_CAT_KEYS, mergePhones, phonesFrom, sameStore, type Menu, type StoreData, type StorePhone } from "@/lib/localData";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { findPlace, placesNear } from "@/server/city";
import { tileKey, tileOf } from "@/lib/city";
import { HttpError, route } from "@/server/http";
import { directoryTwins } from "@/server/storeSites";
import { SITES } from "@/lib/stores/directory";
import { dealInfo, dealReviews, dealsAround, divarAround, divarPost, divarPosts, PHONE_LATE_MS, phonesFor, storeData, torobPlaceInfo, torobPlacesAround, torobSearch, vendorMenu, vendorReviews, vendorsAround } from "@/server/localData";

const num = z.coerce.number().finite();
const Query = z.union([
  z.object({ near: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ torobNear: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ reviews: z.string().regex(/^[0-9a-z]{6}$/), page: z.coerce.number().int().min(0).max(100).default(0) }),
  z.object({ torobPlace: z.coerce.number().int().positive().max(1e9), lat: num.min(-90).max(90).optional(), lng: num.min(-180).max(180).optional() }),
  z.object({ divar: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ divar: z.string().regex(/^\d{1,9}$/), city: z.string().regex(/^\d{1,9}$/), cat: z.enum(DIVAR_CAT_KEYS).default("all") }),
  z.object({ deals: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ dealInfo: z.coerce.number().int().positive().max(1e9) }),
  z.object({ dealReviews: z.coerce.number().int().positive().max(1e9), page: z.coerce.number().int().min(0).max(100).default(0) }),
  z.object({ divarPost: z.string().regex(/^[A-Za-z0-9_-]{4,16}$/) }),
  z.object({ menu: z.string().regex(/^[0-9a-z]{6}$/), lat: num.optional(), lng: num.optional() }),
  z.object({ phone: z.literal("1"), name: z.string().trim().min(1).max(120), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ store: z.literal("place"), id: z.string().max(40).optional(), name: z.string().trim().min(1).max(120), lat: num, lng: num, cat: z.string().max(20) }),
  z.object({ store: z.enum(["biz", "shop"]), id: z.string().max(40) }),
  z
    .object({ torob: z.string().trim().max(60), shop: z.coerce.number().int().positive().optional() })
    .refine((q) => q.shop || q.torob.length >= 2, { path: ["torob"], message: "Too short" }),
]);

const empty: StoreData = { menu: null, torob: [], torobQuery: "", torobShop: null, links: [], about: { photo: "", logo: "", address: "", hours: "", week: null, phone: "", phones: [] } };

/**
 * Every number anyone has for a store, each once: the ones its own listing gave (`known`),
 * the map's own record of the same place nearby (OpenStreetMap's phone tag), and Balad's /
 * Google's (cached a month; at most `waitMs` the first time). [] when nobody knows one.
 */
async function anyPhones(store: { name: string; lat: number; lng: number }, known: StorePhone[] = [], waitMs?: number): Promise<StorePhone[]> {
  const [found, around] = await Promise.all([phonesFor(store, waitMs), placesNear(store, 200, 40).catch(() => [])]);
  const same = around.find((p) => p.info?.phone && sameStore(p, { title: store.name, lat: store.lat, lng: store.lng }, distanceM(p, store)));
  return mergePhones(known, phonesFrom("map", same?.info?.phone), found);
}
/** `phones` and, for the Call button, the first of them as `phone`. */
const withPhones = <T extends { phone?: string }>(x: T, phones: StorePhone[]) => ({ ...x, phone: phones[0]?.number ?? "", phones });

/** The restaurant's own numbers (Snappfood only gives its call centre). */
async function withMapPhone(menu: Menu): Promise<Menu> {
  return withPhones(menu, await anyPhones({ name: menu.vendor.title, lat: menu.vendor.lat, lng: menu.vendor.lng }, menu.phones ?? phonesFrom("snappfood", menu.phone)));
}

/** The store's pages on Bilbooard / Irangaah as links, and their numbers after the ones it had. */
function withTwins(data: StoreData, twins: Awaited<ReturnType<typeof directoryTwins>> | null): StoreData {
  if (!twins || (!twins.links.length && !twins.phones.length)) return data;
  const phones = mergePhones(data.about.phones, twins.phones);
  const links = [...data.links, ...twins.links.map((l) => ({ kind: "directory" as const, url: l.url, label: t("On {site}", { site: t(SITES[l.site].name) }) }))];
  if (!data.about.phone && phones[0]) links.push({ kind: "phone", url: `tel:${phones[0].number.replace(/[^\d+]/g, "")}`, label: phones[0].number });
  return { ...data, links, about: { ...data.about, phones, phone: data.about.phone || phones[0]?.number || "" } };
}

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (!S.localDataEnabled) {
    if ("near" in q) return { vendors: [] };
    if ("torobNear" in q) return { shops: [], pending: false };
    if ("reviews" in q) return { reviews: { count: 0, reviews: [] } };
    if ("torobPlace" in q) return { info: null, items: [], stock: [] };
    if ("phone" in q) return { phone: "", phones: [] };
    if ("divarPost" in q) return { post: null };
    if ("deals" in q) return { deals: [] };
    if ("dealInfo" in q) return { info: null };
    if ("dealReviews" in q) return { reviews: { count: 0, avg: 0, reviews: [] } };
    return "divar" in q ? (q.divar === "1" ? { areas: [] } : { posts: [] }) : "menu" in q ? { menu: null } : "torob" in q ? { items: [] } : empty;
  }

  if ("near" in q) return { vendors: (await vendorsAround(q)).slice(0, 400) };
  if ("divarPost" in q) return { post: await divarPost(q.divarPost) };
  if ("deals" in q) return { deals: (await dealsAround(q)).slice(0, 120) };
  if ("dealInfo" in q) return { info: await dealInfo(q.dealInfo) };
  if ("dealReviews" in q) return { reviews: (await dealReviews(q.dealReviews, q.page)) ?? { count: 0, avg: 0, reviews: [] } };
  if ("torobNear" in q) {
    // The map needs where and what kind: each store's products come with its card.
    const { shops, pending } = await torobPlacesAround(q);
    return { shops: shops.slice(0, 300).map(({ stock: _, ...s }) => s), pending };
  }
  if ("reviews" in q) return { reviews: (await vendorReviews(q.reviews, q.page)) ?? { count: 0, reviews: [] } };
  if ("torobPlace" in q) {
    const at = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    const [info, items, near] = await Promise.all([torobPlaceInfo(q.torobPlace), torobSearch("", q.torobPlace), at ? torobPlacesAround(at, 400) : null]);
    // Torob's own numbers first, then the other maps' (its page often has none; the card asks again later if nobody answers in time).
    const own = info ? (info.phones ?? phonesFrom("torob", info.phone)) : [];
    const phones = info && at ? await anyPhones({ name: info.name, ...at }, own) : own;
    return { info: info ? withPhones(info, phones) : info, items, stock: near?.shops.find((s) => s.id === q.torobPlace)?.stock ?? [] };
  }
  if ("phone" in q) return withPhones({}, await anyPhones(q, [], PHONE_LATE_MS));
  if ("divar" in q) return "lat" in q ? { areas: await divarAround(q) } : { posts: await divarPosts(Number(q.city), Number(q.divar), q.cat) };
  if ("menu" in q) {
    const menu = await vendorMenu(q.menu, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined);
    if (!menu) throw new HttpError(503, t("Couldn't load the menu — try again in a moment"));
    return { menu: await withMapPhone(menu) };
  }
  if ("torob" in q) return { items: await torobSearch(q.torob, q.shop) };
  if (q.store === "place") {
    // A business that claimed this place has its own links: they win over the guess.
    // Otherwise the map's own record of the place has its phone, website, hours…
    const biz = q.id ? await prisma.business.findFirst({ where: { osmId: q.id } }) : null;
    if (biz) return storeData({ ...biz, cat: biz.category });
    const info = q.id ? (await findPlace(tileKey(tileOf(q).cx, tileOf(q).cy), q.id))?.info : undefined;
    const [data, twins] = await Promise.all([
      storeData({ name: q.name, lat: q.lat, lng: q.lng, cat: q.cat, website: info?.web, phone: info?.phone, instagram: info?.ig, hours: info?.hours, address: info?.addr, photo: info?.img }),
      directoryTwins(q).catch(() => null),
    ]);
    return withTwins(data, twins);
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
