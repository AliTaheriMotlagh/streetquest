"use client";
// Admin → Scenarios: the story missions of the 3D city (lib/scenarios). A list with switches, and an
// editor: title, briefing, giver, reward, fail rules, and the steps (a type-specific form for each,
// dialogue lines, checkpoints). Places are anchors ("a junction 300–600 m away", "a bakery") or a pin
// on the map (AdminDropMap). Problems show next to the field they're about, from the same validator the
// server uses. "Test it" opens the 3D city on the scenario (/play?drive=1&scenario=<id>).
// Loaded only in the browser (Leaflet), from AdminPanel.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { askConfirm } from "@/components/Dialogs";
import { FLEET } from "@/lib/fleet";
import { fmtNum, getLocale, msg, t } from "@/lib/i18n";
import { STEP_LABEL } from "@/lib/scenarios/text";
import { ANCHOR_KINDS, LIMITS, PLACED, STEP_TYPES, STORE_KINDS, type Anchor, type L10n, type Line, type Scenario, type Step, type StepType } from "@/lib/scenarios/types";
import { say, validateScenario } from "@/lib/scenarios/validate";

const AdminDropMap = dynamic(() => import("./AdminDropMap"), { ssr: false, loading: () => <div className="admin-map" /> });

type Row = Scenario & { starter: boolean; runs: { won: number; failed: number; abandoned: number } };
type Path = (string | number)[];
const key = (p: Path) => p.join(".");
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function setIn<T>(root: T, path: Path, value: unknown): T {
  const next = clone(root) as Record<string | number, unknown>;
  let o = next;
  path.slice(0, -1).forEach((k) => (o = o[k] as Record<string | number, unknown>));
  const last = path[path.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
  return next as T;
}

const ANCHOR_LABEL: Record<(typeof ANCHOR_KINDS)[number], string> = {
  fixed: msg("Pinned on the map"),
  start: msg("Where I am when it starts"),
  junction: msg("A road junction"),
  store: msg("A store of a kind"),
  landmark: msg("A named building"),
  along: msg("A point along the roads"),
};
const STORE_LABEL: Record<(typeof STORE_KINDS)[number], string> = {
  any: msg("Any store"), food: msg("Food & drink"), cafe: msg("Café"), bakery: msg("Bakery"), pharmacy: msg("Pharmacy"), supermarket: msg("Supermarket"), fuel: msg("Fuel station"), bank: msg("Bank"), electronics: msg("Electronics"), clothes: msg("Clothes"),
};

const blankL10n = (): L10n => ({ fa: "", en: "" });
function newStep(type: StepType): Step {
  const base = { text: blankL10n() };
  switch (type) {
    case "goto": return { type, ...base, at: { at: "junction", min: 300, max: 700 } };
    case "car": return { type, ...base, car: "any" };
    case "pickup": return { type, ...base, what: "package", at: { at: "store", kind: "any", min: 150, max: 500 } };
    case "deliver": return { type, ...base, at: { at: "along", dist: 900 } };
    case "chase": return { type, ...base, startM: 70, escapeM: 220 };
    case "evade": return { type, ...base, stars: 2 };
    case "survive": return { type, ...base, seconds: 30 };
    case "hostiles": return { type, ...base, count: 4 };
    case "photo": return { type, ...base, at: { at: "landmark", min: 250, max: 800 } };
    case "drift": return { type, ...base, meters: 100 };
  }
}
const blank = (): Scenario => ({
  id: "", title: blankL10n(), brief: blankL10n(), emoji: "🎬", difficulty: 1, giver: { name: blankL10n(), at: { at: "junction", min: 60, max: 250, from: "start" } },
  steps: [newStep("goto")], reward: { coins: 200, xp: 150 }, enabled: false, fail: { carDestroyed: true, playerDown: true },
});
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);

