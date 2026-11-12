"use client";
// Vasatyab on the 2D map: the middle, each member and a dashed line to it (GameMap.tsx, browser only —
// Leaflet can't load on the server, so this lives apart from the panel and the hook in Vasatyab.tsx).
import { Marker, Polyline } from "react-leaflet";
import { formatDistance } from "@/lib/geo";
import { t } from "@/lib/i18n";
import type { MidView } from "@/server/midpoint";
import { esc, icon } from "./mapIcons";

/** On the 2D map: each member joined by a line to the middle, the middle itself, and the gather point. */
export function VasatyabLayer({ view }: { view: MidView }) {
  const mid = view.point;
  return (
    <>
      {mid &&
        view.members.map((m) =>
          m.lat == null || m.lng == null ? null : (
            <Polyline key={`l${m.userId}`} positions={[[m.lat, m.lng], [mid.lat, mid.lng]]} interactive={false} pathOptions={{ color: "#f0c05a", weight: 2.5, opacity: 0.85, dashArray: "6 8" }} />
          ),
        )}
      {view.members.map((m) =>
        m.lat == null || m.lng == null || m.me ? null : (
          <Marker key={`m${m.userId}`} position={[m.lat, m.lng]} zIndexOffset={900} interactive={false} icon={icon(`<span class="ring" style="color:#f0c05a"></span>${esc(m.avatar)}<span class="nm">${esc(m.name)}${m.distM != null ? ` · ${esc(formatDistance(m.distM))}` : ""}</span>`, "place vasa-member", 36)} />
        ),
      )}
      {mid && (
        <Marker position={[mid.lat, mid.lng]} zIndexOffset={1000} interactive={false} icon={icon(`<span class="beacon"></span><span class="bc-pin">📍</span><span class="bc-label">${esc(t("The middle"))}</span>`, "story-beacon", 56)} />
      )}
      {view.meet && (
        <Marker position={[view.meet.lat, view.meet.lng]} zIndexOffset={1100} interactive={false} icon={icon(`<span class="beacon ok"></span><span class="bc-pin">🚩</span><span class="bc-label">${esc(view.meet.name || t("Gather point"))}</span>`, "story-beacon", 56)} />
      )}
    </>
  );
}
