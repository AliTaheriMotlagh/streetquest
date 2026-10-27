import Link from "next/link";
import { getT } from "@/server/i18n";

export async function SiteHeader() {
  const { t } = await getT();
  return (
    <header className="wrap topbar">
      <Link href="/" className="logo">
        <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden>
          <path d="M16 2.5c-6 0-10.5 4.5-10.5 10.3C5.5 20.6 16 29.5 16 29.5s10.5-8.9 10.5-16.7C26.5 7 22 2.5 16 2.5Z" fill="var(--pink)" />
          <path d="M11 13.5h10M16 8.5v10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        STREET<span>QUEST</span>
      </Link>
      <nav className="row" style={{ marginLeft: "auto" }}>
        <Link href="/events" className="btn ghost small hide-sm">
          {t("Events")}
        </Link>
        <Link href="/play" className="btn small">
          {t("Play now")}
        </Link>
      </nav>
    </header>
  );
}
