import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/drive/icons";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FEATURES } from "@/lib/features";
import { breadcrumbLd, ldJson, pageAlternates } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getT } from "@/server/i18n";
import "../landing.css";
import "./features.css";

// Every part of the game on one page, each linking to its own page (lib/features.ts) — the hub crawlers start from.
export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getT();
  return {
    title: t("Everything you can do in StreetQuest"),
    description: t("Drive your city in 3D, play online matches on real streets, find stores and prices, plan trips, ride the metro and pick up real money — all in your browser."),
    alternates: pageAlternates("/features", locale),
  };
}

export default async function Features() {
  const { t, locale } = await getT();
  const B = SITE.url;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: t("Everything you can do in StreetQuest"),
      itemListElement: FEATURES.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: t(f.title), url: `${B}/features/${f.slug}?lang=${locale}` })),
    },
    breadcrumbLd(B, [
      [SITE.name, `/?lang=${locale}`],
      [t("Features"), `/features?lang=${locale}`],
    ]),
  ];
  return (
    <main className="page lp feat">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <SiteHeader />
      <div className="wrap">
        <section className="feat-hero">
          <h1>{t("Everything you can do in StreetQuest")}</h1>
          <p className="lp-lead">{t("One app on your real streets: a 3D city to drive, matches with other players, stores and prices, trips, the metro and money to pick up. Free in your browser.")}</p>
        </section>
        <section className="lp-section">
          <div className="lp-features">
            {FEATURES.map((f) => (
              <Link className="lp-feature feat-card" href={`/features/${f.slug}`} key={f.slug}>
                <span className="lp-feature-ic"><Icon name={f.icon} size={28} /></span>
                <div>
                  <h2 className="feat-h">{t(f.title)}</h2>
                  <p>{t(f.description)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="lp-final">
          <h2>{t("The streets are waiting.")}</h2>
          <p>{t("Free in your browser. No download, no sign-up.")}</p>
          <Link href="/play" className="lp-btn primary">{t("Create your player")}</Link>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
