import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { LocalTime } from "@/components/LocalTime";
import { prisma } from "@/lib/db";
import { getT } from "@/server/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Live & upcoming real-world events"),
    description: t("Join StreetQuest group quests near you. Meet up, check in with GPS and earn squad XP bonuses."),
    alternates: { canonical: "/events" },
  };
}

export default async function EventsPage() {
  const { t } = await getT();
  const events = await prisma.event.findMany({
    where: { isPublic: true, endsAt: { gt: new Date() } },
    orderBy: [{ official: "desc" }, { startsAt: "asc" }],
    include: { _count: { select: { participants: true } }, creator: { select: { username: true } } },
    take: 100,
  });
  return (
    <main className="page">
      <SiteHeader />
      <div className="wrap section">
        <h1 style={{ fontSize: 40, marginBottom: 20 }}>{t("Events")}</h1>
        {events.length === 0 && <p className="muted">{t("No public events right now — create one in the game!")}</p>}
        {events.map((e) => (
          <Link key={e.id} href={`/e/${e.slug}`} className="card list-item" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="icon-tile">{e.official ? "⭐" : "🎉"}</div>
            <div className="grow">
              <b>{e.title}</b>
              <div className="small muted">
                <LocalTime iso={e.startsAt.toISOString()} /> · {t("{n}/{max} going · by {name}", { n: e._count.participants, max: e.maxPlayers, name: e.creator.username })}
              </div>
            </div>
            {e.official && <span className="tag" style={{ color: "var(--yellow)" }}>{t("Official")}</span>}
          </Link>
        ))}
      </div>
    </main>
  );
}
