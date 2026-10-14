import Link from "next/link";
import { getT } from "@/server/i18n";

export async function SiteHeader() {
  const { t } = await getT();
  return (
    <header className="wrap topbar">
      <Link href="/" className="logo">
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
