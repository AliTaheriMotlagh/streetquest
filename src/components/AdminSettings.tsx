"use client";
// Admin: live game settings (every tunable in lib/settings.ts), per-entry stat
// overrides for units/buildings/towers/items/research, and store & ad revenue.
import { useMemo, useState } from "react";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "./Button";

type Def = { key: string; group: string; label: string; help: string; min?: number; max?: number; step?: number; type: "number" | "bool" | "text" | "json"; def: unknown };
type CatalogEntry = { key: string; name: string; emoji: string; values: Record<string, number | null> };
export type AdminConfig = {
  defs: Def[];
  values: Record<string, unknown>;
  overrides: Record<string, unknown>;
  metrics: Record<string, string>;
  catalog: Record<string, CatalogEntry[]>;
  originals: Record<string, Record<string, Record<string, number | null>>>;
};
export type AdminRevenue = {
  stripe: boolean;
  push: boolean;
  pushDevices: number;
  last30: { cents: number; gems: number; count: number };
  allTime: { cents: number; count: number };
  ads7: number;
  adsByCreative: { creativeId: string; views: number; clicks: number }[];
  purchases: { id: string; user: string; pack: string; gems: number; amountCents: number; currency: string; status: string; createdAt: string }[];
};

type Post = (body: object) => Promise<boolean>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------- list editors for the JSON settings
type Col = { path: string; label: string; type: "text" | "number" | "metric" | "bool" | "tiers"; width?: number };
const COLUMNS: Record<string, Col[]> = {
  worldGoals: [
    { path: "emoji", label: "", type: "text", width: 44 },
    { path: "title", label: "Title", type: "text" },
    { path: "metric", label: "Counts", type: "metric" },
    { path: "target", label: "Target", type: "number" },
    { path: "reward.xp", label: "XP", type: "number", width: 80 },
    { path: "reward.coins", label: "Coins", type: "number", width: 80 },
    { path: "reward.gems", label: "Gems", type: "number", width: 70 },
    { path: "key", label: "Id", type: "text", width: 90 },
  ],
  personalGoals: [
    { path: "emoji", label: "", type: "text", width: 44 },
    { path: "title", label: "Title", type: "text" },
    { path: "metric", label: "Counts", type: "metric" },
    { path: "tiers", label: "Tiers (comma list)", type: "tiers" },
    { path: "reward.xp", label: "XP/tier", type: "number", width: 80 },
    { path: "reward.coins", label: "Coins/tier", type: "number", width: 80 },
    { path: "reward.gems", label: "Gems/tier", type: "number", width: 70 },
    { path: "key", label: "Id", type: "text", width: 90 },
  ],
  gemPacks: [
    { path: "label", label: "Name", type: "text" },
    { path: "gems", label: "Gems", type: "number", width: 90 },
    { path: "priceCents", label: "Price (cents)", type: "number", width: 110 },
    { path: "bonus", label: "Badge", type: "text", width: 110 },
    { path: "key", label: "Id", type: "text", width: 90 },
  ],
  gemOffers: [
    { path: "label", label: "Name", type: "text" },
    { path: "gems", label: "Costs gems", type: "number", width: 100 },
    { path: "coins", label: "Gives coins", type: "number", width: 110 },
    { path: "key", label: "Id", type: "text", width: 90 },
  ],
  adCreatives: [
    { path: "active", label: "On", type: "bool", width: 40 },
    { path: "sponsor", label: "Sponsor", type: "text", width: 120 },
    { path: "title", label: "Headline", type: "text" },
    { path: "body", label: "Text", type: "text" },
    { path: "imageUrl", label: "Image URL", type: "text" },
    { path: "videoUrl", label: "Video URL", type: "text" },
    { path: "clickUrl", label: "Link", type: "text" },
    { path: "id", label: "Id", type: "text", width: 90 },
  ],
};
COLUMNS.factionGoals = COLUMNS.worldGoals;
const NEW_ROW: Record<string, () => object> = {
  worldGoals: () => ({ key: `g${Date.now().toString(36)}`, title: "New goal", emoji: "🎯", metric: "collect", target: 1000, reward: { xp: 300, coins: 200, gems: 5 } }),
  personalGoals: () => ({ key: `p${Date.now().toString(36)}`, title: "New milestone", emoji: "🎯", metric: "collect", tiers: [10, 50, 200], reward: { xp: 100, coins: 50, gems: 1 } }),
  gemPacks: () => ({ key: `pack${Date.now().toString(36)}`, gems: 100, priceCents: 199, label: "New pack" }),
  gemOffers: () => ({ key: `o${Date.now().toString(36)}`, gems: 20, coins: 1000, label: "New offer" }),
  adCreatives: () => ({ id: `ad${Date.now().toString(36)}`, sponsor: "Sponsor", title: "Headline", body: "", imageUrl: "", clickUrl: "", active: true }),
};
NEW_ROW.factionGoals = NEW_ROW.worldGoals;

