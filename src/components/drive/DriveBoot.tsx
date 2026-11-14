"use client";
// The 3D city's loading screen (rules: lib/bootGate.ts). It covers the city while the streets
// round you are drawn and your car is put on one, then fades away and the controls come alive.
// A tip every few seconds; "Play now" after a long wait; "Back to the map" any time.
import { useEffect, useState } from "react";
import { msg, t } from "@/lib/i18n";
import { BOOT_STAGES, type BootOut } from "@/lib/bootGate";
import { LoadingScene } from "../LoadingScene";

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

export function DriveBoot({ boot, onSkip, onExit, onGone }: { boot: BootOut; onSkip: () => void; onExit: () => void; onGone: () => void }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const id = setInterval(() => setTip((i) => (i + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(id);
  }, []);
  // Ready: the scene lifts away like a curtain over the city, then it's gone.
  useEffect(() => {
    if (!boot.done) return;
    const id = setTimeout(onGone, 850);
    return () => clearTimeout(id);
  }, [boot.done]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LoadingScene className={boot.done ? "" : "dboot"} out={boot.done} pct={boot.pct} title={t("StreetQuest")} sub={t("Your real city, in 3D")} stage={t(BOOT_STAGES[boot.stage])} tip={t(TIPS[tip])}>
      {boot.canSkip && !boot.done && (
        <button type="button" className="btn yellow" onClick={onSkip}>
          {t("Play now")}
        </button>
      )}
      {!boot.done && (
        <button type="button" className="btn ghost small" onClick={onExit}>
          {t("Back to the map")}
        </button>
      )}
    </LoadingScene>
  );
}
