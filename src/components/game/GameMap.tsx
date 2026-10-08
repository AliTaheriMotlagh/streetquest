"use client";
import L from "leaflet";
import { memo, useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { RARITY_COLOR } from "@/lib/catalog";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BUILDING_BY_KEY, FACTION_BY_KEY, SIEGE_RANGE_M, type BuildingKey } from "@/lib/rts";
import { offset } from "@/lib/geo";
import { PINGS, towerStats } from "@/lib/td";
import type { GpsView, LatLng, LobbyView, Me, Selected, World } from "./client";
import { esc, icon } from "./mapIcons";
import { LiveLayer } from "./LiveLayer";
import { PlayerLayer, type Guide } from "./PlayerLayer";
import { getLocation } from "./useLocation";

// Default: public OSM tiles, darkened with CSS. For production traffic set
// NEXT_PUBLIC_TILE_URL to a provider you have a key for (MapTiler, Stadia, Mapbox…).
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARKEN = !process.env.NEXT_PUBLIC_TILE_URL || process.env.NEXT_PUBLIC_TILE_DARKEN === "1";


/** When a new waypoint appears, zoom out so both you and it are on screen. */
function FrameTarget({ target }: { target: LatLng | null }) {
  const map = useMap();
  const key = target ? `${target.lat.toFixed(5)},${target.lng.toFixed(5)}` : "";
  useEffect(() => {
    const pos = getLocation().pos;
    if (!pos || !target) return;
    map.fitBounds(L.latLngBounds([pos.lat, pos.lng], [target.lat, target.lng]), { paddingTopLeft: [40, 110], paddingBottomRight: [80, 260], maxZoom: 17, animate: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Clicks({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const towerColor = (t: { mine: boolean; friend: boolean }) => (t.mine ? "#22e3ff" : t.friend ? "#3dff8f" : "#ff4d4d");

type Props = {
  travelTo?: LatLng | null;
  game?: GpsView | null;
  runners?: LobbyView["players"];
  strikeMode?: boolean;
  world: World | null;
  me: Me | null;
  follow: boolean;
  picking: boolean;
  onUnfollow: () => void;
  onFollow: () => void;
  onMapClick: (p: LatLng) => void;
  onSelect: (s: Selected) => void;
};

export default memo(GameMap);

const GOLD = "#ffd23f";

/** Dashed lines from the player to wherever they're headed (drawn by PlayerLayer). */
function guidesFor(run: Me["activeRun"] | undefined, game: GpsView | null | undefined, travelTo: LatLng | null | undefined): Guide[] {
  const out: Guide[] = [];
  if (run) out.push({ to: { lat: run.targetLat, lng: run.targetLng }, color: "#ff2e88", dash: "8 10", weight: 3 });
  const next = game?.points && game.next != null ? game.points[game.next] : null;
  if (next) out.push({ to: next, color: GOLD, dash: "8 10", weight: 3 });
  if (game?.target) out.push({ to: game.target, color: GOLD, dash: "10 10", weight: 4, opacity: 0.9 });
  if (game?.area) out.push({ to: game.area.center, color: GOLD, dash: "10 10", weight: 3, opacity: 0.7 });
  if (travelTo) out.push({ to: travelTo, color: "#3dff8f", dash: "6 8", weight: 3 });
  return out;
}

function GameMap({ world, me, follow, picking, onUnfollow, onFollow, onMapClick, onSelect, runners, strikeMode, game, travelTo }: Props) {
  // Only the first position matters here; PlayerLayer follows the player after that.
  const center = getLocation().pos ?? { lat: 51.5074, lng: -0.1278 };
  const run = me?.activeRun;
  const tint = world ? `${world.phase}-tint` : "";
  const guides = useMemo(() => guidesFor(run, game, travelTo), [run, game, travelTo]);

  return (
    <div className={`map ${DARKEN ? "darken" : ""} ${tint} ${picking || strikeMode ? "picking" : ""} ${strikeMode ? "striking" : ""}`}>
      <MapContainer preferCanvas center={[center.lat, center.lng]} zoom={17} minZoom={3} maxZoom={19} zoomControl={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={19}
        />
        <PlayerLayer follow={follow} guides={guides} onUnfollow={onUnfollow} onFollow={onFollow} />
        <FrameTarget target={game?.target ?? game?.area?.center ?? (game?.points && game.next != null ? game.points[game.next] : null) ?? null} />
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

        {/* King-of-the-hill flags */}
        {world?.flags.map((f) => {
          const color = f.mine ? "#22e3ff" : f.friend ? "#3dff8f" : "#ff4d4d";
          return (
            <Marker
              key={`fl${f.id}`}
              position={[f.lat, f.lng]}
              zIndexOffset={480}
              icon={icon(
                `<span class="ring" style="color:${color}"></span>🚩<span class="nm" style="color:${color}">${esc(f.name)}</span>${f.capture ? '<span class="cap">⚔️</span>' : ""}`,
                `flag ${f.capture ? "contested" : ""}`,
                40,
              )}
              eventHandlers={{ click: () => onSelect({ type: "flag", data: f }) }}
            />
          );
        })}

        {/* Superweapon strikes: public target circle + countdown, then the fallout zone */}
        {world?.strikes.map((x) => (
          <Circle
            key={`sw${x.id}`}
            center={[x.lat, x.lng]}
            radius={x.radius}
            pathOptions={{ color: x.resolved ? "#a3e635" : "#ff2e2e", weight: 3, dashArray: x.resolved ? "4 8" : undefined, fillOpacity: x.resolved ? 0.12 : 0.18 }}
            eventHandlers={{ click: () => onSelect({ type: "strike", data: x }) }}
          />
        ))}

        {world?.players.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icon(`${esc(p.avatar)}<span class="nm">${p.home ? "🛋️ " : ""}${esc(p.username)} · ${p.level}</span>${p.bounty ? `<span class="wanted">💀${p.bounty}</span>` : ""}`, `player ${p.friend ? "friend" : ""} ${p.bounty ? "is-wanted" : ""}`, 34)}
            eventHandlers={{ click: () => onSelect({ type: "player", data: p }) }}
          />
        ))}

        {run && (
          <>
            <Marker position={[run.targetLat, run.targetLng]} icon={icon("🎯", "target", 46)} />
            <Circle center={[run.targetLat, run.targetLng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#ff2e88", weight: 2, fillOpacity: 0.15 }} />
          </>
        )}

        {/* GPS games & story: visible waypoints, rally checkpoints, hold zones */}
        {game?.points?.map((p, i) => (
          <Marker key={`rp${i}`} position={[p.lat, p.lng]} zIndexOffset={1200} icon={icon(`<span class="ring" style="color:${i === game.next ? "#ffd23f" : i < (game.next ?? 0) ? "#3dff8f" : "#9ca3af"}"></span>${i < (game.next ?? 0) ? "✅" : "🏁"}<span class="nm">${i + 1}</span>`, `quest-pt ${i === game.next ? "next" : ""}`, 40)} />
        ))}
        {/* Story / GPS waypoints: a gold beacon you can't miss, with what to do there */}
        {game?.target && (
          <>
            <Circle center={[game.target.lat, game.target.lng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#ffd23f", weight: 3, fillOpacity: 0.14 }} />
            <Marker position={[game.target.lat, game.target.lng]} zIndexOffset={1300} icon={icon(`<span class="beacon"></span><span class="bc-pin">${game.kind === "story" ? "📖" : "📍"}</span><span class="bc-label">${game.kind === "story" ? `GO HERE · ${(game.step ?? 0) + 1}/${game.steps}` : "GO HERE"}</span>`, "story-beacon", 56)} />
          </>
        )}
        {game?.area && (
          <>
            <Circle center={[game.area.center.lat, game.area.center.lng]} radius={game.area.radius} pathOptions={{ color: "#ffd23f", weight: 3, fillOpacity: 0.12, dashArray: "8 8" }} />
            <Marker position={[game.area.center.lat, game.area.center.lng]} zIndexOffset={1300} interactive={false} icon={icon(`<span class="beacon"></span><span class="bc-pin">🔍</span><span class="bc-label">SEARCH HERE · ${(game.step ?? 0) + 1}/${game.steps}</span>`, "story-beacon", 56)} />
          </>
        )}
        {game?.hold && game.center && (
          <>
            <Circle center={[game.center.lat, game.center.lng]} radius={game.hold.radius} pathOptions={{ color: game.hold.inside ? "#3dff8f" : "#ff4d4d", weight: 3, fillOpacity: 0.12, dashArray: "6 6" }} />
            <Marker position={[game.center.lat, game.center.lng]} zIndexOffset={1300} interactive={false} icon={icon(`<span class="beacon ${game.hold.inside ? "ok" : ""}"></span><span class="bc-pin">🛡️</span><span class="bc-label">HOLD HERE · ${(game.step ?? 0) + 1}/${game.steps}</span>`, "story-beacon", 56)} />
          </>
        )}

        {/* Play from home: where the commander is travelling to */}
        {travelTo && <Marker position={[travelTo.lat, travelTo.lng]} zIndexOffset={1100} interactive={false} icon={icon(`<span class="ring" style="color:#3dff8f"></span>📍`, "quest-pt next", 36)} />}
      </MapContainer>
    </div>
  );
}
