"use client";
// Explore mode's bar: says you're only looking (nothing here can be picked up), quick
// jumps to cities and the north, and the way back to your own spot.
import { t } from "@/lib/i18n";
import { EXPLORE_PLACES } from "@/lib/explore";
import type { LatLng } from "@/lib/geo";
import { Button } from "@/components/Button";

export function ExploreBar({ onJump, onExit, hasMe }: { onJump: (at: LatLng) => void; onExit: () => void; hasMe: boolean }) {
  return (
    <div className="explore-bar" role="region" aria-label={t("Exploring the map")}>
      <div className="explore-head">
        <span aria-hidden>🧭</span>
        <span className="grow">
          <b>{t("Exploring the map")}</b>
          <span className="small muted"> · {t("look around anywhere — stores, menus, ads and players load where the map is; picking things up still needs you there")}</span>
        </span>
        <Button className="btn small cyan" onClick={onExit}>
          {hasMe ? `◎ ${t("Back to me")}` : t("Done")}
        </Button>
      </div>
      <div className="explore-chips" role="list">
        {EXPLORE_PLACES.map((p) => (
          <Button key={p.id} role="listitem" className="chip small" onClick={() => onJump(p)}>
            {t(p.name)}
          </Button>
        ))}
      </div>
    </div>
  );
}
