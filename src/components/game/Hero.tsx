"use client";
// The quest log: the campaign that teaches the money game, and today's three orders.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { api, type HeroView } from "./client";
import { useGame } from "./ui";
import { S } from "@/lib/settings";
import { Button } from "@/components/Button";

export function useHero() {
  const [h, setH] = useState<HeroView | null>(null);
  const load = useCallback(() => api<HeroView>("/api/hero").then(setH).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  return { h, load };
}

function useHeroAct(load: () => void) {
  const { act } = useGame();
  return (body: unknown, path = "/api/hero") => act(() => api(path, { body })).then((ok) => {
    load(); // also after a refusal: the sheet was showing something out of date
    return ok;
  });
}

export function QuestsTab() {
  const { h, load } = useHero();
  const doAct = useHeroAct(load);
  if (!h) return <div className="empty">{t("Loading…")}</div>;
  const camp = h.quests.find((q) => q.campaign);
  const daily = h.quests.filter((q) => !q.campaign);
  // A render helper, not a component: a component declared in here would be a new type
  // on every render, remounting the card (and eating taps on Claim mid-update).
  const quest = (q: HeroView["quests"][number]) => (
    <div key={q.key} className={`card ${q.done && !q.claimed ? "hl" : ""}`} style={{ opacity: q.claimed ? 0.5 : 1 }}>
      <div className="row">
        <div className="grow">
          <b>{t(q.title)}</b>
          <div className="small muted">{t(q.desc)}</div>
        </div>
        {q.claimed ? (
          <span className="small muted">✓</span>
        ) : q.done ? (
          <Button className="btn yellow small" onClick={() => doAct({ action: "claimQuest", key: q.key })}>{t("Claim")}</Button>
        ) : (
          <span className="small mono">{fmtNum(q.progress)}/{fmtNum(q.target)}</span>
        )}
      </div>
      <div className="need-bar"><i style={{ width: `${(q.progress / q.target) * 100}%`, background: "var(--yellow)" }} /></div>
      <div className="small muted">
        {t("Reward: {xp} XP · {coins} 🪙 · {gems} 💎", { xp: q.reward.xp, coins: q.reward.coins, gems: q.campaign ? S.questGemsCampaign : S.questGemsDaily })}
      </div>
    </div>
  );
  return (
    <>
      <label>{t("📜 Campaign · chapter {n}", { n: h.campaignStep + 1 })}</label>
      {camp ? (
        <>
          {camp.lore && <p className="small" style={{ fontStyle: "italic", color: "#c8c8dc" }}>«{t(camp.lore)}»</p>}
          {quest(camp)}
        </>
      ) : (
        <div className="empty">{t("Campaign complete — daily orders keep coming.")}</div>
      )}
      <label>{t("🗓️ Daily orders (reset at your midnight)")}</label>
      {daily.map(quest)}
    </>
  );
}
