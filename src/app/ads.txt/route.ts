// ads.txt (IAB): tells ad buyers Google may sell this site's ad space. Without it
// AdSense limits or stops serving ads. Empty until ADSENSE_CLIENT is set.
import { adsTxt } from "@/server/ads";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(adsTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
