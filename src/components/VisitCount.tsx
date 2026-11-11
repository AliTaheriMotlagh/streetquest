"use client";
// The home page's visit counter: the counts the server rendered, then this visit counted
// (once per browser session) and the fresh numbers shown.
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";

const SESSION_KEY = "sq_visit_counted";

export function VisitCount({ total, today, unique }: { total: number; today: number; unique?: number }) {
  const [n, setN] = useState({ total, today, unique: unique ?? 0 });
  useEffect(() => {
    let counted = false;
    try {
      counted = sessionStorage.getItem(SESSION_KEY) === "1";
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    let live = true;
    fetch("/api/visits", { method: counted ? "GET" : "POST", ...(counted ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "home" }) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { total: number; today: number; unique?: number } | null) => live && v && setN({ total: v.total, today: v.today, unique: v.unique ?? 0 }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="lp-visits">
      <dt>{t("Visits")}</dt>
      <dd>
        {fmtNum(n.total)}
        <small>{t("{n} today", { n: fmtNum(n.today) })}{n.unique > 0 && <> · {t("{n} unique today", { n: fmtNum(n.unique) })}</>}</small>
      </dd>
    </div>
  );
}
