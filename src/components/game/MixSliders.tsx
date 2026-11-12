"use client";
// The sound mixer (lib/audio/mix.ts): Settings → Sound on the map and in the 3D city's menu.
import { useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { MIX_BUS_KEYS, MIX_BUSES, type Mix } from "@/lib/audio/mix";
import { getMix, isMuted, setMix, setMuted } from "./sfx";

/** One slider for everything, then one per kind of sound (lib/audio/mix.ts): heard as you drag. */
export function MixSliders({ off, withMute }: { off?: boolean; /** Also the on/off switch (the 3D city has no other). */ withMute?: boolean }) {
  const [muted, setMutedState] = useState(isMuted);
  const [m, setM] = useState<Mix>(() => getMix());
  const set = (p: Partial<Mix>) => (setMix(p), setM(getMix()));
  const row = (key: keyof Mix, emoji: string, label: string) => (
    <div className="row mix-row" key={key}>
      <span className="mix-lb"><span aria-hidden>{emoji}</span> {label}</span>
      <input type="range" min={0} max={1} step={0.05} value={m[key]} disabled={silent} onChange={(e) => set({ [key]: Number(e.target.value) })} className="grow" aria-label={label} />
      <span className="mix-n">{fmtNum(Math.round(m[key] * 100))}</span>
    </div>
  );
  const silent = off ?? muted;
  return (
    <div className="mix">
      {withMute && (
        <label className="row mix-row">
          <span className="mix-lb"><span aria-hidden>🔇</span> {t("Sound")}</span>
          <span className="grow" />
          <input type="checkbox" checked={!muted} onChange={(e) => (setMuted(!e.target.checked), setMutedState(!e.target.checked))} aria-label={t("Sound")} />
        </label>
      )}
      {row("master", "🔊", t("Everything"))}
      {MIX_BUS_KEYS.map((b) => row(b, MIX_BUSES[b].emoji, t(MIX_BUSES[b].label)))}
    </div>
  );
}
