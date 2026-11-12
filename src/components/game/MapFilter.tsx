"use client";
// What the map shows, picked right on the map (its filter button, or ⋯ → On the map):
// the game's own markers, Snappfood's vendors by kind, real places (narrowed to some
// kinds of place), Torob's walk-in stores, Divar's ads, live traffic and the store sites
// (Bilbooard, Irangaah, Okala, Netbarg, Sheypoor — narrowed to some types of store) — each
// chip with how many there are around you. From here: every store as a list, and services.
import { fmtNum, t } from "@/lib/i18n";
import { Button } from "@/components/Button";

export type FilterItem = { key: string; emoji: string; label: string; count?: number };

type Props = {
  groups: { title: string; items: FilterItem[] }[];
  on: (key: string) => boolean;
  onToggle: (key: string) => void;
  onAll: (show: boolean) => void;
  /** Kinds of real place (shown while real places are on): every kind is on unless hidden. */
  kinds?: { items: FilterItem[]; hidden: string[]; onToggle: (kind: string) => void } | null;
  /** Types of store from the store sites (shown while one of them is on): every type is on unless hidden. */
  types?: { items: FilterItem[]; hidden: string[]; onToggle: (type: string) => void } | null;
  /** Open every store round you as a list / the home services and shopping sites. */
  onList?: () => void;
  onServices?: () => void;
  onClose: () => void;
};

function Chip({ item, on, onClick }: { item: FilterItem; on: boolean; onClick: () => void }) {
  return (
    <button className={`filter-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span aria-hidden>{item.emoji}</span>
      <span className="lb">{t(item.label)}</span>
      {item.count != null && <span className="n">{fmtNum(item.count)}</span>}
    </button>
  );
}

export function MapFilter({ groups, on, onToggle, onAll, kinds, types, onList, onServices, onClose }: Props) {
  const all = groups.flatMap((g) => g.items);
  const shown = all.filter((i) => on(i.key)).length;
  return (
    <div className="map-filter" role="dialog" aria-label={t("Filter the map")}>
      <div className="row">
        <b className="grow">🗺️ {t("On the map")}</b>
        <span className="small muted">{fmtNum(shown)}/{fmtNum(all.length)}</span>
        <button className="close" onClick={onClose} aria-label={t("Close")}>✕</button>
      </div>
      {groups.map((g) => (
        <section key={g.title}>
          <h4 className="small muted">{t(g.title)}</h4>
          <div className="filter-chips">
            {g.items.map((i) => (
              <Chip key={i.key} item={i} on={on(i.key)} onClick={() => onToggle(i.key)} />
            ))}
          </div>
        </section>
      ))}
      {!!kinds?.items.length && (
        <section>
          <h4 className="small muted">{t("Kinds of place")}</h4>
          <div className="filter-chips kinds">
            {kinds.items.map((i) => (
              <Chip key={i.key} item={i} on={!kinds.hidden.includes(i.key)} onClick={() => kinds.onToggle(i.key)} />
            ))}
          </div>
        </section>
      )}
      {!!types?.items.length && (
        <section>
          <h4 className="small muted">{t("Types of store")}</h4>
          <div className="filter-chips kinds">
            {types.items.map((i) => (
              <Chip key={i.key} item={i} on={!types.hidden.includes(i.key)} onClick={() => types.onToggle(i.key)} />
            ))}
          </div>
        </section>
      )}
      {(onList || onServices) && (
        <div className="row">
          {onList && <Button className="btn small cyan grow" onClick={onList}>🗂️ {t("List all stores")}</Button>}
          {onServices && <Button className="btn small ghost grow" onClick={onServices}>🛠️ {t("Services & shops")}</Button>}
        </div>
      )}
      <div className="row">
        <Button className="btn small ghost grow" onClick={() => onAll(true)}>✅ {t("Show all")}</Button>
        <Button className="btn small ghost grow" onClick={() => onAll(false)}>🚫 {t("Hide all")}</Button>
      </div>
      <p className="small muted more-note">{t("With everything on, the map groups nearby places into bubbles and shows crowded ones as dots — zoom in or tap one to see it.")}</p>
    </div>
  );
}
