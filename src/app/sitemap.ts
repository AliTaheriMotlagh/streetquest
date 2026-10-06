import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await prisma.event
    .findMany({ where: { isPublic: true, endsAt: { gt: new Date() } }, select: { slug: true, createdAt: true }, take: 5000 })
    .catch(() => []);
  return [
    { url: SITE.url, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/events`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE.url}/signup`, changeFrequency: "monthly", priority: 0.6 },
    ...events.map((e) => ({ url: `${SITE.url}/e/${e.slug}`, lastModified: e.createdAt, changeFrequency: "hourly" as const, priority: 0.7 })),
  ];
}
