import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

// Shown by the service worker when a page isn't cached and there's no connection.
export default function Offline() {
  return (
    <main className="page" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 64 }}>📴</div>
        <h2>You&apos;re offline</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          StreetQuest needs a connection to sync your moves with other players. The map you&apos;ve already visited is saved on this phone — open the game to see it, and everything syncs when you&apos;re back online.
        </p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <a className="btn yellow" href="/play">Open the game</a>
          <a className="btn ghost" href="/offline">Try again</a>
        </div>
      </div>
    </main>
  );
}
