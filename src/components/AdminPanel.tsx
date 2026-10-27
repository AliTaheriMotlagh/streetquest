"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { askConfirm, askText } from "@/components/Dialogs";
import { GameDataTab, RevenueTab, SettingsTab, type AdminConfig, type AdminRevenue } from "@/components/AdminSettings";
import { Button } from "./Button";
import { fmtNum, t, msg } from "@/lib/i18n";

const AdminDropMap = dynamic(() => import("./AdminDropMap"), { ssr: false, loading: () => <div className="admin-map" /> });

type Drop = { batch: string; label: string; sponsor: string | null; points: { lat: number; lng: number }[]; amount: number; maxClaims: number | null; claims: number; paid: number; activeFrom: string; activeTo: string };
type Cashout = { id: string; user: string; wallet: number; joined: string; amount: number; fullName: string; phone: string; account: string; status: "PENDING" | "PAID" | "REJECTED"; note: string | null; createdAt: string; decidedAt: string | null };
type MoneyData = { wallets: number; paid: number; pending: number; pendingCount: number; earned24: number; pickups24: number; drops: Drop[]; cashouts: Cashout[] };

type Data = {
  stats: { users: number; online: number; signups7: number; claims24: number; upcomingEvents: number; pageViews7: number; conversion7: number; deliveries: Record<string, number> };
  bySource: { source: string; count: number }[];
  byCampaign: { campaign: string; count: number }[];
  series: Record<string, { page_view: number; signup: number; claim: number }>;
  users: { id: string; username: string; email: string; role: string; banned: boolean; level: number; coins: number; gems: number; toman: number; createdAt: string; utmSource: string | null; online: boolean; lastSeenAt: string | null }[];
  deliveries: { id: string; title: string; status: string; reward: number; createdAt: string; sender: { username: string }; courier: { username: string } | null }[];
  rides: { id: string; pickupLabel: string; dropoffLabel: string; status: string; fare: number; createdAt: string; rider: { username: string }; driver: { username: string } | null }[];
  lotteries: { id: string; name: string; status: string; pot: number; ticketPrice: number; drawAt: string; players: number; official: boolean; host: { username: string }; winner: { username: string } | null }[];
  notes: { id: string; body: string; hidden: boolean; lat: number; lng: number; createdAt: string; author: { username: string } }[];
  announcements: { id: string; title: string; body: string; active: boolean; ctaUrl: string | null }[];
  messages: { id: string; room: string; body: string; createdAt: string; author: { username: string } }[];
  config: AdminConfig;
  revenue: AdminRevenue;
  money: MoneyData;
};

