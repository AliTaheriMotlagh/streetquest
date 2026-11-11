"use client";
// Admin → Graphics: every parameter of the 3D city's quality tiers (drive/graphics/quality.ts)
// and its film look and haze (lib/gfxConfig.ts) as a server default, for all tiers at once or
// one tier. Stored with the other live settings (the `gfx` key), so players get it the way they
// get any setting: with /api/me, applied when the 3D city starts. A player's own quality pick
// still chooses the tier, and "auto" still adapts; the admin only moves what each tier means.
import { useMemo, useState } from "react";
import { msg, t } from "@/lib/i18n";
import { GFX_GROUPS, GFX_PARAMS, overriddenKeys, resolveGfx, sanitizeGfx, tierDefaults, type GfxConfig, type GfxKey, type GfxOverrides, type ParamDef } from "@/lib/gfxConfig";
import { TIERS, type Tier } from "./drive/graphics/quality";
import { askConfirm } from "./Dialogs";
import { Button } from "./Button";
import type { AdminConfig } from "./AdminSettings";

type Scope = "all" | Tier;
const SCOPE_LABEL: Record<Tier, string> = { low: msg("Low"), medium: msg("Medium"), high: msg("High"), ultra: msg("Ultra") };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function AdminGraphics({ config, post }: { config: AdminConfig; post: (body: object) => Promise<boolean> }) {
  const saved = useMemo(() => sanitizeGfx(config.values.gfx), [config.values.gfx]);
  const [draft, setDraft] = useState<GfxConfig>(() => structuredClone(saved));
  const [scope, setScope] = useState<Scope>("all");
  const [saving, setSaving] = useState(false);
  const dirty = !same(sanitizeGfx(draft), saved);
  const current = (): GfxOverrides => (scope === "all" ? draft.all : draft.tiers?.[scope]) ?? {};

  const set = (key: GfxKey, v: number | boolean | undefined) => {
    const next: GfxConfig = structuredClone(draft);
    const bag: GfxOverrides = (scope === "all" ? (next.all ??= {}) : ((next.tiers ??= {})[scope] ??= {}));
    if (v === undefined) delete bag[key];
    else (bag as Record<string, number | boolean>)[key] = v;
    setDraft(sanitizeGfx(next));
  };

  /** What a parameter is at this scope when it isn't overridden here. */
  const inherited = (key: GfxKey) => (scope === "all" ? undefined : resolveGfx(scope, { all: draft.all })[key]);
  const builtin = (key: GfxKey) => (scope === "all" ? "" : String(tierDefaults(scope)[key]));

  const save = async () => {
    setSaving(true);
    // The saved settings are replaced as a whole: keep every other override, change only gfx.
    const data: Record<string, unknown> = { ...config.overrides };
    const clean = sanitizeGfx(draft);
    if (Object.keys(clean).length) data.gfx = clean;
    else delete data.gfx;
    await post({ action: "saveSettings", data });
    setSaving(false);
  };

  const cell = (p: ParamDef) => {
    const cur = current()[p.key];
    const inh = inherited(p.key);
    const hint = inh === undefined ? t("per tier") : String(inh);
    if (p.type === "bool")
      return (
        <select value={cur === undefined ? "" : cur ? "1" : "0"} onChange={(e) => set(p.key, e.target.value === "" ? undefined : e.target.value === "1")}>
          <option value="">{t("Default")} ({inh === undefined ? t("per tier") : inh ? t("on") : t("off")})</option>
          <option value="1">{t("on")}</option>
          <option value="0">{t("off")}</option>
        </select>
      );
    if (p.type === "choice")
      return (
        <select value={cur === undefined ? "" : String(cur)} onChange={(e) => set(p.key, e.target.value === "" ? undefined : Number(e.target.value))}>
          <option value="">{t("Default")} ({hint})</option>
          {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    return (
      <input
        type="number"
        min={p.min}
        max={p.max}
        step={p.step}
        value={cur === undefined ? "" : String(cur)}
        placeholder={hint}
        onChange={(e) => set(p.key, e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? undefined : Number(e.target.value))}
      />
    );
  };

  const changed = (tier: Tier) => overriddenKeys(tier, draft).length;
  const bag = current();

  return (
    <>
      <div className="settings-bar">
        <span className={`grow small ${dirty ? "unsaved-note" : "muted"}`}>{dirty ? t("● Unsaved changes") : t("✓ All saved · players get changes the next time they open the 3D city (within ~15 seconds of saving)")}</span>
        <Button className="btn ghost small" disabled={!dirty} onClick={() => setDraft(structuredClone(saved))}>{t("Discard")}</Button>
        <Button className="btn small" disabled={!dirty || saving} onClick={save}>{saving ? t("Saving…") : t("💾 Save & apply")}</Button>
      </div>

      <div className="card">
        <div className="row wrap" style={{ gap: 6 }}>
          <Button className={`btn small ${scope === "all" ? "" : "ghost"}`} onClick={() => setScope("all")}>{t("All tiers")}</Button>
          {TIERS.map((tier) => (
            <Button key={tier} className={`btn small ${scope === tier ? "" : "ghost"}`} onClick={() => setScope(tier)}>
              {t(SCOPE_LABEL[tier])}{changed(tier) ? ` · ${changed(tier)}` : ""}
            </Button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {scope === "all"
            ? t("Applies to every tier. A value set on one tier wins over this. Leave a field empty to keep each tier's own built-in value.")
            : t("Only the {tier} tier. Empty fields use the All tiers value, then the tier's built-in one.", { tier: t(SCOPE_LABEL[scope]) })}
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {t("Players keep their own quality choice in the game (Auto, Ultra, High, Medium, Low) — it picks the tier; these values are what each tier means. Preview: save, then open the 3D city on a phone or in another tab.")}{" "}
          <a href="/play?drive=1" target="_blank" rel="noreferrer">{t("Open the 3D city")}</a>
        </p>
        <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
          <Button className="btn ghost small" disabled={!Object.keys(bag).length} onClick={() => askConfirm(t("Remove every override on this page and use the built-in defaults?"), { ok: t("Reset"), danger: true }).then((ok) => ok && setDraft(sanitizeGfx(scope === "all" ? { ...draft, all: {} } : { ...draft, tiers: { ...draft.tiers, [scope]: {} } })))}>
            {t("Reset this page to default")}
          </Button>
          <Button className="btn ghost small" disabled={!Object.keys(draft).length} onClick={() => askConfirm(t("Reset every graphics setting, for every tier, to the built-in defaults?"), { ok: t("Reset everything"), danger: true }).then((ok) => ok && setDraft({}))}>
            {t("Reset all graphics to default")}
          </Button>
        </div>
      </div>

      {GFX_GROUPS.map((g) => (
        <div key={g} className="card" style={{ marginTop: 10 }}>
          <b>{t(g)}</b>
          <div style={{ display: "grid", gap: "8px 14px", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginTop: 8 }}>
            {GFX_PARAMS.filter((p) => p.group === g).map((p) => {
              const over = bag[p.key] !== undefined;
              return (
                <label key={p.key} className={`setting ${over ? "changed" : ""}`} style={{ display: "grid", gap: 3 }}>
                  <span className="small">{t(p.label)}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="grow">{cell(p)}</span>
                    {over && <Button className="btn ghost small" onClick={() => set(p.key, undefined)} aria-label={t("Reset to default")} title={t("Reset to default")}>↺</Button>}
                  </span>
                  {scope !== "all" && <span className="small muted">{t("Built-in")}: {builtin(p.key)}</span>}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
