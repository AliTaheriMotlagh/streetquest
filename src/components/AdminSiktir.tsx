"use client";
// Admin → Siktir: every "never again" mark players made on places, newest first. Hide one (it stops
// counting and showing; the player can't bring it back by editing it) or delete it (spam, abuse).
import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import { REASON_INFO, isSiktirReason } from "@/lib/siktir";
import { fmtNum, t } from "@/lib/i18n";

type Mark = { id: string; user: string; lat: number; lng: number; placeKey: string | null; placeName: string; reason: string; note: string; hidden: boolean; createdAt: string; spotCount: number };

const call = async <T,>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "?");
  return j as T;
};

export default function AdminSiktir({ onError }: { onError: (m: string) => void }) {
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback((query: string) => call<{ marks: Mark[] }>(`/api/admin/siktir?q=${encodeURIComponent(query)}`).then((r) => setMarks(r.marks)).catch((e: Error) => onError(e.message)), [onError]);
  useEffect(() => {
    const id = setTimeout(() => void load(q), q ? 300 : 0);
    return () => clearTimeout(id);
  }, [q, load]);
  const act = async (m: Mark, action: "hide" | "unhide" | "delete") => {
    if (action === "delete" && !(await askConfirm(t("Delete this Siktir mark?"), { danger: true }))) return;
    try {
      await call("/api/admin/siktir", { action, id: m.id });
      await load(q);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="card">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by place or note")} aria-label={t("Search by place or note")} style={{ width: "100%", marginBottom: 10 }} />
      {!marks ? (
        <p className="muted">{t("Loading…")}</p>
      ) : !marks.length ? (
        <p className="muted small">{t("No Siktir marks yet")}</p>
      ) : (
        marks.map((m) => (
          <div key={m.id} className="row wrap" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", opacity: m.hidden ? 0.55 : 1 }}>
            <div className="grow">
              <b dir="auto">{m.placeName || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`}</b>
              <span className="tag" style={{ marginInlineStart: 6 }}>{isSiktirReason(m.reason) ? t(REASON_INFO[m.reason].label) : m.reason}</span>
              {m.hidden && <span className="tag">{t("hidden")}</span>}
              <div className="small muted">
                {m.user} · {new Date(m.createdAt).toLocaleString()} · {t("{n, plural, one {# mark} other {# marks}} on this place", { n: m.spotCount })}
              </div>
              {m.note && <div className="small" dir="auto">“{m.note}”</div>}
            </div>
            <Button className="btn small ghost" onClick={() => act(m, m.hidden ? "unhide" : "hide")}>{m.hidden ? t("Show") : t("Hide")}</Button>
            <Button className="btn small red" onClick={() => act(m, "delete")}>{t("Delete")}</Button>
          </div>
        ))
      )}
      <p className="small muted">{t("Showing the latest {n}", { n: fmtNum(marks?.length ?? 0) })}</p>
    </div>
  );
}
