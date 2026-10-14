// Public, indexable event page — the shareable link for marketing & invites.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LocalTime } from "@/components/LocalTime";
import { ShareButton } from "@/components/ShareButton";
import { prisma } from "@/lib/db";
import { SITE } from "@/lib/site";
import { getT } from "@/server/i18n";

type Props = { params: Promise<{ slug: string }> };

const load = (slug: string) =>
  prisma.event.findUnique({ where: { slug }, include: { _count: { select: { participants: true } }, creator: { select: { username: true } } } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getT();
  const e = await load((await params).slug);
  if (!e) return { title: t("Event not found") };
  return {
    title: e.title,
    description: e.description || t("Real-world group quest on {name}. Show up, check in, earn squad XP.", { name: SITE.name }),
    alternates: { canonical: `/e/${e.slug}` },
    openGraph: { title: `${e.title} · ${SITE.name}`, description: e.description, type: "website" },
    robots: { index: e.isPublic, follow: true },
  };
}

export default async function EventPage({ params }: Props) {
  const e = await load((await params).slug);
  if (!e) notFound();
  const { t } = await getT();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.description,
    startDate: e.startsAt.toISOString(),
    endDate: e.endsAt.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: t("Meeting point"), geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng }, address: `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` },
    organizer: { "@type": "Organization", name: SITE.name, url: SITE.url },
    isAccessibleForFree: true,
  };
  const osm = `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=17/${e.lat}/${e.lng}`;
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <div className="wrap section" style={{ maxWidth: 700 }}>
        {e.official && <span className="tag" style={{ color: "var(--yellow)" }}>{t("⭐ Official event")}</span>}
        <h1 style={{ fontSize: 42, margin: "10px 0" }}>{e.title}</h1>
        <p className="muted">
          <LocalTime iso={e.startsAt.toISOString()} /> → <LocalTime iso={e.endsAt.toISOString()} />
        </p>
        <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.description}</p>
        <div className="grid3" style={{ margin: "20px 0" }}>
          <div className="stat"><b>{e._count.participants}/{e.maxPlayers}</b><span>{t("Going")}</span></div>
          <div className="stat"><b>+{e.rewardXp}</b><span>{t("XP")}</span></div>
          <div className="stat"><b>+{e.rewardCoins}</b><span>{t("Coins")}</span></div>
        </div>
        <div className="row wrap">
          <Link href={`/play?event=${e.id}`} className="btn">{t("Join in game")}</Link>
          <a href={osm} target="_blank" rel="noreferrer" className="btn ghost">{t("Open map")}</a>
          <ShareButton title={e.title} />
        </div>
        <p className="small muted" style={{ marginTop: 20 }}>{t("Hosted by {name}. Check in with GPS within {r} m of the meeting point.", { name: e.creator.username, r: e.radiusM })}</p>
      </div>
    </main>
  );
}
