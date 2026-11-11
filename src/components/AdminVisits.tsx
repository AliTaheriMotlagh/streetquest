"use client";
// Admin → Visits: today's numbers, a bars-and-lines chart (hand-rolled SVG) and a per-day table.
// Data: /api/admin/visits (Iran days). Colours come from the theme tokens so it follows light/dark.
import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { fmtDate, fmtNum, t } from "@/lib/i18n";
import { VISIT_RANGES, type DayRow } from "@/lib/visits";

type Stats = { days: number; total: Record<"visits" | "visitors" | "players" | "newUsers", number>; avg: Record<"visits" | "visitors" | "players" | "newUsers", number> };
type Res = { days: number; series: DayRow[]; today: DayRow; week: Stats; month: Stats };

const W = 640, H = 220, PAD = { l: 38, r: 10, t: 12, b: 24 };
const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};
const dayLabel = (day: string) => fmtDate(new Date(`${day}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" });

function Chart({ series }: { series: DayRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length, top = niceMax(Math.max(1, ...series.map((r) => r.visits))), iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / n, x = (i: number) => PAD.l + step * (i + 0.5), y = (v: number) => PAD.t + ih - (v / top) * ih;
  const line = (k: "visitors" | "players") => series.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const labelEvery = Math.ceil(n / 6);
  const h = hover == null ? null : series[hover];
  const summary = t("Visits per day over the last {n} days, with unique visitors and signed-in players", { n: fmtNum(n) });
  return (
    <div className="av-chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width * W - PAD.l) / step)))); }}>
        <title>{summary}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="av-grid" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="av-tick">{fmtNum(v)}</text>
          </g>
        ))}
        {series.map((r, i) => <rect key={r.day} x={x(i) - Math.max(0.5, step * 0.36)} width={Math.max(1, step * 0.72)} y={y(r.visits)} height={Math.max(0, PAD.t + ih - y(r.visits))} className={`av-bar ${hover === i ? "on" : ""}`} />)}
        <path d={line("visitors")} className="av-line av-visitors" />
        <path d={line("players")} className="av-line av-players" />
        {series.map((r, i) => (i % labelEvery === 0 || i === n - 1) && (n - 1 - i) % labelEvery === 0 ? <text key={r.day} x={x(i)} y={H - 6} textAnchor="middle" className="av-tick">{dayLabel(r.day)}</text> : null)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} className="av-cursor" />}
      </svg>
      <div className="av-tip" aria-live="polite">
        {h ? <><b>{dayLabel(h.day)}</b> · {t("Visits")} {fmtNum(h.visits)} · {t("Unique visitors")} {fmtNum(h.visitors)} · {t("Signed-in players")} {fmtNum(h.players)}</> : <span className="muted">{t("Point at the chart for a day's numbers.")}</span>}
      </div>
      <div className="av-legend">
        <span><i className="av-key av-k-bar" />{t("Visits")}</span>
        <span><i className="av-key av-k-visitors" />{t("Unique visitors")}</span>
        <span><i className="av-key av-k-players" />{t("Signed-in players")}</span>
      </div>
    </div>
  );
}

export default function AdminVisits() {
  const [range, setRange] = useState<number>(30);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setErr(false);
    fetch(`/api/admin/visits?days=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Res) => live && setRes(d))
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, [range]);
  const rows = useMemo(() => (res ? [...res.series].reverse() : []), [res]);
  if (err) return <p className="muted">{t("Couldn't load the visit numbers.")}</p>;
  if (!res) return <p>{t("Loading…")}</p>;
  const td = res.today;
  const cards: [string, number, string][] = [
    [t("Visits today"), td.visits, t("{n} per day this week", { n: fmtNum(res.week.avg.visits) })],
    [t("Unique visitors today"), td.visitors, t("{n} per day this week", { n: fmtNum(res.week.avg.visitors) })],
    [t("Signed-in players today"), td.players, t("{n} per day this week", { n: fmtNum(res.week.avg.players) })],
    [t("New players today"), td.newUsers, t("{n} this week", { n: fmtNum(res.week.total.newUsers) })],
  ];
  return (
    <>
      <div className="kpis">
        {cards.map(([label, v, sub]) => <div className="stat" key={label}><b>{fmtNum(v)}</b><span>{label}</span><small className="av-sub">{sub}</small></div>)}
      </div>
      <p className="muted">{t("Last 7 days: {v} visits, {u} unique visitors. Last 30 days: {mv} visits, {mu} unique visitors (days are Iran time).", { v: fmtNum(res.week.total.visits), u: fmtNum(res.week.total.visitors), mv: fmtNum(res.month.total.visits), mu: fmtNum(res.month.total.visitors) })}</p>
      <div className="av-range" role="group" aria-label={t("Time range")}>
        {VISIT_RANGES.map((d) => <Button key={d} className={`btn small ${range === d ? "" : "ghost"}`} aria-pressed={range === d} onClick={() => setRange(d)}>{t("{n} days", { n: fmtNum(d) })}</Button>)}
      </div>
      <Chart series={res.series} />
      <details className="av-table">
        <summary>{t("Day by day")}</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("Day")}</th><th>{t("Visits")}</th><th>{t("Home page")}</th><th>{t("Game")}</th><th>{t("Unique visitors")}</th><th>{t("Signed-in players")}</th><th>{t("New players")}</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.day}><td>{dayLabel(r.day)}</td><td>{fmtNum(r.visits)}</td><td>{fmtNum(r.home)}</td><td>{fmtNum(r.play)}</td><td>{fmtNum(r.visitors)}</td><td>{fmtNum(r.players)}</td><td>{fmtNum(r.newUsers)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
