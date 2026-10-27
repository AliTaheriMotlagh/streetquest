"use client";
// 🔔 Inbox: every notification the game sent you, newest first, grouped by day and
// filterable by kind. Opening it marks everything read (clears the bell badge); tapping
// an item opens what it's about; ✕ dismisses one, "Clear all" empties it.
import { msg, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { api } from "./client";
import { Sheet, useGame } from "./ui";
import { Button } from "@/components/Button";
import { splitIcon } from "./Toasts";

type Item = { id: string; kind: string; tag: string | null; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
type Filter = "all" | "reward" | "event" | "social" | "delivery" | "info";
const FILTERS: [Filter, string][] = [
  ["all", msg("All")],
  ["reward", msg("Rewards")],
  ["event", msg("Battle")],
  ["social", msg("Social")],
  ["delivery", msg("Jobs")],
  ["info", msg("News")],
];

const ago = (d: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 60 ? t("just now") : s < 3600 ? t("{n} min ago", { n: Math.floor(s / 60) }) : s < 86400 ? t("{n} h ago", { n: Math.floor(s / 3600) }) : t("{n} d ago", { n: Math.floor(s / 86400) });
};
const dayOf = (d: string) => {
  const day = new Date(d).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return day === today ? t("Today") : day === today - 86400_000 ? t("Yesterday") : t("Earlier");
};

export function InboxPanel({ onClose, peek, onRead }: { onClose: () => void; peek: boolean; onRead: () => void }) {
  const { openLink } = useGame();
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    api<{ items: Item[] }>("/api/notifications")
      .then((r) => {
        setItems(r.items);
        if (r.items.some((i) => !i.readAt)) api("/api/notifications", { body: { action: "readAll" } }).then(onRead).catch(() => {});
        else onRead();
      })
      .catch(() => setItems([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = (id: string) => {
    setItems((l) => l?.filter((i) => i.id !== id) ?? null);
    api("/api/notifications", { body: { action: "dismiss", id } }).catch(() => {});
  };
  const clear = () => {
    setItems([]);
    api("/api/notifications", { body: { action: "clear" } }).catch(() => {});
  };
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const i of items ?? []) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);
  const shown = (items ?? []).filter((i) => filter === "all" || i.kind === filter);
  const groups: [string, Item[]][] = [];
  for (const i of shown) {
    const g = dayOf(i.createdAt);
    if (groups.at(-1)?.[0] !== g) groups.push([g, []]);
    groups.at(-1)![1].push(i);
  }
  return (
    <Sheet title={t("🔔 Inbox")} onClose={onClose} peek={peek} help="inbox" actions={items?.length ? <Button className="btn ghost small" onClick={clear}>{t("Clear all")}</Button> : undefined}>
      {!!items?.length && (
        <div className="inbox-filters" role="tablist">
          {FILTERS.filter(([k]) => k === "all" || counts[k]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {t(label)}
              <span className="if-n">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      {!items && <div className="empty">{t("Loading…")}</div>}
      {items && !shown.length && (
        <div className="empty inbox-empty">
          <div className="ie-art">📭</div>
          <b>{t("All caught up")}</b>
          <span className="small muted">{t("Rewards, raids, crew news and finished builds show up here.")}</span>
        </div>
      )}
      <div className="inbox">
        {groups.map(([g, list]) => (
          <section key={g} className="inbox-day">
            <h3 className="inbox-when">{g}</h3>
            {list.map((i) => {
              const [icon, title] = splitIcon(i.title, i.kind);
              return (
                <div
                  key={i.id}
                  className={`inbox-item ${i.readAt ? "" : "unread"} ${i.kind} ${i.link ? "linked" : ""}`}
                  role={i.link ? "button" : undefined}
                  tabIndex={i.link ? 0 : undefined}
                  onClick={i.link ? () => openLink(i.link!) : undefined}
                  onKeyDown={i.link ? (e) => e.key === "Enter" && openLink(i.link!) : undefined}
                >
                  <span className="ib-ic">{icon}</span>
                  <div className="grow">
                    <b>{title}</b>
                    {i.body && <div className="ib-body">{i.body}</div>}
                    <div className="ib-time">{ago(i.createdAt)}</div>
                  </div>
                  <Button
                    className="ib-x"
                    aria-label={t("Dismiss")}
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(i.id);
                    }}
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
