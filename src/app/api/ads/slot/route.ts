// One ad slot (components/AdSlot.tsx): a house ad if any is running, and the networks to fall back on
// for the player's country (lib/ads/slot.ts adChain). Open to guests; never cached (each call is a view).
import { route } from "@/server/http";
import { serveSlot } from "@/server/houseAds";
import { countryOf } from "@/lib/clientIp";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => serveSlot(countryOf(req.headers)));
