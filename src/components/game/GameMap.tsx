"use client";
import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { PLACE_CATS } from "@/lib/places";
import { fmtNum, t } from "@/lib/i18n";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import { distanceM } from "@/lib/geo";
import { CONGESTION_COLORS, congestion, type TrafficCellOut } from "@/lib/traffic";
import { VENDOR_KINDS, type DivarArea, type TorobPlace, type Vendor } from "@/lib/localData";
import type { LiveRoute } from "@/server/traffic";
import { api, type GpsView, type LatLng, type Me, type Selected, type World, type WorldPlayer, type WorldSpot } from "./client";
import { esc, icon } from "./mapIcons";
import { PlayerLayer, type Guide } from "./PlayerLayer";
import { OthersLayer } from "./OthersLayer";
import { cellFor, cluster, groupBounds, lodFor, NO_CLUSTER_ZOOM, type Group, type Lod } from "./mapLod";
import { declutter, labelPx, type Mark } from "./declutter";
import { nearby } from "./location/nearby";
import { getLocation } from "./useLocation";
import { isLite, isTouch, probeFrameRate } from "../perf";
import { DEFAULT_STYLE, DEFAULT_TILES, type MapStyle } from "./mapStyles";

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
  /** Tiles + filter the map is drawn with (mapStyles.ts). */
  look?: MapStyle;
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
  /**
   * The style's tiles all fail (e.g. the provider blocks this country): say so, once.
   * `fellBack`: the style has a keyless stand-in, which the map now shows instead.
   */
  onTilesFail?: (look: MapStyle, fellBack: boolean) => void;
  /** Snappfood vendors the player chose to see (⋯ → On the map). */
  vendors?: Vendor[];
  /** Real places with no job right now: plain signs (⋯ → On the map → Places). */
  spots?: WorldSpot[];
  /** Divar neighbourhoods around, each pinned with its latest ads. */
  divar?: DivarArea[];
  /** Torob's walk-in stores around (tap for the store's own catalog). */
  torob?: TorobPlace[];
  /** Live traffic on the roads, coloured by speed. */
  traffic?: boolean;
  /** The route being followed (🧭), drawn as a line to its end. */
  route?: (LiveRoute & { to: LatLng }) | null;
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

