"use client";
import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { PLACE_CATS } from "@/lib/places";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import { distanceM } from "@/lib/geo";
import { EXPLORE_ZOOM } from "@/lib/explore";
import { CONGESTION_COLORS, congestion, type TrafficCellOut } from "@/lib/traffic";
import { VENDOR_KINDS, type Deal, type DivarArea, type TorobPlace, type Vendor, type VendorKind } from "@/lib/localData";
import type { Cinema } from "@/lib/cinema";
import type { LiveBus } from "@/lib/transit/iett";
import type { BusStop, City, Station } from "@/lib/transit/network";
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
import { LongPress, SiktirLayer } from "./SiktirLayer";
import { VasatyabLayer } from "./VasatyabLayer";
import type { SiktirSpot } from "@/lib/siktir";
import type { MidView } from "@/server/midpoint";
import { DEFAULT_STYLE, DEFAULT_TILES, type MapStyle } from "./mapStyles";
import { STORE_TYPES, typeOf, type AdArea, type DirStore, type StoreType } from "@/lib/stores/directory";
import { clusterFace, countText, PIN_BOX, PIN_DOT_R, PIN_PX, pinClass, pinHtml, type PinSpec } from "@/lib/mapPins";
import { glyphFor } from "@/lib/hudMarkers";

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
  /** Play from home: the streets the walk there follows (null: straight there). */
  travelPath?: LatLng[] | null;
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
  /** Cinemas (cinematicket.org): a few per district, each always on the map with its name. */
  cinemas?: Cinema[];
  /** Public transport (game/transit.ts): metro stations (always shown, like cinemas), bus stops and live buses. */
  transit?: TransitPins;
  /** Stores with a deal or cashback on Takhfifan (a badge with the % off). */
  deals?: Deal[];
  /** Directory stores (Bilbooard, Irangaah, Okala, Netbarg) and Sheypoor's ads by neighbourhood. */
  dir?: DirStore[];
  ads?: AdArea[];
  /** Live traffic on the roads, coloured by speed. */
  traffic?: boolean;
  /** The route being followed (🧭), drawn as a line to its end. */
  route?: (LiveRoute & { to: LatLng }) | null;
  /** Other players to draw instead of the world's (explore mode: those around the explored spot). */
  others?: WorldPlayer[];
  /** Siktir: spots players marked as disliked (the layer), and a long press anywhere to mark one. */
  siktir?: SiktirSpot[];
  onLongPress?: (p: LatLng) => void;
  /** Vasatyab: the party's middle, its members and gather point. */
  vasatyab?: MidView | null;
  /** Explore mode: the map moves freely; `jump` flies it somewhere, `onCenter` reports where it ends up. */
  explore?: { jump: { at: LatLng; n: number } | null; onCenter: (c: LatLng) => void } | null;
  /** Hidden under the 3D city: keep the map as it was, re-render nothing until it shows again. */
  asleep?: boolean;
};

export default memo(GameMap, (a, b) => (a.asleep && b.asleep ? true : Object.keys({ ...a, ...b }).every((k) => a[k as keyof Props] === b[k as keyof Props])));

const GOLD = "#f0c05a";

/** Dashed lines from the player to wherever they're headed (drawn by PlayerLayer). */
function guidesFor(run: Me["activeRun"] | undefined, game: GpsView | null | undefined, travelTo: LatLng | null | undefined, onStreets = false): Guide[] {
  const out: Guide[] = [];
  if (run) out.push({ to: { lat: run.targetLat, lng: run.targetLng }, color: "#ee7fae", dash: "8 10", weight: 3 });
  const next = game?.points && game.next != null ? game.points[game.next] : null;
  if (next) out.push({ to: next, color: GOLD, dash: "8 10", weight: 3 });
  if (game?.target) out.push({ to: game.target, color: GOLD, dash: "10 10", weight: 4, opacity: 0.9 });
  if (game?.area) out.push({ to: game.area.center, color: GOLD, dash: "10 10", weight: 3, opacity: 0.7 });
  // Walking the streets there: the route is drawn instead of a straight line through the buildings.
  if (travelTo && !onStreets) out.push({ to: travelTo, color: "#5bd38c", dash: "6 8", weight: 3 });
  return out;
}

