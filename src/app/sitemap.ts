import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { sitemapEntry } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

// Every public page with its language versions (lib/seo.ts: ?lang= + hreflang): the landing page, events, open
// player shops (their public storefront /s/<id>), the feature pages (lib/features.ts), the API docs and the credits.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [events, shops] = await Promise.all([
    prisma.event.findMany({ where: { isPublic: true, endsAt: { gt: now } }, select: { slug: true, createdAt: true }, take: 5000 }).catch(() => []),
    prisma.shop
      .findMany({ where: { open: true, expiresAt: { gt: now }, products: { some: { active: true } } }, select: { id: true, updatedAt: true }, orderBy: { sales: "desc" }, take: 5000 })
      .catch(() => []),
  ]);
  const B = SITE.url;
  return [
    sitemapEntry(B, "/", { changeFrequency: "daily", priority: 1 }),
    sitemapEntry(B, "/features", { changeFrequency: "weekly", priority: 0.9 }),
    ...FEATURES.map((f) => sitemapEntry(B, `/features/${f.slug}`, { changeFrequency: "weekly", priority: 0.8 })),
    sitemapEntry(B, "/events", { changeFrequency: "hourly", priority: 0.8 }),
    ...events.map((e) => sitemapEntry(B, `/e/${e.slug}`, { lastModified: e.createdAt, changeFrequency: "hourly", priority: 0.7 })),
    ...shops.map((s) => sitemapEntry(B, `/s/${s.id}`, { lastModified: s.updatedAt, changeFrequency: "daily", priority: 0.6 })),
    sitemapEntry(B, "/developers", { changeFrequency: "monthly", priority: 0.4 }),
    sitemapEntry(B, "/credits", { changeFrequency: "monthly", priority: 0.2 }),
  ];
}