const get = (o: Record<string, unknown>, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);
function set(o: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split(".");
  let cur = o;
  for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
  cur[keys[keys.length - 1]] = v;
}

function ListEditor({ k, rows, metrics, onChange }: { k: string; rows: Record<string, unknown>[]; metrics: Record<string, string>; onChange: (rows: Record<string, unknown>[]) => void }) {
  const cols = COLUMNS[k];
  if (!cols) return <textarea rows={6} className="mono small" defaultValue={JSON.stringify(rows, null, 2)} onBlur={(e) => { try { onChange(JSON.parse(e.target.value)); } catch {} }} />;
  const edit = (i: number, path: string, v: unknown) => {
    const next = clone(rows);
    set(next[i], path, v);
    onChange(next);
  };
  return (
    <div className="table-scroll">
      <table className="edit-table">
        <thead><tr>{cols.map((c) => <th key={c.path} style={{ width: c.width }}>{c.label}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const v = get(r, c.path);
                return (
                  <td key={c.path}>
                    {c.type === "metric" ? (
                      <select value={String(v ?? "")} onChange={(e) => edit(i, c.path, e.target.value)}>
                        {Object.entries(metrics).map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                      </select>
                    ) : c.type === "bool" ? (
                      <input type="checkbox" checked={v !== false} onChange={(e) => edit(i, c.path, e.target.checked)} />
                    ) : c.type === "tiers" ? (
                      <input defaultValue={(v as number[] | undefined)?.join(", ") ?? ""} onBlur={(e) => edit(i, c.path, e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0).sort((a, b) => a - b))} />
                    ) : c.type === "number" ? (
                      <input type="number" value={Number(v ?? 0)} onChange={(e) => edit(i, c.path, Number(e.target.value))} />
                    ) : (
                      <input value={String(v ?? "")} onChange={(e) => edit(i, c.path, e.target.value)} />
                    )}
                  </td>
                );
              })}
              <td>
                <Button className="btn ghost small" title="Move up" disabled={!i} onClick={() => { const n = clone(rows); [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}>↑</Button>
                <Button className="btn ghost small" title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => onChange([...rows, NEW_ROW[k]() as Record<string, unknown>])}>+ Add row</Button>
    </div>
  );
}

