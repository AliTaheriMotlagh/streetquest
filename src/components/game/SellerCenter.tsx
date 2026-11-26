"use client";
// The Seller center (lib/sellerCenter.ts, /api/seller): the seller's player shop and their real businesses in one
// place — what needs doing first, the shop at a glance, each business with its plan and whether it's verified, and
// linking a verified business to the shop (the shop then shows "Verified store"). Every to-do opens its screen.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t, dot } from "@/lib/i18n";
import type { Todo, TodoAction } from "@/lib/sellerCenter";
import { api } from "./client";
import { Button } from "@/components/Button";

type Overview = {
  shop: { id: string; name: string; emoji: string; sales: number; open: boolean; expiresAt: number; businessId: string | null; products: number; pending: number } | null;
  businesses: { id: string; name: string; emoji: string; verified: boolean; plan: string; views: number; linked: boolean; linkedElsewhere?: boolean }[];
  todos: Todo[];
};

export function SellerCenter({ onAction }: { onAction: (a: TodoAction, id?: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Overview>("/api/seller").then(setData, (e: Error) => setErr(e.message)), []);
  useEffect(() => void load(), [load]);
  const link = async (businessId: string | null) => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/seller", { body: { businessId } });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <div className="empty">{err || t("Loading…")}</div>;
  const { shop, businesses, todos } = data;
  const act = (x: Todo) => (x.action === "link" && x.id ? void link(x.id) : onAction(x.action, x.id));
  return (
    <div className="seller">
      {err && <p className="small tv-err" role="alert">{err}</p>}
      <section aria-label={t("To do")}>
        <h3 className="small">{t("To do")}</h3>
        {todos.length ? (
          <ul className="seller-todos">
            {todos.map((x) => (
              <li key={x.key}>
                <button type="button" className={`seller-todo${x.urgent ? " urgent" : ""}`} onClick={() => act(x)} disabled={busy}>
                  <span aria-hidden>{x.emoji}</span>
                  <span className="grow" dir="auto">{t(x.text, x.vars)}</span>
                  <span aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">{t("All done — nothing waiting for you.")}</p>
        )}
      </section>

      {shop && (
        <section className="card seller-card" aria-label={t("My shop")}>
          <div className="row">
            <b className="grow" dir="auto">{shop.emoji} {shop.name}</b>
            <span className={`tag ${shop.open && shop.expiresAt > Date.now() ? "tag-open" : "tag-closed"}`}>{shop.open && shop.expiresAt > Date.now() ? t("Open") : t("Closed")}</span>
          </div>
          <p className="small muted">{[t("{n} products", { n: fmtNum(shop.products) }), t("{n} sold", { n: shop.sales }), shop.pending ? t("{n} orders to hand over", { n: fmtNum(shop.pending) }) : ""].filter(Boolean).join(dot())}</p>
          <Button className="btn small ghost" onClick={() => onAction("products")}>🛠️ {t("Manage my shop")}</Button>
        </section>
      )}

      <section aria-label={t("My businesses")}>
        <h3 className="small">{t("My businesses")}</h3>
        {businesses.length === 0 && <p className="small muted">{t("Own a real store? Put it on the game map and bring players through your door.")}</p>}
        {businesses.map((b) => (
          <div key={b.id} className="card seller-card">
            <div className="row">
              <b className="grow" dir="auto">{b.emoji} {b.name}</b>
              <span className={`tag ${b.verified ? "tag-open" : ""}`}>{b.verified ? t("Verified") : t("Not verified")}</span>
            </div>
            <p className="small muted">{[t("Plan: {plan}", { plan: b.plan }), t("{n} views", { n: fmtNum(b.views) })].join(dot())}</p>
            <div className="row wrap">
              {b.linked ? (
                <>
                  <span className="small">🔗 {t("Linked to your shop")}</span>
                  <button type="button" className="link-btn small" onClick={() => link(null)} disabled={busy}>{t("Unlink")}</button>
                </>
              ) : shop && b.verified && !b.linkedElsewhere && !shop.businessId ? (
                <Button className="btn small cyan" onClick={() => link(b.id)} disabled={busy}>🔗 {t("Link to my shop")}</Button>
              ) : null}
              <button type="button" className="link-btn small" onClick={() => onAction(b.verified ? "plan" : "verify", b.id)}>{t("Open")} ›</button>
            </div>
          </div>
        ))}
        <button type="button" className="link-btn small" onClick={() => onAction("verify")}>＋ {t("Add a real store")}</button>
      </section>
    </div>
  );
}
