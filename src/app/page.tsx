import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { prisma } from "@/lib/db";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

const FEATURES = [
  ["🗺️", "Your streets, your map", "Real GPS, real places. Missions, items and chests spawn around you wherever you are on Earth."],
  ["🏁", "GTA-style timed runs", "Getaways, street races and dead drops — reach the target before the clock hits zero."],
  ["🔓", "Chests & mini-games", "Crack locks, win arcade challenges and score rare loot — some only appear at night."],
  ["📦", "Real package deliveries", "Players post real delivery requests. Carry them across town, hand over with a secret code, get paid."],
  ["📍", "Messages at places", "Leave notes pinned to real locations. Only people who physically show up can read them."],
  ["🤝", "Crews & live events", "Add friends, see who's online, chat, and set up group quests with squad XP bonuses."],
  ["🌙", "Time matters", "Day, dusk and night change what spawns. Golden hour doubles XP — wherever your timezone is."],
  ["🏆", "Levels, streaks, ranks", "Level up from Rookie to Street Legend, keep daily streaks and climb global and crew leaderboards."],
];

const FAQ = [
  ["Is StreetQuest free?", "Yes. StreetQuest is free to play in any modern mobile browser — no app store download needed. You can add it to your home screen like an app."],
  ["Does it work in my city?", "Yes. The world is generated from GPS coordinates, so missions and items spawn everywhere on Earth, from big cities to small towns."],
  ["How do real package deliveries work?", "A player posts a request with pickup and drop-off points and a coin reward held in escrow. A courier accepts, checks in at the pickup with GPS, and completes the delivery by entering a secret handover code the recipient receives from the sender."],
  ["Is my location shared?", "Only friends see your precise position while you are online. Other players see an approximate location, and you can stop sharing anytime by closing the game."],
  ["How is this different from Pokémon GO?", "StreetQuest mixes collectible spawns with GTA-style timed missions, real-world courier jobs, location messages, mini-games and player-created events."],
];

export default async function Home() {
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
      description: SITE.description,
      genre: ["Location-based game", "Adventure", "Augmented reality"],
      gamePlatform: ["Web browser", "iOS", "Android"],
      applicationCategory: "Game",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <div className="wrap">
        {announcements.map((a) => (
          <div className="announce" key={a.id}>
            <b>📣 {a.title}</b>
            <span className="grow muted" style={{ minWidth: 180 }}>{a.body}</span>
            {a.ctaUrl && (
              <a className="btn yellow small" href={a.ctaUrl}>
                {a.ctaLabel ?? "Go"}
              </a>
            )}
          </div>
        ))}

        <section className="hero">
          <div>
            <span className="tag" style={{ background: "rgba(255,46,136,.2)", color: "var(--pink)" }}>
              Real-world GPS game
            </span>
            <h1 style={{ margin: "14px 0" }}>
              Your city is <em>the game map.</em>
            </h1>
            <p>
              Run missions on your actual streets, crack chests, deliver real packages for coins, leave messages at secret spots and
              squad up with friends at live events — anywhere on Earth.
            </p>
            <div className="row wrap" style={{ marginTop: 24 }}>
              <Link href="/signup" className="btn" style={{ fontSize: 16, padding: "16px 26px" }}>
                ▶ Start playing free
              </Link>
              <Link href="/events" className="btn ghost">
                Browse events
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: 16 }}>
              {players.toLocaleString()} players · {events} live & upcoming events · Works in your browser
            </p>
          </div>
          <div className="phone" aria-hidden>
            <div className="street" style={{ left: 0, right: 0, top: "30%", height: 18 }} />
            <div className="street" style={{ left: 0, right: 0, top: "68%", height: 26 }} />
            <div className="street" style={{ top: 0, bottom: 0, left: "35%", width: 20 }} />
            <div className="street" style={{ top: 0, bottom: 0, left: "75%", width: 14 }} />
            <div className="pin" style={{ left: "15%", top: "18%" }}>💎</div>
            <div className="pin" style={{ left: "60%", top: "40%", animationDelay: ".5s" }}>🧰</div>
            <div className="pin" style={{ left: "20%", top: "55%", animationDelay: "1s" }}>🏁</div>
            <div className="pin" style={{ left: "70%", top: "78%", animationDelay: "1.4s" }}>📦</div>
            <div className="pin" style={{ left: "42%", top: "86%", animationDelay: ".2s" }}>🌙</div>
            <div className="me-marker" style={{ position: "absolute", left: "45%", top: "58%" }} />
          </div>
        </section>

        <section className="features" aria-label="Features">
          {FEATURES.map(([e, t, d]) => (
            <article className="feature" key={t}>
              <div className="e">{e}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </section>

        <section className="section">
          <h2>How it works</h2>
          <div className="features" style={{ paddingTop: 0 }}>
            {[
              ["1", "Open the map", "Allow location. The world around you fills with loot, chests, runs and players."],
              ["2", "Walk there", "Get within 40 m to interact. Crack locks, play mini-games, race the clock."],
              ["3", "Level up together", "Add friends, chat, join events and climb the leaderboards."],
            ].map(([n, t, d]) => (
              <div className="feature" key={n}>
                <div className="big-num" style={{ color: "var(--pink)" }}>{n}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section faq">
          <h2>FAQ</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="section center">
          <h2>The streets are waiting.</h2>
          <Link href="/signup" className="btn yellow" style={{ marginTop: 10 }}>
            Create your player
          </Link>
        </section>
      </div>
      <footer className="footer">
        <div className="wrap row wrap">
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          <span className="grow" />
          <span>Play safe: stay aware of your surroundings, respect private property and traffic laws.</span>
        </div>
      </footer>
    </main>
  );
}
