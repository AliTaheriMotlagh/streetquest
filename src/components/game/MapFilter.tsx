"use client";
// What the map shows, picked right on the map (its filter button, or ⋯ → On the map).
// Top to bottom: one-tap presets (food, shopping, health, services, going out, just the game,
// everything); then each group of layers folded into one line — its name, how many of its layers
// are on, a switch for the whole group — opening onto its chips (each with how many there are
// around you, and the colour its pins wear on the map); then the store types and kinds of place to
// narrow the stores to; then the store list and services. Which groups are open is remembered.
import { useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { PRESETS, type PresetId } from "@/lib/mapPresets";
import { Button } from "@/components/Button";

export type FilterItem = { key: string; emoji: string; label: string; count?: number; color?: string };

type Props = {
  groups: { title: string; items: FilterItem[] }[];
  on: (key: string) => boolean;
  onToggle: (key: string) => void;
  /** Every layer of a group on or off. */
  onGroup: (keys: string[], show: boolean) => void;
  onAll: (show: boolean) => void;
  /** The preset the current choice is exactly (its chip lights up), and picking one. */
  preset: PresetId | null;
  onPreset: (id: PresetId) => void;
  /** Kinds of real place (shown while real places are on): every kind is on unless hidden. */
  kinds?: { items: FilterItem[]; hidden: string[]; onToggle: (kind: string) => void; onSet: (hidden: string[]) => void } | null;
  /** Types of store from the store sites (shown while one of them is on): every type is on unless hidden. */
  types?: { items: FilterItem[]; hidden: string[]; onToggle: (type: string) => void; onSet: (hidden: string[]) => void } | null;
  /** Open every store round you as a list / the home services and shopping sites. */
  onList?: () => void;
  onServices?: () => void;
  onClose: () => void;
};

const OPEN_KEY = "sq_filter_open";
function readOpen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Hidden after a group's switch: none of its items (show), or all of them too. */
const switched = (g: { items: FilterItem[]; hidden: string[] }, show: boolean) => {
  const keys = g.items.map((i) => i.key);
  return show ? g.hidden.filter((k) => !keys.includes(k)) : [...new Set([...g.hidden, ...keys])];
};

function Chip({ item, on, onClick }: { item: FilterItem; on: boolean; onClick: () => void }) {
  return (
    <button className={`filter-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      {item.color ? <i className="fc-dot" style={{ background: item.color }} aria-hidden /> : <span aria-hidden>{item.emoji}</span>}
      <span className="lb">{t(item.label)}</span>
      {item.count != null && <span className="n">{fmtNum(item.count)}</span>}
    </button>
  );
}

/** One folded group: its name, "3/5", a switch for all of it; open, its chips. */
function Group({ id, title, items, isOn, onToggle, onSwitch, open, onOpen }: { id: string; title: string; items: FilterItem[]; isOn: (k: string) => boolean; onToggle: (k: string) => void; onSwitch: (show: boolean) => void; open: boolean; onOpen: (open: boolean) => void }) {
  const n = items.filter((i) => isOn(i.key)).length;
  const all = n === items.length;
  return (
    <section className={`fg ${open ? "open" : ""}`}>
      <div className="fg-head">
        <button className="fg-title" aria-expanded={open} aria-controls={`fg-${id}`} onClick={() => onOpen(!open)}>
          <span className="fg-caret" aria-hidden>›</span>
          <span className="grow">{title}</span>
          <span className={`fg-n ${n ? "" : "none"}`}>{fmtNum(n)}/{fmtNum(items.length)}</span>
        </button>
        <button className={`fg-switch ${all ? "on" : n ? "some" : ""}`} role="switch" aria-checked={all ? "true" : n ? "mixed" : "false"} aria-label={t("Show all of {group}", { group: title })} onClick={() => onSwitch(!all)}>
          <i />
        </button>
      </div>
      {open && (
        <div className="filter-chips" id={`fg-${id}`}>
          {items.map((i) => (
            <Chip key={i.key} item={i} on={isOn(i.key)} onClick={() => onToggle(i.key)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function MapFilter({ groups, on, onToggle, onGroup, onAll, preset, onPreset, kinds, types, onList, onServices, onClose }: Props) {
  const [open, setOpen] = useState<string[]>(readOpen);
  const setGroupOpen = (id: string, v: boolean) => {
    const next = v ? [...new Set([...open, id])] : open.filter((x) => x !== id);
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* private window: forget */
    }
  };
  const all = groups.flatMap((g) => g.items);
  const shown = all.filter((i) => on(i.key)).length;
  return (
    <div className="map-filter" role="dialog" aria-label={t("Filter the map")}>
      <div className="row mf-head">
        <b className="grow">{t("On the map")}</b>
        <span className="small muted">{t("{n} of {total} on", { n: fmtNum(shown), total: fmtNum(all.length) })}</span>
        <button className="close" onClick={onClose} aria-label={t("Close")}>✕</button>
      </div>
      <div className="mf-presets" role="radiogroup" aria-label={t("Quick picks")}>
        {PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={preset === p.id} className={`mf-preset ${preset === p.id ? "on" : ""}`} onClick={() => onPreset(p.id)}>
            <span aria-hidden>{p.emoji}</span> {t(p.label)}
          </button>
        ))}
      </div>
      <div className="mf-body">
        {groups.map((g) => (
          <Group key={g.title} id={g.title} title={t(g.title)} items={g.items} isOn={on} onToggle={onToggle} onSwitch={(show) => onGroup(g.items.map((i) => i.key), show)} open={open.includes(g.title)} onOpen={(v) => setGroupOpen(g.title, v)} />
        ))}
        {!!types?.items.length && (
          <Group id="types" title={t("Types of store")} items={types.items} isOn={(k) => !types.hidden.includes(k)} onToggle={types.onToggle} onSwitch={(show) => types.onSet(switched(types, show))} open={open.includes("types")} onOpen={(v) => setGroupOpen("types", v)} />
        )}
        {!!kinds?.items.length && (
          <Group id="kinds" title={t("Kinds of place")} items={kinds.items} isOn={(k) => !kinds.hidden.includes(k)} onToggle={kinds.onToggle} onSwitch={(show) => kinds.onSet(switched(kinds, show))} open={open.includes("kinds")} onOpen={(v) => setGroupOpen("kinds", v)} />
        )}
      </div>
      {(onList || onServices) && (
        <div className="row mf-actions">
          {onList && <Button className="btn small cyan grow" onClick={onList}>🗂️ {t("List all stores")}</Button>}
          {onServices && <Button className="btn small ghost grow" onClick={onServices}>🛠️ {t("Services & shops")}</Button>}
        </div>
      )}
      <div className="row mf-foot">
        <button className="link-btn" onClick={() => onAll(true)}>{t("Show all")}</button>
        <span className="muted" aria-hidden>·</span>
        <button className="link-btn" onClick={() => onAll(false)}>{t("Hide all")}</button>
      </div>
    </div>
  );
}