// ---------------------------------------------------------------- settings tab
const GROUP_ICON: Record<string, string> = { "Players & map": "🗺️", "Play from home": "🛋️", "Rewards & economy": "🪙", "Base & army": "🏰", Territory: "🚩", "Street combat": "🔫", "GPS games & story": "🧭", Goals: "🏆", "Store & ads": "💎" };
const GROUP_DESC: Record<string, string> = {
  "Players & map": "How close players must be, how much spawns, how far they see.",
  "Play from home": "Players who don't walk: on/off, their reward cut and travel speed.",
  "Rewards & economy": "XP, coins and gems the game hands out.",
  "Base & army": "Costs and timers for buildings, troops and research.",
  Territory: "Outposts and king-of-the-hill flags.",
  "Street combat": "Player health and shooting on the street.",
  "GPS games & story": "Treasure hunt, sprint, rally and story missions.",
  Goals: "Weekly world and faction goals, and personal milestones.",
  "Store & ads": "Gem packs, gem offers, boosts and sponsor ads.",
};
export function SettingsTab({ config, post }: { config: AdminConfig; post: Post }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => clone(config.values));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const defs = config.defs.filter((d) => d.key !== "catalog");
  const groups = [...new Set(defs.map((d) => d.group))];
  const [group, setGroup] = useState(groups[0]);
  const dirty = defs.filter((d) => !same(draft[d.key], config.values[d.key])).length;
  const overridden = (d: Def) => !same(draft[d.key], d.def);
  const shown = (d: Def) => !q || `${d.label} ${d.help} ${d.key}`.toLowerCase().includes(q.toLowerCase());

  const save = async () => {
    setSaving(true);
    // Store only what differs from the defaults, so future default changes still apply.
    const data: Record<string, unknown> = {};
    for (const d of config.defs) {
      const v = d.key === "catalog" ? config.values.catalog : draft[d.key];
      if (!same(v, d.def)) data[d.key] = v;
    }
    await post({ action: "saveSettings", data });
    setSaving(false);
  };

  return (
    <>
      <div className="settings-bar">
        <input placeholder="🔎 Search settings" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className={`grow small ${dirty ? "unsaved-note" : "muted"}`}>{dirty ? `● ${dirty} unsaved change${dirty > 1 ? "s" : ""}` : "✓ All saved · changes go live within ~15 s"}</span>
        <Button className="btn ghost small" disabled={!dirty} onClick={() => setDraft(clone(config.values))}>Discard</Button>
        <Button className="btn small" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "💾 Save & apply"}</Button>
      </div>
      <div className="settings-layout">
        <nav className="settings-cats">
          {groups.map((g) => {
            const changed = defs.filter((d) => d.group === g && overridden(d)).length;
            const unsaved = defs.filter((d) => d.group === g && !same(draft[d.key], config.values[d.key])).length;
            return (
              <Button key={g} className={`cat ${!q && group === g ? "on" : ""}`} onClick={() => (setQ(""), setGroup(g))}>
                <span>{GROUP_ICON[g] ?? "•"}</span>
                <span className="grow">{g}</span>
                {unsaved > 0 ? <i className="cat-dot unsaved" title="Unsaved changes" /> : changed > 0 ? <i className="cat-dot" title={`${changed} changed from default`} /> : null}
              </Button>
            );
          })}
        </nav>
        <div className="settings-list">
          {q && <p className="small muted">Results for “{q}” in all categories</p>}
          {groups.map((g) => {
            const list = defs.filter((d) => (q ? shown(d) : d.group === group) && d.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="card settings-group">
                <div className="settings-group-head">
                  <b>{GROUP_ICON[g]} {g}</b>
                  {GROUP_DESC[g] && <span className="small muted">{GROUP_DESC[g]}</span>}
                </div>
                {g === "Goals" && <p className="small muted">Things a goal can count: {Object.values(config.metrics).join(" · ")}</p>}
                {list.map((d) => (
                  <div key={d.key} className={`setting ${d.type === "json" ? "wide" : ""} ${overridden(d) ? "changed" : ""}`}>
                    <div className="grow">
                      <b>{d.label}</b>
                      {d.help && <div className="small muted">{d.help}</div>}
                      {d.type !== "json" && overridden(d) && <div className="small" style={{ color: "var(--yellow)" }}>Changed · default is {String(d.def)}</div>}
                    </div>
                    <div className="setting-input">
                      {d.type === "number" && <input type="number" value={Number(draft[d.key])} min={d.min} max={d.max} step={d.step ?? 1} onChange={(e) => setDraft({ ...draft, [d.key]: e.target.value === "" ? 0 : Number(e.target.value) })} />}
                      {d.type === "bool" && (
                        <Button className={`toggle ${draft[d.key] ? "on" : ""}`} onClick={() => setDraft({ ...draft, [d.key]: !draft[d.key] })} aria-pressed={!!draft[d.key]}>
                          <i />
                          <span>{draft[d.key] ? "On" : "Off"}</span>
                        </Button>
                      )}
                      {d.type === "text" && <input value={String(draft[d.key] ?? "")} onChange={(e) => setDraft({ ...draft, [d.key]: e.target.value })} />}
                      {overridden(d) && <Button className="btn ghost small" title="Back to default" onClick={() => setDraft({ ...draft, [d.key]: clone(d.def) })}>↺</Button>}
                    </div>
                    {d.type === "json" && <ListEditor k={d.key} rows={(draft[d.key] as Record<string, unknown>[]) ?? []} metrics={config.metrics} onChange={(rows) => setDraft({ ...draft, [d.key]: rows })} />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <Button
        className="btn ghost small"
        style={{ marginTop: 10 }}
        onClick={() => askConfirm("Reset EVERY setting and stat override to the built-in defaults?", { ok: "Reset everything", danger: true }).then((ok) => ok && post({ action: "saveSettings", data: {} }))}
      >
        Reset all to defaults
      </Button>
    </>
  );
}

// ---------------------------------------------------------------- game data tab (catalog stat overrides)
const CAT_LABEL: Record<string, string> = { units: "🪖 Units", buildings: "🏗️ Buildings", towers: "🗼 Towers", items: "🎒 Items", research: "🔬 Research" };

export function GameDataTab({ config, post }: { config: AdminConfig; post: Post }) {
  const [cat, setCat] = useState("units");
  const [draft, setDraft] = useState<Record<string, Record<string, Record<string, number>>>>(() => clone((config.values.catalog as Record<string, Record<string, Record<string, number>>>) ?? {}));
  const entries = config.catalog[cat] ?? [];
  const fields = useMemo(() => Object.keys(entries[0]?.values ?? {}), [entries]);
  const orig = (key: string, f: string) => config.originals[cat]?.[key]?.[f] ?? null;
  const value = (key: string, f: string) => draft[cat]?.[key]?.[f] ?? orig(key, f);
  const dirty = !same(draft, config.values.catalog ?? {});
  const edit = (key: string, f: string, raw: string) => {
    const next = clone(draft);
    const v = raw === "" ? null : Number(raw);
    next[cat] ??= {};
    next[cat][key] ??= {};
    if (v == null || !Number.isFinite(v) || v === orig(key, f)) delete next[cat][key][f];
    else next[cat][key][f] = v;
    if (!Object.keys(next[cat][key]).length) delete next[cat][key];
    if (!Object.keys(next[cat]).length) delete next[cat];
    setDraft(next);
  };
  const save = () => {
    const data: Record<string, unknown> = {};
    for (const d of config.defs) {
      const v = d.key === "catalog" ? draft : config.values[d.key];
      if (!same(v, d.def)) data[d.key] = v;
    }
    return post({ action: "saveSettings", data });
  };
  return (
    <>
      <p className="small muted">Every unit, building, tower, item and research project. Change a number to override it (highlighted); clear a cell to go back to the built-in value. Costs and times here are before the global multipliers in Settings.</p>
      <div className="settings-bar">
        <div className="tabs" style={{ margin: 0 }}>
          {Object.keys(config.catalog).map((c) => <Button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{CAT_LABEL[c] ?? c}</Button>)}
        </div>
        <span className="grow" />
        <Button className="btn ghost small" disabled={!dirty} onClick={() => setDraft(clone((config.values.catalog as typeof draft) ?? {}))}>Discard</Button>
        <Button className="btn small" disabled={!dirty} onClick={save}>💾 Save & apply</Button>
      </div>
      <div className="table-scroll">
        <table className="edit-table">
          <thead><tr><th>Name</th>{fields.map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.key}>
                <td><b>{e.emoji} {e.name}</b><div className="small muted mono">{e.key}</div></td>
                {fields.map((f) => {
                  const changed = draft[cat]?.[e.key]?.[f] != null;
                  return (
                    <td key={f}>
                      <input type="number" step="any" className={changed ? "changed" : ""} value={value(e.key, f) ?? ""} placeholder={String(orig(e.key, f) ?? "—")} title={`Built-in: ${orig(e.key, f) ?? "—"}`} onChange={(ev) => edit(e.key, f, ev.target.value)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- revenue tab
const money = (c: number) => (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RevenueTab({ rev, config }: { rev: AdminRevenue; config: AdminConfig }) {
  const creatives = (config.values.adCreatives as { id: string; sponsor: string; title: string }[]) ?? [];
  const cur = String(config.values.currency ?? "usd").toUpperCase();
  return (
    <>
      <div className="kpis">
        <div className="stat"><b>{money(rev.last30.cents)} {cur}</b><span>Revenue · 30d</span></div>
        <div className="stat"><b>{rev.last30.count}</b><span>Purchases · 30d</span></div>
        <div className="stat"><b>{rev.last30.gems.toLocaleString()}</b><span>Gems sold · 30d</span></div>
        <div className="stat"><b>{money(rev.allTime.cents)} {cur}</b><span>Revenue · all time</span></div>
        <div className="stat"><b>{rev.ads7}</b><span>Ads watched · 7d</span></div>
      </div>
      <div className="card">
        <b>Payments {rev.stripe ? <span className="tag" style={{ color: "var(--green)" }}>Stripe connected</span> : <span className="tag" style={{ color: "var(--red)" }}>not set up</span>}</b>
        {!rev.stripe && (
          <ol className="small" style={{ lineHeight: 1.7 }}>
            <li>Create a Stripe account and copy the <b>secret key</b> (Developers → API keys).</li>
            <li>Set <span className="mono">STRIPE_SECRET_KEY</span> in your server environment (Vercel → Settings → Environment Variables) and redeploy.</li>
            <li>Optional but recommended: add a webhook endpoint <span className="mono">/api/store/webhook</span> for <span className="mono">checkout.session.completed</span> and set <span className="mono">STRIPE_WEBHOOK_SECRET</span>.</li>
            <li>Edit gem packs and prices in Settings → Store &amp; ads.</li>
          </ol>
        )}
      </div>
      <div className="card">
        <b>Sponsor spots · 30 days</b>
        <p className="small muted">Sell spots to local businesses: add their ad in Settings → Store &amp; ads → Sponsor ads, then share these numbers with them.</p>
        <table>
          <thead><tr><th>Ad</th><th>Views</th><th>Clicks</th><th>CTR</th></tr></thead>
          <tbody>
            {rev.adsByCreative.map((a) => {
              const c = creatives.find((x) => x.id === a.creativeId);
              return (
                <tr key={a.creativeId}>
                  <td>{c ? <><b>{c.sponsor}</b> · {c.title}</> : a.creativeId === "house" ? "House ad (invite friends)" : a.creativeId}</td>
                  <td>{a.views}</td>
                  <td>{a.clicks}</td>
                  <td>{a.views ? `${((a.clicks / a.views) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              );
            })}
            {!rev.adsByCreative.length && <tr><td className="muted">No views yet</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <b>Recent purchases</b>
        <table>
          <thead><tr><th>Player</th><th>Pack</th><th>Gems</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {rev.purchases.map((p) => (
              <tr key={p.id}>
                <td>{p.user}</td>
                <td>{p.pack}</td>
                <td>{p.gems}</td>
                <td>{money(p.amountCents)} {p.currency.toUpperCase()}</td>
                <td><span className="tag" style={{ color: p.status === "PAID" ? "var(--green)" : undefined }}>{p.status}</span></td>
                <td className="small muted">{new Date(p.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!rev.purchases.length && <tr><td className="muted">No purchases yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
