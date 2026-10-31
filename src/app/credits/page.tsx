import type { Metadata } from "next";
import { CAR_MODELS } from "@/lib/carModels";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Credits") };
}

// Who made what the 3D city is built from: the map (OpenStreetMap, ODbL) and the street
// cars' 3D models (CC BY 4.0 — each needs its author named, a link, and a note that it was changed).
export default async function Credits() {
  const { t } = await getT();
  const cars = Object.values(CAR_MODELS);
  return (
    <main className="page" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2>{t("Credits")}</h2>
        <h3>{t("Map data")}</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © {t("OpenStreetMap contributors")}
          </a>{" "}
          (ODbL)
        </p>
        <h3>{t("3D cars")}</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>{t("Made lighter for phones and recoloured for the game.")}</p>
        <ul style={{ lineHeight: 1.8, paddingInlineStart: 18 }}>
          {cars.map((c) => (
            <li key={c!.key} dir="ltr" style={{ textAlign: "start" }}>
              <a href={c!.credit.url} target="_blank" rel="noreferrer">
                {c!.credit.title}
              </a>{" "}
              — {c!.credit.author} ·{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                {c!.credit.license.replace(/-/g, " ").replace(/ 4 0$/, " 4.0")}
              </a>
            </li>
          ))}
        </ul>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <a className="btn yellow" href="/play">
            {t("Open the game")}
          </a>
        </div>
      </div>
    </main>
  );
}
