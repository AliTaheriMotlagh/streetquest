"use client";
// The open city's crime HUD (drive/street.ts): the wanted stars (steady while an officer
// sees you, blinking while they search for you), your car's health while it's hurt (red
// and pulsing once it's on fire), and the big moments — wanted, lost them, arrested,
// wrecked, knocked out — as a banner that fades by itself. Small on phones (compact.css).
import { useSyncExternalStore } from "react";
import { fmtNum, t } from "@/lib/i18n";
import type { Banner, StreetLife } from "./street";

const TEXT: Record<Banner, () => [string, string]> = {
  wanted: () => [t("Wanted!"), t("The police are after you")],
  lost: () => [t("You lost them"), t("The police have given up the search")],
  busted: () => [t("Arrested"), t("They let you off with a warning — this time")],
  wrecked: () => [t("Wrecked"), t("Take another car off the street (F), or pick one in the garage")],
  down: () => [t("Knocked out"), t("Back on your feet in a moment")],
  fire: () => [t("Your car is on fire!"), t("Get out before it blows")],
};

export function StreetHud({ street }: { street: StreetLife }) {
  const s = useSyncExternalStore(street.subscribe, street.getSnapshot, street.getSnapshot);
  const banner = s.banner && TEXT[s.banner.kind]();
  return (
    <div className="shud">
      {s.stars > 0 && (
        <div className={`shud-stars ${s.seen ? "seen" : "search"}`} role="img" aria-label={t("Wanted level {n} of 5", { n: fmtNum(s.stars) })}>
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i <= s.stars ? "on" : ""} aria-hidden>
              ★
            </i>
          ))}
        </div>
      )}
      {s.car != null && (
        <div className={`shud-car ${s.burning ? "fire" : s.car < 35 ? "low" : ""}`} style={{ ["--hp" as string]: Math.max(0, s.car) / 100 }} role="img" aria-label={t("Car health {n}%", { n: fmtNum(Math.max(0, s.car)) })}>
          <span aria-hidden>{s.burning ? "🔥" : "🔧"}</span>
          <i />
        </div>
      )}
      {banner && (
        <div key={s.banner!.id} className={`shud-banner ${s.banner!.kind}`} role="status">
          <b>{banner[0]}</b>
          <span>{banner[1]}</span>
        </div>
      )}
    </div>
  );
}