export default function AdminScenarios({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [server, setServer] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Path | null>(null);
  const [busy, setBusy] = useState(false);
  const lang = getLocale();

  const load = useCallback(() => {
    fetch("/api/admin/scenarios")
      .then((r) => r.json())
      .then((d) => (d.scenarios ? setRows(d.scenarios) : onError(d.error ?? t("Request failed"))))
      .catch(() => onError(t("Request failed")));
  }, [onError]);
  useEffect(load, [load]);

  // Problems by field, live (the same validator the server runs).
  const issues = useMemo(() => {
    const out: Record<string, string> = { ...server };
    if (draft) {
      const v = validateScenario(draft);
      if (!v.ok) for (const e of v.errors) out[e.path] ??= t(e.message, e.vars);
    }
    return out;
  }, [draft, server]);
  const problem = (p: Path) => (issues[key(p)] ? <div className="small" style={{ color: "var(--red, #ff6b5a)" }} role="alert">{issues[key(p)]}</div> : null);

  const post = async (body: object) => {
    const r = await fetch("/api/admin/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    return { ok: r.ok, d };
  };
  const edit = (s: Scenario | null, asNew = false) => {
    setDraft(s ? clone(s) : blank());
    setIsNew(!s || asNew);
    setServer({});
    setPicker(null);
    onError(null);
  };
  const duplicate = (s: Row) => {
    const copy = clone(s) as Scenario & Partial<Row>;
    delete copy.starter;
    delete copy.runs;
    edit({ ...copy, id: `${s.id}-copy`.slice(0, 40), title: { fa: `${s.title.fa} (کپی)`, en: `${s.title.en} (copy)` }, enabled: false }, true);
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    onError(null);
    const { ok, d } = await post({ action: "save", scenario: draft });
    setBusy(false);
    if (!ok) {
      setServer(Object.fromEntries((d.issues ?? []).map((i: { path: string; message: string }) => [i.path, i.message])));
      return onError(d.error ?? t("Request failed"));
    }
    setDraft(null);
    load();
  };
  const toggle = async (s: Row) => {
    const { ok, d } = await post({ action: "enable", scenario: { ...s, starter: undefined, runs: undefined }, enabled: !s.enabled });
    if (!ok) onError(d.error ?? t("Request failed"));
    load();
  };
  const remove = async (s: Row) => {
    const ok = await askConfirm(s.starter ? t("Reset “{name}” to its original?", { name: say(s.title, lang) }) : t("Delete “{name}”?", { name: say(s.title, lang) }), { body: t("Run history is kept."), ok: s.starter ? t("Reset") : t("Delete"), danger: true });
    if (!ok) return;
    await post({ action: "delete", id: s.id });
    load();
  };

  const set = (p: Path, v: unknown) => setDraft((d) => (d ? setIn(d, p, v) : d));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      if (!d || i + by < 0 || i + by >= d.steps.length) return d;
      const steps = clone(d.steps);
      [steps[i], steps[i + by]] = [steps[i + by], steps[i]];
      return { ...d, steps };
    });

  // ---- small field editors
  const text = (label: string, p: Path, v: L10n | undefined, big = false) => (
    <div>
      <label>{label}</label>
      <div className="row wrap" style={{ gap: 6 }}>
        {(["fa", "en"] as const).map((l) =>
          big ? (
            <textarea key={l} rows={3} dir={l === "fa" ? "rtl" : "ltr"} lang={l} placeholder={l === "fa" ? "فارسی" : "English"} value={v?.[l] ?? ""} maxLength={LIMITS.text} style={{ flex: "1 1 220px" }} onChange={(e) => set([...p, l], e.target.value)} />
          ) : (
            <input key={l} dir={l === "fa" ? "rtl" : "ltr"} lang={l} placeholder={l === "fa" ? "فارسی" : "English"} value={v?.[l] ?? ""} maxLength={LIMITS.text} style={{ flex: "1 1 160px" }} onChange={(e) => set([...p, l], e.target.value)} />
          ),
        )}
      </div>
      {problem(p)}
    </div>
  );
  const number = (label: string, p: Path, v: number | undefined, opts: { step?: number; placeholder?: string } = {}) => (
    <div>
      <label>{label}</label>
      <input type="number" inputMode="decimal" step={opts.step} placeholder={opts.placeholder} value={v ?? ""} onChange={(e) => set(p, e.target.value === "" ? undefined : Number(e.target.value))} />
      {problem(p)}
    </div>
  );

  const anchorEditor = (label: string, p: Path, a: Anchor) => {
    const rel = a.at === "junction" || a.at === "store" || a.at === "landmark" || a.at === "along";
    return (
      <div className="card" style={{ padding: 8 }}>
        <label>{label}</label>
        <div className="form-grid" style={{ gap: 8 }}>
          <div>
            <select
              value={a.at}
              onChange={(e) => {
                const k = e.target.value as Anchor["at"];
                set(p, k === "fixed" ? { at: "fixed", lat: 35.6997, lng: 51.338 } : k === "start" ? { at: "start" } : k === "along" ? { at: "along", dist: 800 } : k === "store" ? { at: "store", kind: "any", min: 150, max: 500 } : { at: k, min: 150, max: 500 });
              }}
            >
              {ANCHOR_KINDS.map((k) => <option key={k} value={k}>{t(ANCHOR_LABEL[k])}</option>)}
            </select>
            {problem([...p, "at"])}
          </div>
          {a.at === "store" && (
            <div>
              <select value={a.kind} onChange={(e) => set([...p, "kind"], e.target.value)}>
                {STORE_KINDS.map((k) => <option key={k} value={k}>{t(STORE_LABEL[k])}</option>)}
              </select>
              {problem([...p, "kind"])}
            </div>
          )}
          {(a.at === "junction" || a.at === "store" || a.at === "landmark") && (
            <>
              {number(t("From (m)"), [...p, "min"], a.min, { placeholder: "150" })}
              {number(t("To (m)"), [...p, "max"], a.max, { placeholder: "500" })}
            </>
          )}
          {a.at === "along" && number(t("Distance along roads (m)"), [...p, "dist"], a.dist)}
          {rel && (
            <div>
              <label>{t("Measured from")}</label>
              <select value={a.from ?? "prev"} onChange={(e) => set([...p, "from"], e.target.value)}>
                <option value="prev">{t("The previous place")}</option>
                <option value="start">{t("Where I started")}</option>
              </select>
            </div>
          )}
          {a.at === "fixed" && (
            <>
              {number(t("Latitude"), [...p, "lat"], a.lat, { step: 0.0001 })}
              {number(t("Longitude"), [...p, "lng"], a.lng, { step: 0.0001 })}
              <div><label>&nbsp;</label><Button className="btn ghost small" onClick={() => setPicker(picker && key(picker) === key(p) ? null : p)}>📍 {t("Pick on the map")}</Button></div>
            </>
          )}
        </div>
        {a.at === "fixed" && picker && key(picker) === key(p) && (
          <AdminDropMap points={[{ lat: a.lat, lng: a.lng }]} center={{ lat: a.lat, lng: a.lng }} existing={[]} onPick={(pt) => (set([...p, "lat"], Math.round(pt.lat * 1e5) / 1e5), set([...p, "lng"], Math.round(pt.lng * 1e5) / 1e5))} />
        )}
      </div>
    );
  };

  const linesEditor = (label: string, p: Path, lines: Line[] | undefined) => (
    <div>
      <div className="row"><label className="grow">{label}</label><Button className="btn ghost small" onClick={() => set(p, [...(lines ?? []), { speaker: blankL10n(), text: blankL10n() }])}>＋ {t("Line")}</Button></div>
      {(lines ?? []).map((l, i) => (
        <div key={i} className="card" style={{ padding: 8 }}>
          {text(t("Speaker"), [...p, i, "speaker"], l.speaker)}
          {text(t("Says"), [...p, i, "text"], l.text)}
          <div className="row">
            <input className="grow" placeholder={t("Recorded line id (optional)")} value={l.bark ?? ""} maxLength={60} onChange={(e) => set([...p, i, "bark"], e.target.value || undefined)} />
            <Button className="btn ghost small" onClick={() => set(p, (lines ?? []).filter((_, j) => j !== i).length ? (lines ?? []).filter((_, j) => j !== i) : undefined)}>🗑️</Button>
          </div>
          {problem([...p, i, "bark"])}
        </div>
      ))}
      {problem(p)}
    </div>
  );

  const stepEditor = (s: Step, i: number) => {
    const p: Path = ["steps", i];
    const carList = s.type === "car" || s.type === "chase" ? (Array.isArray(s.car) ? s.car : s.car && s.car !== "any" ? [s.car] : []) : [];
    return (
      <div key={i} className="card" style={{ padding: 10 }}>
        <div className="row wrap">
          <b className="grow">{fmtNum(i + 1)} · {t(STEP_LABEL[s.type])}</b>
          <Button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("Move up")}>↑</Button>
          <Button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === draft!.steps.length - 1} aria-label={t("Move down")}>↓</Button>
          <Button className="btn ghost small" onClick={() => set(["steps"], [...draft!.steps.slice(0, i + 1), clone(s), ...draft!.steps.slice(i + 1)])} aria-label={t("Duplicate")}>⧉</Button>
          <Button className="btn ghost small" onClick={() => set(["steps"], draft!.steps.filter((_, j) => j !== i))} aria-label={t("Delete")}>🗑️</Button>
        </div>
        {problem(p)}
        <div className="form-grid" style={{ gap: 8 }}>
          <div>
            <label>{t("Type")}</label>
            <select value={s.type} onChange={(e) => set(p, { ...newStep(e.target.value as StepType), text: s.text, say: s.say, checkpoint: s.checkpoint, timeLimitS: s.timeLimitS })}>
              {STEP_TYPES.map((k) => <option key={k} value={k}>{t(STEP_LABEL[k])}</option>)}
            </select>
          </div>
          {number(t("Time limit for this step (s)"), [...p, "timeLimitS"], s.timeLimitS)}
          <div><label>{t("Checkpoint")}</label><label className="row"><input type="checkbox" checked={!!s.checkpoint} onChange={(e) => set([...p, "checkpoint"], e.target.checked || undefined)} /> {t("Retry starts after this step")}</label></div>
          {s.type === "pickup" && (
            <div><label>{t("What")}</label><select value={s.what} onChange={(e) => set([...p, "what"], e.target.value)}><option value="package">{t("A package")}</option><option value="person">{t("A person")}</option></select>{problem([...p, "what"])}</div>
          )}
          {(s.type === "goto" || s.type === "pickup" || s.type === "deliver" || s.type === "photo") && number(t("Radius (m)"), [...p, "radius"], s.radius, { placeholder: s.type === "photo" ? "70" : "25" })}
          {s.type === "evade" && number(t("Wanted stars"), [...p, "stars"], s.stars)}
          {s.type === "survive" && number(t("Seconds"), [...p, "seconds"], s.seconds)}
          {s.type === "hostiles" && number(t("Gunmen to take out"), [...p, "count"], s.count)}
          {s.type === "drift" && number(t("Metres of drift"), [...p, "meters"], s.meters)}
          {s.type === "chase" && (
            <>
              {number(t("Starts ahead (m)"), [...p, "startM"], s.startM, { placeholder: "70" })}
              {number(t("Gets away at (m)"), [...p, "escapeM"], s.escapeM, { placeholder: "220" })}
            </>
          )}
          {(s.type === "car" || s.type === "chase") && (
            <div>
              <label>{t("Car")}</label>
              <select
                value={carList[0] ?? "any"}
                onChange={(e) => set([...p, "car"], e.target.value === "any" ? (s.type === "car" ? "any" : undefined) : e.target.value)}
              >
                <option value="any">{t("Any car")}</option>
                {Object.keys(FLEET).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              {problem([...p, "car"])}
            </div>
          )}
        </div>
        {(PLACED as readonly string[]).includes(s.type) && anchorEditor(t("Where"), [...p, "at"], (s as Extract<Step, { at: Anchor }>).at)}
        {text(t("Objective (shown on screen)"), [...p, "text"], s.text)}
        {linesEditor(t("Dialogue when this step starts"), [...p, "say"], s.say)}
      </div>
    );
  };

  if (!rows) return <p>{t("Loading…")}</p>;
  const test = (id: string) => window.open(`/play?drive=1&scenario=${encodeURIComponent(id)}`, "_blank");

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <b className="grow">{t("Story scenarios")}</b>
          <Button className="btn green small" onClick={() => edit(null)}>＋ {t("New scenario")}</Button>
        </div>
        <p className="small muted">{t("Missions in the 3D city: a giver stands on the street, the player accepts, and the steps play out. The six starters can be switched off or duplicated and changed.")}</p>
        <table className="table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.emoji} {say(r.title, lang)}</b><div className="small muted">{t("{n} steps", { n: fmtNum(r.steps.length) })} · 🪙 {fmtNum(r.reward.coins)} · {t("{n} XP", { n: fmtNum(r.reward.xp) })}{r.starter && ` · ${t("starter")}`}</div></td>
                <td className="small muted">{t("won {a} · failed {b}", { a: fmtNum(r.runs.won), b: fmtNum(r.runs.failed) })}</td>
                <td><label className="row"><input type="checkbox" checked={r.enabled} onChange={() => void toggle(r)} /> {t("On")}</label></td>
                <td className="row wrap">
                  <Button className="btn ghost small" onClick={() => edit(r)}>{t("Edit")}</Button>
                  <Button className="btn ghost small" onClick={() => duplicate(r)}>{t("Duplicate")}</Button>
                  <Button className="btn ghost small" onClick={() => test(r.id)}>▶ {t("Test it")}</Button>
                  <Button className="btn ghost small" onClick={() => void remove(r)}>{r.starter ? t("Reset") : t("Delete")}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card">
          <b>{isNew ? t("New scenario") : t("Edit scenario")}</b>
          <div className="form-grid" style={{ gap: 8 }}>
            <div>
              <label>{t("Id")}</label>
              <input value={draft.id} disabled={!isNew} maxLength={40} onChange={(e) => set(["id"], slug(e.target.value))} onFocus={() => !draft.id && draft.title.en && set(["id"], slug(draft.title.en))} />
              {problem(["id"])}
            </div>
            <div><label>{t("Emoji")}</label><input value={draft.emoji} maxLength={8} onChange={(e) => set(["emoji"], e.target.value)} />{problem(["emoji"])}</div>
            <div>
              <label>{t("Difficulty")}</label>
              <select value={draft.difficulty} onChange={(e) => set(["difficulty"], Number(e.target.value))}>
                <option value={1}>{t("Easy")}</option><option value={2}>{t("Medium")}</option><option value={3}>{t("Hard")}</option>
              </select>
            </div>
            <div><label>{t("Enabled")}</label><label className="row"><input type="checkbox" checked={draft.enabled} onChange={(e) => set(["enabled"], e.target.checked)} /> {t("Players can play it")}</label></div>
          </div>
          {text(t("Title"), ["title"], draft.title)}
          {text(t("Briefing"), ["brief"], draft.brief, true)}
          {text(t("Mission giver's name"), ["giver", "name"], draft.giver.name)}
          {anchorEditor(t("Where the giver stands"), ["giver", "at"], draft.giver.at)}

          <h4>{t("Reward and rules")}</h4>
          <div className="form-grid" style={{ gap: 8 }}>
            {number(t("Coins"), ["reward", "coins"], draft.reward.coins)}
            {number(t("XP"), ["reward", "xp"], draft.reward.xp)}
            {number(t("Time limit for the whole mission (s)"), ["fail", "timeLimitS"], draft.fail?.timeLimitS)}
            <div><label>{t("Fail when")}</label>
              <label className="row"><input type="checkbox" checked={draft.fail?.carDestroyed !== false} onChange={(e) => set(["fail", "carDestroyed"], e.target.checked)} /> {t("my car is wrecked")}</label>
              <label className="row"><input type="checkbox" checked={draft.fail?.playerDown !== false} onChange={(e) => set(["fail", "playerDown"], e.target.checked)} /> {t("I'm knocked out or arrested")}</label>
            </div>
          </div>

          <h4>{t("Steps")}</h4>
          {problem(["steps"])}
          {draft.steps.map(stepEditor)}
          <div className="row wrap">
            {STEP_TYPES.map((k) => <Button key={k} className="btn ghost small" onClick={() => set(["steps"], [...draft.steps, newStep(k)])}>＋ {t(STEP_LABEL[k])}</Button>)}
          </div>
          {linesEditor(t("Said when it's won"), ["outro", "won"], draft.outro?.won)}
          {linesEditor(t("Said when it's failed"), ["outro", "lost"], draft.outro?.lost)}

          <div className="row wrap" style={{ marginTop: 10 }}>
            <Button className="btn green" disabled={busy} onClick={() => void save()}>{t("Save")}</Button>
            <Button className="btn ghost" onClick={() => setDraft(null)}>{t("Cancel")}</Button>
            {!isNew && <Button className="btn ghost" onClick={() => test(draft.id)}>▶ {t("Test it")}</Button>}
            {Object.keys(issues).length > 0 && <span className="small" style={{ color: "var(--red, #ff6b5a)" }}>{t("{n} problems to fix", { n: fmtNum(Object.keys(issues).length) })}</span>}
          </div>
          <p className="small muted">{t("Save first, then test it: the link opens the 3D city and the briefing straight away (even if the scenario is switched off).")}</p>
        </div>
      )}
    </div>
  );
}
