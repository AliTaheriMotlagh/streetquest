"use client";
import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { PLACE_CATS } from "@/lib/places";
import { fmtNum, t } from "@/lib/i18n";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import type { GpsView, LatLng, Me, Selected, World, WorldPlayer } from "./client";
import { esc, icon } from "./mapIcons";
import { PlayerLayer, type Guide } from "./PlayerLayer";
import { OthersLayer } from "./OthersLayer";
import { cellFor, cluster, groupBounds, lodFor, type Group, type Lod } from "./mapLod";
import { nearby } from "./location/nearby";
import { getLocation } from "./useLocation";
import { isLite, isTouch, probeFrameRate } from "../perf";

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

type Props = {
  /** fantasy: illustrated storybook map · dark: night-ops · classic: plain street map. */
  look?: "fantasy" | "dark" | "classic";
  travelTo?: LatLng | null;
  game?: GpsView | null;
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

const GOLD = "#f0c05a";

/** Dashed lines from the player to wherever they're headed (drawn by PlayerLayer). */
function guidesFor(run: Me["activeRun"] | undefined, game: GpsView | null | undefined, travelTo: LatLng | null | undefined): Guide[] {
  const out: Guide[] = [];
  if (run) out.push({ to: { lat: run.targetLat, lng: run.targetLng }, color: "#ee7fae", dash: "8 10", weight: 3 });
  const next = game?.points && game.next != null ? game.points[game.next] : null;
  if (next) out.push({ to: next, color: GOLD, dash: "8 10", weight: 3 });
  if (game?.target) out.push({ to: game.target, color: GOLD, dash: "10 10", weight: 4, opacity: 0.9 });
  if (game?.area) out.push({ to: game.area.center, color: GOLD, dash: "10 10", weight: 3, opacity: 0.7 });
  if (travelTo) out.push({ to: travelTo, color: "#5bd38c", dash: "6 8", weight: 3 });
  return out;
}

function GameMap({ world, me, follow, picking, onUnfollow, onFollow, onMapClick, onSelect, game, travelTo, look = "fantasy" }: Props) {
  // Only the first position matters here; PlayerLayer follows the player after that.
  const center = getLocation().pos ?? { lat: 51.5074, lng: -0.1278 };
  const run = me?.activeRun;
  const tint = world ? `${world.phase}-tint` : "";
  const guides = useMemo(() => guidesFor(run, game, travelTo), [run, game, travelTo]);
  // Read once per mount: tile fading gives every tile its own GPU layer (will-change),
  // which is what made panning and rotating stutter on Android and ate RAM.
  const [tuning] = useState(() => ({ touch: isTouch(), lite: isLite() }));
  // Phones that hide their RAM get measured instead: a janky map drops to lite.
  useEffect(() => (tuning.touch ? probeFrameRate() : undefined), [tuning.touch]);

  return (
    <div className={`map ${look === "dark" && DARKEN ? "darken" : ""} ${look === "fantasy" ? "fantasy" : ""} ${tint} ${picking ? "picking" : ""}`}>
      <MapContainer
        preferCanvas
        center={[center.lat, center.lng]}
        zoom={17}
        minZoom={3}
        maxZoom={19}
        zoomControl={false}
        fadeAnimation={!tuning.touch}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} keepBuffer={tuning.lite ? 1 : 2} updateWhenZooming={false} />
        <PlayerLayer follow={follow} guides={guides} onUnfollow={onUnfollow} onFollow={onFollow} />
        <FrameTarget target={game?.target ?? game?.area?.center ?? (game?.points && game.next != null ? game.points[game.next] : null) ?? null} />
        <Clicks onClick={onMapClick} />
        <Layers world={world} me={me} game={game} travelTo={travelTo} onSelect={onSelect} onUnfollow={onUnfollow} />
      </MapContainer>
      {look === "fantasy" && (
        <div className="fantasy-fx" aria-hidden>
          <i className="cloud c1" />
          <i className="cloud c2" />
          <i className="cloud c3" />
          <span className="compass-rose" />
        </div>
      )}
    </div>
  );
}

/**
 * Zoom + a generously padded viewport. Updates on zoom, or once the view pans out of
 * the padded area — not on every follow-pan, so walking doesn't re-render the markers.
 */
function useMapView() {
  const map = useMap();
  const read = useCallback(() => ({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.6) }), [map]);
  const [view, setView] = useState(read);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const v = viewRef.current;
      if (map.getZoom() !== v.zoom || !v.bounds.contains(map.getBounds())) setView(read());
    };
    // Rotation and URL-bar resizes fire bursts of events: handle at most one per frame.
    const later = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    map.on("moveend zoomend resize", later);
    return () => {
      map.off("moveend zoomend resize", later);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map, read]);
  return view;
}

