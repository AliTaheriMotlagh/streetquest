import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="wrap topbar">
      <Link href="/" className="logo">
        STREET<span>QUEST</span>
      </Link>
      <nav className="row" style={{ marginLeft: "auto" }}>
        <Link href="/events" className="btn ghost small hide-sm">
          Events
        </Link>
        <Link href="/play" className="btn small">
          Play now
        </Link>
      </nav>
    </header>
  );
}
