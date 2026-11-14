import type { Metadata } from "next";
import "./developers.css";
import { DeveloperKeys } from "@/components/DeveloperKeys";
import { openApi, SOURCES } from "@/lib/apiV1";
import { getT } from "@/server/i18n";
import { QuickStart } from "./QuickStart";

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
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app";
  return (
    <main className="page">
      <div className="devdocs">
        <header className="dd-hero">
          <h1>🔑 {t("StreetQuest data API")}</h1>
          <p>{t("A read-only data API for other apps: the stores, deals, cinemas, ads and products StreetQuest knows. It answers from our cache, with each source credited.")}</p>
          <div className="facts">
            <span>GET · JSON</span>
            <span>{t("{n} endpoints", { n: paths.length })}</span>
            <span>{t("60 requests a minute per key")}</span>
            <span>CORS *</span>
            <a href="/api/v1/openapi.json" dir="ltr">openapi.json ↗</a>
          </div>
        </header>

        <div className="two">
          <section className="box">
            <DeveloperKeys />
          </section>
          <section className="box">
            <h2>{t("How to call it")}</h2>
            <QuickStart origin={origin} />
            <p className="muted small" style={{ marginBottom: 0 }}>
              {t("Each key may make 60 requests a minute; over that you get a 429 with Retry-After. Only GET is allowed, from any origin.")}
            </p>
          </section>
        </div>

        <section className="box" dir="ltr">
          <h2>Endpoints</h2>
          {paths.map(([p, v], i) => (
            <details key={p} className="ep" open={i === 0}>
              <summary>
                <span className="get">GET</span>
                <code>/api/v1{p}</code>
                <span className="muted">— {v.get.summary}</span>
              </summary>
              <div className="body">
                <p className="muted" style={{ margin: 0 }}>{v.get.description}</p>
                {v.get.parameters.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>In</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.get.parameters.map((x) => (
                        <tr key={x.name}>
                          <td>
                            <code>{x.name}</code> {x.required && <span className="req">required</span>}
                          </td>
                          <td>{x.in}</td>
                          <td>{x.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          ))}
        </section>

        <section className="box" dir="ltr">
          <h2>{t("Sources and licences")}</h2>
          <p className="muted">Every answer lists its sources in <code>meta.sources</code>. Please keep the attribution when you show the data.</p>
          <ul className="src">
            {Object.values(SOURCES).map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> <span className="muted">· {s.country === "*" ? "worldwide" : s.country}</span>
                <div className="muted small">{s.licence}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
