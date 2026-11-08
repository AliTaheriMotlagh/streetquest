"use client";
// The garage: pick what you drive (or fly) and its paint, how the city looks (style,
// picture quality, time of day, weather), and which names its streets and shops show.
import { useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import { GARAGE_KEYS, PAINTS, unlocked, VEHICLES, type VehicleKey } from "@/lib/vehicles";
import { PARTY_GAMES, type PartyGame } from "@/lib/party";
import { Button } from "@/components/Button";
import type { TimePick, Weather } from "@/lib/daylight";
import type { QualityPick, Tier } from "./graphics/quality";
import type { Style } from "./tileMesh";
import type { NameMode } from "./vectorTile";
import { askTilt, type SteerMode } from "./DrivePad";
import { Icon, type IconName } from "./icons";

const CTL: { key: SteerMode; icon: IconName; label: string }[] = [
  { key: "wheel", icon: "wheel", label: msg("Wheel") },
  { key: "buttons", icon: "pad", label: msg("Buttons") },
  { key: "tilt", icon: "tilt", label: msg("Tilt") },
];

const NAMES: { key: NameMode; label: string }[] = [
  { key: "mine", label: msg("My language") },
  { key: "local", label: msg("As on the street") },
  { key: "both", label: msg("Both") },
];

const QUALITY: { key: QualityPick; label: string }[] = [
  { key: "auto", label: msg("Auto") },
  { key: "ultra", label: msg("Ultra") },
  { key: "high", label: msg("High") },
  { key: "medium", label: msg("Medium") },
  { key: "low", label: msg("Low") },
];
const TIER_LABEL: Record<Tier, string> = { ultra: msg("Ultra"), high: msg("High"), medium: msg("Medium"), low: msg("Low") };

const TIMES: { key: TimePick; icon: string; label: string }[] = [
  { key: "day", icon: "☀️", label: msg("Day") },
  { key: "live", icon: "🕒", label: msg("Real time") },
  { key: "sunset", icon: "🌇", label: msg("Sunset") },
  { key: "night", icon: "🌙", label: msg("Night") },
];

const WEATHERS: { key: Weather; icon: string; label: string }[] = [
  { key: "clear", icon: "🌤️", label: msg("Clear sky") },
  { key: "cloudy", icon: "☁️", label: msg("Cloudy") },
  { key: "rain", icon: "🌧️", label: msg("Rain") },
];

type Props = {
  level: number;
  vehicle: VehicleKey;
  paint: string;
  style: Style;
  names: NameMode;
  /** Picture quality, and the tier "auto" chose for this device. */
  quality: QualityPick;
  autoTier: Tier;
  timeOfDay: TimePick;
  weather: Weather;
  fps: number;
  /** A ground-only round is running: flyers are parked until it ends. */
  locked: PartyGame | null;
  /** How you steer on a touch screen (null: no touch controls here). */
  ctl: SteerMode | null;
  onVehicle: (k: VehicleKey) => void;
  onPaint: (c: string) => void;
  onStyle: (s: Style) => void;
  onNames: (n: NameMode) => void;
  onQuality: (q: QualityPick) => void;
  onTime: (t: TimePick) => void;
  onWeather: (w: Weather) => void;
  onCtl: (m: SteerMode) => void;
  onClose: () => void;
  /** Inside the drive menu: no window of its own. */
  embedded?: boolean;
};

export function DriveGarage({ level, vehicle, paint, style, names, quality, autoTier, timeOfDay, weather, fps, locked, ctl, onVehicle, onPaint, onStyle, onNames, onQuality, onTime, onWeather, onCtl, onClose, embedded }: Props) {
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
        {GARAGE_KEYS.map((k) => {
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
      <b className="small">{t("Picture quality")}</b>
      <div className="seg seg5 seg-fill" role="radiogroup" aria-label={t("Picture quality")}>
        {QUALITY.map((q) => (
          <Button key={q.key} role="radio" aria-checked={quality === q.key} className={`btn small ${quality === q.key ? "yellow" : "ghost"}`} onClick={() => onQuality(q.key)}>
            {t(q.label)}
          </Button>
        ))}
      </div>
      {quality === "auto" && <p className="small muted">{t("Auto chose {tier} for this device, and steps down by itself if the frame rate drops.", { tier: t(TIER_LABEL[autoTier]) })}</p>}
      <b className="small">{t("Time of day")}</b>
      <div className="seg seg4 seg-fill" role="radiogroup" aria-label={t("Time of day")}>
        {TIMES.map((o) => (
          <Button key={o.key} role="radio" aria-checked={timeOfDay === o.key} className={`btn small ${timeOfDay === o.key ? "yellow" : "ghost"}`} onClick={() => onTime(o.key)}>
            {o.icon} {t(o.label)}
          </Button>
        ))}
      </div>
      {timeOfDay === "live" && <p className="small muted">{t("The sun is where it really is over your streets right now: day, sunset and night as they happen.")}</p>}
      <b className="small">{t("Weather")}</b>
      <div className="seg seg3 seg-fill" role="radiogroup" aria-label={t("Weather")}>
        {WEATHERS.map((o) => (
          <Button key={o.key} role="radio" aria-checked={weather === o.key} className={`btn small ${weather === o.key ? "yellow" : "ghost"}`} onClick={() => onWeather(o.key)}>
            {o.icon} {t(o.label)}
          </Button>
        ))}
      </div>
      <b className="small">{t("Street and shop names")}</b>
      <div className="seg" role="radiogroup" aria-label={t("Street and shop names")}>
        {NAMES.map((n) => (
          <Button key={n.key} role="radio" aria-checked={names === n.key} className={`btn small ${names === n.key ? "yellow" : "ghost"}`} onClick={() => onNames(n.key)}>
            {t(n.label)}
          </Button>
        ))}
      </div>
      {fps > 0 && <p className="small muted">{t("{n} frames a second — the picture sharpens or softens on its own to keep it smooth.", { n: fps })}</p>}
    </div>
  );
}
