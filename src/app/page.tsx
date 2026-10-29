import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { AutoVideo } from "@/components/AutoVideo";
import { VisitCount } from "@/components/VisitCount";
import { ArtSprite, ArtUse } from "@/components/art/ArtSprite";
import { prisma } from "@/lib/db";
import { SITE } from "@/lib/site";
import { fmtNum, msg } from "@/lib/i18n";
import { getT } from "@/server/i18n";
import { visitTotals } from "@/server/visits";
import "./landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** The three big reasons to play, with their art. */
const PILLARS = [
  ["cash", msg("Pick up real money on your streets"), msg("Money appears around you on the map. Walk to it and it's yours — 10,000 toman a pickup, and 1,000 when you play from home."), true],
  ["bank", msg("Cash out to your bank card"), msg("Reach 1,000,000 toman and ask for a payout to your card or Sheba number. We check it and pay it."), false],
  ["shop", msg("A job at every store"), msg("Cafés, bakeries, groceries and pharmacies on the map each have a mission: check in, or pick up an order and deliver it for more toman."), false],
] as const;

const FEATURES = [
  ["raceCar", msg("Drive your real streets in 3D"), msg("Real buildings, shops and street names. Drive through your neighbourhood and pick money up as you pass.")],
  ["moneybag", msg("Special money drops"), msg("Gold money appears on busy streets and at store openings — worth more, and gone when it's gone.")],
  ["map", msg("Your streets, your map"), msg("Real GPS, real places. Money appears around you wherever you are, every 20 minutes.")],
  ["bizTower", msg("Idle street empire"), msg("Build a business empire that earns while you're away — and every step you walk makes it grow faster.")],
  ["box", msg("Real package deliveries"), msg("Players post real delivery requests. Carry them across town, hand over with a secret code, get paid.")],
  ["pin", msg("Messages at places"), msg("Leave notes pinned to real locations. Only people who physically show up can read them.")],
  ["people", msg("Crews & live events"), msg("Add friends, see who's online, chat, call, and meet up at real places.")],
  ["trophy", msg("Levels, streaks, ranks"), msg("Level up, keep daily streaks and climb the leaderboards.")],
] as const;

const FAQ = [
  [msg("Is StreetQuest free?"), msg("Yes. StreetQuest is free to play in any modern mobile browser — no app store download needed. You can add it to your home screen like an app.")],
  [msg("How much is the money on the map worth?"), msg("Each pickup is 10,000 toman when you walk there with GPS, and 1,000 toman when you play from home. Store missions and special drops can pay more.")],
  [msg("How do I cash out?"), msg("Once your wallet reaches 1,000,000 toman, open Wallet, enter your name, mobile number and card or Sheba number, and ask for a payout. We check it and pay it to your account.")],
  [msg("Does it work in my city?"), msg("Yes. Money appears from GPS coordinates, so it's everywhere on Earth, from big cities to small towns.")],
  [msg("How do real package deliveries work?"), msg("A player posts a request with pickup and drop-off points and a coin reward held in escrow. A courier accepts, checks in at the pickup with GPS, and completes the delivery by entering a secret handover code the recipient receives from the sender.")],
  [msg("Is my location shared?"), msg("Only friends see your precise position while you are online. Other players see an approximate location, and you can stop sharing anytime by closing the game.")],
];

const STEPS = [
  [msg("Open the map"), msg("Allow location, or play from home. Money and stores fill the map around you.")],
  [msg("Walk there"), msg("Get close to the money and pick it up. Do store missions for more.")],
  [msg("Cash out"), msg("Reach 1,000,000 toman and get paid to your bank card.")],
];

const ART = ["cash", "moneybag", ...PILLARS.map((p) => p[0]), ...FEATURES.map((f) => f[0])];

export default async function Home() {
  const { t, locale } = await getT();
  const [announcements, players, events, visits] = await Promise.all([
    prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 2 }).catch(() => []),
    prisma.user.count().catch(() => 0),
    prisma.event.count({ where: { endsAt: { gt: new Date() }, isPublic: true } }).catch(() => 0),
    visitTotals().catch(() => ({ total: 0, today: 0 })),
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
    <main className="page lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ArtSprite keys={ART} />
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

        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <i className="lp-live" aria-hidden />
              {t("Real-world GPS money game")}
            </span>
            <h1>
              {t("Your city is")} <em>{t("the game map.")}</em>
            </h1>
            <p className="lp-lead">
              {t("Money is lying around your real streets. Walk to it and pick it up — or play from home — then cash it out to your bank card.")}
            </p>
            <div className="lp-cta">
              <Link href="/play" className="lp-btn primary">
                {t("▶ Play now — no sign-up")}
              </Link>
              <Link href="/events" className="lp-btn ghost">
                {t("Browse events")}
              </Link>
            </div>
            <dl className="lp-stats">
              <div>
                <dt>{t("Players")}</dt>
                <dd>{fmtNum(players, locale)}</dd>
              </div>
              <div>
                <dt>{t("Live & upcoming events")}</dt>
                <dd>{fmtNum(events, locale)}</dd>
              </div>
              <VisitCount total={visits.total} today={visits.today} />
              <div>
                <dt>{t("Works in your browser")}</dt>
                <dd>{t("Free")}</dd>
              </div>
            </dl>
          </div>
          <div className="lp-device">
            <div className="lp-glow" aria-hidden />
            <div className="lp-phone">
              {/* The 15 s gameplay trailer (muted autoplay; tap for sound). */}
              <div className="lp-screen">
                <AutoVideo className="phone-video" src="/media/streetquest-ad.mp4" poster="/media/streetquest-ad.jpg" label={t("StreetQuest gameplay trailer")} />
              </div>
            </div>
            <div className="lp-float a" aria-hidden>
              <ArtUse k="cash" size={30} />
              <span>
                <b>+{fmtNum(10000, locale)}</b>
                <small>{t("toman picked up")}</small>
              </span>
            </div>
            <div className="lp-float b" aria-hidden>
              <ArtUse k="moneybag" size={30} />
              <span>
                <b>{t("Cashed out")}</b>
                <small>{t("Paid to your card")}</small>
              </span>
            </div>
          </div>
        </section>

        <section className="lp-pillars" aria-label={t("Features")}>
          {PILLARS.map(([k, title, d, fresh]) => (
            <article className="lp-pillar lp-reveal" key={k}>
              <div className="lp-pillar-art">
                <ArtUse k={k} size={76} />
              </div>
              {fresh && <span className="lp-new">{t("New")}</span>}
              <h2>{t(title)}</h2>
              <p>{t(d)}</p>
            </article>
          ))}
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">{t("Everything in the game")}</h2>
          <div className="lp-features">
            {FEATURES.map(([k, title, d]) => (
              <article className="lp-feature lp-reveal" key={k}>
                <span className="lp-feature-ic">
                  <ArtUse k={k} size={34} />
                </span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(d)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">{t("How it works")}</h2>
          <ol className="lp-steps">
            {STEPS.map(([title, d], i) => (
              <li className="lp-step lp-reveal" key={title}>
                <span className="lp-step-n">{fmtNum(i + 1, locale)}</span>
                <h3>{t(title)}</h3>
                <p>{t(d)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-faq">
          <h2 className="lp-h2">{t("FAQ")}</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{t(q)}</summary>
              <p>{t(a)}</p>
            </details>
          ))}
        </section>

        <section className="lp-final lp-reveal">
          <h2>{t("The streets are waiting.")}</h2>
          <p>{t("Free in your browser. No download, no sign-up.")}</p>
          <Link href="/play" className="lp-btn primary">
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
