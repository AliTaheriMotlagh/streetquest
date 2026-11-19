import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/drive/icons";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FEATURES, featureBySlug } from "@/lib/features";
import { breadcrumbLd, faqLd, ldJson, metaDescription, pageAlternates } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getT } from "@/server/i18n";
import "../../landing.css";
import "../features.css";

// One part of the game, told for search engines and people who haven't played yet (lib/features.ts).
export const dynamicParams = false;
export const generateStaticParams = () => FEATURES.map((f) => ({ slug: f.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = featureBySlug((await params).slug);
  const { t, locale } = await getT();
  if (!f) return { title: t("Page not found"), robots: { index: false } };
  const path = `/features/${f.slug}`;
  const description = metaDescription(t(f.description));
  const og = { url: `/og-card?lang=${locale}`, width: 1200, height: 630, alt: t(f.title) };
  return {
    title: t(f.title),
    description,
    alternates: pageAlternates(path, locale),
    openGraph: { type: "article", title: t(f.title), description, url: path, images: [og] },
    twitter: { card: "summary_large_image", title: t(f.title), description, images: [og.url] },
  };
}

export default async function FeaturePage({ params }: Props) {
  const f = featureBySlug((await params).slug);
  if (!f) notFound();
  const { t, locale } = await getT();
  const B = SITE.url;
  const path = `/features/${f.slug}`;
  const faq = f.faq.map(([q, a]) => [t(q), t(a)] as [string, string]);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${B}${path}`,
      url: `${B}${path}?lang=${locale}`,
      name: t(f.title),
      description: t(f.description),
      inLanguage: locale,
      isPartOf: { "@type": "WebSite", name: SITE.name, url: B },
      about: { "@type": "VideoGame", name: SITE.name, url: B },
    },
    breadcrumbLd(B, [
      [SITE.name, `/?lang=${locale}`],
      [t("Features"), `/features?lang=${locale}`],
      [t(f.title), `${path}?lang=${locale}`],
    ]),
    faqLd(faq),
  ];
  const others = FEATURES.filter((o) => o.slug !== f.slug);
  return (
    <main className="page lp feat">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <SiteHeader />
      <div className="wrap">
        <nav className="feat-crumbs" aria-label={t("Breadcrumb")}>
          <Link href="/">{SITE.name}</Link> <span aria-hidden>›</span> <Link href="/features">{t("Features")}</Link>
        </nav>
        <section className="feat-hero">
          <span className="feat-ic" aria-hidden><Icon name={f.icon} size={34} /></span>
          <h1>{t(f.h1)}</h1>
          <p className="lp-lead">{t(f.intro)}</p>
          <div className="lp-cta">
            <Link href={f.play} className="lp-btn primary">▶ {t(f.cta)}</Link>
            <Link href="/" className="lp-btn ghost">{t("About StreetQuest")}</Link>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-features">
            {f.points.map(([h, p]) => (
              <article className="lp-feature" key={h}>
                <div>
                  <h2 className="feat-h">{t(h)}</h2>
                  <p>{t(p)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-faq">
          <h2 className="lp-h2">{t("FAQ")}</h2>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">{t("More in StreetQuest")}</h2>
          <ul className="feat-more">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/features/${o.slug}`}>
                  <Icon name={o.icon} size={20} /> {t(o.title)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
