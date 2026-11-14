import type { Metadata } from "next";
import { DeveloperKeys } from "@/components/DeveloperKeys";
import { openApi, SOURCES } from "@/lib/apiV1";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Developers") };
}

type Param = { name: string; in: string; required?: boolean; description?: string };
type Op = { summary: string; description: string; parameters: Param[] };

// The data API's keys (make, copy, revoke) and its reference, drawn from the same OpenAPI document
// /api/v1/openapi.json serves, so the page and the document can't drift apart.
export default async function Developers() {
  const { t } = await getT();
  const doc = openApi("");
  const paths = Object.entries(doc.paths) as [string, { get: Op }][];
  return (
    <main className="page" style={{ display: "grid", placeItems: "start center", padding: 16 }}>
      <div className="modal" style={{ maxWidth: 720, width: "100%", display: "grid", gap: 14 }}>
        <h2>{t("Developers")}</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {t("A read-only data API for other apps: the stores, deals, cinemas, ads and products StreetQuest knows. It answers from our cache, with each source credited.")}
        </p>
        <DeveloperKeys />
        <section>
          <h3>{t("How to call it")}</h3>
          <pre dir="ltr" style={{ overflowX: "auto" }}>{`curl -H "Authorization: Bearer sq_live_…" \\\n  "/api/v1/stores?lat=35.70&lng=51.34&radius=1500"`}</pre>
          <p className="muted">
            {t("Each key may make 60 requests a minute; over that you get a 429 with Retry-After. Only GET is allowed, from any origin.")}{" "}
            <a href="/api/v1/openapi.json" dir="ltr">/api/v1/openapi.json</a>
          </p>
        </section>
        <section dir="ltr" style={{ display: "grid", gap: 10 }}>
          <h3>Endpoints</h3>
          {paths.map(([p, v]) => (
            <div key={p}>
              <code>GET /api/v1{p}</code> — {v.get.summary}
              <p className="muted" style={{ margin: "2px 0" }}>{v.get.description}</p>
              <ul style={{ margin: 0 }}>
                {v.get.parameters.map((x) => (
                  <li key={x.name}>
                    <code>{x.name}</code> ({x.in}{x.required ? ", required" : ""}) {x.description}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section dir="ltr">
          <h3>{t("Sources and licences")}</h3>
          <p className="muted">Every answer lists its sources in <code>meta.sources</code>. Please keep the attribution when you show the data.</p>
          <ul>
            {Object.values(SOURCES).map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> ({s.country === "*" ? "worldwide" : s.country}): {s.licence}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