function GameMap({ world, me, follow, picking, onUnfollow, onFollow, onMapClick, onSelect, game, travelTo, travelPath, vendors, spots, divar, torob, cinemas, transit, deals, dir, ads, traffic, route, look = DEFAULT_STYLE, onTilesFail, others, explore, siktir, onLongPress, vasatyab }: Props) {
  // Only the first position matters here; PlayerLayer follows the player after that.
  const center = getLocation().pos ?? explore?.jump?.at ?? { lat: 51.5074, lng: -0.1278 };
  const run = me?.activeRun;
  const tint = world ? `${world.phase}-tint` : "";
  const onStreets = !!travelPath && travelPath.length > 2;
  const guides = useMemo(() => guidesFor(run, game, travelTo, onStreets), [run, game, travelTo, onStreets]);
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
        <PlayerLayer follow={follow && !explore} guides={guides} onUnfollow={onUnfollow} onFollow={onFollow} />
        {explore && <ExploreView jump={explore.jump} onCenter={explore.onCenter} />}
        <FrameTarget target={game?.target ?? game?.area?.center ?? (game?.points && game.next != null ? game.points[game.next] : null) ?? null} />
        <Clicks onClick={onMapClick} />
        {onLongPress && !picking && <LongPress onLongPress={onLongPress} />}
        {siktir && <SiktirLayer spots={siktir} onSelect={onSelect} />}
        {vasatyab && <VasatyabLayer view={vasatyab} />}
        <Layers world={world} me={me} game={game} travelTo={travelTo} travelPath={onStreets ? travelPath : null} vendors={vendors} spots={spots} divar={divar} torob={torob} cinemas={cinemas} transit={transit} deals={deals} dir={dir} ads={ads} others={others} onSelect={onSelect} onUnfollow={onUnfollow} lite={tuning.lite} />
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

/**
 * Explore mode's camera: flies to each new `jump`, and reports the middle of the map after
 * every pan or zoom (the layers then load around it).
 */
function ExploreView({ jump, onCenter }: { jump: { at: LatLng; n: number } | null; onCenter: (c: LatLng) => void }) {
  const map = useMap();
  const report = useRef(onCenter);
  report.current = onCenter;
  useEffect(() => {
    // A far jump (another city) lands zoomed out a little; a hop nearby keeps the zoom.
    if (jump) map.setView([jump.at.lat, jump.at.lng], map.distance(map.getCenter(), [jump.at.lat, jump.at.lng]) > 5000 ? EXPLORE_ZOOM : map.getZoom(), { animate: true });
  }, [map, jump]);
  useEffect(() => {
    const moved = () => {
      const c = map.getCenter();
      report.current({ lat: c.lat, lng: c.lng });
    };
    moved();
    map.on("moveend", moved);
    return () => void map.off("moveend", moved);
  }, [map]);
  return null;
}

/** A road's usual free-flowing speed when we don't know its kind (km/h): Tehran's main streets. */
const TRAFFIC_FREE_KMH = 50;
/** Snappfood rates out of 10: vendors at least this good get a ⭐ on their sign. */
const TOP_RATING = 9.3;
/** Game markers are bigger than most: they group a little more loosely. */
const GAME_SPACING = 1.5;
/** Places and vendors cluster this much more loosely than other markers (their signs are wider). */
const POI_SPACING = 1.35;
/** Full markers on screen at most (more and the furthest places become dots): a phone stays smooth with everything on. */
/**
 * What one screen may hold (declutter.ts): full pins, dots past them, and names. A phone gets
 * less — a calm map with the nearest places named — and a lite phone less again.
 */
const MARKER_BUDGET = {
  lite: { pins: 32, dots: 24, names: 10 },
  phone: { pins: 44, dots: 40, names: 12 },
  full: { pins: 120, dots: 220, names: 40 },
};
/** Full pins keep a gap of about one pin between them (declutter.ts); a place closer than that is a dot. */
const PIN_SPACING = 1.7;
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
 * One marker on the map (mapPins.ts). Its icon is built from what the marker *is*, so it stays the
 * same object while the map pans and zooms; whether its name fits is a class toggled on the element
 * — the marker is never re-inserted, so nothing blinks or replays its entrance.
 */
const Pin = memo(function Pin({ lat, lng, html, cls, z, named, title, onClick }: { lat: number; lng: number; html: string; cls: string; z: number; named: boolean; title: string; onClick: () => void }) {
  const ref = useRef<L.Marker | null>(null);
  const at = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);
  const ic = icon(html, cls, PIN_BOX);
  const click = useRef(onClick);
  click.current = onClick;
  const handlers = useMemo(() => ({ click: () => click.current() }), []);
  useEffect(() => {
    ref.current?.getElement()?.querySelector(".mk")?.classList.toggle("nolabel", !named);
  }, [named, ic]);
  return <Marker ref={ref} position={at} icon={ic} zIndexOffset={z} eventHandlers={handlers} title={title} alt={title} />;
});
/** A crowded place: a dot in its colour on the map's canvas (cheap with hundreds; still tappable). */
const Dot = memo(function Dot({ lat, lng, color, onClick }: { lat: number; lng: number; color: string; onClick: () => void }) {
  const at = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);
  const click = useRef(onClick);
  click.current = onClick;
  const handlers = useMemo(() => ({ click: () => click.current() }), []);
  const style = useMemo(() => ({ color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.95 }), [color]);
  return <CircleMarker center={at} radius={PIN_DOT_R} pathOptions={style} eventHandlers={handlers} />;
});

