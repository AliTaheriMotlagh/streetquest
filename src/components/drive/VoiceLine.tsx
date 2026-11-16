"use client";
// The voice download's line on the 3D city's loading screen (DriveBoot), under the game files' one: "🗣️ Downloading
// the Persian voice · 85 MB · 40%" with its own thin bar — the player's language only (drive/tts/neural.ts
// warmLanguage, started as the city opens). Nothing when the voices are here, off, or not for this device.
import { useEffect, useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import type { TtsLang } from "@/lib/tts/sherpa";
import { languageProgress, onNeuralChange, ttsLang, warmLanguage } from "./tts/neural";

const LANG: Record<TtsLang, string> = { fa: msg("Downloading the Persian voice"), en: msg("Downloading the English voice"), tr: msg("Downloading the Turkish voice") };

export function VoiceLine() {
  const [, redraw] = useState(0);
  useEffect(() => onNeuralChange(() => redraw((n) => n + 1)), []);
  // The loading screen is up: the language's voices start coming now, not once the street is built.
  useEffect(() => warmLanguage(), []);
  const lp = languageProgress();
  if (!lp.busy) return null;
  const pct = Math.round(lp.pct * 100);
  return (
    <div className="gdl" role="status" aria-live="off">
      <div className="gdl-head">
        <span>🗣️ {t(LANG[ttsLang()])}</span>
        <b>{fmtNum(pct)}%</b>
      </div>
      <div className="gdl-bar" aria-hidden>
        <i style={{ transform: `scaleX(${Math.max(0.02, lp.pct)})` }} />
      </div>
      <small>{t("{n} MB, once — then people speak in natural voices", { n: fmtNum(lp.mb) })}</small>
    </div>
  );
}
