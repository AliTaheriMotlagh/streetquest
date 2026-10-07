"use client";
import L from "leaflet";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { RARITY_COLOR } from "@/lib/catalog";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BUILDING_BY_KEY, FACTION_BY_KEY, SIEGE_RANGE_M, type BuildingKey } from "@/lib/rts";
import { offset } from "@/lib/geo";
import { PINGS, towerStats } from "@/lib/td";
import type { LatLng, LobbyView, Me, Selected, World } from "./client";
import { esc, icon, meIcon } from "./mapIcons";
import { LiveLayer } from "./LiveLayer";

// Default: public OSM tiles, darkened with CSS. For production traffic set
// NEXT_PUBLIC_TILE_URL to a provider you have a key for (MapTiler, Stadia, Mapbox…).
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARKEN = !process.env.NEXT_PUBLIC_TILE_URL || process.env.NEXT_PUBLIC_TILE_DARKEN === "1";


function Follow({ pos, follow, onDrag }: { pos: LatLng | null; follow: boolean; onDrag: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (pos && follow) map.panTo([pos.lat, pos.lng], { animate: true });
  }, [pos?.lat, pos?.lng, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({ dragstart: onDrag });
  return null;
}

function Clicks({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const towerColor = (t: { mine: boolean; friend: boolean }) => (t.mine ? "#22e3ff" : t.friend ? "#3dff8f" : "#ff4d4d");

type Props = {
  runners?: LobbyView["players"];
  strikeMode?: boolean;
  pos: LatLng | null;
  world: World | null;
  me: Me | null;
  follow: boolean;
  picking: boolean;
  onUnfollow: () => void;
  onMapClick: (p: LatLng) => void;
  onSelect: (s: Selected) => void;
};

export default function GameMap({ pos, world, me, follow, picking, onUnfollow, onMapClick, onSelect, runners, strikeMode }: Props) {
  const center = pos ?? { lat: 51.5074, lng: -0.1278 };
  const run = me?.activeRun;
  const tint = world ? `${world.phase}-tint` : "";

  return (
    <div className={`map ${DARKEN ? "darken" : ""} ${tint} ${picking || strikeMode ? "picking" : ""} ${strikeMode ? "striking" : ""}`}>
      <MapContainer center={[center.lat, center.lng]} zoom={17} minZoom={3} maxZoom={19} zoomControl={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={19}
        />
        <Follow pos={pos} follow={follow} onDrag={onUnfollow} />
        <Clicks onClick={onMapClick} />

        {world?.events.map((e) => (
          <Circle key={`ec${e.id}`} center={[e.lat, e.lng]} radius={e.radiusM} pathOptions={{ color: e.official ? "#ffd23f" : "#b26bff", weight: 1, fillOpacity: 0.08 }} />
        ))}

        {world?.spawns.map((s) => {
          const color = s.kind === "derrick" ? "#ffd23f" : s.item ? RARITY_COLOR[s.item.rarity] : "#22e3ff";
          const emoji = s.kind === "chest" ? "🧰" : s.kind === "run" ? "🏁" : s.kind === "arcade" ? "🕹️" : s.kind === "derrick" ? "🛢️" : s.item?.emoji ?? "❔";
          const cls = `${s.kind} ${s.item?.rarity ?? ""} ${s.claimed ? "claimed" : ""}`;
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={icon(`<span class="ring" style="color:${color}"></span>${emoji}`, cls)}
              eventHandlers={{ click: () => onSelect({ type: "spawn", data: s }) }}
            />
          );
        })}

        {world?.missions.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={icon(`<span class="ring" style="color:#ffd23f"></span>${m.item?.emoji ?? "⭐"}`, `legendary ${m.claimed ? "claimed" : ""}`, 46)}
            eventHandlers={{ click: () => onSelect({ type: "mission", data: m }) }}
          />
        ))}

        {world?.notes.map((n) => (
          <Marker key={n.id} position={[n.lat, n.lng]} icon={icon(n.unlocked ? "💬" : "📍", "note", 32)} eventHandlers={{ click: () => onSelect({ type: "note", data: n }) }} />
        ))}

        {world?.events.map((e) => (
          <Marker key={e.id} position={[e.lat, e.lng]} icon={icon(e.official ? "⭐" : "🎉", "event")} eventHandlers={{ click: () => onSelect({ type: "event", data: e }) }} />
        ))}

        {world?.deliveries.map((d) => (
          <Marker key={d.id} position={[d.pickupLat, d.pickupLng]} icon={icon("📦", "")} eventHandlers={{ click: () => onSelect({ type: "delivery", data: d }) }} />
        ))}

        {world?.bases.map((b) => {
          const f = b.faction ? FACTION_BY_KEY[b.faction] : null;
          const color = b.mine ? "#22e3ff" : b.friend ? "#3dff8f" : (f?.color ?? "#ff4d4d");
          return (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              zIndexOffset={500}
              icon={icon(
                `<span class="ring" style="color:${color}"></span>🏰<span class="nm" style="color:${color}">${esc(b.name)} · ${b.hq}</span>${b.liveMatch ? '<span class="fight">⚔️</span>' : ""}${b.shielded ? '<span class="shield">🛡️</span>' : ""}`,
                `base ${b.mine ? "mine" : ""} ${b.owner.online ? "online" : ""}`,
                48,
              )}
              eventHandlers={{ click: () => onSelect({ type: "base", data: b }) }}
            />
          );
        })}

        {world?.outposts.map((o) => {
          const f = o.owner?.faction ? FACTION_BY_KEY[o.owner.faction as keyof typeof FACTION_BY_KEY] : null;
          const color = o.mine ? "#22e3ff" : f?.color ?? "#9ca3af";
          return (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              zIndexOffset={400}
              icon={icon(`<span class="ring" style="color:${color}"></span>${o.owner ? "🚩" : "🏴"}<span class="nm" style="color:${color}">${esc(o.name.replace("Outpost ", ""))}</span>`, `outpost ${o.mine ? "mine" : ""}`, 40)}
              eventHandlers={{ click: () => onSelect({ type: "outpost", data: o }) }}
            />
          );
        })}

        {/* Base buildings, laid out around each base so you can see what a rival has built */}
        {world?.bases.flatMap((b) => {
          const list = b.buildings.filter((x) => x.type !== "hq");
          return list.map((x, i) => {
            const p = offset(b, 30 + (i % 2) * 9, (i * 360) / Math.max(1, list.length));
            const def = BUILDING_BY_KEY[x.type as BuildingKey];
            return (
              <Marker
                key={`bb${b.id}${x.type}`}
                position={[p.lat, p.lng]}
                zIndexOffset={300}
                icon={icon(`${x.building ? "🚧" : def?.emoji ?? "🏠"}<span class="lv">${Math.max(1, x.level)}</span>`, `bldg ${b.mine ? "mine" : ""}`, 24)}
                eventHandlers={{ click: () => onSelect({ type: "base", data: b }) }}
              />
            );
          });
        })}

        {/* Towers: range rings — red ones will shoot you */}
        {world?.towers.map((t) => {
          const st = towerStats(t);
          const color = towerColor(t);
          const ready = t.readyAt <= Date.now();
          return (
            <Circle
              key={`tr${t.id}`}
              center={[t.lat, t.lng]}
              radius={st.range}
              pathOptions={{ color, weight: 1, opacity: ready ? 0.5 : 0.2, fillOpacity: !t.mine && !t.friend && ready ? 0.08 : 0.03, dashArray: ready ? undefined : "3 6" }}
            />
          );
        })}
        {world?.towers.map((t) => {
          const st = towerStats(t);
          const color = towerColor(t);
          const ready = t.readyAt <= Date.now();
          return (
            <Marker
              key={`tw${t.id}`}
              position={[t.lat, t.lng]}
              zIndexOffset={450}
              icon={icon(
                `<span class="ring" style="color:${color}"></span>${ready ? st.def.emoji : "🚧"}<span class="lv">${"▲".repeat(t.level)}</span><span class="hpbar"><i style="width:${Math.max(0, Math.min(100, (t.hp / st.maxHp) * 100))}%;background:${color}"></i></span>`,
                `tower ${t.mine ? "mine" : t.friend ? "friend" : "enemy"}`,
                34,
              )}
              eventHandlers={{ click: () => onSelect({ type: "tower", data: t }) }}
            />
          );
        })}

        {world?.pings.map((p) => (
          <Marker
            key={`pg${p.id}`}
            position={[p.lat, p.lng]}
            zIndexOffset={900}
            icon={icon(`${PINGS[p.kind]?.emoji ?? "📍"}<span class="nm">${esc(p.by)}</span>`, "ping", 40)}
            eventHandlers={{ click: () => onSelect({ type: "ping", data: p }) }}
          />
        ))}

        <LiveLayer world={world} me={me} runners={runners} onSelect={onSelect} />

        {me?.base && <Circle center={[me.base.lat, me.base.lng]} radius={SIEGE_RANGE_M} pathOptions={{ color: "#22e3ff", weight: 1, opacity: 0.25, fill: false, dashArray: "2 10" }} />}

        {world?.bosses.map((b) => (
          <Marker
            key={b.id}
            position={[b.lat, b.lng]}
            zIndexOffset={600}
            icon={icon(
              `<span class="ring" style="color:${b.def.color}"></span>${b.def.emoji}<span class="hpbar"><i style="width:${(b.hp / b.maxHp) * 100}%"></i></span>${b.liveMatch ? '<span class="fight">⚔️</span>' : ""}`,
              "boss",
              60,
            )}
            eventHandlers={{ click: () => onSelect({ type: "boss", data: b }) }}
          />
        ))}

        {world?.players.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icon(`${esc(p.avatar)}<span class="nm">${esc(p.username)} · ${p.level}</span>`, `player ${p.friend ? "friend" : ""}`, 34)}
            eventHandlers={{ click: () => onSelect({ type: "player", data: p }) }}
          />
        ))}

        {run && (
          <>
            <Marker position={[run.targetLat, run.targetLng]} icon={icon("🎯", "target", 46)} />
            <Circle center={[run.targetLat, run.targetLng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#ff2e88", weight: 2, fillOpacity: 0.15 }} />
            {pos && <Polyline positions={[[pos.lat, pos.lng], [run.targetLat, run.targetLng]]} pathOptions={{ color: "#ff2e88", dashArray: "8 10", weight: 3 }} />}
          </>
        )}

        {pos && (
          <>
            <Circle center={[pos.lat, pos.lng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#22e3ff", weight: 1, fillOpacity: 0.06, dashArray: "4 6" }} />
            <Marker position={[pos.lat, pos.lng]} icon={meIcon} zIndexOffset={1000} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