/** Something the map draws: where, its pin, how it stacks, what tapping it opens, and how it may give way when crowded. */
type Item = { id: string; lat: number; lng: number; spec: PinSpec; z: number; sel: Selected; dot: boolean };
const VENDOR_TYPE: Record<VendorKind, StoreType> = { food: "food", cafe: "cafe", sweets: "sweets", market: "grocery" };
const AREA_COLOR = { divar: "#c0392b", sheypoor: "#7a3cff" };

/** Every place-like thing as a pin: Snappfood vendors, real places, Torob walk-ins, directory stores, cinemas, deals. Colour = what kind of place. */
export type TransitPins = { city: City; stations: { s: Station; colour: string }[]; stops: BusStop[]; buses: LiveBus[] };

function placeItems({ vendors, spots, torob, dir, cinemas, deals, transit }: Pick<Props, "vendors" | "spots" | "torob" | "dir" | "cinemas" | "deals" | "transit">): { cinemas: Item[]; places: Item[] } {
  const places: Item[] = [];
  for (const v of vendors ?? []) {
    const k = VENDOR_KINDS[v.kind];
    places.push({ id: `sf${v.code}`, lat: v.lat, lng: v.lng, z: 260, dot: true, sel: { type: "vendor", data: v }, spec: { family: "place", face: k.emoji, color: STORE_TYPES[VENDOR_TYPE[v.kind]].color, logo: v.logo, label: v.title, badge: v.rating >= TOP_RATING ? { text: "⭐", kind: "star" } : undefined, state: v.open ? [] : ["closed"] } });
  }
  for (const d of dir ?? []) {
    const ty = STORE_TYPES[d.type];
    places.push({ id: `ds${d.id}`, lat: d.lat, lng: d.lng, z: d.off ? 280 : 250, dot: true, sel: { type: "dir", data: d }, spec: { family: "place", face: ty.emoji, color: ty.color, logo: d.site === "okala" ? d.img : undefined, label: d.name, badge: d.off ? { text: `−${fmtNum(d.off)}%`, kind: "deal" } : d.rating >= 4.5 ? { text: "⭐", kind: "star" } : undefined } });
  }
  for (const d of deals ?? []) {
    const ty = STORE_TYPES[typeOf(d.category, d.name)];
    places.push({ id: `dl${d.id}`, lat: d.lat, lng: d.lng, z: 290, dot: true, sel: { type: "deal", data: d }, spec: { family: "place", face: ty.emoji, color: ty.color, label: d.name, badge: d.off > 0 ? { text: `−${fmtNum(d.off)}%`, kind: "deal" } : { text: `${fmtNum(d.cashback)}%↺`, kind: "back" } } });
  }
  for (const tp of torob ?? [])
    places.push({ id: `tr${tp.id}`, lat: tp.lat, lng: tp.lng, z: 240, dot: true, sel: { type: "torob", data: tp }, spec: { family: "place", face: tp.sells[0] ?? "🏷️", color: STORE_TYPES.other.color, logo: tp.photo, label: tp.name } });
  for (const p of spots ?? []) {
    const c = PLACE_CATS[p.cat] ?? PLACE_CATS.shop;
    places.push({ id: `sp${p.id}`, lat: p.lat, lng: p.lng, z: 200, dot: true, sel: { type: "spot", data: p }, spec: { family: "place", face: c.emoji, color: c.color, label: p.name } });
  }
  if (transit) {
    for (const b of transit.stops) places.push({ id: `bs${b.id}`, lat: b.lat, lng: b.lng, z: 150, dot: true, sel: { type: "busstop", data: { city: transit.city, stop: b } }, spec: { family: "place", face: "🚏", color: "#2d8cff", label: b.name } });
    for (const b of transit.buses) places.push({ id: `lb${b.id}`, lat: b.lat, lng: b.lng, z: 235, dot: true, sel: { type: "bus", data: b }, spec: { family: "place", face: "🚌", color: "#e2231a", label: b.line ?? "" } });
  }
  const cin = (cinemas ?? []).map<Item>((c) => ({ id: `ct${c.id}`, lat: c.lat, lng: c.lng, z: 300, dot: false, sel: { type: "cinema", data: c }, spec: { family: "place", face: "🎬", color: "#f5c518", label: c.name, badge: c.rate >= 4.5 ? { text: "⭐", kind: "star" } : undefined } }));
  // Places wear a white line glyph on a solid disc (one icon language with the HUD and the 3D city);
  // a face no glyph fits (a rare Torob category) stays drawn art.
  for (const it of places) it.spec.glyph = glyphFor(it.spec.face) ?? undefined;
  for (const it of cin) it.spec.glyph = "film";
  // Metro stations stay on the map at city zoom too (with the cinemas): the city's landmarks.
  for (const { s, colour } of transit?.stations ?? []) cin.push({ id: `ms${s.id}`, lat: s.lat, lng: s.lng, z: 310, dot: false, sel: { type: "station", data: { city: transit!.city, station: s } }, spec: { family: "place", face: "🚇", color: colour, label: getLocale() === "fa" ? s.name : s.en || s.name } });
  return { cinemas: cin, places };
}

