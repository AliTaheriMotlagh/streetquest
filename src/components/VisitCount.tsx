"use client";
// The home page's visit counter: the counts the server rendered, then this visit counted
// (once per browser session) and the fresh numbers shown.
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";

const SESSION_KEY = "sq_visit_counted";

export function VisitCount({ total, today }: { total: number; today: number }) {
  const [n, setN] = useState({ total, today });
  useEffect(() => {
    let counted = false;
    try {
      counted = sessionStorage.getItem(SESSION_KEY) === "1";
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    let live = true;
    fetch("/api/visits", { method: counted ? "GET" : "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { total: number; today: number } | null) => live && v && setN({ total: v.total, today: v.today }))
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
        <small>{t("{n} today", { n: fmtNum(n.today) })}</small>
      </dd>
    </div>
  );
}
