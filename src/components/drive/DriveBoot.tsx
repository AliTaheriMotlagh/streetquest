"use client";
// The 3D city's loading screen (rules: lib/bootGate.ts). It covers the city while the streets
// round you are drawn and your car is put on one, then fades away and the controls come alive.
// A tip every few seconds; "Play now" after a long wait; "Back to the map" any time.
import { useEffect, useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import { BOOT_STAGES, type BootOut } from "@/lib/bootGate";

const TIPS = [
  msg("Slow down past a shop to see its menu and prices."),
  msg("Every store in the city is a real one — its menu, its prices, its hours."),
  msg("Press F (or the door button) to get out and walk; again to get back in."),
  msg("Hold Shift for nitro. On a pad: L2 + R2 slows time."),
  msg("Settings → Sound has a slider for every kind of sound."),
  msg("Menu → Places finds any store in the district, not only the nearest."),
  msg("Vasatyab finds the fairest place to meet your friends."),
  msg("Crash into a police car and you'll have a star on your head."),
];
const TIP_MS = 4500;

export function DriveBoot({ boot, onSkip, onExit }: { boot: BootOut; onSkip: () => void; onExit: () => void }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const id = setInterval(() => setTip((i) => (i + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="dboot" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={boot.pct} aria-label={t(BOOT_STAGES[boot.stage])}>
      <div className="db-sky" aria-hidden />
      <div className="db-card">
        <div className="db-title">{t("StreetQuest")}</div>
        <div className="db-sub">{t("Your real city, in 3D")}</div>
        <div className="db-bar" aria-hidden>
          <i style={{ transform: `scaleX(${boot.pct / 100})` }} />
        </div>
        <div className="db-stage">
          <span>{t(BOOT_STAGES[boot.stage])}</span>
          <b>{fmtNum(boot.pct)}%</b>
        </div>
        <p className="db-tip" key={tip}>{t(TIPS[tip])}</p>
        <div className="db-actions">
          {boot.canSkip && (
            <button type="button" className="btn yellow" onClick={onSkip}>
              {t("Play now")}
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={onExit}>
            {t("Back to the map")}
          </button>
        </div>
      </div>
    </div>
  );
}
