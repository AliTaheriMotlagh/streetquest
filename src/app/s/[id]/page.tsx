// A player's shop as a public web page: the link a seller shares (and search engines index) — the shop, where it
// is, and everything on its shelves with prices in coins or toman. "Open in the game" goes to the shop in the Market
// (/play?shop=<id>); toman products show how to reach the seller, as on the product page in the game.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ShareButton } from "@/components/ShareButton";
import { prisma } from "@/lib/db";
import { fmtNum, LOCALE_META, type Locale } from "@/lib/i18n";
import { ldJson, metaDescription, pageAlternates, shopLd } from "@/lib/seo";
import { categoryOf } from "@/lib/shops";
import { contactOf, KINDS, kindLine } from "@/lib/shopKinds";
import { SITE } from "@/lib/site";
import { getT } from "@/server/i18n";
import { PRODUCT_SELECT, SHOP_SELECT, shopView } from "@/server/shops";

type Props = { params: Promise<{ id: string }> };

const load = async (id: string) => {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const s = await prisma.shop.findUnique({ where: { id }, select: { ...SHOP_SELECT, products: { where: { active: true }, select: PRODUCT_SELECT, orderBy: [{ featured: "desc" }, { createdAt: "desc" }], take: 120 } } }).catch(() => null);
  if (!s) return null;
  const { products, ...shop } = s;
  return shopView(shop, products, "", null);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t, locale } = await getT();
  const s = await load((await params).id);
  if (!s) return { title: t("Shop not found"), robots: { index: false } };
  const description = metaDescription(s.tagline || s.about || t("{name} on {site}: see what's on the shelves and pick it up in person.", { name: s.name, site: SITE.name }));
  const image = s.coverId ? `/shop-img/${s.coverId}` : `/og-card?lang=${locale}`;
  return {
    title: s.name,
    description,
    alternates: pageAlternates(`/s/${s.id}`, locale),
    openGraph: { title: `${s.emoji} ${s.name} · ${SITE.name}`, description, type: "website", url: `/s/${s.id}`, images: [image] },
    twitter: { card: "summary_large_image", title: s.name, description, images: [image] },
    // A closed or empty shop stays reachable by its link but out of search results.
    robots: { index: s.live && s.inStock > 0, follow: true },
  };
}

export default async function ShopPage({ params }: Props) {
  const s = await load((await params).id);
  if (!s) notFound();
  const { t, locale } = await getT();
  const date = (ms: number) => new Intl.DateTimeFormat(LOCALE_META[locale as Locale].intl, { dateStyle: "medium", timeStyle: "short" }).format(ms);
  const money = (n: number, currency: "coins" | "toman") => (currency === "toman" ? (n ? t("{n} toman", { n: fmtNum(n, locale) }) : t("Ask the seller")) : `${fmtNum(n, locale)} 🪙`);
  const cat = categoryOf(s.category);
  const osm = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=18/${s.lat}/${s.lng}`;
  const play = `/play?shop=${s.id}`;

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(shopLd(SITE.url, s, s.products)) }} />
      <SiteHeader />
      <div className="wrap section storefront-page">
        {s.coverId && <img className="sf-cover" src={`/shop-img/${s.coverId}`} alt="" decoding="async" />}
        <h1 dir="auto"><span aria-hidden>{s.emoji}</span> {s.name}</h1>
        {s.tagline && <p className="muted" dir="auto">{s.tagline}</p>}
        <p className="small muted">
          <span className={`tag ${s.live ? "tag-open" : "tag-closed"}`}>{s.live ? t("Open") : t("Closed")}</span> {cat.emoji} {t(cat.label)} · {t("Run by {name}", { name: s.owner.username })}
          {s.sales > 0 && ` · ${t("{n} sold", { n: s.sales })}`}
        </p>
        {s.address && <p dir="auto">🏠 {s.address}</p>}
        {s.about && <p className="sf-about" dir="auto">{s.about}</p>}
        <div className="row wrap" style={{ gap: 8, margin: "14px 0" }}>
          <Link className="btn yellow" href={play}>🛍️ {t("Open in the game")}</Link>
          <a className="btn ghost" href={osm} target="_blank" rel="noopener noreferrer">🗺️ {t("Map")}</a>
          {s.phone && <a className="btn ghost" href={`tel:${s.phone}`} dir="ltr">📞 {s.phone}</a>}
          <ShareButton title={s.name} text={s.tagline || undefined} url={`${SITE.url}/s/${s.id}`} />
        </div>

        <h2>{t("All products")}</h2>
        {s.products.length ? (
          <div className="sf-grid">
            {s.products.map((p) => {
              const kind = KINDS[p.kind];
              const line = kindLine(p.kind, p.details, { date });
              const contact = p.currency === "toman" ? contactOf(p.kind, p.details, s) : null;
              return (
                <article key={p.id} id={`p-${p.id}`} className={`sf-item card ${p.over || p.stock === 0 ? "dim" : ""}`}>
                  <div className={`sf-photo ${p.photos[0] ? "" : "empty"}`}>{p.photos[0] ? <img src={`/shop-img/${p.photos[0]}`} alt={p.title} loading="lazy" decoding="async" /> : <span aria-hidden>{kind.emoji}</span>}</div>
                  <div className="sf-body">
                    <span className="small muted">{kind.emoji} {t(kind.label)}</span>
                    <h3 dir="auto">{p.title}</h3>
                    {line && <p className="small muted" dir="auto">{line}</p>}
                    <p className="sf-price">
                      <b>{money(p.priceNow, p.currency)}</b>
                      {p.deal > 0 && p.price > 0 && <s className="muted"> {money(p.price, p.currency)}</s>}
                    </p>
                    {p.over ? <p className="small muted">{t("That's already over")}</p> : p.stock === 0 ? <p className="small muted">{t("Sold out")}</p> : null}
                    {p.description && <p className="small" dir="auto">{metaDescription(p.description, 220)}</p>}
                    {contact?.phone && <a className="small" href={`tel:${contact.phone}`} dir="ltr">📞 {contact.phone}</a>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">{t("Nothing on the shelves right now.")}</p>
        )}
        <p className="small muted" style={{ marginTop: 18 }}>{t("Coin prices are paid in the game and held safely until pickup. Toman prices are paid to the seller directly.")}</p>
      </div>
      <SiteFooter />
    </main>
  );
}