/** Money level ring colours (0 = free; the rest are bought in the wallet). */
const TIER_COLORS = ["#5bd38c", "#4cb8ff", "#b77dff", "#ff6b6b"];

/**
 * What the map shows: money to pick up and stores with a mission (the server sends only
 * the nearest few), other players, and where you're headed. Nothing else.
 */
function Layers({ world, me, game, travelTo, onSelect, onUnfollow }: Pick<Props, "world" | "me" | "game" | "travelTo" | "onSelect" | "onUnfollow">) {
  const map = useMap();
  const view = useMapView();
  const lod: Lod = lodFor(view.zoom);
  // Street level only merges markers that really sit on top of each other.
  const cell = cellFor(view.zoom);
  const run = me?.activeRun;

  // Labels, sizes and animations per zoom level are pure CSS (see .lod-* in globals.css).
  useEffect(() => {
    const el = map.getContainer();
    el.classList.remove("lod-near", "lod-mid", "lod-far");
    el.classList.add(`lod-${lod}`);
  }, [map, lod]);

  const zoomInto = useCallback(
    (g: Group<{ lat: number; lng: number }>) => {
      onUnfollow();
      map.fitBounds(groupBounds(g).pad(0.4), { maxZoom: Math.max(map.getZoom() + 2, 16), animate: true });
    },
    [map, onUnfollow],
  );
  const clusterIcon = (emoji: string, n: number, cls: string) => icon(`<span class="ring"></span>${emoji}<span class="cl-n">${n > 99 ? "99+" : n}</span>`, `cluster ${cls}`, 42);

  // Other players further out: grouped. At street level OthersLayer animates them.
  const playerGroups = useMemo(() => {
    if (!world || lod === "near") return [];
    const live = new Map(nearby.list().map((n) => [n.id, n.last]));
    const list = world.players.map((p) => {
      const l = live.get(p.id);
      return l ? { ...p, lat: l.lat, lng: l.lng } : p;
    });
    return cluster(list.filter((p) => view.bounds.contains([p.lat, p.lng])), view.zoom, cell, "pl");
  }, [world, view, lod, cell]);

  const playerMarker = (p: WorldPlayer) => (
    <Marker
      key={p.id}
      position={[p.lat, p.lng]}
      icon={icon(`${esc(p.avatar)}<span class="nm">${p.home ? "🛋️ " : ""}${esc(p.username)} · ${fmtNum(p.level)}</span>`, `player ${p.friend ? "friend" : ""}`, 34)}
      eventHandlers={{ click: () => onSelect({ type: "player", data: p }) }}
    />
  );

  return (
    <>
      {/* Money: green bills, then blue, purple, red for bigger money levels, gold for admin drops; the amount shows at street level. */}
      {world?.money.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          zIndexOffset={m.drop ? 800 : 600 + Math.min(3, m.tier ?? 0) * 50}
          icon={icon(`<span class="ring" style="color:${m.drop ? "#f0c05a" : TIER_COLORS[Math.min(TIER_COLORS.length - 1, m.tier ?? 0)]}"></span>💵<span class="nm">${esc(t("{n} toman", { n: m.amount }))}</span>`, `money ${m.drop ? "drop legendary" : m.tier ? `tier tier${Math.min(3, m.tier)}` : ""}`, m.drop ? 48 : m.tier ? 46 : 42)}
          eventHandlers={{ click: () => onSelect({ type: "money", data: m }) }}
        />
      ))}

      {/* Store missions: the burger delivery starts at the real burger joint. */}
      {world?.places.map((m) => {
        const cat = PLACE_CATS[m.place.cat] ?? PLACE_CATS.shop;
        return (
          <Marker
            key={`pl${m.id}`}
            position={[m.place.lat, m.place.lng]}
            zIndexOffset={320}
            icon={icon(
              `<span class="ring" style="color:${cat.color}"></span>${cat.emoji}<span class="nm">${esc(m.place.name)}</span><span class="job">${m.kind === "deliver" ? "📦" : "✅"}</span>`,
              "place",
              40,
            )}
            eventHandlers={{ click: () => onSelect({ type: "place", data: m }) }}
          />
        );
      })}

      {/* Real businesses that joined: their own sign, gold when featured. */}
      {world?.businesses.map((b) => {
        const open = b.campaigns.filter((c) => !c.visited).length;
        const best = b.campaigns.reduce((n, c) => Math.max(n, c.rewardCoins), 0);
        return (
          <Marker
            key={`bz${b.id}`}
            position={[b.lat, b.lng]}
            zIndexOffset={b.featured ? 700 : 360}
            icon={icon(
              `<span class="ring" style="color:${b.featured ? "#f0c05a" : b.mine ? "#63b3f2" : "#ff7ad9"}"></span>${esc(b.emoji)}<span class="nm">${esc(b.name)}</span>${open && !b.mine ? `<span class="deal">+${fmtNum(best)} 🪙</span>` : ""}${b.verified ? '<span class="shield">✔</span>' : ""}`,
              `biz ${b.featured ? "featured" : ""} ${open ? "" : "claimed"}`,
              b.featured ? 50 : 42,
            )}
            eventHandlers={{ click: () => onSelect({ type: "biz", data: b }) }}
          />
        );
      })}

      {/* Other players: animated + live at street level, grouped further out */}
      {lod === "near" && world && <OthersLayer players={world.players} onSelect={onSelect} />}
      {playerGroups.map((g) =>
        g.items.length === 1 ? playerMarker(g.items[0]) : <Marker key={g.key} position={[g.lat, g.lng]} zIndexOffset={850} icon={clusterIcon("👥", g.items.length, "players")} eventHandlers={{ click: () => zoomInto(g) }} />,
      )}

      {/* A store delivery under way: the drop-off. */}
      {run && (
        <>
          <Marker position={[run.targetLat, run.targetLng]} icon={icon("🎯", "target", 46)} />
          <Circle center={[run.targetLat, run.targetLng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#ee7fae", weight: 2, fillOpacity: 0.15 }} />
        </>
      )}

      {/* GPS games & story: visible waypoints, rally checkpoints, hold zones */}
      {game?.points?.map((p, i) => (
        <Marker key={`rp${i}`} position={[p.lat, p.lng]} zIndexOffset={1200} icon={icon(`<span class="ring" style="color:${i === game.next ? "#f0c05a" : i < (game.next ?? 0) ? "#5bd38c" : "#9ca3af"}"></span>${i < (game.next ?? 0) ? "✅" : "🏁"}<span class="nm">${i + 1}</span>`, `quest-pt ${i === game.next ? "next" : ""}`, 40)} />
      ))}
      {/* Story / GPS waypoints: a gold beacon you can't miss, with what to do there */}
      {game?.target && (
        <>
          <Circle center={[game.target.lat, game.target.lng]} radius={INTERACT_RADIUS_M} pathOptions={{ color: "#f0c05a", weight: 3, fillOpacity: 0.14 }} />
          <Marker position={[game.target.lat, game.target.lng]} zIndexOffset={1300} icon={icon(`<span class="beacon"></span><span class="bc-pin">${game.kind === "story" ? "📖" : "📍"}</span><span class="bc-label">${esc(game.kind === "story" ? t("GO HERE · {n}/{total}", { n: (game.step ?? 0) + 1, total: game.steps ?? 0 }) : t("GO HERE"))}</span>`, "story-beacon", 56)} />
        </>
      )}
      {game?.area && (
        <>
          <Circle center={[game.area.center.lat, game.area.center.lng]} radius={game.area.radius} pathOptions={{ color: "#f0c05a", weight: 3, fillOpacity: 0.12, dashArray: "8 8" }} />
          <Marker position={[game.area.center.lat, game.area.center.lng]} zIndexOffset={1300} interactive={false} icon={icon(`<span class="beacon"></span><span class="bc-pin">🔍</span><span class="bc-label">${esc(t("SEARCH HERE · {n}/{total}", { n: (game.step ?? 0) + 1, total: game.steps ?? 0 }))}</span>`, "story-beacon", 56)} />
        </>
      )}
      {game?.hold && game.center && (
        <>
          <Circle center={[game.center.lat, game.center.lng]} radius={game.hold.radius} pathOptions={{ color: game.hold.inside ? "#5bd38c" : "#ef6461", weight: 3, fillOpacity: 0.12, dashArray: "6 6" }} />
          <Marker position={[game.center.lat, game.center.lng]} zIndexOffset={1300} interactive={false} icon={icon(`<span class="beacon ${game.hold.inside ? "ok" : ""}"></span><span class="bc-pin">🛡️</span><span class="bc-label">${esc(t("HOLD HERE · {n}/{total}", { n: (game.step ?? 0) + 1, total: game.steps ?? 0 }))}</span>`, "story-beacon", 56)} />
        </>
      )}

      {/* Play from home: where the commander is travelling to */}
      {travelTo && <Marker position={[travelTo.lat, travelTo.lng]} zIndexOffset={1100} interactive={false} icon={icon(`<span class="ring" style="color:#5bd38c"></span>📍`, "quest-pt next", 36)} />}
    </>
  );
}