function GameMap({ world, me, follow, picking, onUnfollow, onFollow, onMapClick, onSelect, game, travelTo, vendors, spots, divar, torob, traffic, route, look = DEFAULT_STYLE, onTilesFail }: Props) {
  // Only the first position matters here; PlayerLayer follows the player after that.
  const center = getLocation().pos ?? { lat: 51.5074, lng: -0.1278 };
  const run = me?.activeRun;
  const tint = world ? `${world.phase}-tint` : "";
  const guides = useMemo(() => guidesFor(run, game, travelTo), [run, game, travelTo]);
  // Read once per mount: tile fading gives every tile its own GPU layer (will-change),
  // which is what made panning and rotating stutter on Android and ate RAM.
  const [tuning] = useState(() => ({ touch: isTouch(), lite: isLite() }));
  // A style whose provider can't be reached switches to its stand-in (until another style is picked).
  const [fellBack, setFellBack] = useState<string | null>(null);
  const onFallback = fellBack === look.id && !!look.fallback;
  const tiles = onFallback ? look.fallback! : look.tiles ?? DEFAULT_TILES;
  const layerKey = `${look.id}${onFallback ? "-fallback" : ""}`;
  // Counted per style: a phone screen asks for ~8 tiles, so 4 errors before any loads means the provider is unreachable.
  const health = useRef({ id: "", ok: 0, bad: 0, told: false });
  if (health.current.id !== layerKey) health.current = { id: layerKey, ok: 0, bad: 0, told: false };
  const tileEvents = useMemo(
    () => ({
      tileload: () => void health.current.ok++,
      tileerror: () => {
        const h = health.current;
        if (++h.bad < 4 || h.ok || h.told) return;
        h.told = true;
        const swap = !!look.fallback && !onFallback;
        if (swap) setFellBack(look.id);
        onTilesFail?.(look, swap);
      },
    }),
    [look, onTilesFail, onFallback],
  );
  // Phones that hide their RAM get measured instead: a janky map drops to lite.
  useEffect(() => (tuning.touch ? probeFrameRate() : undefined), [tuning.touch]);

  return (
    <div className={`map ${look.css ?? ""} ${tint} ${picking ? "picking" : ""}`}>
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
        {/* Keyed: a TileLayer only follows a new url, not new subdomains or zoom limits. */}
        <TileLayer key={layerKey} eventHandlers={tileEvents} url={tiles.url} attribution={tiles.attribution} subdomains={tiles.subdomains ?? "abc"} maxNativeZoom={tiles.maxNativeZoom} maxZoom={19} keepBuffer={tuning.lite ? 1 : 2} updateWhenZooming={false} />
        {look.labels && !onFallback && <TileLayer key={`${look.id}-labels`} className="labels" url={look.labels.url} attribution={look.labels.attribution} maxNativeZoom={look.labels.maxNativeZoom} maxZoom={19} keepBuffer={tuning.lite ? 1 : 2} updateWhenZooming={false} />}
        {traffic && <TrafficLayer />}
        {route && <RouteLine route={route} />}
        <PlayerLayer follow={follow} guides={guides} onUnfollow={onUnfollow} onFollow={onFollow} />
        <FrameTarget target={game?.target ?? game?.area?.center ?? (game?.points && game.next != null ? game.points[game.next] : null) ?? null} />
        <Clicks onClick={onMapClick} />
        <Layers world={world} me={me} game={game} travelTo={travelTo} vendors={vendors} spots={spots} divar={divar} torob={torob} onSelect={onSelect} onUnfollow={onUnfollow} lite={tuning.lite} />
      </MapContainer>
      {look.fx && (
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

/** A road's usual free-flowing speed when we don't know its kind (km/h): Tehran's main streets. */
const TRAFFIC_FREE_KMH = 50;
/** Snappfood rates out of 10: vendors at least this good get a ⭐ on their sign. */
const TOP_RATING = 9.3;
/** Money or a store job, as the game layer clusters them. */
type GameItem = { id: string; lat: number; lng: number; m?: World["money"][number]; j?: World["places"][number] };
/** Game markers are bigger than most: they group a little more loosely. */
const GAME_SPACING = 1.5;
/** A real place, a Snappfood vendor or a walk-in Torob store, as the points-of-interest layer clusters them. */
type Poi = { id: string; lat: number; lng: number; v?: Vendor; p?: WorldSpot; tp?: TorobPlace };
/** Places and vendors cluster this much more loosely than other markers (their signs are wider). */
const POI_SPACING = 1.35;
/** Full markers on screen at most (more and the furthest places become dots): a phone stays smooth with everything on. */
const MARKER_BUDGET = { lite: 60, full: 120 };
/** A crowded place's dot, in its layer's colour. */
const DOT_R = 5;
/** Half a traffic dash's length, and how far each direction sits to its right of the road's middle (m). */
const DASH_M = 22, SIDE_M = 4;

/**
 * Live traffic around the middle of the map: short dashes along each ~50 m of road and
 * direction, green → dark red by speed (/api/traffic: players' GPS and Neshan's live
 * routing). Drawn on one canvas, refreshed every minute and after a long pan; hidden
 * when zoomed out to the whole city.
 */
function TrafficLayer() {
  const map = useMap();
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.3 });
    const group = L.layerGroup().addTo(map);
    let last: (LatLng & { at: number }) | null = null;
    let live = true;
    const load = async (force = false) => {
      if (document.visibilityState === "hidden") return;
      if (map.getZoom() < 13) {
        group.clearLayers();
        last = null;
        return;
      }
      const c = map.getCenter();
      if (!force && last && distanceM(last, c) < 700) return;
      last = { lat: c.lat, lng: c.lng, at: Date.now() };
      const r = await api<{ cells: TrafficCellOut[] }>(`/api/traffic?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`).catch(() => null);
      if (!live || !r) return;
      group.clearLayers();
      for (const [lat, lng, dir, kmh] of r.cells) {
        const a = (dir * Math.PI) / 4, kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 110_540;
        // Along the road (bearing a), and a step to its right so both directions show.
        const ax = Math.sin(a), ay = Math.cos(a), sx = Math.cos(a) * SIDE_M, sy = -Math.sin(a) * SIDE_M;
        const at = (k: number): [number, number] => [lat + (ay * DASH_M * k + sy) / ky, lng + (ax * DASH_M * k + sx) / kx];
        L.polyline([at(-1), at(1)], { renderer, color: CONGESTION_COLORS[congestion(kmh, TRAFFIC_FREE_KMH)], weight: 5, opacity: 0.85, lineCap: "round", interactive: false }).addTo(group);
      }
    };
    void load(true);
    const timer = setInterval(() => void load(true), 60_000);
    const moved = () => void load();
    map.on("moveend zoomend", moved);
    return () => {
      live = false;
      clearInterval(timer);
      map.off("moveend zoomend", moved);
      group.remove();
    };
  }, [map]);
  return null;
}

