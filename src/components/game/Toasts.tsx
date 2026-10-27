"use client";
// Banners at the top of the screen. Each one has an icon (the message's own leading
// emoji, or its category's), a title, an optional line under it and a thin bar showing
// how long it stays. Tap opens what it's about (a notification's link) or dismisses it;
// swipe it up or sideways to dismiss. The newest sits on top, at most three at once.
import { useRef } from "react";
import { t } from "@/lib/i18n";
import type { Toast } from "./ui";

/** How long a toast stays, by kind (errors stay a little longer). */
export const toastLife = (n: Toast) => (n.kind === "error" ? 4500 : n.body ? 4200 : 3400);

export const KIND_ICON: Record<string, string> = { reward: "🎁", social: "💬", delivery: "📦", event: "⚔️", info: "📣", error: "⚠️" };
const LEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:️|⃣|‍(?:\p{Extended_Pictographic}|️))*)\s*/u;

/** "🔫 Ana shot you" → ["🔫", "Ana shot you"]; plain text gets its category icon. */
export function splitIcon(title: string, kind?: string): [string, string] {
  const m = LEAD.exec(title);
  return m && m[0].length < title.length ? [m[1], title.slice(m[0].length)] : [KIND_ICON[kind ?? "info"] ?? "📣", title];
}

export function Toasts({ toasts, onDismiss, onOpen }: { toasts: (Toast & { out?: boolean })[]; onDismiss: (id: number | undefined) => void; onOpen: (link: string) => void }) {
  const shown = toasts.slice(-3).reverse();
  return (
    <div className="toasts" aria-live="polite">
      {shown.map((x, i) => (
        <ToastCard key={x.id} x={x} depth={i} onDismiss={() => onDismiss(x.id)} onOpen={x.link ? () => (onOpen(x.link!), onDismiss(x.id)) : undefined} />
      ))}
    </div>
  );
}

function ToastCard({ x, depth, onDismiss, onOpen }: { x: Toast & { out?: boolean }; depth: number; onDismiss: () => void; onOpen?: () => void }) {
  const [icon, title] = splitIcon(x.title, x.kind);
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const set = (dx: number, dy: number) => {
    if (el.current) el.current.style.transform = dx || dy ? `translate(${dx}px, ${Math.min(0, dy)}px)` : "";
  };
  return (
    <div
      ref={el}
      className={`toast ${x.kind ?? "info"} ${x.out ? "out" : ""} ${onOpen ? "linked" : ""}`}
      style={{ ["--life" as string]: `${toastLife(x)}ms`, ["--depth" as string]: depth }}
      role={x.kind === "error" ? "alert" : "status"}
      title={onOpen ? t("Tap to open") : t("Tap to dismiss")}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: false };
        el.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) > 6 || dy < -6) d.moved = true;
        if (d.moved) set(dx, dy);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (d.moved) {
          if (Math.abs(dx) > 80 || dy < -36) onDismiss();
          else set(0, 0);
          return;
        }
        (onOpen ?? onDismiss)();
      }}
      onPointerCancel={() => ((drag.current = null), set(0, 0))}
    >
      <span className="toast-ic">{icon}</span>
      <div className="toast-txt">
        <b>{title}</b>
        {x.body && <span>{x.body}</span>}
      </div>
      {onOpen && <span className="toast-go" aria-hidden="true">›</span>}
      <i className="toast-life" />
    </div>
  );
}
