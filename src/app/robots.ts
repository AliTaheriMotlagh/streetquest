import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// /play stays out: rendering it would sign crawlers up as guests through the API (and it's noindex anyway).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/play", "/dev/", "/offline"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
