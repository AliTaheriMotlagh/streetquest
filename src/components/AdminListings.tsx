"use client";
// Admin → Listings (server/moderation.ts, lib/stores/moderation.ts): products waiting for a moderator — a new
// seller's first listings, flagged text, edits to a turned-down one, products several players reported — with
// their photos, text, price and why they're waiting; let one through or turn it down with a reason the seller
// reads. Below, the open reports (most reported first): open the shop, dismiss them, or decide the product.
import { useCallback, useEffect, useState } from "react";
import { askText } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import { fmtNum, t } from "@/lib/i18n";
import { REASON_LABEL, type ReportReason } from "@/lib/stores/moderation";

type Pending = { id: string; title: string; description: string; price: number; currency: string; kind: string; reviewNote: string; updatedAt: number; photos: string[]; shop: { id: string; name: string; owner: { username: string } } };
type Ad = { id: string; title: string; body: string; url: string; emoji: string; views: number; reviewNote: string; owner: { username: string } };
type Queue = { pending: Pending[]; reports: Report[]; ads: Ad[] };
type Report = { shopId: string; shop: string; target: string; title: string | null; review: string | null; n: number; last: number; reasons: Record<string, number>; notes: string[] };


const call = async <T,>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "?");
  return j as T;
};
/** A held listing's reasons (" · "-joined keys from preCheck), each translated. */
const why = (note: string) => note.split(" · ").filter(Boolean).map((k) => t(k)).join(" · ");

export default function AdminListings({ onError }: { onError: (m: string) => void }) {
  const [q, setQ] = useState<Queue | null>(null);
  const load = useCallback(() => call<Queue>("/api/admin/listings").then(setQ).catch((e: Error) => onError(e.message)), [onError]);
  useEffect(() => void load(), [load]);

  const decide = async (productId: string, approve: boolean, ad = false) => {
    let note = "";
    if (!approve) {
      const r = await askText(t("Why not? The seller sees this."), "");
      if (r == null) return;
      note = r;
    }
    try {
      await call("/api/admin/listings", ad ? { action: "decideAd", id: productId, approve, note } : { action: "decide", productId, approve, note });
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const dismiss = async (r: Report) => {
    try {
      await call("/api/admin/listings", { action: "dismiss", shopId: r.shopId, target: r.target });
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  if (!q) return <p className="muted">{t("Loading…")}</p>;
  return (
    <div className="stack">
      <div className="card">
        <h3>{t("Waiting for a moderator")} · {fmtNum(q.pending.length)}</h3>
        {!q.pending.length && <p className="muted small">{t("Nothing waiting.")}</p>}
        {q.pending.map((p) => (
          <div key={p.id} className="adm-listing">
            <div className="adm-listing-photos">
              {p.photos.map((ph) => <img key={ph} src={`/shop-img/${ph}`} alt="" loading="lazy" width={72} height={72} />)}
            </div>
            <div className="grow">
              <b>{p.title}</b> <span className="small muted">· {fmtNum(p.price)} {p.currency === "toman" ? t("toman") : t("coins")} · {p.kind}</span>
              {p.description && <p className="small">{p.description}</p>}
              <p className="tiny muted">
                <a href={`/s/${p.shop.id}`} target="_blank" rel="noreferrer">{p.shop.name}</a> · @{p.shop.owner.username}
              </p>
              {p.reviewNote && <p className="tiny adm-why">⚠️ {why(p.reviewNote)}</p>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button className="btn small green" onClick={() => decide(p.id, true)}>{t("Approve")}</Button>
              <Button className="btn small ghost danger" onClick={() => decide(p.id, false)}>{t("Turn down")}</Button>
            </div>
          </div>
        ))}
      </div>
      {!!q.ads.length && (
        <div className="card">
          <h3>{t("Player ads")} · {fmtNum(q.ads.length)}</h3>
          {q.ads.map((a) => (
            <div key={a.id} className="adm-listing">
              <div className="grow">
                <b dir="auto">{a.emoji} {a.title}</b> <span className="small muted">· {t("{n} ad views", { n: fmtNum(a.views) })} · @{a.owner.username}</span>
                {a.body && <p className="small" dir="auto">{a.body}</p>}
                {a.url && <p className="tiny muted" dir="ltr">{a.url}</p>}
                {a.reviewNote && <p className="tiny adm-why">⚠️ {why(a.reviewNote)}</p>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Button className="btn small green" onClick={() => decide(a.id, true, true)}>{t("Approve")}</Button>
                <Button className="btn small ghost danger" onClick={() => decide(a.id, false, true)}>{t("Turn down")}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h3>{t("Reports")} · {fmtNum(q.reports.length)}</h3>
        {!q.reports.length && <p className="muted small">{t("No open reports.")}</p>}
        {q.reports.map((r) => (
          <div key={`${r.shopId}:${r.target}`} className="adm-listing">
            <div className="grow">
              <b>{r.title ?? `🏪 ${r.shop}`}</b> {r.title && <span className="small muted">· {r.shop}</span>} <span className="chip small">{t("{n} reports", { n: fmtNum(r.n) })}</span>
              <p className="tiny muted">{Object.entries(r.reasons).map(([k, n]) => `${t(REASON_LABEL[k as ReportReason] ?? k)} ×${fmtNum(n)}`).join(" · ")}</p>
              {r.notes.map((n, i) => <p key={i} className="tiny">“{n}”</p>)}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <a className="btn small ghost" href={`/s/${r.shopId}`} target="_blank" rel="noreferrer">{t("Open")}</a>
              {r.target !== "shop" && <Button className="btn small ghost danger" onClick={() => decide(r.target, false)}>{t("Turn down")}</Button>}
              <Button className="btn small ghost" onClick={() => dismiss(r)}>{t("Dismiss")}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
