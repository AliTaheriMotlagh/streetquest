// The store directories and the other store sites (server/storeSites.ts). One GET:
//   ?near=1&lat&lng&sites=bilbooard,irangaah,okala,netbarg[&ads=1]
//                         directory stores round a point (merged, nearest first) and, with ads=1,
//                         Sheypoor's newest ads pinned on the neighbourhoods round it
//   ?detail=<site:id>&url&lat&lng   one store's page in full (photos, hours, phones, the deal, reviews)
//   ?basalam=<query>[&city]          Basalam products (sellers in the player's city first)
//   ?city=1&lat&lng                  the city a point is in (the services list's links) and which sites answer
import { z } from "zod";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { leaveInfo, MAP_SITES, type MapSite } from "@/lib/stores/directory";
import { basalamSearch, cityAt, phonesOf, sitesOn, storeDetail, storesAround } from "@/server/storeSites";

const lat = z.coerce.number().finite().min(-90).max(90);
const lng = z.coerce.number().finite().min(-180).max(180);
const Query = z.union([
  z.object({
    near: z.literal("1"),
    lat,
    lng,
    sites: z.string().max(80).default(MAP_SITES.join(",")),
    ads: z.enum(["0", "1"]).default("0"),
  }),
  z.object({ detail: z.string().regex(/^(bilbooard|irangaah|okala|netbarg):[\w~.-]{1,120}$/), url: z.string().url().max(400), lat: lat.optional(), lng: lng.optional() }),
  z.object({ basalam: z.string().trim().min(2).max(60), city: z.string().trim().max(40).optional() }),
  z.object({ city: z.literal("1"), lat, lng }),
]);

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const on = S.localDataEnabled;
  if ("near" in q) {
    if (!on) return { stores: [], ads: [], city: null, pending: false };
    const want = q.sites.split(",").filter((s): s is MapSite => (MAP_SITES as string[]).includes(s));
    return storesAround(q, want, q.ads === "1");
  }
  if ("detail" in q) {
    // The page asked for must be on the store's own site.
    const site = q.detail.split(":")[0];
    if (!on || leaveInfo(q.url)?.site?.id !== site) return { detail: null };
    const at = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    const d = await storeDetail(q.detail, q.url, at);
    return { detail: d && at ? { ...d, phones: await phonesOf(d, at) } : d };
  }
  if ("basalam" in q) return { products: on ? await basalamSearch(q.basalam, q.city) : [] };
  return { city: on ? await cityAt(q) : null, sites: sitesOn() };
});
