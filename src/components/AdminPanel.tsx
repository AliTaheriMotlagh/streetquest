"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { askConfirm, askText } from "@/components/Dialogs";
import { GameDataTab, RevenueTab, SettingsTab, type AdminConfig, type AdminRevenue } from "@/components/AdminSettings";

type Data = {
  stats: { users: number; online: number; signups7: number; claims24: number; upcomingEvents: number; pageViews7: number; conversion7: number; deliveries: Record<string, number> };
  bySource: { source: string; count: number }[];
  byCampaign: { campaign: string; count: number }[];
  series: Record<string, { page_view: number; signup: number; claim: number }>;
  users: { id: string; username: string; email: string; role: string; banned: boolean; level: number; coins: number; gems: number; createdAt: string; utmSource: string | null; online: boolean; lastSeenAt: string | null }[];
  deliveries: { id: string; title: string; status: string; reward: number; createdAt: string; sender: { username: string }; courier: { username: string } | null }[];
  notes: { id: string; body: string; hidden: boolean; lat: number; lng: number; createdAt: string; author: { username: string } }[];
  missions: { id: string; title: string; itemKey: string; lat: number; lng: number; activeFrom: string; activeTo: string; sponsor: string | null; rewardXp: number; rewardCoins: number }[];
  announcements: { id: string; title: string; body: string; active: boolean; ctaUrl: string | null }[];
  messages: { id: string; room: string; body: string; createdAt: string; author: { username: string } }[];
  items: { key: string; label: string }[];
  config: AdminConfig;
  revenue: AdminRevenue;
};

