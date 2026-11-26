"use client";
// Admin → Product models: the photo → 3D pipeline (server/product3d.ts, scripts/product3d/) for every store product —
// counts by status, filters (status, kind, unsure kinds, search), and per product its photo, kind (and who set it),
// status, score with the reasons, the model turning, the run log; and the decisions: approve / reject a model, make
// it again, template only, AI or template, a new kind, a new picture, upload one's own .glb. Sweep the menus into the
// queue and start the runner from here.
import { useCallback, useEffect, useState } from "react";
import { msg, t, dot, fmtNum } from "@/lib/i18n";
import { Button } from "./Button";
import { ModelPreview } from "./AdminModelPreview";

type Row = {
  key: string; title: string; section: string; storeKind: string; photo: string; image: string; imageFrom: string; kind: string; kindBy: string; conf: number; en: string;
  strategy: string; status: string; attempts: number; error: string; url: string; bytes: number; tris: number; score: number; stats: { why?: string[] } | null; locked: boolean; stores: number;
  log: { at: string; what: string; by: string; note?: string }[];
};
type Stats = { total: number; pending: { jobs: number; classify: number }; status: Record<string, number>; kinds: { kind: string; n: number }[]; runner: { token: boolean; dispatch: boolean }; autoLive: number; version: number; kindNames: string[] };

const STATUS_LABEL: Record<string, string> = {
  queued: msg("Queued"), working: msg("Being made"), review: msg("To review"), live: msg("Live"), template: msg("Template"), failed: msg("Failed"), rejected: msg("Rejected"),
};

