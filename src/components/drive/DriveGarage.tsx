"use client";
// The garage: pick what you drive (or fly) and its paint, and how the city looks.
import { useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import { PAINTS, unlocked, VEHICLE_KEYS, VEHICLES, type VehicleKey } from "@/lib/vehicles";
import { PARTY_GAMES, type PartyGame } from "@/lib/party";
import { Button } from "@/components/Button";
import type { Style } from "./tileMesh";
import { askTilt, type SteerMode } from "./DrivePad";
import { Icon, type IconName } from "./icons";

const CTL: { key: SteerMode; icon: IconName; label: string }[] = [
  { key: "wheel", icon: "wheel", label: msg("Wheel") },
  { key: "buttons", icon: "pad", label: msg("Buttons") },
  { key: "tilt", icon: "tilt", label: msg("Tilt") },
];

type Props = {
  level: number;
  vehicle: VehicleKey;
  paint: string;
  style: Style;
  fps: number;
  /** A ground-only round is running: flyers are parked until it ends. */
  locked: PartyGame | null;
  /** How you steer on a touch screen (null: no touch controls here). */
  ctl: SteerMode | null;
  onVehicle: (k: VehicleKey) => void;
  onPaint: (c: string) => void;
  onStyle: (s: Style) => void;
  onCtl: (m: SteerMode) => void;
  onClose: () => void;
  /** Inside the drive menu: no window of its own. */
  embedded?: boolean;
};

export function DriveGarage({ level, vehicle, paint, style, fps, locked, ctl, onVehicle, onPaint, onStyle, onCtl, onClose, embedded }: Props) {
  const groundOnly = !!locked && PARTY_GAMES[locked].groundOnly;
  const [tiltError, setTiltError] = useState(false);
  const pickCtl = async (m: SteerMode) => {
    // Tilt needs motion access, which iOS only grants from a tap like this one.
    if (m === "tilt" && !(await askTilt())) return setTiltError(true);
    setTiltError(false);
    onCtl(m);
  };
  return (
    <div className={embedded ? "drive-tab" : "drive-sheet"} role={embedded ? undefined : "dialog"} aria-label={t("Garage")}>
      {!embedded && (
        <div className="row">
          <b className="grow">🏁 {t("Garage")}</b>
          <button className="close" onClick={onClose} aria-label={t("Close")}>✕</button>
        </div>
      )}
      {groundOnly && <p className="small muted">{t("This round is on wheels only — flyers are parked until it ends.")}</p>}
      <div className="garage-grid">
        {VEHICLE_KEYS.map((k) => {
          const v = VEHICLES[k];
          const open = unlocked(k, level);
          const parked = groundOnly && v.flies;
          return (
            <button key={k} className={`garage-car ${vehicle === k ? "on" : ""}`} disabled={!open || parked} onClick={() => onVehicle(k)} aria-pressed={vehicle === k}>
              <span className="ic">{open ? v.emoji : "🔒"}</span>
              <b>{t(v.name)}</b>
              <span className="small muted">{open ? t(v.blurb) : t("Unlocks at level {n}", { n: v.level })}</span>
              <span className="garage-stats small">
                ⚡ {fmtNum(Math.round(v.speed * 100))}%{v.flies ? ` · ✈️ ${t("flies")}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <b className="small">{t("Paint")}</b>
      <div className="garage-paints">
        {PAINTS.map((c) => (
          <button key={c} className={`swatch ${paint === c ? "on" : ""}`} style={{ background: c }} onClick={() => onPaint(c)} aria-label={c} aria-pressed={paint === c} />
        ))}
      </div>
      {ctl && (
        <>
          <b className="small">{t("Steering")}</b>
          <div className="ctl-pick" role="radiogroup" aria-label={t("Steering")}>
            {CTL.map((c) => (
              <button key={c.key} role="radio" aria-checked={ctl === c.key} className={ctl === c.key ? "on" : ""} onClick={() => pickCtl(c.key)}>
                <Icon name={c.icon} size={24} />
                <span>{t(c.label)}</span>
              </button>
            ))}
          </div>
          {tiltError && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{t("This phone didn't allow motion access, so tilt steering can't work here.")}</p>}
          {VEHICLES[vehicle].flies && <p className="small muted" style={{ margin: 0 }}>{t("Flying uses the stick: left and right to turn, up and down to climb and descend.")}</p>}
        </>
      )}
      <b className="small">{t("Graphics")}</b>
      <div className="seg">
        <Button className={`btn small ${style === "real" ? "yellow" : "ghost"}`} onClick={() => onStyle("real")}>🏙️ {t("Realistic")}</Button>
        <Button className={`btn small ${style === "toon" ? "yellow" : "ghost"}`} onClick={() => onStyle("toon")}>🧸 {t("Cartoon")}</Button>
      </div>
      {fps > 0 && <p className="small muted">{t("{n} frames a second — the picture sharpens or softens on its own to keep it smooth.", { n: fps })}</p>}
    </div>
  );
}
