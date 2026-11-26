"use client";
// Admin → Store claims: owners proving a store is theirs (lib/claims.ts). The queue is the claims
// waiting for a person: a licence/bill photo, a risky automatic one, or a dispute over a store
// someone else runs. Each shows the proof (photo, website, visits with their distance), the
// owner's account age and the risk flags; approve verifies the store (a dispute hands it over),
// turn down asks for a reason the owner sees. Every decision lands in the audit log.
import { useCallback, useEffect, useState } from "react";
import { askConfirm, askText } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import { CLAIM_METHODS, CLAIM_STATUS, type ClaimMethod, type ClaimStatus } from "@/lib/claims";
import { fmtNum, t, dot } from "@/lib/i18n";

type Claim = {
  id: string; method: ClaimMethod; code: string; status: ClaimStatus; dispute: boolean; hasDoc: boolean; note: string; decision: string; createdAt: string; expired: boolean;
  risk: number; flags: string[]; visitsAt: { at: string; dist: number }[]; url: string; user: string; userSince: string;
  business: { name: string; address: string; website: string; lat: number; lng: number; verified: boolean; owner: string };
};
const TABS: (ClaimStatus | "all")[] = ["review", "pending", "approved", "rejected", "all"];

const call = async <T,>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "?");
  return j as T;
};
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function AdminClaims({ onError }: { onError: (m: string) => void }) {
  const [status, setStatus] = useState<ClaimStatus | "all">("review");
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const load = useCallback(() => call<{ claims: Claim[] }>(`/api/admin/claims?status=${status}`).then((r) => setClaims(r.claims)).catch((e: Error) => onError(e.message)), [status, onError]);
  useEffect(() => {
    setClaims(null);
    void load();
  }, [load]);

  const decide = async (c: Claim, approve: boolean) => {
    let reason = "";
    if (approve) {
      if (c.dispute && !(await askConfirm(t("Hand {place} from {from} to {to}?", { place: c.business.name, from: c.business.owner, to: c.user }), { danger: true }))) return;
    } else {
      const r = await askText(t("Why not? The owner sees this."), "");
      if (r == null) return;
      reason = r;
    }
    try {
      await call("/api/admin/claims", { id: c.id, approve, reason });
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }} role="tablist">
        {TABS.map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={`btn small ${status === s ? "" : "ghost"}`} onClick={() => setStatus(s)}>
            {s === "all" ? t("All") : `${CLAIM_STATUS[s].emoji} ${t(CLAIM_STATUS[s].label)}`}
          </button>
        ))}
      </div>
      {!claims ? (
        <p className="muted">{t("Loading…")}</p>
      ) : !claims.length ? (
        <p className="muted small">{status === "review" ? t("Nothing waiting — every claim is handled") : t("No claims here")}</p>
      ) : (
        claims.map((c) => (
          <div key={c.id} className="row wrap" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "flex-start", gap: 12 }}>
            {c.hasDoc && (
              <button className="btn ghost" style={{ padding: 0, width: 96, height: 96, overflow: "hidden" }} onClick={() => setBig(c.id)} aria-label={t("Open the photo")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/claims/doc?id=${c.id}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            )}
            <div className="grow" style={{ minWidth: 220 }}>
              <b dir="auto">{c.business.name}</b> {c.business.verified && <span className="tag verified">✔ {t("Verified")}</span>}
              <span className="tag" style={{ marginInlineStart: 6 }}>{CLAIM_METHODS[c.method].emoji} {t(CLAIM_METHODS[c.method].label)}</span>
              {c.dispute && <span className="tag" style={{ marginInlineStart: 6, background: "var(--red)", color: "#fff" }}>{t("Dispute")}</span>}
              {c.expired && <span className="tag" style={{ marginInlineStart: 6 }}>{t("ran out")}</span>}
              <div className="small muted" dir="auto">{c.business.address || `${c.business.lat.toFixed(5)}, ${c.business.lng.toFixed(5)}`}</div>
              <div className="small">
                {t("By {user} (player for {n} days)", { user: c.user, n: fmtNum(days(c.userSince)) })}
                {c.dispute && <> · {t("now run by {user}", { user: c.business.owner })}</>}
                {dot()}{new Date(c.createdAt).toLocaleString()}
              </div>
              {c.method === "website" && <div className="small">🌐 <a href={c.url || c.business.website} target="_blank" rel="noreferrer noopener">{c.url || c.business.website || "—"}</a> · <code>{c.code}</code></div>}
              {c.visitsAt.length > 0 && <div className="small">📍 {c.visitsAt.map((v) => t("{when} at {m} m", { when: new Date(v.at).toLocaleString(), m: fmtNum(v.dist) })).join(dot())}</div>}
              {c.note && <div className="small" dir="auto">“{c.note}”</div>}
              {c.decision && <div className="small muted" dir="auto">{t("Decision")}: {c.decision}</div>}
              <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                <span className={`tag ${c.risk >= 3 ? "red" : ""}`}>{t("Risk {n}", { n: c.risk })}</span>
                {c.flags.map((f) => <span key={f} className="tag">{f}</span>)}
              </div>
            </div>
            {(c.status === "review" || c.status === "pending") && (
              <div className="row" style={{ gap: 6 }}>
                <Button className="btn small" onClick={() => decide(c, true)}>{c.dispute ? t("Hand over") : t("Approve")}</Button>
                <Button className="btn small red" onClick={() => decide(c, false)}>{t("Turn down")}</Button>
              </div>
            )}
            {(c.status === "approved" || c.status === "rejected") && <span className="tag">{CLAIM_STATUS[c.status].emoji} {t(CLAIM_STATUS[c.status].label)}</span>}
          </div>
        ))
      )}
      {big && (
        <div role="dialog" aria-label={t("Photo")} onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, zIndex: "var(--z-modal)", background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/admin/claims/doc?id=${big}`} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