export default function AdminProduct3D({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [f, setF] = useState({ status: "", kind: "", q: "", low: false });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (cursor?: string) => {
      const q = new URLSearchParams({ ...(f.status && { status: f.status }), ...(f.kind && { kind: f.kind }), ...(f.q && { q: f.q }), ...(f.low && { low: "1" }), ...(cursor && { cursor }) });
      fetch(`/api/admin/product3d?${q}`)
        .then((r) => r.json())
        .then((j: { rows?: Row[]; next?: string | null; stats?: Stats | null; error?: string }) => {
          if (j.error) return onError(j.error);
          setRows((old) => (cursor ? [...old, ...(j.rows ?? [])] : j.rows ?? []));
          setNext(j.next ?? null);
          if (j.stats) setStats(j.stats);
        })
        .catch(() => onError(t("Couldn't load — check your connection")));
    },
    [f, onError],
  );
  useEffect(() => load(), [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/product3d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return onError(j.error ?? t("Server error — please try again"));
      if (j.key) setRows((old) => old.map((x) => (x.key === j.key ? j : x)));
      else load();
      if (body.action === "backfill") onError(t("{n} new products from {m} menus", { n: fmtNum(j.added ?? 0), m: fmtNum(j.menus ?? 0) }));
      if (body.action === "dispatch") onError(t("The runner is starting on GitHub"));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (key: string, file: File) => {
    const fd = new FormData();
    fd.set("key", key);
    fd.set("model", file);
    const r = await fetch("/api/admin/product3d", { method: "PUT", body: fd });
    const j = await r.json();
    if (!r.ok) return onError(j.error ?? t("Server error — please try again"));
    setRows((old) => old.map((x) => (x.key === j.key ? j : x)));
  };

  return (
    <div className="p3d">
      {stats && (
        <div className="p3d-stats">
          <span>{t("{n} products", { n: fmtNum(stats.total) })}</span>
          {Object.entries(STATUS_LABEL).map(([s, label]) => (
            <button key={s} type="button" className={`chip ${f.status === s ? "on" : ""}`} onClick={() => setF({ ...f, status: f.status === s ? "" : s })}>
              {t(label)} {fmtNum(stats.status[s] ?? 0)}
            </button>
          ))}
          <span className="muted">
            {t("Left: {jobs} to make, {c} to classify", { jobs: fmtNum(stats.pending.jobs), c: fmtNum(stats.pending.classify) })}
            {dot()}
            {stats.runner.token ? t("Runner token set") : t("PRODUCT3D_TOKEN is not set — the runner can't report")}
          </span>
        </div>
      )}
      <div className="p3d-bar">
        <input type="search" placeholder={t("Search products")} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={t("Kind")}>
          <option value="">{t("Every kind")}</option>
          {stats?.kinds.map((k) => (
            <option key={k.kind} value={k.kind}>{k.kind} ({fmtNum(k.n)})</option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={f.low} onChange={(e) => setF({ ...f, low: e.target.checked })} /> {t("Unsure kind")}
        </label>
        <Button disabled={busy} onClick={() => act({ action: "backfill" })}>{t("Sweep menus")}</Button>
        <Button disabled={busy} onClick={() => act({ action: "retryFailed" })}>{t("Retry failed")}</Button>
        <Button disabled={busy || !stats?.runner.dispatch} title={stats?.runner.dispatch ? "" : t("Set GITHUB_DISPATCH_TOKEN and GITHUB_REPO to start the runner from here")} onClick={() => act({ action: "dispatch" })}>
          {t("Start runner")}
        </Button>
      </div>
      <ul className="p3d-list">
        {rows.map((r) => (
          <li key={r.key} className={`p3d-row ${r.status}`}>
            <button type="button" className="p3d-head" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.image ? <img src={r.image.replace("/640x640/", "/200x201/")} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="p3d-ph">?</span>}
              <span className="p3d-title">
                <b>{r.title}</b>
                <small>
                  {r.kind} ({r.kindBy}{r.kindBy === "rules" || r.kindBy === "store" ? ` ${Math.round(r.conf * 100)}%` : ""}){dot()}{t(STATUS_LABEL[r.status] ?? r.status)}
                  {r.score ? `${dot()}${r.score}` : ""}{r.stores > 1 ? `${dot()}${t("{n} stores", { n: fmtNum(r.stores) })}` : ""}{r.locked ? " 🔒" : ""}
                </small>
              </span>
            </button>
            {open === r.key && (
              <div className="p3d-detail">
                {r.url ? <ModelPreview source={{ url: r.url }} width={260} height={200} label={r.title} /> : <p className="muted">{t("No model yet — the game shows the template with the photo.")}</p>}
                <dl>
                  <dt>{t("Section")}</dt><dd>{r.section || "—"} ({r.storeKind})</dd>
                  {r.en && (<><dt>{t("English name")}</dt><dd>{r.en}</dd></>)}
                  <dt>{t("Picture")}</dt><dd>{r.imageFrom || "—"}</dd>
                  {r.url && (<><dt>{t("Model")}</dt><dd>{fmtNum(Math.round(r.bytes / 1024))} KB{dot()}{t("{n} triangles", { n: fmtNum(r.tris) })}{r.stats?.why?.length ? `${dot()}${r.stats.why.join(", ")}` : ""}</dd></>)}
                  {r.error && (<><dt>{t("Last error")}</dt><dd>{r.error} ({t("{n} tries", { n: r.attempts })})</dd></>)}
                </dl>
                <div className="p3d-acts">
                  <Button disabled={busy || !r.url} onClick={() => act({ action: "approve", key: r.key })}>✅ {t("Approve")}</Button>
                  <Button disabled={busy} onClick={() => act({ action: "reject", key: r.key })}>⛔ {t("Reject")}</Button>
                  <Button disabled={busy} onClick={() => act({ action: "retry", key: r.key })}>🔁 {t("Make again")}</Button>
                  <Button disabled={busy} onClick={() => act({ action: "template", key: r.key })}>🧱 {t("Template only")}</Button>
                  {r.locked && <Button disabled={busy} onClick={() => act({ action: "unlock", key: r.key })}>🔓 {t("Unlock")}</Button>}
                  <select value={r.kind} onChange={(e) => act({ action: "kind", key: r.key, kind: e.target.value })} aria-label={t("Kind")}>
                    {stats?.kindNames.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={r.strategy} onChange={(e) => act({ action: "strategy", key: r.key, strategy: e.target.value })} aria-label={t("Look")}>
                    <option value="">{t("Kind's choice")}</option>
                    <option value="ai">{t("Model from the photo")}</option>
                    <option value="template">{t("Template with the photo")}</option>
                  </select>
                  <Button disabled={busy} onClick={() => { const u = prompt(t("Picture address (https://…), empty for none"), r.image); if (u != null) act({ action: "image", key: r.key, image: u.trim() }); }}>🖼 {t("Picture")}</Button>
                  <label className="btn">
                    ⬆ {t("Upload .glb")}
                    <input type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => e.target.files?.[0] && upload(r.key, e.target.files[0])} />
                  </label>
                </div>
                {r.log.length > 0 && (
                  <ol className="p3d-log">
                    {[...r.log].reverse().map((l, i) => (
                      <li key={i}><time>{new Date(l.at).toLocaleString()}</time> {l.what} — {l.by}{l.note ? `: ${l.note}` : ""}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {next && <Button onClick={() => load(next)}>{t("More")}</Button>}
    </div>
  );
}
