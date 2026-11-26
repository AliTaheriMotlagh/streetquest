"use client";
// Advertise with coins (server/houseAds.ts, lib/ads/slot.ts): a short ad — emoji, title, a line, a link —
// shown in the game's lists before any ad network; the player picks how many views and sees the price.
// Below, their ads with views, clicks and status (waiting for a moderator, live, turned down), paused/resumed.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { AD_VIEWS_MAX, AD_VIEWS_MIN, AD_VIEWS_STEP, adPrice } from "@/lib/ads/slot";
import { Button } from "@/components/Button";
import { api } from "./client";
import { useGame } from "./ui";

type MyAd = { id: string; title: string; body: string; emoji: string; views: number; shown: number; clicks: number; review: string; reviewNote: string; paused: boolean };
type Mine = { ads: MyAd[]; per100: number; enabled: boolean };
const VIEW_STEPS = [100, 500, 1000, 5000];

export function Advertise() {
  const { act, me, refresh } = useGame();
  const [data, setData] = useState<Mine | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ emoji: "📣", title: "", body: "", url: "", views: 500 });
  const load = useCallback(() => api<Mine>("/api/ads/house").then(setData).catch(() => setData(null)), []);
  useEffect(() => void load(), [load]);
  if (!data?.enabled) return null;
  const price = adPrice(f.views, data.per100);
  const buy = async () => {
    const ok = await act(() => api("/api/ads/house", { body: { action: "buy", ...f } }));
    if (ok) (setOpen(false), setF({ ...f, title: "", body: "", url: "" }), void load(), refresh?.());
  };
  return (
    <section className="advertise">
      <div className="sec-head">
        <b>📣 {t("Advertise")}</b>
        <span className="grow" />
        {!open && <Button className="btn cyan small" onClick={() => setOpen(true)}>＋ {t("New ad")}</Button>}
      </div>
      {open && (
        <div className="card stack" style={{ gap: 8 }}>
          <p className="small muted">{t("Your ad shows in the game's lists (shops, travel) to players everywhere. It's checked like a shop listing.")}</p>
          <div className="row" style={{ gap: 6 }}>
            <input className="ad-emoji-in" value={f.emoji} maxLength={4} onChange={(e) => setF({ ...f, emoji: e.target.value })} aria-label={t("Emoji")} />
            <input className="grow" value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("Title")} aria-label={t("Title")} dir="auto" />
          </div>
          <input value={f.body} maxLength={140} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={t("One line about it (optional)")} aria-label={t("One line about it (optional)")} dir="auto" />
          <input value={f.url} maxLength={300} inputMode="url" onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" aria-label={t("Link (optional)")} dir="ltr" />
          <div className="row wrap" role="radiogroup" aria-label={t("Views")} style={{ gap: 6 }}>
            {VIEW_STEPS.filter((v) => v >= AD_VIEWS_MIN && v <= AD_VIEWS_MAX && v % AD_VIEWS_STEP === 0).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={f.views === v} className={`chip small ${f.views === v ? "on" : ""}`} onClick={() => setF({ ...f, views: v })}>
                {t("{n} ad views", { n: fmtNum(v) })}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button className="btn ghost small" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <span className="grow" />
            <Button className="btn yellow small" disabled={f.title.trim().length < 3 || me.coins < price} onClick={buy}>
              {t("Buy for {n} 🪙", { n: fmtNum(price) })}
            </Button>
          </div>
        </div>
      )}
      {data.ads.map((a) => (
        <div key={a.id} className={`card list-item ${a.paused ? "dim" : ""}`}>
          <span className="icon-tile" aria-hidden>{a.emoji}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <b className="ellipsis" dir="auto" style={{ display: "block" }}>{a.title}</b>
            <span className="small muted">
              {a.review === "pending" ? `🕓 ${t("Waiting for a moderator")}` : a.review === "rejected" ? `⛔ ${t("Turned down")}` : `👁 ${fmtNum(a.shown)}/${fmtNum(a.views)} · 👆 ${fmtNum(a.clicks)}`}
            </span>
          </span>
          {a.review === "ok" && a.shown < a.views && (
            <Button className="btn ghost small" onClick={() => act(() => api("/api/ads/house", { body: { action: "pause", id: a.id, paused: !a.paused } })).then(() => load())}>
              {a.paused ? `▶ ${t("Resume")}` : `⏸ ${t("Pause")}`}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
