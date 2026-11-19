// The public pages' footer. Its language links are plain <a href="?lang=…" hreflang> — the in-app language switch
// is a button, which crawlers can't follow, so without these the Persian and Turkish pages are never found.
import Link from "next/link";
import { fmtNum, LOCALE_META, LOCALES } from "@/lib/i18n";
import { hreflang } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getT } from "@/server/i18n";

export async function SiteFooter() {
  const { t, locale } = await getT();
  return (
    <footer className="footer">
      <div className="wrap row wrap">
        <span>© {fmtNum(new Date().getFullYear(), locale).replace(/٬|,/g, "")} {t(SITE.name)}</span>
        <span className="grow" />
        <span>{t("Play safe: stay aware of your surroundings, respect private property and traffic laws.")}</span>
        <Link href="/events">{t("Events")}</Link>
        <a href="/developers">{t("Developers")}</a>
        <a href="/credits">{t("Credits")}</a>
      </div>
      <nav className="wrap row wrap footer-langs" aria-label={t("Language")}>
        {LOCALES.map((l) =>
          l === locale ? (
            <b key={l} lang={l} aria-current="true">{LOCALE_META[l].name}</b>
          ) : (
            <a key={l} href={`?lang=${l}`} hrefLang={hreflang(l)} lang={l}>
              {LOCALE_META[l].name}
            </a>
          ),
        )}
      </nav>
    </footer>
  );
}
