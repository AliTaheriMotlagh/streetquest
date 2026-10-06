import Link from "next/link";
import { currentUser } from "@/server/auth";

export async function SiteHeader() {
  const user = await currentUser().catch(() => null);
  return (
    <header className="wrap topbar">
      <Link href="/" className="logo">
        STREET<span>QUEST</span>
      </Link>
      <nav className="row" style={{ marginLeft: "auto" }}>
        <Link href="/events" className="btn ghost small hide-sm">
          Events
        </Link>
        {user ? (
          <Link href="/play" className="btn small">
            Play
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn ghost small">
              Log in
            </Link>
            <Link href="/signup" className="btn small">
              Play free
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