/** The route being followed: a cased blue line to the end, and the finish flag. */
function RouteLine({ route }: { route: LiveRoute & { to: LatLng } }) {
  const line = route.line;
  return (
    <>
      <Polyline positions={line} interactive={false} pathOptions={{ color: "#0b3d91", weight: 10, opacity: 0.55, lineCap: "round", lineJoin: "round" }} />
      <Polyline positions={line} interactive={false} pathOptions={{ color: "#4cb8ff", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
      <Marker position={[route.to.lat, route.to.lng]} zIndexOffset={1150} interactive={false} icon={icon(`<span class="ring" style="color:#4cb8ff"></span>🏁`, "quest-pt next", 38)} />
    </>
  );
}

/** Money level ring colours (0 = free; the rest are bought in the wallet). */
const TIER_COLORS = ["#5bd38c", "#4cb8ff", "#b77dff", "#ff6b6b"];

/**
 * What the map shows, from top to bottom: where you're headed, other players, money to
 * pick up and stores with a job (the server sends only the nearest few), businesses,
 * Divar neighbourhoods, then every real place and Snappfood vendor around. Each layer
 * groups what would overlap into a bubble, and nothing groups from street level on.
 */
function Layers({ world, me, game, travelTo, vendors, spots, divar, torob, onSelect, onUnfollow, lite }: Pick<Props, "world" | "me" | "game" | "travelTo" | "vendors" | "spots" | "divar" | "torob" | "onSelect" | "onUnfollow"> & { lite: boolean }) {
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
    // Street level, nothing grouped: room for every place's name.
    el.classList.toggle("lod-street", view.zoom >= NO_CLUSTER_ZOOM);
  }, [map, lod, view.zoom]);

  const zoomInto = useCallback(
    (g: Group<{ lat: number; lng: number }>) => {
      onUnfollow();
      map.fitBounds(groupBounds(g).pad(0.4), { maxZoom: Math.max(map.getZoom() + 2, 16), animate: true });
    },
    [map, onUnfollow],
  );
  const clusterIcon = (emoji: string, n: number, cls: string, size = 42) => icon(`<span class="ring"></span>${emoji}<span class="cl-n">${n > 99 ? "99+" : n}</span>`, `cluster ${cls}`, size);

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

  // Places, Snappfood vendors and Torob's walk-in stores (hundreds around you) are one layer, grouped together so
  // their bubbles never stack, a little more loosely than the rest (their signs are wider),
  // and left out at city zoom, where the map is about the game.
  const poiGroups = useMemo(() => {
    if (lod === "far") return [];
    const list: Poi[] = [];
    for (const v of vendors ?? []) if (view.bounds.contains([v.lat, v.lng])) list.push({ id: `sf${v.code}`, lat: v.lat, lng: v.lng, v });
    for (const p of spots ?? []) if (view.bounds.contains([p.lat, p.lng])) list.push({ id: `sp${p.id}`, lat: p.lat, lng: p.lng, p });
    for (const tp of torob ?? []) if (view.bounds.contains([tp.lat, tp.lng])) list.push({ id: `tr${tp.id}`, lat: tp.lat, lng: tp.lng, tp });
    return cluster(list, view.zoom, cell && Math.round(cell * POI_SPACING), "poi");
  }, [vendors, spots, torob, view, cell, lod]);

  // Money and store jobs: grouped only where they'd overlap (a bubble shows what's in it),
  // each on its own from street level. Nothing is dropped — tap a bubble to zoom in.
  const gameGroups = useMemo(() => {
    const list: GameItem[] = [];
    for (const m of world?.money ?? []) list.push({ id: `m${m.id}`, lat: m.lat, lng: m.lng, m });
    for (const j of world?.places ?? []) list.push({ id: `j${j.id}`, lat: j.place.lat, lng: j.place.lng, j });
    return cluster(list, view.zoom, cell && Math.round(cell * GAME_SPACING), "g");
  }, [world, view.zoom, cell]);

  // Every layer at once, in screen space: in priority order (money and jobs, businesses,
  // players, then places nearest the middle of the view — vendors and walk-in stores ahead
  // of plain places — then Divar), crowded places shrink to dots, and a name shows only
  // where it has room.
  const deco = useMemo(() => {
    const zoom = view.zoom, mid = map.project(view.bounds.getCenter(), zoom);
    const at = (lat: number, lng: number) => map.project([lat, lng], zoom);
    const marks: Mark[] = [];
    const put = (id: string, lat: number, lng: number, r: number, name: string, dot = false) => {
      const p = at(lat, lng);
      marks.push({ id, x: p.x, y: p.y, r, label: name ? labelPx(name) : 0, dot });
    };
    for (const g of gameGroups) {
      const it = g.items[0], one = g.items.length === 1;
      put(g.key, g.lat, g.lng, 21, !one ? "" : it.m ? t("{n} toman", { n: it.m.amount }) : it.j!.place.name);
    }
    for (const b of world?.businesses ?? []) put(`bz${b.id}`, b.lat, b.lng, b.featured ? 25 : 21, b.name);
    for (const g of playerGroups) put(g.key, g.lat, g.lng, 17, g.items.length === 1 ? `${g.items[0].username} · ${g.items[0].level}` : "");
    const pois = poiGroups
      .map((g) => {
        const p = at(g.lat, g.lng), one = g.items.length === 1 ? g.items[0] : null;
        return { g, one, d: Math.hypot(p.x - mid.x, p.y - mid.y) * (one?.p ? 1.4 : 1) };
      })
      .sort((a, b) => a.d - b.d);
    for (const { g, one } of pois) put(g.key, g.lat, g.lng, one ? (one.p ? 15 : one.tp ? 18 : 19) : 17, one ? one.v?.title ?? one.tp?.name ?? one.p!.name : "", !!one);
    if (lod !== "far") for (const a of divar ?? []) put(`dv${a.city}-${a.id}`, a.lat, a.lng, 20, t("Divar · {area}", { area: a.name }));
    return declutter(marks, lite ? MARKER_BUDGET.lite : MARKER_BUDGET.full);
  }, [map, view, lod, gameGroups, poiGroups, playerGroups, world, divar, lite]);
  /** " nolabel" when a marker's name has no room. */
  const nl = (id: string) => (deco.named.has(id) ? "" : " nolabel");

  const playerMarker = (p: WorldPlayer, key: string) => (
    <Marker
      key={p.id}
      position={[p.lat, p.lng]}
      icon={icon(`${esc(p.avatar)}<span class="nm">${p.home ? "🛋️ " : ""}${esc(p.username)} · ${fmtNum(p.level)}</span>`, `player ${p.friend ? "friend" : ""}${nl(key)}`, 34)}
      eventHandlers={{ click: () => onSelect({ type: "player", data: p }) }}
    />
  );

  return (
    <>
      {/* Money (green bills, then blue, purple, red for bigger money levels, gold for admin
          drops; the amount at street level) and store jobs (the burger delivery starts at the
          real burger joint). */}
      {gameGroups.map((g) => {
        if (g.items.length > 1) {
          const money = g.items.filter((x) => x.m).length;
          const label = money === g.items.length ? "💵" : money ? "🎯" : "📦";
          return <Marker key={g.key} position={[g.lat, g.lng]} zIndexOffset={650} icon={clusterIcon(label, g.items.length, "loot")} eventHandlers={{ click: () => zoomInto(g) }} />;
        }
        const it = g.items[0];
        if (it.m) {
          const m = it.m;
          return (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              zIndexOffset={m.drop ? 800 : 600 + Math.min(3, m.tier ?? 0) * 50}
              icon={icon(`<span class="ring" style="color:${m.drop ? "#f0c05a" : TIER_COLORS[Math.min(TIER_COLORS.length - 1, m.tier ?? 0)]}"></span>💵<span class="nm">${esc(t("{n} toman", { n: m.amount }))}</span>`, `money ${m.drop ? "drop legendary" : m.tier ? `tier tier${Math.min(3, m.tier)}` : ""}${nl(g.key)}`, m.drop ? 48 : m.tier ? 46 : 42)}
              eventHandlers={{ click: () => onSelect({ type: "money", data: m }) }}
            />
          );
        }
        const m = it.j!;
        const cat = PLACE_CATS[m.place.cat] ?? PLACE_CATS.shop;
        return (
          <Marker
            key={`pl${m.id}`}
            position={[m.place.lat, m.place.lng]}
            zIndexOffset={320}
            icon={icon(
              `<span class="ring" style="color:${cat.color}"></span>${cat.emoji}<span class="nm">${esc(m.place.name)}</span><span class="job">${m.kind === "deliver" ? "📦" : "✅"}</span>`,
              `place${nl(g.key)}`,
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
              `biz ${b.featured ? "featured" : ""} ${open ? "" : "claimed"}${nl(`bz${b.id}`)}`,
              b.featured ? 50 : 42,
            )}
            eventHandlers={{ click: () => onSelect({ type: "biz", data: b }) }}
          />
        );
      })}

      {/* Every real place around — restaurants, cafés, shops, parks (tap for the menu and
          contacts) — and Snappfood vendors, with their logo up close (tap for the menu). */}
      {poiGroups.map((g) => {
        if (g.items.length > 1) {
          const food = g.items.filter((x) => x.v).length * 2 >= g.items.length;
          return <Marker key={g.key} position={[g.lat, g.lng]} zIndexOffset={200} icon={clusterIcon(food ? "🍽️" : "📍", g.items.length, `poi ${food ? "vendors" : "spots"}`, 34)} eventHandlers={{ click: () => zoomInto(g) }} />;
        }
        const it = g.items[0];
        if (deco.dots.has(g.key)) {
          // Crowded: a dot on the map's canvas (cheap, still tappable).
          const color = it.tp ? "#e2363c" : it.v ? "#ff2f6e" : (PLACE_CATS[it.p!.cat] ?? PLACE_CATS.shop).color;
          const sel: Selected = it.tp ? { type: "torob", data: it.tp } : it.v ? { type: "vendor", data: it.v } : { type: "spot", data: it.p! };
          return <CircleMarker key={it.id} center={[it.lat, it.lng]} radius={DOT_R} pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.95 }} eventHandlers={{ click: () => onSelect(sel) }} />;
        }
        if (it.tp) {
          const tp = it.tp;
          const pic = lod === "near" && tp.photo ? `<img class="lg" src="${esc(tp.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
          return (
            <Marker
              key={it.id}
              position={[tp.lat, tp.lng]}
              zIndexOffset={280}
              icon={icon(`<span class="ring" style="color:#e2363c"></span>${tp.sells[0] ?? "🏷️"}${pic}<span class="nm">${esc(tp.name)}</span>`, `place torob ${pic ? "has-logo" : ""}${nl(g.key)}`, 36)}
              eventHandlers={{ click: () => onSelect({ type: "torob", data: tp }) }}
            />
          );
        }
        if (it.v) {
          const v = it.v;
          const k = VENDOR_KINDS[v.kind];
          const logo = lod === "near" && v.logo ? `<img class="lg" src="${esc(v.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
          return (
            <Marker
              key={it.id}
              position={[v.lat, v.lng]}
              zIndexOffset={300}
              icon={icon(`<span class="ring" style="color:#ff2f6e"></span>${k.emoji}${logo}<span class="nm">${esc(v.title)}</span>${v.rating >= TOP_RATING ? `<span class="job">⭐</span>` : ""}`, `place vendor ${v.open ? "" : "closed"} ${logo ? "has-logo" : ""}${nl(g.key)}`, 38)}
              eventHandlers={{ click: () => onSelect({ type: "vendor", data: v }) }}
            />
          );
        }
        const p = it.p!;
        const cat = PLACE_CATS[p.cat] ?? PLACE_CATS.shop;
        return (
          <Marker
            key={it.id}
            position={[p.lat, p.lng]}
            zIndexOffset={200}
            icon={icon(`<span class="ring" style="color:${cat.color}"></span>${cat.emoji}<span class="nm">${esc(p.name)}</span>`, `place spot${nl(g.key)}`, 30)}
            eventHandlers={{ click: () => onSelect({ type: "spot", data: p }) }}
          />
        );
      })}

      {/* Divar: each neighbourhood around, pinned on its centre with how many fresh ads it has. */}
      {lod !== "far" &&
        divar?.map((a) => (
          <Marker
            key={`dv${a.city}-${a.id}`}
            position={[a.lat, a.lng]}
            zIndexOffset={250}
            icon={icon(`<span class="ring"></span>📢<span class="cl-n">${fmtNum(a.posts.length)}</span><span class="nm">${esc(t("Divar · {area}", { area: a.name }))}</span>`, `place divar${nl(`dv${a.city}-${a.id}`)}`, 40)}
            eventHandlers={{ click: () => onSelect({ type: "divar", data: a }) }}
          />
        ))}

      {/* Other players: animated + live at street level, grouped further out */}
      {lod === "near" && world && <OthersLayer players={world.players} onSelect={onSelect} />}
      {playerGroups.map((g) =>
        g.items.length === 1 ? playerMarker(g.items[0], g.key) : <Marker key={g.key} position={[g.lat, g.lng]} zIndexOffset={850} icon={clusterIcon("👥", g.items.length, "players")} eventHandlers={{ click: () => zoomInto(g) }} />,
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
