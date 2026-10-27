"use client";
// The toman wallet: what you have, how you earn it, and asking to be paid out to a
// bank card once you reach the minimum. The server takes the amount out of the wallet
// when you ask and an admin pays it (or puts it back).
import { useCallback, useEffect, useState } from "react";
import { fmtNum, msg, t, toAsciiDigits } from "@/lib/i18n";
import { S } from "@/lib/settings";
import { Button } from "@/components/Button";
import { askConfirm } from "@/components/Dialogs";
import { api, fmtTime, type CashoutView } from "./client";
import { Sheet, useGame } from "./ui";

const STATUS: Record<CashoutView["requests"][number]["status"], { icon: string; label: string; color: string }> = {
  PENDING: { icon: "⏳", label: msg("Waiting for payment"), color: "var(--yellow)" },
  PAID: { icon: "✅", label: msg("Paid"), color: "var(--green)" },
  REJECTED: { icon: "↩️", label: msg("Declined — back in your wallet"), color: "var(--red)" },
};

export function WalletPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { me, act } = useGame();
  const [d, setD] = useState<CashoutView | null>(null);
  const [form, setForm] = useState({ amount: "", fullName: "", phone: "", account: "" });
  const load = useCallback(() => api<CashoutView>("/api/cashout").then(setD).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, me.toman]);

  const min = d?.min ?? S.cashoutMin;
  const toman = me.toman;
  const pending = d?.requests.find((r) => r.status === "PENDING");
  const can = toman >= min && !pending && (d?.enabled ?? true);
  const amount = Math.floor(Number(toAsciiDigits(form.amount || String(toman)).replace(/[,٬\s]/g, "")));

  const submit = async () => {
    const ok = await askConfirm(t("Cash out {n} toman?", { n: amount }), {
      body: t("It leaves your wallet now and is paid to {account} after a check. Make sure the name matches the account.", { account: form.account }),
      ok: t("Request payment"),
      cancel: t("Go back"),
    });
    if (!ok) return;
    const done = await act(() => api("/api/cashout", { body: { amount, fullName: form.fullName, phone: toAsciiDigits(form.phone), account: toAsciiDigits(form.account) } }));
    if (done) {
      setForm({ amount: "", fullName: form.fullName, phone: form.phone, account: "" });
      load();
    }
  };

  return (
    <Sheet title={`💵 ${t("Wallet")}`} onClose={onClose} peek={peek} help="wallet">
      <div className="card wallet-card">
        <div className="small muted">{t("Your toman")}</div>
        <div className="wallet-big" data-fx-target="cash">{fmtNum(toman)} <span className="small">{t("toman")}</span></div>
        <div className="need-bar" aria-hidden><i style={{ width: `${Math.min(100, (100 * toman) / Math.max(1, min))}%`, background: "var(--green)" }} /></div>
        <div className="small muted">
          {toman >= min ? t("You can cash out — the minimum is {n} toman", { n: min }) : t("{n} toman to go until you can cash out", { n: min - toman })}
        </div>
        {d && d.today > 0 && (
          <div className="small muted" style={{ marginTop: 4 }}>
            {d.dailyCap > 0 ? t("Today: {n} of {cap} toman", { n: d.today, cap: d.dailyCap }) : t("Today: +{n} toman", { n: d.today })}
          </div>
        )}
      </div>

      <div className="card small">
        <b>{t("How to earn")}</b>
        <ul className="wallet-how">
          <li>💵 {t("Walk to money on the map: {n} toman each", { n: S.moneyGps })}</li>
          <li>🛋️ {t("From home: {n} toman each", { n: S.moneyHome })}</li>
          <li>🏪 {t("Missions at stores: up to {n} toman", { n: Math.max(S.placeVisitToman, S.placeDeliverToman) })}</li>
          <li>✨ {t("Gold money is a special drop — it can be worth more")}</li>
        </ul>
      </div>

      {pending ? (
        <div className="card" style={{ borderColor: "var(--yellow)" }}>
          <b>⏳ {t("Cash-out on its way")}</b>
          <p className="small muted" style={{ margin: "4px 0 0" }}>{t("{n} toman to {account} — requested {when}", { n: pending.amount, account: pending.account, when: fmtTime(pending.createdAt) })}</p>
        </div>
      ) : (
        <div className="card">
          <b>💸 {t("Cash out to your bank")}</b>
          {!can && <p className="small muted" style={{ margin: "4px 0 8px" }}>{d && !d.enabled ? t("Cash-out is paused right now — try again later") : t("Reach {n} toman to cash out.", { n: min })}</p>}
          <fieldset disabled={!can} style={{ border: 0, padding: 0, margin: 0 }}>
            <label>{t("Amount (toman)")}</label>
            <input inputMode="numeric" value={form.amount} placeholder={fmtNum(toman)} onChange={(e) => setForm({ ...form, amount: e.target.value })} dir="ltr" />
            <label>{t("Full name (as on the bank account)")}</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoComplete="name" dir="auto" />
            <label>{t("Mobile number")}</label>
            <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09xxxxxxxxx" autoComplete="tel" dir="ltr" />
            <label>{t("Card number or Sheba")}</label>
            <input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="6037 xxxx xxxx xxxx / IR…" dir="ltr" />
            <Button
              className="btn green block"
              style={{ marginTop: 10 }}
              disabled={!can || !(amount >= min && amount <= toman) || form.fullName.trim().length < 3 || form.phone.trim().length < 8 || form.account.trim().length < 16}
              onClick={submit}
            >
              {t("Cash out {n} toman", { n: Number.isFinite(amount) ? amount : 0 })}
            </Button>
          </fieldset>
        </div>
      )}

      {!!d?.requests.length && (
        <>
          <label>{t("Your cash-outs")}</label>
          {d.requests.map((r) => (
            <div key={r.id} className="card list-item">
              <div className="icon-tile">{STATUS[r.status].icon}</div>
              <div className="grow">
                <b>{t("{n} toman", { n: r.amount })}</b>
                <div className="small muted">
                  <span style={{ color: STATUS[r.status].color }}>{t(STATUS[r.status].label)}</span> · {r.account} · {fmtTime(r.createdAt)}
                </div>
                {r.note && <div className="small muted">{r.note}</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