type Tab = "dash" | "settings" | "data" | "revenue" | "users" | "missions" | "marketing" | "moderation" | "deliveries";
const fmt = (d: string) => new Date(d).toLocaleString();
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function MiniBars({ title, values }: { title: string; values: [string, number][] }) {
  const max = Math.max(1, ...values.map(([, v]) => v));
  const total = values.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="card">
      <div className="row">
        <b className="grow">{title}</b>
        <span className="small muted">{total.toLocaleString()} in 7 days</span>
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
  const [tab, setTab] = useState<Tab>("dash");
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(0), 2500);
    return () => clearTimeout(t);
  }, [saved]);
  const [mission, setMission] = useState({ title: "", description: "", lat: "", lng: "", itemKey: "diamond", rewardXp: 300, rewardCoins: 100, activeFrom: toLocalInput(new Date()), activeTo: toLocalInput(new Date(Date.now() + 7 * 86400000)), sponsor: "" });
  const [ann, setAnn] = useState({ title: "", body: "", ctaLabel: "", ctaUrl: "" });
  const [push, setPush] = useState({ title: "", body: "" });
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
  if (!data) return <main className="page wrap"><p>Loading…</p></main>;
  const s = data.stats;
  const days = Object.entries(data.series);
  const utmUrl = `${location.origin}${utm.path}?utm_source=${encodeURIComponent(utm.source)}&utm_medium=${encodeURIComponent(utm.medium)}&utm_campaign=${encodeURIComponent(utm.campaign)}`;

  return (
    <main className="page">
      {notice && (
        <div className="announce" role="alert" style={{ position: "sticky", top: 8, zIndex: 50, borderColor: "var(--red)", marginBottom: 10 }}>
          <b className="grow small" style={{ color: "var(--red)" }}>⚠️ {notice}</b>
          <button className="close" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {saved > 0 && (
        <div className="announce" role="status" style={{ position: "sticky", top: 8, zIndex: 50, borderColor: "var(--green)", marginBottom: 10 }}>
          <b className="grow small" style={{ color: "var(--green)" }}>✅ Settings saved — live for players within ~15 seconds</b>
        </div>
      )}
      <div className="wrap admin">
        <div className="topbar">
          <Link href="/" className="logo">STREET<span>QUEST</span></Link>
          <span className="tag" style={{ color: "var(--yellow)" }}>ADMIN</span>
          <span className="grow" />
          <Link href="/play" className="btn small">Open game</Link>
        </div>
        <div className="tabs">
          {([["dash", "Dashboard"], ["settings", "⚙️ Game settings"], ["data", "📊 Game data"], ["revenue", "💰 Revenue"], ["users", "Players"], ["missions", "Missions"], ["marketing", "Marketing"], ["moderation", "Moderation"], ["deliveries", "Deliveries"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === "dash" && (
          <>
            <div className="kpis">
              <div className="stat"><b>{s.users.toLocaleString()}</b><span>Players</span></div>
              <div className="stat"><b><span className="dot on" /> {s.online}</b><span>Online now</span></div>
              <div className="stat"><b>{s.signups7}</b><span>Signups · 7d</span></div>
              <div className="stat"><b>{(s.conversion7 * 100).toFixed(1)}%</b><span>Visit → signup</span></div>
              <div className="stat"><b>{s.claims24}</b><span>Collects · 24h</span></div>
              <div className="stat"><b>{s.upcomingEvents}</b><span>Live/upcoming events</span></div>
            </div>
            <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <MiniBars title="Page views" values={days.map(([d, v]) => [d, v.page_view])} />
              <MiniBars title="Signups" values={days.map(([d, v]) => [d, v.signup])} />
              <MiniBars title="Collects" values={days.map(([d, v]) => [d, v.claim])} />
            </div>
            <div className="card">
              <b>Deliveries by status</b>
              <div className="row wrap" style={{ marginTop: 8 }}>
                {Object.entries(s.deliveries).map(([k, v]) => <span key={k} className="tag">{k}: {v}</span>)}
                {!Object.keys(s.deliveries).length && <span className="muted small">None yet</span>}
              </div>
            </div>
          </>
        )}

        {tab === "settings" && <SettingsTab key={JSON.stringify(data.config.overrides)} config={data.config} post={post} />}
        {tab === "data" && <GameDataTab key={JSON.stringify(data.config.overrides.catalog ?? {})} config={data.config} post={post} />}
        {tab === "revenue" && <RevenueTab rev={data.revenue} config={data.config} />}

        {tab === "users" && (
          <>
            <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
            <div className="table-scroll">
              <table>
                <thead><tr><th>Player</th><th>Email</th><th>Lvl</th><th>Coins</th><th>Gems</th><th>Source</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} style={{ opacity: u.banned ? 0.5 : 1 }}>
                      <td><span className={`dot ${u.online ? "on" : ""}`} /> <b>{u.username}</b> {u.role === "ADMIN" && <span className="tag">admin</span>}</td>
                      <td className="muted">{u.email}</td>
                      <td>{u.level}</td>
                      <td>{u.coins}</td>
                      <td>{u.gems}</td>
                      <td>{u.utmSource ?? "organic"}</td>
                      <td className="muted">{fmt(u.createdAt)}</td>
                      <td className="row">
                        <button className="btn ghost small" onClick={() => post({ action: "ban", userId: u.id, banned: !u.banned })}>{u.banned ? "Unban" : "Ban"}</button>
                        <button className="btn ghost small" onClick={() => post({ action: "role", userId: u.id, role: u.role === "ADMIN" ? "PLAYER" : "ADMIN" })}>{u.role === "ADMIN" ? "Demote" : "Make admin"}</button>
                        <button className="btn ghost small" onClick={() => askText(`Coins to grant ${u.username}`, "100", { body: "Use a negative number to remove coins.", ok: "Grant" }).then((c) => { if (c && Number.isFinite(Number(c))) post({ action: "grant", userId: u.id, coins: Math.round(Number(c)), xp: 0 }); })}>🪙 Gift</button>
                        <button className="btn ghost small" onClick={() => askText(`Gems to grant ${u.username}`, "50", { body: "Use a negative number to remove gems.", ok: "Grant" }).then((c) => { if (c && Number.isFinite(Number(c))) post({ action: "grantGems", userId: u.id, gems: Math.round(Number(c)) }); })}>💎 Gift</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "missions" && (
          <>
            <div className="card">
              <b>New mission drop</b>
              <p className="small muted">Hand-placed missions appear on everyone&apos;s map at that spot during the active window — great for sponsored drops, store activations and city campaigns.</p>
              <div className="form-grid">
                <div><label>Title</label><input value={mission.title} onChange={(e) => setMission({ ...mission, title: e.target.value })} /></div>
                <div><label>Sponsor (optional)</label><input value={mission.sponsor} onChange={(e) => setMission({ ...mission, sponsor: e.target.value })} /></div>
                <div><label>Latitude</label><input value={mission.lat} onChange={(e) => setMission({ ...mission, lat: e.target.value })} placeholder="51.5079" /></div>
                <div><label>Longitude</label><input value={mission.lng} onChange={(e) => setMission({ ...mission, lng: e.target.value })} placeholder="-0.0877" /></div>
                <div><label>Reward item</label><select value={mission.itemKey} onChange={(e) => setMission({ ...mission, itemKey: e.target.value })}>{data.items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></div>
                <div><label>XP</label><input type="number" value={mission.rewardXp} onChange={(e) => setMission({ ...mission, rewardXp: Number(e.target.value) })} /></div>
                <div><label>Coins</label><input type="number" value={mission.rewardCoins} onChange={(e) => setMission({ ...mission, rewardCoins: Number(e.target.value) })} /></div>
                <div><label>Active from</label><input type="datetime-local" value={mission.activeFrom} onChange={(e) => setMission({ ...mission, activeFrom: e.target.value })} /></div>
                <div><label>Active to</label><input type="datetime-local" value={mission.activeTo} onChange={(e) => setMission({ ...mission, activeTo: e.target.value })} /></div>
              </div>
              <label>Description</label>
              <textarea rows={2} value={mission.description} onChange={(e) => setMission({ ...mission, description: e.target.value })} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn ghost small" onClick={() => navigator.geolocation.getCurrentPosition((p) => setMission({ ...mission, lat: String(p.coords.latitude), lng: String(p.coords.longitude) }))}>📍 Use my location</button>
                <button className="btn" onClick={async () => {
                  const ok = await post({ action: "createMission", ...mission, lat: Number(mission.lat), lng: Number(mission.lng), sponsor: mission.sponsor || undefined, activeFrom: new Date(mission.activeFrom), activeTo: new Date(mission.activeTo) });
                  if (ok) setMission({ ...mission, title: "", description: "" });
                }}>Create mission</button>
              </div>
            </div>
            <table>
              <thead><tr><th>Mission</th><th>Where</th><th>Window</th><th>Reward</th><th /></tr></thead>
              <tbody>
                {data.missions.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.title}</b> {m.sponsor && <span className="tag">{m.sponsor}</span>}</td>
                    <td className="mono small">{m.lat.toFixed(4)}, {m.lng.toFixed(4)}</td>
                    <td className="small muted">{fmt(m.activeFrom)} → {fmt(m.activeTo)}</td>
                    <td>{m.itemKey} · {m.rewardXp} XP · {m.rewardCoins} 🪙</td>
                    <td><button className="btn ghost small" onClick={() => askConfirm("Delete mission?", { ok: "Delete", danger: true }).then((ok) => ok && post({ action: "deleteMission", id: m.id }))}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "marketing" && (
          <>
            <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <div className="card">
                <b>Signups by source</b>
                <table><tbody>{data.bySource.map((r) => <tr key={r.source}><td>{r.source}</td><td>{r.count}</td></tr>)}</tbody></table>
              </div>
              <div className="card">
                <b>Signups by campaign</b>
                <table><tbody>{data.byCampaign.map((r) => <tr key={r.campaign}><td>{r.campaign}</td><td>{r.count}</td></tr>)}{!data.byCampaign.length && <tr><td className="muted">No campaigns tracked yet</td></tr>}</tbody></table>
              </div>
            </div>
            <div className="card">
              <b>Campaign link builder</b>
              <div className="form-grid">
                {(["path", "source", "medium", "campaign"] as const).map((k) => (
                  <div key={k}><label>{k}</label><input value={utm[k]} onChange={(e) => setUtm({ ...utm, [k]: e.target.value })} /></div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input readOnly value={utmUrl} className="mono small" />
                <button className="btn cyan small" onClick={() => navigator.clipboard.writeText(utmUrl)}>Copy</button>
              </div>
            </div>
            <div className="card">
              <b>Announcement banners</b>
              <p className="small muted">Shown on the landing page and inside the game.</p>
              <div className="form-grid">
                <div><label>Title</label><input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></div>
                <div><label>Body</label><input value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} /></div>
                <div><label>Button label</label><input value={ann.ctaLabel} onChange={(e) => setAnn({ ...ann, ctaLabel: e.target.value })} /></div>
                <div><label>Button URL</label><input value={ann.ctaUrl} onChange={(e) => setAnn({ ...ann, ctaUrl: e.target.value })} /></div>
              </div>
              <button className="btn small" style={{ marginTop: 10 }} onClick={async () => (await post({ action: "createAnnouncement", ...ann, ctaLabel: ann.ctaLabel || undefined, ctaUrl: ann.ctaUrl || undefined })) && setAnn({ title: "", body: "", ctaLabel: "", ctaUrl: "" })}>Publish</button>
              <table style={{ marginTop: 10 }}><tbody>
                {data.announcements.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.title}</b> <span className="muted">{a.body}</span></td>
                    <td className="row">
                      <button className="btn ghost small" onClick={() => post({ action: "toggleAnnouncement", id: a.id, active: !a.active })}>{a.active ? "Hide" : "Show"}</button>
                      <button className="btn ghost small" onClick={() => post({ action: "deleteAnnouncement", id: a.id })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="card">
              <b>Live push to everyone online</b>
              <div className="row" style={{ marginTop: 8 }}>
                <input placeholder="Title" value={push.title} onChange={(e) => setPush({ ...push, title: e.target.value })} />
                <input placeholder="Body" value={push.body} onChange={(e) => setPush({ ...push, body: e.target.value })} />
                <button className="btn yellow small" disabled={!push.title} onClick={async () => (await post({ action: "broadcast", ...push })) && setPush({ title: "", body: "" })}>Send</button>
              </div>
            </div>
          </>
        )}

        {tab === "moderation" && (
          <div className="form-grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <b>Location messages</b>
              <table><tbody>
                {data.notes.map((n) => (
                  <tr key={n.id} style={{ opacity: n.hidden ? 0.4 : 1 }}>
                    <td><b>{n.author.username}</b>: {n.body}<div className="small muted mono">{n.lat.toFixed(4)}, {n.lng.toFixed(4)}</div></td>
                    <td><button className="btn ghost small" onClick={() => post({ action: "hideNote", id: n.id, hidden: !n.hidden })}>{n.hidden ? "Restore" : "Hide"}</button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="card">
              <b>Recent chat</b>
              <table><tbody>
                {data.messages.map((m) => (
                  <tr key={m.id}>
                    <td><span className="tag">{m.room.split(":")[0]}</span> <b>{m.author.username}</b>: {m.body}</td>
                    <td><button className="btn ghost small" onClick={() => post({ action: "deleteMessage", id: m.id })}>Delete</button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}

        {tab === "deliveries" && (
          <table>
            <thead><tr><th>Package</th><th>Sender</th><th>Courier</th><th>Reward</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.title}</b></td>
                  <td>{d.sender.username}</td>
                  <td>{d.courier?.username ?? "—"}</td>
                  <td>{d.reward}</td>
                  <td><span className="tag">{d.status}</span></td>
                  <td className="muted small">{fmt(d.createdAt)}</td>
                  <td>{!["DELIVERED", "CANCELLED"].includes(d.status) && <button className="btn ghost small" onClick={() => askConfirm("Cancel and refund sender?", { ok: "Cancel delivery", cancel: "Keep it", danger: true }).then((ok) => ok && post({ action: "cancelDelivery", id: d.id }))}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
