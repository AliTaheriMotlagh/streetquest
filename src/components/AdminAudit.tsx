"use client";
// Admin → Audit log: everything owners and admins did to stores, claims and missions (server/audit.ts),
// newest first. Filter by kind, by player (username), by the thing it was done to (an id from any
// row: tap it), or by words; "older" pages back. Each row opens to show what changed, and the IP.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { AUDIT_GROUPS } from "@/lib/claims";
import { t, msg } from "@/lib/i18n";

type Row = { id: string; actor: string; actorId: string | null; action: string; targetType: string; targetId: string; summary: string; data: unknown; ip: string; createdAt: string };
const GROUP_LABEL: Record<(typeof AUDIT_GROUPS)[number], string> = { business: msg("Stores"), claim: msg("Claims"), campaign: msg("Missions"), coupon: msg("Coupons"), admin: msg("Admins") };
const ICON: Record<string, string> = { business: "🏪", claim: "🪪", campaign: "🎯", coupon: "🎟️", admin: "🛡️" };

export default function AdminAudit({ onError }: { onError: (m: string) => void }) {
  const [group, setGroup] = useState("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const query = useCallback((before?: string) => {
    const p = new URLSearchParams({ group, actor, target, q, ...(before ? { before } : {}) });
    return fetch(`/api/admin/audit?${p}`).then((r) => r.json()).then((j: { rows?: Row[]; more?: boolean; error?: string }) => {
      if (j.error) throw new Error(j.error);
      return j as { rows: Row[]; more: boolean };
    });
  }, [group, actor, target, q]);

  useEffect(() => {
    const id = setTimeout(() => void query().then((r) => (setRows(r.rows), setMore(r.more))).catch((e: Error) => onError(e.message)), actor || q ? 350 : 0);
    return () => clearTimeout(id);
  }, [query, actor, q, onError]);

  const older = () => rows?.length && query(rows[rows.length - 1].createdAt).then((r) => (setRows([...rows, ...r.rows]), setMore(r.more))).catch((e: Error) => onError(e.message));

  return (
    <div className="card">
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <button className={`btn small ${group ? "ghost" : ""}`} onClick={() => setGroup("")}>{t("All")}</button>
        {AUDIT_GROUPS.map((g) => (
          <button key={g} className={`btn small ${group === g ? "" : "ghost"}`} onClick={() => setGroup(g)}>{ICON[g]} {t(GROUP_LABEL[g])}</button>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder={t("Player")} aria-label={t("Player")} style={{ flex: "1 1 140px" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search the log")} aria-label={t("Search the log")} style={{ flex: "2 1 200px" }} />
        {target && <Button className="btn small ghost" onClick={() => setTarget("")}>✕ {target.slice(0, 10)}…</Button>}
      </div>
      {!rows ? (
        <p className="muted">{t("Loading…")}</p>
      ) : !rows.length ? (
        <p className="muted small">{t("Nothing in the log yet")}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
            <div className="row wrap" style={{ gap: 8, cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span aria-hidden>{ICON[r.action.split(".")[0]] ?? "•"}</span>
              <code className="small">{r.action}</code>
              <b className="grow small" dir="auto">{r.summary}</b>
              <button className="btn small ghost" onClick={(e) => (e.stopPropagation(), setActor(r.actor))}>@{r.actor || "—"}</button>
              <span className="small muted">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {open === r.id && (
              <div className="small muted" style={{ marginTop: 4 }}>
                <div>
                  {r.targetType} · <button className="btn small ghost" onClick={() => setTarget(r.targetId)}>{r.targetId}</button>
                  {r.ip && <> · IP {r.ip}</>}
                </div>
                {!!r.data && Object.keys(r.data as object).length > 0 && <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", direction: "ltr" }}>{JSON.stringify(r.data, null, 1)}</pre>}
              </div>
            )}
          </div>
        ))
      )}
      {more && <Button className="btn small ghost" onClick={() => void older()}>{t("Older")}</Button>}
    </div>
  );
}
