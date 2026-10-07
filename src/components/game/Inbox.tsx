"use client";
// 🔔 Inbox: every notification the game sent you, newest first. Opening it marks
// everything read (clears the bell badge); ✕ dismisses one, "Clear all" empties it.
import { useEffect, useState } from "react";
import { api } from "./client";
import { Sheet } from "./ui";

type Item = { id: string; kind: string; title: string; body: string | null; readAt: string | null; createdAt: string };
const ICON: Record<string, string> = { reward: "🎁", social: "🤝", delivery: "📦", event: "🎉", info: "📣" };

const ago = (d: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};

export function InboxPanel({ onClose, peek, onRead }: { onClose: () => void; peek: boolean; onRead: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
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
  return (
    <Sheet title="🔔 Inbox" onClose={onClose} peek={peek} help="inbox" actions={items?.length ? <button className="btn ghost small" onClick={clear}>Clear all</button> : undefined}>
      {!items && <div className="empty">Loading…</div>}
      {items && !items.length && <div className="empty">📭 All caught up! Rewards, raids, crew news and events show up here.</div>}
      <div className="inbox">
        {items?.map((i) => (
          <div key={i.id} className={`inbox-item ${i.readAt ? "" : "unread"} ${i.kind}`}>
            <span className="ib-ic">{ICON[i.kind] ?? "📣"}</span>
            <div className="grow">
              <b>{i.title}</b>
              {i.body && <div className="small muted">{i.body}</div>}
              <div className="small muted ib-time">{ago(i.createdAt)}</div>
            </div>
            <button className="ib-x" aria-label="Dismiss" onClick={() => dismiss(i.id)}>✕</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
