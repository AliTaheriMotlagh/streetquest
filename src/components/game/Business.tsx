"use client";
// Business center: for real stores, cafés and restaurants. Claim your place on the map
// (from inside the store), post missions that bring players through the door, redeem
// their coupon codes at the till, watch the numbers, and pick a plan.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t, toAsciiDigits } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { PLACE_CAT_KEYS, PLACE_CATS, type PlaceCat } from "@/lib/places";
import { BIZ_LIMITS, CAMPAIGN_MAX_DAYS, PLAN_BY_KEY, type PlanDef, type PlanKey } from "@/lib/business";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import type { BizDashboard } from "@/server/business";
import { api, fmtTime } from "./client";
import { celebrate } from "./Play";
import { Sheet, useGame } from "./ui";
import { OwnerLinkFields } from "./StoreInfo";

type Data = {
  enabled: boolean;
  businesses: BizDashboard[];
  plans: PlanDef[];
  payments: boolean;
  currency: string;
  trialDays: number;
  maxCoins: number;
  claimable: { id: string; name: string; cat: string; lat: number; lng: number; distanceM: number }[];
  admin: boolean;
};

const money = (cents: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);

export function BusinessPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<"home" | "setup" | "edit" | "campaign" | "plans">("home");
  const load = useCallback(() => api<Data>("/api/business").then((d) => (setData(d), setError(null))).catch((e) => setError((e as Error).message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const b = data?.businesses[sel] ?? null;
  const title = view === "setup" ? t("Put your store on the map") : view === "edit" ? t("Store details") : view === "campaign" ? t("New mission") : view === "plans" ? t("Plans") : b ? `${b.emoji} ${b.name}` : t("Business center");
  return (
    <Sheet title={title} onClose={onClose} peek={peek} help="biz" tall actions={view !== "home" ? <button className="close back-btn" onClick={() => setView("home")} aria-label={t("Back")}>‹</button> : undefined}>
      {error && <p className="small" style={{ color: "var(--red)" }}>{error}</p>}
      {!data ? (
        <div className="feed-skeleton" aria-hidden><i /><i /></div>
      ) : !data.enabled && !data.businesses.length ? (
        <p className="muted">{t("Business accounts are switched off right now")}</p>
      ) : view === "setup" ? (
        <Setup data={data} onDone={() => (setView("home"), load().then(() => setSel(data.businesses.length)))} />
      ) : view === "edit" && b ? (
        <DetailsForm b={b} onDone={() => (setView("home"), load())} />
      ) : view === "campaign" && b ? (
        <CampaignForm b={b} maxCoins={data.maxCoins} onDone={() => (setView("home"), load())} />
      ) : view === "plans" ? (
        <Plans data={data} b={b} onDone={load} />
      ) : !b ? (
        <Pitch data={data} onStart={() => setView("setup")} onPlans={() => setView("plans")} />
      ) : (
        <>
          {data.businesses.length > 1 && (
            <div className="tabs-wrap"><div className="tabs">{data.businesses.map((x, i) => <button key={x.id} className={i === sel ? "on" : ""} onClick={() => setSel(i)}>{x.emoji} {x.name}</button>)}</div></div>
          )}
          <Dashboard b={b} data={data} reload={load} onCampaign={() => setView("campaign")} onEdit={() => setView("edit")} onPlans={() => setView("plans")} onAdd={() => setView("setup")} />
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- for owners who haven't joined yet
function Pitch({ data, onStart, onPlans }: { data: Data; onStart: () => void; onPlans: () => void }) {
  return (
    <>
      <div className="biz-hero">
        <div className="biz-hero-art">🏪✨</div>
        <h3>{t("Bring players through your door")}</h3>
        <p className="small">{t("Thousands of people walk and drive past your store in StreetQuest. Put it on the game map with its real name, post a mission, and they come in to check in — and spend.")}</p>
      </div>
      <div className="biz-points">
        <div><span>📍</span><b>{t("Your real store on the map")}</b><p className="small muted">{t("Claim it from inside the store. Players see your name, sign and missions — in 2D and in the 3D city.")}</p></div>
        <div><span>🎯</span><b>{t("Missions at your door")}</b><p className="small muted">{t("“Check in for 50 coins”, “Free cookie with any coffee”. Every check-in is a verified visit.")}</p></div>
        <div><span>🎟️</span><b>{t("Coupons you can count")}</b><p className="small muted">{t("Players show a code at your till; you type it in. That's a sale the game brought you.")}</p></div>
        <div><span>📈</span><b>{t("Numbers that matter")}</b><p className="small muted">{t("Visits, redemptions, new and repeat customers — month by month.")}</p></div>
      </div>
      <Button className="btn yellow block big-btn" onClick={onStart}>🏪 {t("Claim my store — free")}</Button>
      <Button className="btn ghost block" onClick={onPlans}>{t("See plans")}{data.trialDays ? ` · ${t("{n}-day free trial", { n: data.trialDays })}` : ""}</Button>
    </>
  );
}

function Setup({ data, onDone }: { data: Data; onDone: () => void }) {
  const [picked, setPicked] = useState<Data["claimable"][number] | null>(null);
  const [manual, setManual] = useState(false);
  if (!picked && !manual)
    return (
      <>
        <p className="small">{t("Stand inside (or right outside) your store. Here's what's on the real map around you — pick yours:")}</p>
        {data.claimable.length === 0 && <p className="small muted">{t("No named places within 150 m yet. The map may still be loading this area — or add your store yourself.")}</p>}
        {data.claimable.map((p) => {
          const c = PLACE_CATS[p.cat as PlaceCat] ?? PLACE_CATS.shop;
          return (
            <button key={p.id} className="drive-job" onClick={() => setPicked(p)}>
              <span className="ic">{c.emoji}</span>
              <span className="grow"><b>{p.name}</b><span className="small muted"> · {t(c.label)}</span></span>
              <span className="small muted">{formatDistance(p.distanceM)}</span>
            </button>
          );
        })}
        <Button className="btn ghost block" onClick={() => setManual(true)}>➕ {t("My store isn't listed")}</Button>
      </>
    );
  return <DetailsForm initial={picked ? { name: picked.name, category: picked.cat as PlaceCat } : undefined} osmId={picked?.id} onDone={onDone} onBack={() => (setPicked(null), setManual(false))} />;
}

type Details = { name: string; category: PlaceCat; emoji: string; about: string; address: string; phone: string; website: string; snappfood: string; torob: string; divar: string };

function DetailsForm({ b, initial, osmId, onDone, onBack }: { b?: BizDashboard; initial?: Partial<Details>; osmId?: string; onDone: () => void; onBack?: () => void }) {
  const { act } = useGame();
  const [f, setF] = useState<Details>({
    name: b?.name ?? initial?.name ?? "",
    category: (b?.category as PlaceCat) ?? initial?.category ?? "shop",
    emoji: b?.emoji ?? "",
    about: b?.about ?? "",
    address: b?.address ?? "",
    phone: b?.phone ?? "",
    website: b?.website ?? "",
    snappfood: b?.snappfood ?? "",
    torob: b?.torob ?? "",
    divar: b?.divar ?? "",
  });
  const set = <K extends keyof Details>(k: K, v: Details[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    act(() => api("/api/business", { body: b ? { action: "update", businessId: b.id, ...f } : { action: "create", osmId, ...f } })).then((ok) => {
      if (!ok) return;
      if (!b) celebrate({ title: t("YOU'RE ON THE MAP!"), body: f.name, art: "shop" });
      onDone();
    });
  return (
    <div className="form">
      {osmId && <p className="small"><span className="tag real-tag">📍 {t("Real place")}</span> {t("Players will see your store where it really is.")}</p>}
      <label>{t("Store name")}<input className="input" maxLength={BIZ_LIMITS.name} value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label>{t("What kind of place?")}
        <select className="input" value={f.category} onChange={(e) => set("category", e.target.value as PlaceCat)}>
          {PLACE_CAT_KEYS.map((k) => <option key={k} value={k}>{PLACE_CATS[k].emoji} {t(PLACE_CATS[k].label)}</option>)}
        </select>
      </label>
      <label>{t("Sign (emoji)")}<input className="input" maxLength={4} placeholder={PLACE_CATS[f.category].emoji} value={f.emoji} onChange={(e) => set("emoji", e.target.value)} /></label>
      <label>{t("About")}<textarea className="input" rows={3} maxLength={BIZ_LIMITS.about} placeholder={t("What you sell, what makes you special")} value={f.about} onChange={(e) => set("about", e.target.value)} /></label>
      <label>{t("Address")}<input className="input" maxLength={BIZ_LIMITS.address} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
      <div className="row">
        <label className="grow">{t("Phone")}<input className="input" maxLength={BIZ_LIMITS.phone} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="grow">{t("Website")}<input className="input" maxLength={BIZ_LIMITS.website} placeholder="https://" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
      </div>
      <OwnerLinkFields v={f} set={set} />
      <div className="row">
        {onBack && <Button className="btn ghost" onClick={onBack}>{t("Back")}</Button>}
        <Button className="btn yellow grow" disabled={f.name.trim().length < 2} onClick={save}>{b ? t("Save") : t("🏪 Put it on the map")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the owner's dashboard
function Dashboard({ b, data, reload, onCampaign, onEdit, onPlans, onAdd }: { b: BizDashboard; data: Data; reload: () => void; onCampaign: () => void; onEdit: () => void; onPlans: () => void; onAdd: () => void }) {
  const { act } = useGame();
  const [code, setCode] = useState("");
  const plan = PLAN_BY_KEY[b.plan as PlanKey];
  const pct = Math.min(100, (b.stats.visitsMonth / Math.max(1, b.stats.quota)) * 100);
  const redeem = () =>
    act(() => api("/api/business", { body: { action: "redeem", businessId: b.id, code: toAsciiDigits(code) } })).then((ok) => {
      if (ok) (setCode(""), celebrate({ title: t("COUPON REDEEMED!"), art: "ticket" }), reload());
    });
  const live = b.campaigns.filter((c) => c.live);
  return (
    <>
      <div className="card biz-head">
        <div className="row">
          <div className="icon-tile">{b.emoji}</div>
          <div className="grow">
            <b>{b.name}</b> {b.verified && <span className="tag verified">✔ {t("Verified")}</span>}
            <div className="small muted">{t(PLACE_CATS[b.category as PlaceCat]?.label ?? PLACE_CATS.shop.label)}{b.osmId ? ` · 📍 ${t("Real place")}` : ""}</div>
          </div>
          <button className="chip small plan-chip" onClick={onPlans}>{plan.emoji} {t(plan.name)}</button>
        </div>
        {b.planUntil && <div className="small muted">{t("Plan active until {date}", { date: fmtTime(b.planUntil) })}</div>}
      </div>

      <div className="stat-tiles">
        <div><b>{fmtNum(b.stats.visitsMonth)}</b><span>{t("Visits this month")}</span><i className="bar"><i style={{ width: `${pct}%` }} /></i><span className="tiny muted">{t("of {n}", { n: b.stats.quota })}</span></div>
        <div><b>{fmtNum(b.stats.redeemedMonth)}</b><span>{t("Coupons used")}</span></div>
        <div><b>{fmtNum(b.stats.customers)}</b><span>{t("Customers")}</span></div>
        <div><b>{fmtNum(b.stats.repeat)}</b><span>{t("Came back")}</span></div>
        <div><b>{fmtNum(b.views)}</b><span>{t("Card views")}</span></div>
      </div>

      <div className="card redeem-box">
        <b>🎟️ {t("Redeem a coupon")}</b>
        <p className="small muted">{t("When a player pays, type the code they show you.")}</p>
        <div className="row">
          <input className="input grow code-input" maxLength={8} placeholder="ABC123" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && code.length >= 6 && redeem()} autoCapitalize="characters" />
          <Button className="btn green" disabled={code.replace(/\s/g, "").length < 6} onClick={redeem}>{t("Redeem")}</Button>
        </div>
      </div>

      <div className="row">
        <b className="grow">🎯 {t("Missions")} <span className="muted small">({fmtNum(live.length)}/{fmtNum(plan.campaigns)})</span></b>
        <Button className="btn yellow small" disabled={live.length >= plan.campaigns} onClick={onCampaign}>➕ {t("New mission")}</Button>
      </div>
      {b.campaigns.length === 0 && <p className="small muted">{t("No missions yet. Create one and it appears on the map at your store right away.")}</p>}
      {b.campaigns.map((c) => (
        <div key={c.id} className={`card biz-campaign ${c.live ? "" : "ended"}`}>
          <div className="row">
            <b className="grow">{c.kind === "coupon" ? "🎟️" : "✅"} {c.title}</b>
            <span className={`tag ${c.live ? "live" : ""}`}>{c.live ? t("Live") : c.paused ? t("Paused") : t("Ended")}</span>
          </div>
          {c.offer && <div className="small">🎁 {c.offer}</div>}
          <div className="small muted">
            {t("{n} visits", { n: c.visits })} / {fmtNum(c.maxVisits)} · {t("{n} redeemed", { n: c.redeemed })} · {t("{n} views", { n: c.views })} · +{fmtNum(c.rewardCoins)} 🪙 · {t("until {date}", { date: fmtTime(c.activeTo) })}
          </div>
          {new Date(c.activeTo).getTime() > Date.now() && (
            <div className="row">
              <Button className="btn ghost small" onClick={() => act(() => api("/api/business", { body: { action: "campaign_state", campaignId: c.id, state: c.paused ? "resume" : "pause" } })).then((ok) => ok && reload())}>{c.paused ? t("▶ Resume") : t("⏸ Pause")}</Button>
              <Button className="btn ghost small" onClick={() => askConfirm(t("End “{title}”?", { title: c.title }), { ok: t("End mission"), danger: true }).then((ok) => ok && act(() => api("/api/business", { body: { action: "campaign_state", campaignId: c.id, state: "end" } })).then((ok2) => ok2 && reload()))}>{t("End")}</Button>
            </div>
          )}
        </div>
      ))}

      {b.recent.length > 0 && (
        <>
          <b>👥 {t("Latest visitors")}</b>
          {b.recent.map((v) => (
            <div key={v.id} className="card list-item">
              <span className="avatar-sm">{v.avatar}</span>
              <div className="grow"><b className="small">{v.username}</b><div className="tiny muted">{v.campaign} · {fmtTime(v.at)}</div></div>
              {v.redeemed && <span className="tag live">🎟️ {t("Used")}</span>}
            </div>
          ))}
        </>
      )}

      <div className="row wrap">
        <Button className="btn ghost" onClick={onEdit}>✏️ {t("Store details")}</Button>
        <Button className="btn ghost" onClick={onPlans}>⭐ {t("Plans")}</Button>
        {plan.locations > data.businesses.length && <Button className="btn ghost" onClick={onAdd}>➕ {t("Add a location")}</Button>}
        {b.plan === "free" && (
          <Button className="btn ghost" onClick={() => askConfirm(t("Remove {place} from the map?", { place: b.name }), { body: t("Its missions end and its stats are deleted."), ok: t("Remove"), danger: true }).then((ok) => ok && act(() => api("/api/business", { body: { action: "delete", businessId: b.id } })).then((ok2) => ok2 && reload()))}>🗑️</Button>
        )}
      </div>
      {data.admin && <AdminTools b={b} reload={reload} />}
    </>
  );
}

function CampaignForm({ b, maxCoins, onDone }: { b: BizDashboard; maxCoins: number; onDone: () => void }) {
  const { act } = useGame();
  const plan = PLAN_BY_KEY[b.plan as PlanKey];
  const [f, setF] = useState({ title: "", description: "", kind: plan.coupons ? "coupon" : "visit", offer: "", rewardCoins: Math.min(50, maxCoins), bonusCoins: Math.min(60, maxCoins), maxVisits: Math.min(100, plan.visitsPerMonth), days: 14 });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const ideas = [t("Check in for coins"), t("Free cookie with any coffee"), t("10% off your first order"), t("Happy hour: 2-for-1")];
  return (
    <div className="form">
      <div className="seg seg2" role="tablist">
        <button className={f.kind === "visit" ? "on" : ""} onClick={() => set("kind", "visit")}>✅ {t("Visit")}</button>
        <button className={f.kind === "coupon" ? "on" : ""} disabled={!plan.coupons} title={plan.coupons ? undefined : t("Coupons need the Starter plan or higher")} onClick={() => set("kind", "coupon")}>🎟️ {t("Coupon")}</button>
      </div>
      <p className="small muted">{f.kind === "visit" ? t("Players check in at your door for coins. Great for getting discovered.") : t("Players check in and get a code; they show it at your till for your offer, and you redeem it.")}</p>
      <label>{t("Title")}<input className="input" maxLength={BIZ_LIMITS.title} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={ideas[0]} /></label>
      <div className="chips">{ideas.map((i) => <button key={i} className="chip small" onClick={() => set("title", i)}>{i}</button>)}</div>
      <label>{t("Details")}<textarea className="input" rows={2} maxLength={BIZ_LIMITS.description} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
      {f.kind === "coupon" && <label>{t("The offer at your till")}<input className="input" maxLength={BIZ_LIMITS.offer} value={f.offer} onChange={(e) => set("offer", e.target.value)} placeholder={t("a free cookie")} /></label>}
      <label>{t("Coins per check-in: {n}", { n: f.rewardCoins })}<input type="range" min={0} max={maxCoins} step={5} value={f.rewardCoins} onChange={(e) => set("rewardCoins", Number(e.target.value))} /></label>
      {f.kind === "coupon" && <label>{t("Bonus coins when used: {n}", { n: f.bonusCoins })}<input type="range" min={0} max={maxCoins} step={5} value={f.bonusCoins} onChange={(e) => set("bonusCoins", Number(e.target.value))} /></label>}
      <div className="row">
        <label className="grow">{t("Max visits")}<input className="input" type="number" min={1} max={plan.visitsPerMonth} value={f.maxVisits} onChange={(e) => set("maxVisits", Math.max(1, Math.min(plan.visitsPerMonth, Number(toAsciiDigits(e.target.value)) || 1)))} /></label>
        <label className="grow">{t("Runs for (days)")}<input className="input" type="number" min={1} max={CAMPAIGN_MAX_DAYS} value={f.days} onChange={(e) => set("days", Math.max(1, Math.min(CAMPAIGN_MAX_DAYS, Number(toAsciiDigits(e.target.value)) || 1)))} /></label>
      </div>
      <p className="tiny muted">{t("Coins come from the game — your plan covers it. Your plan allows {n} verified visits a month.", { n: plan.visitsPerMonth })}</p>
      <Button className="btn yellow block big-btn" disabled={f.title.trim().length < 3} onClick={() => act(() => api("/api/business", { body: { action: "campaign", businessId: b.id, ...f } })).then((ok) => ok && (celebrate({ title: t("MISSION LIVE!"), art: "target", body: f.title }), onDone()))}>🎯 {t("Go live")}</Button>
    </div>
  );
}

function Plans({ data, b, onDone }: { data: Data; b: BizDashboard | null; onDone: () => void }) {
  const { act, toast } = useGame();
  const current = (b?.plan ?? "free") as PlanKey;
  const buy = async (plan: PlanKey) => {
    if (!b) return toast({ title: t("Claim your store first") });
    if (!data.payments) return toast({ kind: "error", title: t("Online payment isn't set up yet — contact us to upgrade") });
    await act(async () => {
      const r = await api<{ url: string }>("/api/business", { body: { action: "checkout", businessId: b.id, plan } });
      location.href = r.url;
      return {};
    });
  };
  return (
    <>
      {b && !b.trialUsed && current === "free" && data.trialDays > 0 && (
        <div className="card trial-card">
          <b>🎁 {t("Try Starter free for {n} days", { n: data.trialDays })}</b>
          <p className="small muted">{t("Coupons, 3 missions and 500 visits. No card needed.")}</p>
          <Button className="btn green block" onClick={() => act(() => api("/api/business", { body: { action: "trial", businessId: b.id } })).then((ok) => ok && onDone())}>{t("Start free trial")}</Button>
        </div>
      )}
      <div className="plans">
        {data.plans.map((p) => (
          <div key={p.key} className={`plan card ${p.key === current ? "current" : ""} ${p.key === "pro" ? "best" : ""}`}>
            {p.key === "pro" && <span className="plan-ribbon">{t("Most popular")}</span>}
            <div className="plan-name">{p.emoji} {t(p.name)}</div>
            <div className="plan-price">{p.priceCents ? <>{money(p.priceCents, data.currency)}<span className="small muted"> / {t("month")}</span></> : t("Free")}</div>
            <ul>{p.perks.map((x) => <li key={x} className="small">✓ {t(x)}</li>)}</ul>
            {p.key === current ? <Button className="btn block" disabled>{t("Your plan")}</Button> : p.priceCents ? <Button className="btn yellow block" onClick={() => buy(p.key)}>{t("Choose {plan}", { plan: t(p.name) })}</Button> : null}
          </div>
        ))}
      </div>
      <p className="tiny muted">{t("Plans run for 30 days at a time; paying again adds 30 more. Prices exclude local taxes.")}</p>
    </>
  );
}

function AdminTools({ b, reload }: { b: BizDashboard; reload: () => void }) {
  const { act } = useGame();
  return (
    <div className="card admin-tools">
      <b className="small">🛡️ {t("Admin")}</b>
      <div className="row wrap">
        {(["starter", "pro", "chain"] as const).map((p) => <Button key={p} className="btn ghost small" onClick={() => act(() => api("/api/business", { body: { action: "admin", businessId: b.id, plan: p, days: 30 } })).then((ok) => ok && reload())}>{t("+30 days of {plan}", { plan: t(PLAN_BY_KEY[p].name) })}</Button>)}
        <Button className="btn ghost small" onClick={() => act(() => api("/api/business", { body: { action: "admin", businessId: b.id, verified: !b.verified } })).then((ok) => ok && reload())}>{b.verified ? t("Unverify") : t("Verify")}</Button>
      </div>
    </div>
  );
}
