"use client";
// The owner's side of a store claim (lib/claims.ts) in the Business center: until the store is
// verified, "Prove it's yours" offers the three ways — the code on the store's website (approved at
// once), two visits at the store on different days, or a licence / bill photo for our team — and
// shows where the claim stands. Below the dashboard, the store's history (the audit log, no IPs).
import { useState } from "react";
import { CLAIM_METHOD_KEYS, CLAIM_METHODS, CLAIM_STATUS, VISIT_GAP_H, type ClaimMethod } from "@/lib/claims";
import { fmtNum, t } from "@/lib/i18n";
import type { ClaimView } from "@/server/claims";
import type { AuditRow } from "@/server/audit";
import { Button } from "@/components/Button";
import { api, fmtTime } from "./client";
import { resizePhoto } from "./photo";
import { useGame } from "./ui";

export function ProveOwnership({ businessId, website, claim, reload }: { businessId: string; website: string; claim?: ClaimView; reload: () => void }) {
  const { act } = useGame();
  const open = claim && !claim.expired && (claim.status === "pending" || claim.status === "review") ? claim : null;
  const [pick, setPick] = useState<ClaimMethod>(open?.method ?? (website ? "website" : "visits"));
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const start = (method: ClaimMethod) => act(() => api("/api/business", { body: { action: "claim", businessId, method } })).then((ok) => ok && reload());
  const send = (body: Record<string, unknown>) => act(() => api("/api/business", { body })).then((ok) => ok && reload());
  const photo = async (f: File | undefined) => {
    if (!f || !open) return;
    const data = await resizePhoto(f, 1400);
    await send({ action: "claim_doc", claimId: open.id, photo: data });
  };
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card biz-prove">
      <div className="row">
        <b className="grow">🪪 {t("Prove it's your store")}</b>
        {open && <span className="tag">{CLAIM_STATUS[open.status].emoji} {t(CLAIM_STATUS[open.status].label)}</span>}
      </div>
      <p className="small muted">{t("Verified stores get the ✔ tick on the map and in the 3D city, and players trust their missions more.")}</p>
      {claim?.status === "rejected" && !open && claim.decision && <p className="small" dir="auto">❌ {claim.decision}</p>}

      {open?.status === "review" ? (
        <p className="small">🔎 {t("Our team is checking your proof — usually within 2 days. We'll message you.")}</p>
      ) : (
        <>
          <div className="seg-tabs" role="tablist">
            {CLAIM_METHOD_KEYS.map((m) => (
              <button key={m} role="tab" aria-selected={pick === m} className={`chip small ${pick === m ? "on" : ""}`} onClick={() => setPick(m)}>
                {CLAIM_METHODS[m].emoji} {t(CLAIM_METHODS[m].label)}
              </button>
            ))}
          </div>
          <p className="small">{t(CLAIM_METHODS[pick].how)}</p>

          {open?.method !== pick ? (
            <Button className="btn yellow" disabled={pick === "website" && !website} onClick={() => start(pick)}>
              {pick === "website" && !website ? t("Add your website in Edit details first") : t("Start")}
            </Button>
          ) : pick === "website" ? (
            <>
              <div className="row biz-code">
                <code className="grow" dir="ltr">{open.code}</code>
                <Button className="btn ghost small" onClick={() => copy(open.code)}>{copied ? t("Copied") : t("Copy")}</Button>
              </div>
              <p className="tiny muted" dir="ltr">&lt;meta name=&quot;streetquest&quot; content=&quot;{open.code}&quot;&gt;</p>
              <input className="input" dir="ltr" inputMode="url" placeholder={website} value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t("The page with the code (optional)")} />
              <Button className="btn green" onClick={() => send({ action: "claim_check", claimId: open.id, url: url.trim() || undefined })}>{t("Check my website")}</Button>
            </>
          ) : pick === "visits" ? (
            <>
              <div className="biz-visits" aria-label={t("Visits")}>
                {[0, 1].map((i) => <span key={i} className={open.visits > i ? "done" : ""}>{open.visits > i ? "✔" : fmtNum(i + 1)}</span>)}
              </div>
              <p className="tiny muted">{t("The second visit must be on another day, at least {h} hours later.", { h: fmtNum(VISIT_GAP_H) })}</p>
              <Button className="btn green" onClick={() => send({ action: "claim_visit", claimId: open.id })}>📍 {t("I'm in my store now")}</Button>
            </>
          ) : (
            <>
              <p className="tiny muted">{t("Write this code on a paper next to your sign if you have no licence photo:")} <code dir="ltr">{open.code}</code></p>
              <label className="btn green" style={{ cursor: "pointer" }}>
                📷 {t("Send a photo")}
                <input type="file" accept="image/*" hidden onChange={(e) => void photo(e.target.files?.[0])} />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Is this your store?" on a store someone else runs on the game: the real owner sends a licence or
 * bill photo; if our team agrees, the store is handed to them (the other player is told).
 */
export function DisputeStore({ businessId, name }: { businessId: string; name: string }) {
  const { act } = useGame();
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [sent, setSent] = useState(false);
  const start = () =>
    act(async () => {
      const r = await api<{ claim: ClaimView }>("/api/business", { body: { action: "claim", businessId, method: "document" } });
      setClaim(r.claim);
      return {};
    });
  const photo = async (f: File | undefined) => {
    if (!f || !claim) return;
    const data = await resizePhoto(f, 1400);
    const ok = await act(() => api("/api/business", { body: { action: "claim_doc", claimId: claim.id, photo: data } }));
    if (ok) setSent(true);
  };
  if (sent) return <p className="small muted biz-dispute">🔎 {t("Sent — our team checks it within 2 days. We'll message you.")}</p>;
  return (
    <div className="biz-dispute">
      {!claim ? (
        <button className="link-btn small" onClick={start}>🪪 {t("Is {place} your store? Prove it", { place: name })}</button>
      ) : (
        <div className="card">
          <p className="small">{t("Send a photo of your business licence or a bill in the store's name. If it checks out, the store is handed to you.")}</p>
          <p className="tiny muted">{t("Write this code on a paper next to your sign if you have no licence photo:")} <code dir="ltr">{claim.code}</code></p>
          <label className="btn green" style={{ cursor: "pointer" }}>
            📷 {t("Send a photo")}
            <input type="file" accept="image/*" hidden onChange={(e) => void photo(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}

const ICON: Record<string, string> = { business: "🏪", claim: "🪪", campaign: "🎯", coupon: "🎟️", admin: "🛡️" };

/** What happened to this store, newest first (opens on demand). */
export function StoreHistory({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen(!open);
    if (!rows) void api<{ history: AuditRow[] }>("/api/business", { body: { action: "history", businessId } }).then((r) => setRows(r.history), () => setRows([]));
  };
  return (
    <div className="card">
      <button className="row biz-history-open" onClick={toggle} aria-expanded={open}>
        <b className="grow">🧾 {t("Store history")}</b>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (!rows ? (
        <p className="small muted">{t("Loading…")}</p>
      ) : !rows.length ? (
        <p className="small muted">{t("Nothing yet")}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="row small" style={{ padding: "5px 0", borderTop: "1px solid var(--line)" }}>
            <span aria-hidden>{ICON[r.action.split(".")[0]] ?? "•"}</span>
            <span className="grow" dir="auto">{r.summary || r.action}</span>
            <span className="muted">@{r.actor || "—"} · {fmtTime(r.createdAt)}</span>
          </div>
        ))
      ))}
    </div>
  );
}
