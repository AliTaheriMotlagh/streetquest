"use client";
// Admin → Browser errors (GET /api/admin/errors; rules lib/clientLog.ts): what went wrong in players'
// browsers — crashes, scripts that didn't load, connections that were blocked (the realtime server,
// map tiles, a site the phone asks itself) — each once with how often, from which countries and on
// which browsers, the most frequent first. Filter by kind or country; a day, a week or a month.
import { useEffect, useMemo, useState } from "react";
import { fmtNum, fmtWhen, msg, t } from "@/lib/i18n";
import { CLIENT_KINDS, type ClientKind, type ErrorGroup } from "@/lib/clientLog";

const KIND_LABEL: Record<ClientKind, string> = {
  crash: msg("Crash screen"),
  error: msg("Script error"),
  promise: msg("Uncaught promise"),
  chunk: msg("File didn't load"),
  net: msg("Request failed"),
  ws: msg("Realtime blocked"),
  tiles: msg("Map tiles failed"),
};
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏳️");
const top = (r: Record<string, number>, n = 4) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, n);

export default function AdminErrors() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ total: number; groups: ErrorGroup[] } | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<ClientKind | "">("");
  const [country, setCountry] = useState("");
  useEffect(() => {
    setData(null);
    fetch(`/api/admin/errors?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData, (e: Error) => setErr(e.message));
  }, [days]);
  const countries = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of data?.groups ?? []) for (const [k, n] of Object.entries(g.countries)) c[k] = (c[k] ?? 0) + n;
    return top(c, 12);
  }, [data]);
  const shown = (data?.groups ?? []).filter((g) => (!kind || g.kind === kind) && (!country || g.countries[country]));
  return (
    <div className="admin-errors">
      <div className="row wrap" style={{ gap: 6 }}>
        {[1, 7, 30].map((d) => (
          <button key={d} className={`btn small ${days === d ? "" : "ghost"}`} onClick={() => setDays(d)}>{d === 1 ? t("Today") : t("{n} days", { n: fmtNum(d) })}</button>
        ))}
        <select className="input" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as ClientKind | "")} aria-label={t("Kind")}>
          <option value="">{t("Every kind")}</option>
          {CLIENT_KINDS.map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
        </select>
      </div>
      {countries.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <button className={`chip small ${!country ? "on" : ""}`} onClick={() => setCountry("")}>{t("All countries")}</button>
          {countries.map(([c, n]) => (
            <button key={c} className={`chip small ${country === c ? "on" : ""}`} onClick={() => setCountry(country === c ? "" : c)}>{flag(c)} {c} · {fmtNum(n)}</button>
          ))}
        </div>
      )}
      {err && <p className="warn-text">{err}</p>}
      {!data && !err && <p className="muted">{t("Loading…")}</p>}
      {data && (
        <p className="small muted">{t("{n} reports, {g} different errors", { n: fmtNum(data.total), g: fmtNum(data.groups.length) })}</p>
      )}
      {data && !shown.length && <p className="muted">{t("No browser errors in this time — or nothing matches.")}</p>}
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("Times")}</th>
              <th>{t("Kind")}</th>
              <th>{t("Error")}</th>
              <th>{t("Countries")}</th>
              <th>{t("Browsers")}</th>
              <th>{t("Last")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={`${g.kind}|${g.msg}`}>
                <td><b>{fmtNum(g.n)}</b></td>
                <td className="small">{t(KIND_LABEL[g.kind])}</td>
                <td dir="ltr" style={{ textAlign: "start", maxWidth: 420, overflowWrap: "anywhere" }}><code className="small">{g.msg}</code></td>
                <td className="small">{top(g.countries).map(([c, n]) => `${flag(c)} ${c} ${fmtNum(n)}`).join("  ")}</td>
                <td className="small" dir="ltr">{top(g.browsers, 3).map(([b, n]) => `${b} (${fmtNum(n)})`).join(", ")}</td>
                <td className="small">{fmtWhen(g.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">{t("Also in the server log: vercel logs --environment production --query client-error")}</p>
    </div>
  );
}
