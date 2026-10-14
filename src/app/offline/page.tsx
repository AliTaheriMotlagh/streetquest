import type { Metadata } from "next";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Offline"), robots: { index: false } };
}

// Shown by the service worker when a page isn't cached and there's no connection.
export default async function Offline() {
  const { t } = await getT();
  return (
    <main className="page" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 64 }}>📴</div>
        <h2>{t("You're offline")}</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {t("StreetQuest needs a connection to sync your moves with other players. The map you've already visited is saved on this phone — open the game to see it, and everything syncs when you're back online.")}
        </p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <a className="btn yellow" href="/play">{t("Open the game")}</a>
          <a className="btn ghost" href="/offline">{t("Try again")}</a>
        </div>
      </div>
    </main>
  );
}