type Tab = "money" | "cashouts" | "dash" | "settings" | "data" | "revenue" | "users" | "missions" | "marketing" | "moderation" | "deliveries";
type NavItem = { id: Tab; icon: string; label: string; desc: string };
// Grouped by what you're trying to do, each page says what it's for.
const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  { group: msg("Overview"), items: [{ id: "dash", icon: "📈", label: msg("Dashboard"), desc: msg("Players, visits, sign-ups and activity over the last 7 days.") }] },
  {
    group: msg("Game"),
    items: [
      { id: "settings", icon: "⚙️", label: msg("Game settings"), desc: msg("Every rule in the game: rewards, ranges, timers, play from home, goals, store and ads. Pick a category, change values, then Save — players get it within ~15 seconds.") },
      { id: "data", icon: "📊", label: msg("Game data"), desc: msg("Stats of every item. Change a number to override it; clear it to go back to the original.") },
    ],
  },
  {
    group: msg("Money"),
    items: [
      { id: "money", icon: "💵", label: msg("Money drops"), desc: msg("Drop money on a spot or along a street to bring players there — for sponsors, store openings or a street you want to trend. Each player can pick up each drop once.") },
      { id: "cashouts", icon: "💸", label: msg("Cash-outs"), desc: msg("Players asking to be paid their toman. Pay it to the account shown, then mark it paid with the bank reference — or decline it to put the toman back in their wallet.") },
      { id: "revenue", icon: "💰", label: msg("Revenue"), desc: msg("Gem sales, sponsor ad views and clicks, and how to switch on payments.") },
    ],
  },
  {
    group: msg("Community"),
    items: [
      { id: "users", icon: "👥", label: msg("Players"), desc: msg("Search players, gift coins or gems, make admins, ban cheaters.") },
      { id: "moderation", icon: "🛡️", label: msg("Moderation"), desc: msg("Hide location posts and delete chat messages.") },
      { id: "deliveries", icon: "📦", label: msg("Jobs"), desc: msg("Package deliveries and car rides between players, plus lotteries. Cancel a job to refund whoever paid; cancel a lottery to refund every ticket.") },
    ],
  },
  { group: msg("Marketing"), items: [{ id: "marketing", icon: "📣", label: msg("Campaigns"), desc: msg("Where players come from, campaign links, in-game banners and live push messages.") }] },
];
const PAGE = Object.fromEntries(ADMIN_NAV.flatMap((g) => g.items.map((i) => [i.id, i]))) as Record<Tab, NavItem>;
const fmt = (d: string) => new Date(d).toLocaleString();
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function MiniBars({ title, values }: { title: string; values: [string, number][] }) {
  const max = Math.max(1, ...values.map(([, v]) => v));
  const total = values.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="card">
      <div className="row">
        <b className="grow">{title}</b>
        <span className="small muted">{total.toLocaleString()} {t("in 7 days")}</span>
      </div>
      <div className="bars" role="img" aria-label={`${title}: ${values.map(([d, v]) => `${d} ${v}`).join(", ")}`}>
        {values.map(([day, v]) => (
          <div key={day} title={`${day}: ${v}`}>
            <span>{v || ""}</span>
            <i style={{ height: `${(v / max) * 100}%`, background: "var(--cyan)" }} />
            <span>{day.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("money");
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(0), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  const [drop, setDrop] = useState({ label: "", sponsor: "", count: 10, spreadM: 60, amount: 10000, maxClaims: "", activeFrom: toLocalInput(new Date()), activeTo: toLocalInput(new Date(Date.now() + 7 * 86400000)) });
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [ann, setAnn] = useState({ title: "", body: "", ctaLabel: "", ctaUrl: "" });
  const [push, setPush] = useState({ title: "", body: "", push: true });
  const [utm, setUtm] = useState({ path: "/", source: "instagram", medium: "social", campaign: "launch" });

  const load = useCallback(() => {
    fetch(`/api/admin?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)));
  }, [q]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: object) => {
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setNotice(r.ok ? null : d.error ?? "Request failed");
    if (r.ok && "action" in body && (body as { action: string }).action === "saveSettings") setSaved(Date.now());
    load();
    return r.ok;
  };

  if (err) return <main className="page wrap"><p className="err">{err}</p></main>;
  if (!data) return <main className="page wrap"><p>{t("Loading…")}</p></main>;
  const s = data.stats;
  const days = Object.entries(data.series);
  const utmUrl = `${location.origin}${utm.path}?utm_source=${encodeURIComponent(utm.source)}&utm_medium=${encodeURIComponent(utm.medium)}&utm_campaign=${encodeURIComponent(utm.campaign)}`;

  return (
    <main className="page">
      {notice && (
        <div className="announce" role="alert" style={{ position: "sticky", top: 8, zIndex: 50, borderColor: "var(--red)", marginBottom: 10 }}>
          <b className="grow small" style={{ color: "var(--red)" }}>⚠️ {notice}</b>
          <Button className="close" onClick={() => setNotice(null)} aria-label={t("Dismiss")}>✕</Button>
        </div>
      )}
      {saved > 0 && (
        <div className="announce" role="status" style={{ position: "sticky", top: 8, zIndex: 50, borderColor: "var(--green)", marginBottom: 10 }}>
          <b className="grow small" style={{ color: "var(--green)" }}>{t("✅ Settings saved — live for players within ~15 seconds")}</b>
        </div>
      )}
      <div className="admin-shell">
        <aside className="admin-side">
          <div className="admin-brand">
            <Link href="/" className="logo">STREET<span>QUEST</span></Link>
            <span className="tag" style={{ color: "var(--yellow)" }}>{t("ADMIN")}</span>
          </div>
          <nav>
            {ADMIN_NAV.map((g) => (
              <div key={g.group} className="side-group">
                <div className="side-label">{t(g.group)}</div>
                {g.items.map((it) => (
                  <Button key={it.id} className={`side-item ${tab === it.id ? "on" : ""}`} onClick={() => setTab(it.id)}>
                    <span>{it.icon}</span>
                    {t(it.label)}
                  </Button>
                ))}
              </div>
            ))}
          </nav>
          <Link href="/play" className="btn small block" style={{ marginTop: 12 }}>{t("▶ Open game")}</Link>
        </aside>
        <section className="admin-main admin">
        <header className="admin-head">
          <h1>{PAGE[tab].icon} {t(PAGE[tab].label)}</h1>
          <p className="muted">{t(PAGE[tab].desc)}</p>
        </header>

        {tab === "dash" && (
          <>
            <div className="kpis">
              <div className="stat"><b>{s.users.toLocaleString()}</b><span>{t("Players")}</span></div>
              <div className="stat"><b><span className="dot on" /> {s.online}</b><span>{t("Online now")}</span></div>
              <div className="stat"><b>{s.signups7}</b><span>{t("Signups · 7d")}</span></div>
              <div className="stat"><b>{(s.conversion7 * 100).toFixed(1)}%</b><span>{t("Visit → signup")}</span></div>
              <div className="stat"><b>{s.claims24}</b><span>{t("Collects · 24h")}</span></div>
              <div className="stat"><b>{s.upcomingEvents}</b><span>{t("Live/upcoming events")}</span></div>
            </div>
            <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <MiniBars title={t("Page views")} values={days.map(([d, v]) => [d, v.page_view])} />
              <MiniBars title={t("Signups")} values={days.map(([d, v]) => [d, v.signup])} />
              <MiniBars title={t("Collects")} values={days.map(([d, v]) => [d, v.claim])} />
            </div>
            <div className="card">
              <b>{t("Deliveries by status")}</b>
              <div className="row wrap" style={{ marginTop: 8 }}>
                {Object.entries(s.deliveries).map(([k, v]) => <span key={k} className="tag">{k}: {v}</span>)}
                {!Object.keys(s.deliveries).length && <span className="muted small">{t("None yet")}</span>}
              </div>
            </div>
          </>
        )}

        {tab === "settings" && <SettingsTab key={JSON.stringify(data.config.overrides)} config={data.config} post={post} />}
        {tab === "data" && <GameDataTab key={JSON.stringify(data.config.overrides.catalog ?? {})} config={data.config} post={post} />}
        {tab === "revenue" && <RevenueTab rev={data.revenue} config={data.config} />}

        {tab === "users" && (
          <>
            <input placeholder={t("Search name or email")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("Player")}</th><th>{t("Email")}</th><th>{t("Lvl")}</th><th>{t("Toman")}</th><th>{t("Coins")}</th><th>{t("Gems")}</th><th>{t("Source")}</th><th>{t("Joined")}</th><th>{t("Actions")}</th></tr></thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} style={{ opacity: u.banned ? 0.5 : 1 }}>
                      <td><span className={`dot ${u.online ? "on" : ""}`} /> <b>{u.username}</b> {u.role === "ADMIN" && <span className="tag">{t("admin")}</span>}</td>
                      <td className="muted">{u.email}</td>
                      <td>{u.level}</td>
                      <td>{fmtNum(u.toman)}</td>
                      <td>{u.coins}</td>
                      <td>{u.gems}</td>
                      <td>{u.utmSource ?? t("organic")}</td>
                      <td className="muted">{fmt(u.createdAt)}</td>
                      <td className="row">
                        <Button className="btn ghost small" onClick={() => post({ action: "ban", userId: u.id, banned: !u.banned })}>{u.banned ? t("Unban") : t("Ban")}</Button>
                        <Button className="btn ghost small" onClick={() => post({ action: "role", userId: u.id, role: u.role === "ADMIN" ? "PLAYER" : "ADMIN" })}>{u.role === "ADMIN" ? t("Demote") : t("Make admin")}</Button>
                        <Button className="btn ghost small" onClick={() => askText(t("Toman to give {name}", { name: u.username }), "10000", { body: t("Use a negative number to take toman away."), ok: t("Give") }).then((c) => { if (c && Number.isFinite(Number(c))) post({ action: "grantToman", userId: u.id, toman: Math.round(Number(c)) }); })}>{t("💵 Toman")}</Button>
                        <Button className="btn ghost small" onClick={() => askText(t("Coins to grant {name}", { name: u.username }), "100", { body: t("Use a negative number to remove coins."), ok: t("Grant") }).then((c) => { if (c && Number.isFinite(Number(c))) post({ action: "grant", userId: u.id, coins: Math.round(Number(c)), xp: 0 }); })}>{t("🪙 Gift")}</Button>
                        <Button className="btn ghost small" onClick={() => askText(t("Gems to grant {name}", { name: u.username }), "50", { body: t("Use a negative number to remove gems."), ok: t("Grant") }).then((c) => { if (c && Number.isFinite(Number(c))) post({ action: "grantGems", userId: u.id, gems: Math.round(Number(c)) }); })}>{t("💎 Gift")}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "money" && (
          <>
            <div className="kpis">
              <div className="stat"><b>{fmtNum(data.money.earned24)}</b><span>{t("Toman earned · 24h")}</span></div>
              <div className="stat"><b>{fmtNum(data.money.pickups24)}</b><span>{t("Pickups · 24h")}</span></div>
              <div className="stat"><b>{fmtNum(data.money.wallets)}</b><span>{t("In players' wallets")}</span></div>
              <div className="stat"><b>{fmtNum(data.money.pending)}</b><span>{t("Waiting to be paid ({n})", { n: data.money.pendingCount })}</span></div>
              <div className="stat"><b>{fmtNum(data.money.paid)}</b><span>{t("Paid out")}</span></div>
            </div>
            <div className="card">
              <b>{t("New money drop")}</b>
              <p className="small muted">{t("Tap the map once to drop money on a spot (spread around it), or tap along a street to lay it evenly from point to point. Drops show in gold on players' maps, ahead of everything else.")}</p>
              <AdminDropMap points={points} center={here} existing={data.money.drops.map((d) => ({ points: d.points, active: new Date(d.activeTo).getTime() > Date.now() }))} onPick={(p) => setPoints((ps) => (ps.length >= 20 ? ps : [...ps, p]))} />
              <div className="row wrap" style={{ marginTop: 8 }}>
                <span className="small muted grow">
                  {points.length === 0 ? t("No points yet — tap the map") : points.length === 1 ? t("One spot: the drops are spread around it") : t("A street through {n} points", { n: points.length })}
                </span>
                <Button className="btn ghost small" disabled={!points.length} onClick={() => setPoints((ps) => ps.slice(0, -1))}>{t("Undo point")}</Button>
                <Button className="btn ghost small" disabled={!points.length} onClick={() => setPoints([])}>{t("Clear")}</Button>
                <Button className="btn ghost small" onClick={() => navigator.geolocation.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }))}>{t("📍 Use my location")}</Button>
              </div>
              <div className="form-grid">
                <div><label>{t("Name players see")}</label><input value={drop.label} onChange={(e) => setDrop({ ...drop, label: e.target.value })} placeholder={t("e.g. Grand opening")} /></div>
                <div><label>{t("Sponsor (optional)")}</label><input value={drop.sponsor} onChange={(e) => setDrop({ ...drop, sponsor: e.target.value })} /></div>
                <div><label>{t("How many drops")}</label><input type="number" min={1} max={200} value={drop.count} onChange={(e) => setDrop({ ...drop, count: Number(e.target.value) })} /></div>
                {points.length === 1 && <div><label>{t("Spread around the spot (m)")}</label><input type="number" min={0} max={2000} value={drop.spreadM} onChange={(e) => setDrop({ ...drop, spreadM: Number(e.target.value) })} /></div>}
                <div><label>{t("Toman per pickup (GPS)")}</label><input type="number" min={100} step={1000} value={drop.amount} onChange={(e) => setDrop({ ...drop, amount: Number(e.target.value) })} /></div>
                <div><label>{t("Max pickups in total (optional)")}</label><input type="number" min={1} value={drop.maxClaims} onChange={(e) => setDrop({ ...drop, maxClaims: e.target.value })} placeholder={t("unlimited")} /></div>
                <div><label>{t("Active from")}</label><input type="datetime-local" value={drop.activeFrom} onChange={(e) => setDrop({ ...drop, activeFrom: e.target.value })} /></div>
                <div><label>{t("Active to")}</label><input type="datetime-local" value={drop.activeTo} onChange={(e) => setDrop({ ...drop, activeTo: e.target.value })} /></div>
              </div>
              <p className="small muted">
                {t("Budget: up to {n} toman", { n: (drop.maxClaims ? Number(drop.maxClaims) : drop.count) * drop.amount })}
                {!drop.maxClaims && ` ${t("per player who finds them all (each player can pick up each drop once)")}`}
              </p>
              <Button
                className="btn green"
                disabled={!points.length || drop.label.trim().length < 2 || drop.count < 1 || drop.amount < 100}
                onClick={async () => {
                  const ok = await post({
                    action: "dropMoney",
                    label: drop.label,
                    sponsor: drop.sponsor || undefined,
                    points,
                    count: drop.count,
                    spreadM: points.length === 1 ? drop.spreadM : 0,
                    amount: drop.amount,
                    maxClaims: drop.maxClaims ? Number(drop.maxClaims) : undefined,
                    activeFrom: new Date(drop.activeFrom),
                    activeTo: new Date(drop.activeTo),
                  });
                  if (ok) setPoints([]);
                }}
              >
                💵 {t("Drop {n} × {amount} toman", { n: drop.count, amount: drop.amount })}
              </Button>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("Drop")}</th><th>{t("Where")}</th><th>{t("Window")}</th><th>{t("Toman")}</th><th>{t("Picked up")}</th><th /></tr></thead>
                <tbody>
                  {data.money.drops.map((d) => {
                    const live = new Date(d.activeTo).getTime() > Date.now();
                    return (
                      <tr key={d.batch} style={{ opacity: live ? 1 : 0.5 }}>
                        <td><b>{d.label}</b> {d.sponsor && <span className="tag">{d.sponsor}</span>}</td>
                        <td className="mono small" dir="ltr">{d.points[0].lat.toFixed(4)}, {d.points[0].lng.toFixed(4)}{d.points.length > 1 ? ` (+${d.points.length - 1})` : ""}</td>
                        <td className="small muted">{fmt(d.activeFrom)} → {fmt(d.activeTo)}</td>
                        <td>{fmtNum(d.amount)}</td>
                        <td>{fmtNum(d.claims)}{d.maxClaims ? ` / ${fmtNum(d.maxClaims)}` : ""} · {fmtNum(d.paid)}</td>
                        <td>{live && <Button className="btn ghost small" onClick={() => askConfirm(t("End this drop now?"), { body: t("It disappears from every map. What players already picked up stays theirs."), ok: t("End drop"), cancel: t("Keep it"), danger: true }).then((ok) => ok && post({ action: "deleteDrop", batch: d.batch }))}>{t("End")}</Button>}</td>
                      </tr>
                    );
                  })}
                  {!data.money.drops.length && <tr><td colSpan={6} className="muted small">{t("No drops yet")}</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "cashouts" && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t("Player")}</th><th>{t("Amount")}</th><th>{t("Name · phone")}</th><th>{t("Card / Sheba")}</th><th>{t("Asked")}</th><th>{t("Status")}</th><th /></tr></thead>
              <tbody>
                {data.money.cashouts.map((c) => (
                  <tr key={c.id} style={{ opacity: c.status === "PENDING" ? 1 : 0.55 }}>
                    <td><b>{c.user}</b><div className="small muted">{t("joined {when}", { when: fmt(c.joined) })} · {t("wallet {n}", { n: c.wallet })}</div></td>
                    <td><b>{fmtNum(c.amount)}</b></td>
                    <td>{c.fullName}<div className="small muted mono" dir="ltr">{c.phone}</div></td>
                    <td className="mono small" dir="ltr">{c.account}</td>
                    <td className="small muted">{fmt(c.createdAt)}</td>
                    <td><span className="tag">{t(c.status)}</span>{c.note && <div className="small muted">{c.note}</div>}</td>
                    <td className="row">
                      {c.status === "PENDING" && (
                        <>
                          <Button className="btn green small" onClick={() => askText(t("Mark {n} toman to {name} as paid?", { n: c.amount, name: c.fullName }), "", { body: t("Bank reference (optional) — the player sees it."), ok: t("Mark paid"), cancel: t("Go back") }).then((ref) => ref !== null && post({ action: "cashout", id: c.id, paid: true, note: ref || undefined }))}>{t("Paid")}</Button>
                          <Button className="btn ghost small" onClick={() => askText(t("Decline this cash-out?"), "", { body: t("The toman goes back to the player's wallet. Reason (optional) — the player sees it."), ok: t("Decline"), cancel: t("Go back") }).then((why) => why !== null && post({ action: "cashout", id: c.id, paid: false, note: why || undefined }))}>{t("Decline")}</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.money.cashouts.length && <tr><td colSpan={7} className="muted small">{t("No cash-out requests yet")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "marketing" && (
          <>
            <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <div className="card">
                <b>{t("Signups by source")}</b>
                <table><tbody>{data.bySource.map((r) => <tr key={r.source}><td>{t(r.source)}</td><td>{r.count}</td></tr>)}</tbody></table>
              </div>
              <div className="card">
                <b>{t("Signups by campaign")}</b>
                <table><tbody>{data.byCampaign.map((r) => <tr key={r.campaign}><td>{r.campaign}</td><td>{r.count}</td></tr>)}{!data.byCampaign.length && <tr><td className="muted">{t("No campaigns tracked yet")}</td></tr>}</tbody></table>
              </div>
            </div>
            <div className="card">
              <b>{t("Campaign link builder")}</b>
              <div className="form-grid">
                {(["path", "source", "medium", "campaign"] as const).map((k) => (
                  <div key={k}><label>{k}</label><input value={utm[k]} onChange={(e) => setUtm({ ...utm, [k]: e.target.value })} /></div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input readOnly value={utmUrl} className="mono small" />
                <Button className="btn cyan small" onClick={() => navigator.clipboard.writeText(utmUrl)}>{t("Copy")}</Button>
              </div>
            </div>
            <div className="card">
              <b>{t("Announcement banners")}</b>
              <p className="small muted">{t("Shown on the landing page and inside the game.")}</p>
              <div className="form-grid">
                <div><label>{t("Title")}</label><input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></div>
                <div><label>{t("Body")}</label><input value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} /></div>
                <div><label>{t("Button label")}</label><input value={ann.ctaLabel} onChange={(e) => setAnn({ ...ann, ctaLabel: e.target.value })} /></div>
                <div><label>{t("Button URL")}</label><input value={ann.ctaUrl} onChange={(e) => setAnn({ ...ann, ctaUrl: e.target.value })} /></div>
              </div>
              <Button className="btn small" style={{ marginTop: 10 }} onClick={async () => (await post({ action: "createAnnouncement", ...ann, ctaLabel: ann.ctaLabel || undefined, ctaUrl: ann.ctaUrl || undefined })) && setAnn({ title: "", body: "", ctaLabel: "", ctaUrl: "" })}>{t("Publish")}</Button>
              <table style={{ marginTop: 10 }}><tbody>
                {data.announcements.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.title}</b> <span className="muted">{a.body}</span></td>
                    <td className="row">
                      <Button className="btn ghost small" onClick={() => post({ action: "toggleAnnouncement", id: a.id, active: !a.active })}>{a.active ? t("Hide") : t("Show")}</Button>
                      <Button className="btn ghost small" onClick={() => post({ action: "deleteAnnouncement", id: a.id })}>{t("Delete")}</Button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="card">
              <b>{t("Live push to everyone online")}</b>
              <div className="row" style={{ marginTop: 8 }}>
                <input placeholder={t("Title")} value={push.title} onChange={(e) => setPush({ ...push, title: e.target.value })} />
                <input placeholder={t("Body")} value={push.body} onChange={(e) => setPush({ ...push, body: e.target.value })} />
                <Button className="btn yellow small" disabled={!push.title} onClick={async () => (await post({ action: "broadcast", ...push })) && setPush({ title: "", body: "", push: push.push })}>{t("Send")}</Button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <Button className={`toggle ${push.push ? "on" : ""}`} onClick={() => setPush({ ...push, push: !push.push })} aria-pressed={push.push}><i /><span>{t("Also send as a phone notification")}</span></Button>
                <span className="small muted">{data.revenue.push ? t("{n} devices subscribed", { n: data.revenue.pushDevices }) : t("Phone notifications need VAPID keys on the server")}</span>
              </div>
            </div>
          </>
        )}

        {tab === "moderation" && (
          <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <b>{t("Location messages")}</b>
              <table><tbody>
                {data.notes.map((n) => (
                  <tr key={n.id} style={{ opacity: n.hidden ? 0.4 : 1 }}>
                    <td><b>{n.author.username}</b>: {n.body}<div className="small muted mono">{n.lat.toFixed(4)}, {n.lng.toFixed(4)}</div></td>
                    <td><Button className="btn ghost small" onClick={() => post({ action: "hideNote", id: n.id, hidden: !n.hidden })}>{n.hidden ? t("Restore") : t("Hide")}</Button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="card">
              <b>{t("Recent chat")}</b>
              <table><tbody>
                {data.messages.map((m) => (
                  <tr key={m.id}>
                    <td><span className="tag">{m.room.split(":")[0]}</span> <b>{m.author.username}</b>: {m.body}</td>
                    <td><Button className="btn ghost small" onClick={() => post({ action: "deleteMessage", id: m.id })}>{t("Delete")}</Button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}

        {tab === "deliveries" && (
          <>
          <h3>{t("📦 Deliveries")}</h3>
          <table>
            <thead><tr><th>{t("Package")}</th><th>{t("Sender")}</th><th>{t("Courier")}</th><th>{t("Reward")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th /></tr></thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.title}</b></td>
                  <td>{d.sender.username}</td>
                  <td>{d.courier?.username ?? "—"}</td>
                  <td>{d.reward}</td>
                  <td><span className="tag">{t(d.status)}</span></td>
                  <td className="muted small">{fmt(d.createdAt)}</td>
                  <td>{!["DELIVERED", "CANCELLED"].includes(d.status) && <Button className="btn ghost small" onClick={() => askConfirm(t("Cancel and refund sender?"), { ok: t("Cancel delivery"), cancel: t("Keep it"), danger: true }).then((ok) => ok && post({ action: "cancelDelivery", id: d.id }))}>{t("Cancel")}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>{t("🚕 Rides")}</h3>
          <table>
            <thead><tr><th>{t("Route")}</th><th>{t("Rider")}</th><th>{t("Driver")}</th><th>{t("Fare")}</th><th>{t("Status")}</th><th>{t("Created")}</th><th /></tr></thead>
            <tbody>
              {data.rides.map((r) => (
                <tr key={r.id}>
                  <td>{r.pickupLabel} → <b>{r.dropoffLabel}</b></td>
                  <td>{r.rider.username}</td>
                  <td>{r.driver?.username ?? "—"}</td>
                  <td>{r.fare}</td>
                  <td><span className="tag">{t(r.status)}</span></td>
                  <td className="muted small">{fmt(r.createdAt)}</td>
                  <td>{!["DONE", "CANCELLED"].includes(r.status) && <Button className="btn ghost small" onClick={() => askConfirm(t("Cancel and refund the rider?"), { ok: t("Cancel ride"), cancel: t("Keep it"), danger: true }).then((ok) => ok && post({ action: "cancelRide", id: r.id }))}>{t("Cancel")}</Button>}</td>
                </tr>
              ))}
              {!data.rides.length && <tr><td colSpan={7} className="muted small">{t("No rides yet")}</td></tr>}
            </tbody>
          </table>
          <h3>{t("🎰 Lotteries")}</h3>
          <table>
            <thead><tr><th>{t("Name")}</th><th>{t("Host")}</th><th>{t("Ticket")}</th><th>{t("Pot")}</th><th>{t("Players")}</th><th>{t("Draw")}</th><th>{t("Status")}</th><th /></tr></thead>
            <tbody>
              {data.lotteries.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.official ? "⭐ " : ""}{l.name}</b></td>
                  <td>{l.host.username}</td>
                  <td>{l.ticketPrice}</td>
                  <td>{l.pot}</td>
                  <td>{l.players}</td>
                  <td className="muted small">{fmt(l.drawAt)}</td>
                  <td><span className="tag">{t(l.status)}{l.winner ? ` · ${l.winner.username}` : ""}</span></td>
                  <td>{l.status === "OPEN" && (
                    <>
                      <Button className="btn ghost small" onClick={() => askConfirm(t("Draw the winner now?"), { body: t("Ticket sales close and one random ticket wins the pot."), ok: t("Draw now") }).then((ok) => ok && post({ action: "drawLottery", id: l.id }))}>{t("Draw now")}</Button>{" "}
                      <Button className="btn ghost small" onClick={() => askConfirm(t("Cancel and refund every ticket?"), { ok: t("Cancel lottery"), cancel: t("Keep it"), danger: true }).then((ok) => ok && post({ action: "cancelLottery", id: l.id }))}>{t("Cancel")}</Button>
                    </>
                  )}</td>
                </tr>
              ))}
              {!data.lotteries.length && <tr><td colSpan={8} className="muted small">{t("No lotteries yet")}</td></tr>}
            </tbody>
          </table>
          </>
        )}
        </section>
      </div>
    </main>
  );
}
