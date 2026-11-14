"use client";
// The first call, in the three ways people make it (curl, JavaScript, Python), with a copy button.
import { useState } from "react";
import { useT } from "@/components/I18nProvider";

const SAMPLES = {
  curl: (o: string) => `curl -H "Authorization: Bearer sq_live_…" \\\n  "${o}/api/v1/stores?lat=35.70&lng=51.34&radius=1500"`,
  js: (o: string) => `const r = await fetch("${o}/api/v1/stores?lat=41.04&lng=28.99&radius=1500", {\n  headers: { Authorization: "Bearer sq_live_…" },\n});\nconst { data, meta } = await r.json();\nconsole.log(data.length, "stores ·", meta.sources);`,
  python: (o: string) => `import requests\n\nr = requests.get(\n    "${o}/api/v1/stores",\n    params={"lat": 35.70, "lng": 51.34, "radius": 1500},\n    headers={"Authorization": "Bearer sq_live_…"},\n)\nprint(len(r.json()["data"]), "stores")`,
};

export function QuickStart({ origin }: { origin: string }) {
  const t = useT();
  const [tab, setTab] = useState<keyof typeof SAMPLES>("curl");
  const [copied, setCopied] = useState(false);
  const code = SAMPLES[tab](origin);
  return (
    <div dir="ltr">
      <div className="tabs" role="tablist">
        {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => (setTab(k), setCopied(false))}>
            {k === "js" ? "JavaScript" : k === "python" ? "Python" : "curl"}
          </button>
        ))}
      </div>
      <pre>{code}</pre>
      <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}>
        {copied ? `✔ ${t("Copied")}` : t("Copy")}
      </button>
    </div>
  );
}
