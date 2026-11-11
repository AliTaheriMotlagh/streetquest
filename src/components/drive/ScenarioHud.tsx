"use client";
// The HUD of story scenarios (drive/scenarios.ts): the briefing card, the objective with its clock
// and distance, the subtitles, the photo flash, and the pass / fail card with retry. Small on phones.
import { useSyncExternalStore } from "react";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { FAIL_TEXT } from "@/lib/scenarios/text";
import { say } from "@/lib/scenarios/validate";
import type { Scenarios } from "./scenarios";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function ScenarioHud({ scenarios }: { scenarios: Scenarios }) {
  const s = useSyncExternalStore(scenarios.subscribe, scenarios.getSnapshot, scenarios.getSnapshot);
  const lang = getLocale();
  const c = s.card;
  return (
    <div className="scn">
      {s.hud && (
        <div className="scn-obj" role="status">
          <span className="scn-k">
            {s.hud.title} · {fmtNum(s.hud.index + 1)}/{fmtNum(s.hud.total)}
          </span>
          <b>{s.hud.objective}</b>
          <span className="scn-v">
            {s.hud.left != null && <i className={s.hud.left <= 15 ? "hot" : ""}>{clock(s.hud.left)}</i>}
            {s.hud.dist != null && <i>{formatDistance(s.hud.dist)}</i>}
            {s.hud.carrying && <i aria-label={t("Carrying")}>📦</i>}
            {s.hud.progress && (
              <i>
                {fmtNum(s.hud.progress.have)}/{fmtNum(s.hud.progress.need)}
                {s.hud.progress.unit === "m" ? ` ${t("m")}` : s.hud.progress.unit === "s" ? ` ${t("s")}` : ""}
              </i>
            )}
          </span>
        </div>
      )}
      {s.subtitle && (
        <div key={s.subtitle.id} className="scn-sub" role="status">
          <b>{s.subtitle.speaker}</b> {s.subtitle.text}
        </div>
      )}
      {s.flash > 0 && <div key={`f${s.flash}`} className="scn-flash" aria-hidden />}
      {s.checkpoint > 0 && (
        <div key={`c${s.checkpoint}`} className="scn-cp" role="status">
          {t("Checkpoint")}
        </div>
      )}
      {c?.kind === "intro" && (
        <div className="scn-card" role="dialog" aria-label={say(c.scn.title, lang)}>
          <div className="scn-emoji" aria-hidden>
            {c.scn.emoji}
          </div>
          <h3>{say(c.scn.title, lang)}</h3>
          <p className="scn-who">{say(c.scn.giver.name, lang)}</p>
          <p>{say(c.scn.brief, lang)}</p>
          <p className="scn-meta">
            <span aria-label={t("Difficulty {n} of 3", { n: fmtNum(c.scn.difficulty) })}>{"★".repeat(c.scn.difficulty)}{"☆".repeat(3 - c.scn.difficulty)}</span>
            <span>🪙 {fmtNum(c.scn.reward.coins)}</span>
            <span>{t("{n} XP", { n: fmtNum(c.scn.reward.xp) })}</span>
            {c.scn.paidNow && <span className="muted">{t("Already paid recently")}</span>}
          </p>
          <div className="scn-btns">
            <button className="btn" disabled={s.busy} onClick={() => void scenarios.accept()} aria-busy={s.busy || undefined}>
              {s.busy ? t("Working…") : t("Accept")}
            </button>
            <button className="btn ghost" disabled={s.busy} onClick={() => scenarios.dismiss()}>
              {t("Not now")}
            </button>
          </div>
        </div>
      )}
      {c?.kind === "end" && (
        <div className={`scn-card ${c.won ? "won" : "lost"}`} role="dialog" aria-label={c.title}>
          <div className="scn-emoji" aria-hidden>
            {c.won ? "🏁" : "💥"}
          </div>
          <h3>{c.won ? t("Mission passed") : t("Mission failed")}</h3>
          <p className="scn-who">{c.title}</p>
          {!c.won && c.reason && <p>{t(FAIL_TEXT[c.reason])}</p>}
          {c.won && <p>{c.message}</p>}
          {c.reward && (
            <p className="scn-meta">
              <span>🪙 +{fmtNum(c.reward.coins)}</span>
              <span>{t("+{n} XP", { n: fmtNum(c.reward.xp) })}</span>
            </p>
          )}
          <div className="scn-btns">
            {!c.won && (
              <button className="btn" disabled={s.busy} onClick={() => void scenarios.retry()}>
                {c.canResume ? t("Retry from checkpoint") : t("Try again")}
              </button>
            )}
            <button className="btn ghost" disabled={s.busy && c.won} onClick={() => scenarios.quit()}>
              {c.won ? t("Continue") : t("Give up")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
