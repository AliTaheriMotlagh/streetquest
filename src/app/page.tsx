import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { AutoVideo } from "@/components/AutoVideo";
import { prisma } from "@/lib/db";
import { SITE } from "@/lib/site";
import { fmtNum, msg } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

const FEATURES = [
  ["🏰", msg("Build a base on your street"), msg("Pick a faction, plant your base where you really are, then build power, supply lines, barracks, factories and turrets on real timers.")],
  ["🎖️", msg("Command an army"), msg("Train rangers, tanks, artillery and jets. Capture oil derricks in person and siege rival bases up to 5 km away.")],
  ["🔫", msg("Drop into first person"), msg("Walk up to an enemy base while players are online and the fight turns into a live FPS breach — capture their Command Center.")],
  ["💀", msg("World bosses"), msg("Mechs and warlords roam the map with shared HP. Raid them in first person with your crew or bombard them with your army.")],
  ["🛏️", msg("A life to look after"), msg("Your commander gets hungry, tired and lonely. Eat, sleep at base and hang out with nearby players — a good mood means more XP.")],
  ["🗺️", msg("Your streets, your map"), msg("Real GPS, real places. Missions, items and chests spawn around you wherever you are on Earth.")],
  ["🏁", msg("GTA-style timed runs"), msg("Getaways, street races and dead drops — reach the target before the clock hits zero.")],
  ["🔓", msg("Chests & mini-games"), msg("Crack locks, win arcade challenges and score rare loot — some only appear at night.")],
  ["📦", msg("Real package deliveries"), msg("Players post real delivery requests. Carry them across town, hand over with a secret code, get paid.")],
  ["📍", msg("Messages at places"), msg("Leave notes pinned to real locations. Only people who physically show up can read them.")],
  ["🤝", msg("Crews & live events"), msg("Add friends, see who's online, chat, and set up group quests with squad XP bonuses.")],
  ["🌙", msg("Time matters"), msg("Day, dusk and night change what spawns. Golden hour doubles XP — wherever your timezone is.")],
  ["🏆", msg("Levels, streaks, ranks"), msg("Level up from Rookie to Street Legend, keep daily streaks and climb global and crew leaderboards.")],
];

const FAQ = [
  ["Is StreetQuest free?", msg("Yes. StreetQuest is free to play in any modern mobile browser — no app store download needed. You can add it to your home screen like an app.")],
  ["Does it work in my city?", msg("Yes. The world is generated from GPS coordinates, so missions and items spawn everywhere on Earth, from big cities to small towns.")],
  ["How do real package deliveries work?", msg("A player posts a request with pickup and drop-off points and a coin reward held in escrow. A courier accepts, checks in at the pickup with GPS, and completes the delivery by entering a secret handover code the recipient receives from the sender.")],
  ["Is my location shared?", msg("Only friends see your precise position while you are online. Other players see an approximate location, and you can stop sharing anytime by closing the game.")],
  ["How is this different from Pokémon GO?", msg("StreetQuest is a strategy war game on real streets: you build a base, train an army and siege rivals, fight live first-person battles when players meet near a base, raid world bosses together, and keep your commander fed, rested and happy.")],
  ["When does a fight turn first-person?", msg("When you're within 200 m of an enemy base or a boss and other players are online nearby. Otherwise battles are auto-resolved with your army, Generals-style.")],
];

const STEPS = [
  ["1", msg("Open the map"), msg("Allow location. The world around you fills with loot, chests, runs and players.")],
  ["2", msg("Walk there"), msg("Get within 40 m to interact. Crack locks, play mini-games, race the clock.")],
  ["3", msg("Level up together"), msg("Add friends, chat, join events and climb the leaderboards.")],
];

export default async function Home() {
  const { t, locale } = await getT();
  const [announcements, players, events] = await Promise.all([
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 2 }).catch(() => []),
    prisma.user.count().catch(() => 0),
    prisma.event.count({ where: { endsAt: { gt: new Date() }, isPublic: true } }).catch(() => 0),
  ]);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: SITE.name,
      url: SITE.url,
      description: t(SITE.description),
      inLanguage: locale,
      genre: ["Location-based game", "Adventure", "Augmented reality"],
      gamePlatform: ["Web browser", "iOS", "Android"],
      applicationCategory: "Game",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: t(q), acceptedAnswer: { "@type": "Answer", text: t(a) } })),
    },
  ];

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <div className="wrap">
        {announcements.map((a) => (
          <div className="announce" key={a.id}>
            <b dir="auto">📣 {a.title}</b>
            <span className="grow muted" style={{ minWidth: 180 }} dir="auto">{a.body}</span>
            {a.ctaUrl && (
              <a className="btn yellow small" href={a.ctaUrl}>
                {a.ctaLabel ?? t("Go")}
              </a>
            )}
          </div>
        ))}

        <section className="hero">
          <div>
            <span className="tag" style={{ background: "rgba(255,46,136,.2)", color: "var(--pink)" }}>
              {t("Real-world GPS war game")}
            </span>
            <h1 style={{ margin: "14px 0" }}>
              {t("Your city is")} <em>{t("the game map.")}</em>
            </h1>
            <p>
              {t("Build a base on your actual street, train an army and siege your rivals. Get close while they're online and it turns into a first-person firefight. Hunt world bosses with your crew, and keep your commander fed, rested and happy.")}
            </p>
            <div className="row wrap" style={{ marginTop: 24 }}>
              <Link href="/play" className="btn" style={{ fontSize: 16, padding: "16px 26px" }}>
                {t("▶ Play now — no sign-up")}
              </Link>
              <Link href="/events" className="btn ghost">
                {t("Browse events")}
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: 16 }}>
              {t("{n, plural, one {# player} other {# players}}", { n: players })} · {t("{n} live & upcoming events", { n: events })} · {t("Works in your browser")}
            </p>
          </div>
          <div className="phone">
            {/* The 15 s gameplay trailer (muted autoplay; tap for sound). */}
            <AutoVideo className="phone-video" src="/media/streetquest-ad.mp4" poster="/media/streetquest-ad.jpg" label={t("StreetQuest gameplay trailer")} />
          </div>
        </section>

        <section className="features" aria-label={t("Features")}>
          {FEATURES.map(([e, title, d]) => (
            <article className="feature" key={title}>
              <div className="e">{e}</div>
              <h3>{t(title)}</h3>
              <p>{t(d)}</p>
            </article>
          ))}
        </section>

        <section className="section">
          <h2>{t("How it works")}</h2>
          <div className="features" style={{ paddingTop: 0 }}>
            {STEPS.map(([n, title, d]) => (
              <div className="feature" key={n}>
                <div className="big-num" style={{ color: "var(--pink)" }}>{fmtNum(Number(n), locale)}</div>
                <h3>{t(title)}</h3>
                <p>{t(d)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section faq">
          <h2>{t("FAQ")}</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{t(q)}</summary>
              <p>{t(a)}</p>
            </details>
          ))}
        </section>

        <section className="section center">
          <h2>{t("The streets are waiting.")}</h2>
          <Link href="/play" className="btn yellow" style={{ marginTop: 10 }}>
            {t("Create your player")}
          </Link>
        </section>
      </div>
      <footer className="footer">
        <div className="wrap row wrap">
          <span>© {fmtNum(new Date().getFullYear(), locale).replace(/٬|,/g, "")} {t(SITE.name)}</span>
          <span className="grow" />
          <span>{t("Play safe: stay aware of your surroundings, respect private property and traffic laws.")}</span>
        </div>
      </footer>
    </main>
  );
}
