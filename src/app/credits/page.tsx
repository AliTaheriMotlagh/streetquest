import type { Metadata } from "next";
import { CAR_MODELS } from "@/lib/carModels";
import type { Credit } from "@/lib/assetLicense";
import downloaded from "../../../assets/credits.json";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Credits") };
}

// Who made what the 3D city is built from: the map (OpenStreetMap, ODbL), the street cars'
// 3D models and Street Arena's guns (CC BY 4.0 — each needs its author named, a link, and a
// note that it was changed). Guns and other downloads come from assets/credits.json
// (scripts/sketchfab.ts writes it).
export default async function Credits() {
  const { t } = await getT();
  const cars = Object.values(CAR_MODELS);
  const weapons = (downloaded as Credit[]).filter((c) => c.kind === "weapon");
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
        {weapons.length > 0 && (
          <>
            <h3>{t("3D weapons")}</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>{t("Made lighter for phones, recoloured and given new names in the game.")}</p>
            <ul style={{ lineHeight: 1.8, paddingInlineStart: 18 }}>
              {weapons.map((c) => (
                <li key={c.uid} dir="ltr" style={{ textAlign: "start" }}>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>{" "}
                  — {c.author} ·{" "}
                  <a href={c.license === "CC0-1.0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : "https://creativecommons.org/licenses/by/4.0/"} target="_blank" rel="noreferrer">
                    {c.license === "CC0-1.0" ? "CC0" : "CC BY 4.0"}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <a className="btn yellow" href="/play">
            {t("Open the game")}
          </a>
        </div>
      </div>
    </main>
  );
}
