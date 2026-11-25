"use client";
// The card of a place that isn't a shop (lib/storeKinds.ts civicKind): a mosque, school, hospital, police
// station, bank, office… It sells nothing, so no menu, prices or Torob — instead what it is, a mosque's
// prayer times for today (lib/prayerTimes.ts, worked out on the device), the emergency number for police,
// fire and hospitals, and the map's own opening hours, phones and address (/api/local with cat "civic",
// which skips every store lookup).
import { useEffect, useMemo, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { CIVIC_LOOK, emergencyNumber, type CivicKind } from "@/lib/storeKinds";
import { localDay, methodFor, nextPrayer, PRAYER_LABEL, prayerTimes } from "@/lib/prayerTimes";
import { dayClock, weekFromOsm, zoneOf, type StoreData } from "@/lib/localData";
import { countryAt } from "@/lib/region";
import type { LatLng } from "@/lib/geo";
import { Button } from "@/components/Button";
import { clock, HoursTable, OpenBadge, useLocal } from "../game/StoreInfo";
import { Sheet } from "../game/ui";
import type { StoreTarget } from "./StoreCard";

/** The place's own time zone: Iran's and Turkey's by position, else the device's. */
const zoneAt = (at: LatLng) => zoneOf(at) ?? (countryAt(at.lat, at.lng) === "TR" ? "Europe/Istanbul" : undefined);

/** The /api/local query for a non-shop place: only the map's own record. */
export const civicQuery = (s: StoreTarget) => ({ store: "place", name: s.name, lat: s.lat.toFixed(6), lng: s.lng.toFixed(6), cat: "civic" });

/** Today's times at a place, the next one marked; refreshed each minute. */
export function usePrayers(at: LatLng) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const zone = zoneAt(at);
  const dayKey = JSON.stringify(localDay(now, zone));
  const times = useMemo(() => prayerTimes(JSON.parse(dayKey), at.lat, at.lng, methodFor(countryAt(at.lat, at.lng))), [dayKey, at.lat, at.lng]);
  return { times, next: nextPrayer(times, now), at: (d: Date) => clock(dayClock(d, zone).min) };
}

function Prayers({ at }: { at: LatLng }) {
  const { times, next, at: show } = usePrayers(at);
  return (
    <div className="civic-block">
      <b className="small">🕰️ {t("Prayer times today")}</b>
      <table className="hours-table">
        <tbody>
          {times.map((p) => (
            <tr key={p.name} className={p.name === next?.name ? "today" : ""}>
              <th scope="row">{t(PRAYER_LABEL[p.name])}</th>
              <td dir="ltr">{show(p.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{t("Worked out for this spot — the mosque's own timetable may differ by a minute or two.")}</p>
    </div>
  );
}

export function CivicSheet({ s, kind, onClose, onGo }: { s: StoreTarget; kind: CivicKind; onClose: () => void; onGo: () => void }) {
  const look = CIVIC_LOOK[kind];
  const { data } = useLocal<StoreData>(civicQuery(s));
  const week = data ? (data.about.week ?? weekFromOsm(data.about.hours)) : null;
  const sos = emergencyNumber(kind, countryAt(s.lat, s.lng));
  const links = (data?.links ?? []).filter((l) => l.kind === "website" || l.kind === "instagram" || l.kind === "phone" || l.kind === "directory");
  return (
    <Sheet title={`${look.emoji} ${s.name}`} onClose={onClose} tall>
      <div className="store-sheet civic-card" style={{ ["--cat" as string]: look.color }}>
        <div className="store-meta">
          <span className="tag">{look.emoji} {t(look.label)}</span>
          <OpenBadge week={week} at={s} />
          <span className="small muted">{s.sub}</span>
        </div>
        <p className="small muted">{t("Not a shop — nothing to buy here.")}</p>
        {sos && (
          <a className="btn small cyan block" href={`tel:${sos}`}>📞 {t("Emergency: {n}", { n: fmtNum(Number(sos), undefined, { useGrouping: false }) })}</a>
        )}
        {kind === "mosque" && <Prayers at={s} />}
        <div className="civic-block">
          <b className="small">🕘 {t("Opening hours")}</b>
          {week ? <HoursTable week={week} at={s} /> : data?.about.hours ? <p className="small" dir="ltr">{data.about.hours}</p> : <p className="small muted">{data ? t("Opening hours aren't on the map.") : t("Loading…")}</p>}
        </div>
        {!!data?.about.address && <p className="small" dir="auto">📍 {data.about.address}</p>}
        {!!links.length && (
          <div className="store-actions">
            {links.map((l) => (
              <a key={l.url} className="btn small ghost" href={l.url} target={l.kind === "phone" ? undefined : "_blank"} rel="noopener noreferrer" dir="auto">
                {l.kind === "phone" ? "📞" : l.kind === "instagram" ? "📷" : "🌐"} {l.label}
              </a>
            ))}
          </div>
        )}
        <div className="store-actions">
          <Button className="btn small yellow" onClick={onGo}>🧭 {t("Go there")}</Button>
        </div>
      </div>
    </Sheet>
  );
}

/** The chip under the street name for a non-shop place: what it is, and a mosque's next prayer time. */
export function CivicChip({ s, kind, onOpen }: { s: StoreTarget; kind: CivicKind; onOpen: () => void }) {
  const look = CIVIC_LOOK[kind];
  return (
    <button type="button" className="drive-store rich" style={{ "--trade": look.color } as React.CSSProperties} onClick={onOpen}>
      <span className="ic">{look.emoji}</span>
      <span className="tx">
        <b dir="auto">{s.name}</b>
        <span>{s.sub}</span>
        {kind === "mosque" && <NextPrayer at={s} />}
      </span>
    </button>
  );
}

function NextPrayer({ at }: { at: LatLng }) {
  const { next, at: show } = usePrayers(at);
  if (!next) return null;
  return <span className="store-chip-item">🕰️ {t("{name} at {time}", { name: t(PRAYER_LABEL[next.name]), time: show(next.at) })}</span>;
}