/**
 * What the map shows, from top to bottom: where you're headed, other players, money to pick up and
 * stores with a job, businesses, cinemas, deals and every store and place, then the neighbourhoods
 * with fresh ads. Every one is the same pin (mapPins.ts), one size per zoom level; each family groups
 * what would overlap into a bubble (nothing groups from street level on); crowded places become dots
 * and a name shows only where it has room (declutter.ts). At city zoom only the game, cinemas and
 * bubbles show — the map stays readable over a whole city.
 */
function Layers({ world, me, game, travelTo, travelPath, vendors, spots, divar, torob, cinemas, transit, deals, dir, ads, others, onSelect, onUnfollow, lite }: Pick<Props, "world" | "me" | "game" | "travelTo" | "travelPath" | "vendors" | "spots" | "divar" | "torob" | "cinemas" | "transit" | "deals" | "dir" | "ads" | "others" | "onSelect" | "onUnfollow"> & { lite: boolean }) {
  const players = others ?? world?.players;
  const map = useMap();
  const view = useMapView();
  const lod: Lod = lodFor(view.zoom);
  // Street level only merges markers that really sit on top of each other.
  const cell = cellFor(view.zoom);
  const run = me?.activeRun;

  // Pin size, labels and animations per zoom level are pure CSS (--pin and .lod-* in map-pins.css).
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

  // ---- what there is (rebuilt only when the data changes, not on every pan)
  const all = useMemo(() => placeItems({ vendors, spots, torob, dir, cinemas, deals, transit }), [vendors, spots, torob, dir, cinemas, deals, transit]);
  const areaList = useMemo<Item[]>(
    () => [
      ...(divar ?? []).map<Item>((a) => ({ id: `dv${a.city}-${a.id}`, lat: a.lat, lng: a.lng, z: 180, dot: false, sel: { type: "divar", data: a }, spec: { family: "area", face: "📢", glyph: "megaphone", color: AREA_COLOR.divar, label: t("Divar · {area}", { area: a.name }), badge: { text: countText(a.posts.length, fmtNum), kind: "count" } } })),
      ...(ads ?? []).map<Item>((a) => ({ id: `sh${a.id}`, lat: a.lat, lng: a.lng, z: 175, dot: false, sel: { type: "ads", data: a }, spec: { family: "area", face: "📣", glyph: "megaphone", color: AREA_COLOR.sheypoor, label: t("Sheypoor · {area}", { area: a.name }), badge: { text: countText(a.ads.length, fmtNum), kind: "count" } } })),
    ],
    [divar, ads],
  );
  const gameList = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const m of world?.money ?? []) {
      const tier = Math.min(TIER_COLORS.length - 1, m.tier ?? 0);
      out.push({ id: `m${m.id}`, lat: m.lat, lng: m.lng, z: m.drop ? 800 : 600 + tier * 50, dot: false, sel: { type: "money", data: m }, spec: { family: "game", face: "💵", color: m.drop ? GOLD : TIER_COLORS[tier], label: t("{n} toman", { n: m.amount }), state: m.drop ? ["gold"] : [] } });
    }
    for (const j of world?.places ?? []) {
      const c = PLACE_CATS[j.place.cat] ?? PLACE_CATS.shop;
      out.push({ id: `j${j.id}`, lat: j.place.lat, lng: j.place.lng, z: 620, dot: false, sel: { type: "place", data: j }, spec: { family: "game", face: c.emoji, color: c.color, label: j.place.name, badge: { text: j.kind === "deliver" ? "📦" : "✅", kind: "job" } } });
    }
    return out;
  }, [world]);
  const bizList = useMemo<Item[]>(
    () =>
      (world?.businesses ?? []).map((b) => {
        const open = b.campaigns.filter((c) => !c.visited).length;
        const best = b.campaigns.reduce((n, c) => Math.max(n, c.rewardCoins), 0);
        return { id: `bz${b.id}`, lat: b.lat, lng: b.lng, z: b.featured ? 700 : 360, dot: false, sel: { type: "biz", data: b }, spec: { family: "game", face: b.emoji, color: b.featured ? GOLD : b.mine ? "#63b3f2" : "#ff7ad9", label: `${b.verified ? "✔ " : ""}${b.name}`, badge: open && !b.mine ? { text: `+${fmtNum(best)}🪙`, kind: "coin" } : undefined, state: [b.featured ? "gold" : "", open ? "" : "claimed"].filter(Boolean) } } satisfies Item;
      }),
    [world],
  );

  // ---- grouped where they'd overlap, for this zoom and what's (about) on screen
  const inView = useCallback((l: Item[]) => l.filter((x) => view.bounds.contains([x.lat, x.lng])), [view]);
  // At city zoom the hundreds of stores leave the map to the game and the cinemas. Closer in,
  // stores that would sit on top of each other become one bubble with a count (tap: zoom in) —
  // not dots, which read as "something's broken". Only at the closest zoom does every pin stand alone.
  const placeCell = cell && Math.round(cell * POI_SPACING);
  const placeGroups = useMemo(() => cluster(inView(lod === "far" ? all.cinemas : [...all.cinemas, ...all.places]), view.zoom, placeCell, "poi"), [all, inView, lod, view.zoom, placeCell]);
  const areaGroups = useMemo(() => (lod === "far" ? [] : cluster(inView(areaList), view.zoom, placeCell, "ar")), [areaList, inView, lod, view.zoom, placeCell]);
  const gameGroups = useMemo(() => cluster(gameList, view.zoom, cell && Math.round(cell * GAME_SPACING), "g"), [gameList, view.zoom, cell]);
  // Other players further out: grouped. At street level OthersLayer animates them.
  const playerGroups = useMemo(() => {
    if (!players || lod === "near") return [];
    const live = new Map(nearby.list().map((n) => [n.id, n.last]));
    const list = players.map<Item>((p) => {
      const l = live.get(p.id);
      return { id: p.id, lat: l?.lat ?? p.lat, lng: l?.lng ?? p.lng, z: 850, dot: false, sel: { type: "player", data: p }, spec: { family: "player", face: p.avatar, color: p.friend ? "#5bd38c" : "#63b3f2", label: `${p.home ? "🛋️ " : ""}${p.username} · ${fmtNum(p.level)}`, state: p.friend ? ["friend"] : [] } };
    });
    return cluster(inView(list), view.zoom, cell, "pl");
  }, [players, inView, lod, view.zoom, cell]);

  // ---- every layer at once, in screen space: in priority order (the game, businesses, players,
  // cinemas, then places nearest the middle of the view — plain map places last — then the ad areas)
  // crowded places shrink to dots and a name shows only where it has room. One radius for all: one size.
  const deco = useMemo(() => {
    const zoom = view.zoom, mid = map.project(view.bounds.getCenter(), zoom), r = PIN_PX[lod] / 2 + 3;
    const marks: Mark[] = [];
    const put = (key: string, g: Group<Item>) => {
      const p = map.project([g.lat, g.lng], zoom), one = g.items.length === 1 ? g.items[0] : null;
      marks.push({ id: key, x: p.x, y: p.y, r, label: one?.spec.label ? labelPx(one.spec.label) : 0, dot: !!one?.dot });
    };
    for (const g of gameGroups) put(g.key, g);
    for (const b of inView(bizList)) put(`bz${b.id}`, { key: b.id, lat: b.lat, lng: b.lng, items: [b] });
    for (const g of playerGroups) put(g.key, g);
    const places = placeGroups
      .map((g) => {
        const p = map.project([g.lat, g.lng], zoom), one = g.items.length === 1 ? g.items[0] : null;
        const rank = one?.id.startsWith("ct") ? 0 : Math.hypot(p.x - mid.x, p.y - mid.y) * (one?.id.startsWith("sp") ? 1.4 : 1) + 1;
        return { g, rank };
      })
      .sort((a, b) => a.rank - b.rank);
    for (const { g } of places) put(g.key, g);
    for (const g of areaGroups) put(g.key, g);
    return declutter(marks, lite ? MARKER_BUDGET.lite : map.getSize().x < 600 ? MARKER_BUDGET.phone : MARKER_BUDGET.full, PIN_SPACING);
  }, [map, view, lod, gameGroups, bizList, playerGroups, placeGroups, areaGroups, inView, lite]);

  /** One group as the map draws it: a bubble, a dot, or the pin. */
  const draw = (g: Group<Item>, clusterZ: number) => {
    if (g.items.length > 1) {
      const faces = g.items.map((i) => i.spec.face);
      const face = clusterFace(faces);
      const lead = g.items.find((i) => i.spec.face === face)!.spec;
      const spec: PinSpec = { family: "cluster", face, glyph: lead.glyph, color: lead.color, badge: { text: countText(g.items.length, fmtNum), kind: "count" } };
      return <Pin key={g.key} lat={g.lat} lng={g.lng} html={pinHtml(spec)} cls={pinClass(spec)} z={clusterZ} named={false} title={t("{n} places here — tap to zoom in", { n: fmtNum(g.items.length) })} onClick={() => zoomInto(g)} />;
    }
    const it = g.items[0];
    if (deco.hidden.has(g.key)) return null;
    if (deco.dots.has(g.key)) return <Dot key={g.key} lat={it.lat} lng={it.lng} color={it.spec.color} onClick={() => onSelect(it.sel)} />;
    return <Pin key={g.key} lat={it.lat} lng={it.lng} html={pinHtml(it.spec)} cls={pinClass(it.spec)} z={it.z} named={deco.named.has(g.key)} title={it.spec.label ?? ""} onClick={() => onSelect(it.sel)} />;
  };

  return (
    <>
      {/* Neighbourhoods with fresh ads (Divar, Sheypoor): square pins with how many, under everything. */}
      {areaGroups.map((g) => draw(g, 170))}
      {/* Stores, places, cinemas and deals: one layer, grouped together so their pins never stack. */}
      {placeGroups.map((g) => draw(g, 210))}
      {/* Money and store jobs: grouped only where they'd overlap; tap a bubble to zoom in. */}
      {gameGroups.map((g) => draw(g, 650))}
      {/* Real businesses that joined: their own sign, gold when featured. */}
      {inView(bizList).map((b) => draw({ key: `bz${b.id}`, lat: b.lat, lng: b.lng, items: [b] }, b.z))}

      {/* Other players: animated + live at street level, grouped further out */}
      {lod === "near" && players && <OthersLayer players={players} onSelect={onSelect} />}
      {playerGroups.map((g) => draw(g, 850))}

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
      {travelPath && (
        <>
          <Polyline positions={travelPath.map((p) => [p.lat, p.lng] as [number, number])} interactive={false} pathOptions={{ color: "#0b3d24", weight: 9, opacity: 0.35, lineCap: "round", lineJoin: "round" }} />
          <Polyline positions={travelPath.map((p) => [p.lat, p.lng] as [number, number])} interactive={false} pathOptions={{ color: "#5bd38c", weight: 4, opacity: 0.95, dashArray: "1 9", lineCap: "round", lineJoin: "round" }} />
        </>
      )}
      {travelTo && <Marker position={[travelTo.lat, travelTo.lng]} zIndexOffset={1100} interactive={false} icon={icon(`<span class="ring" style="color:#5bd38c"></span>📍`, "quest-pt next", 36)} />}
    </>
  );
}
