"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fmtNum, msg, t, toAsciiDigits } from "@/lib/i18n";
import { useT } from "@/components/I18nProvider";
import { applyConfig } from "@/lib/config";
import { S } from "@/lib/settings";
import { distanceM, formatDistance } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import type { HeroTabId } from "./Panels";
import { api, fmtTime, type LatLng, type Me, type Selected, type World } from "./client";
import { NoteCard } from "./Panels";
import { LotteryCard } from "./Lottery";
import { sfx, isMuted, setMuted, onMuteChange } from "./sfx";
import { setMusicMood, startMusic } from "./music";
import { InboxPanel } from "./Inbox";
import { Tour, TOUR_KEY } from "./Help";
import { enablePush, pushSupported, reportAway, swEnabled, syncPush } from "@/components/pwaClient";
import { askConfirm } from "@/components/Dialogs";
import { CallScreen, type CallInvite, type CallPeer } from "./Call";
import { CrewPanel, EventsPanel, JobsPanel, NearbyPanel, ProfilePanel } from "./Panels";
import { MarketPanel } from "./Market";
import { SHOP_WARN_MS } from "@/lib/shops";
import { Ctx, MoveIcon, Sheet, useGame, type GameCtx, type PanelId, type Toast } from "./ui";
import { useLocation, useWakeLock } from "./useLocation";
import { GpsChip, LocationGate, markModeAsked, ModePrompt, useModePrompt } from "./LocationUi";
import { AdModal, type AdOffer, celebrate, CelebrationLayer, Directions, GpsBanner, PlayPanel, StorePanel, useGpsGame } from "./Play";
import { flyRewards, parseRewards } from "./Rewards";
import { Toasts, toastLife } from "./Toasts";
import { ReadyTray, Wallet } from "./Hud";
import { Button } from "@/components/Button";
import { EmojiArtLayer } from "@/components/art/EmojiArt";
import { Art } from "@/components/art/Art";
import { Icon } from "../drive/icons";
import { pedometer, useSteps } from "./steps";
import { STEP_GOAL } from "@/lib/idle";
import { BizCard, PlaceCard, SpotCard } from "./PlaceCards";
import { DivarCard, StoreExtras, TorobPlaceCard, VendorCard } from "./StoreInfo";
import { OnlineChip, OnlineSheet } from "./Online";
import { sameStore, VENDOR_KIND_KEYS, VENDOR_KINDS, type DivarArea, type TorobPlace, type Vendor, type VendorKind } from "@/lib/localData";
import { PLACE_CATS, type PlaceCat } from "@/lib/places";
import { MapFilter } from "./MapFilter";
import type { LiveRoute } from "@/server/traffic";
import { SocialPanel } from "./Social";
import { BusinessPanel } from "./Business";
import { WalletPanel } from "./WalletPanel";
import { MAP_STYLES, mapStyle as styleById, type MapStyle } from "./mapStyles";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false, loading: () => <div className="map" /> });
const Drive = dynamic(() => import("../drive/Drive"), { ssr: false, loading: () => <div className="drive drive-boot"><div className="splash-bar"><i /></div></div> });

const NAV: [PanelId, string, string][] = [
  ["nearby", "🎯", msg("Nearby")],
  ["wallet", "💵", msg("Wallet")],
  ["play", "🎮", msg("Play")],
  ["market", "🛍️", msg("Market")],
  ["jobs", "📦", msg("Jobs")],
  ["social", "🌐", msg("Social")],
  ["me", "👤", msg("Profile")],
];

const TEST_MODE_KEY = "sq_test_mode";
const MAP_LOOK_KEY = "sq_map_look";
const MAP_LAYERS_KEY = "sq_map_layers";
/** What the map shows (its filter button, or ⋯ → On the map): all on until the player says otherwise. */
type MapLayer = "money" | "jobs" | "players" | "biz" | "places" | VendorKind | "torob" | "divar" | "traffic";
const MAP_LAYERS: { key: MapLayer; emoji: string; label: string; group: string }[] = [
  { key: "money", emoji: "💵", label: msg("Money"), group: msg("The game") },
  { key: "jobs", emoji: "📦", label: msg("Store jobs"), group: msg("The game") },
  { key: "players", emoji: "👥", label: msg("Players"), group: msg("The game") },
  { key: "biz", emoji: "🏪", label: msg("Businesses"), group: msg("The game") },
  ...VENDOR_KIND_KEYS.map((k) => ({ key: k, emoji: VENDOR_KINDS[k].emoji, label: VENDOR_KINDS[k].label, group: msg("Menus from Snappfood") })),
  { key: "places", emoji: "📍", label: msg("Real places"), group: msg("Around you") },
  { key: "torob", emoji: "🏷️", label: msg("Walk-in stores (Torob)"), group: msg("Around you") },
  { key: "divar", emoji: "📢", label: msg("Divar ads"), group: msg("Around you") },
  { key: "traffic", emoji: "🚦", label: msg("Live traffic"), group: msg("Around you") },
];
const ALL_LAYERS = MAP_LAYERS.map((l) => l.key);
const LAYER_GROUPS = [...new Set(MAP_LAYERS.map((l) => l.group))];
/** The layers there were when the player saved their choice (the ones since then start on). */
const MAP_LAYERS_KNOWN_KEY = "sq_map_layers_known";
/** Choices saved before the list of known layers was kept: places, vendors, Divar and traffic existed. */
const LAYERS_BEFORE_TOROB: string[] = ["places", ...VENDOR_KIND_KEYS, "divar", "traffic"];
/** Kinds of real place the player hid on the map. */
const MAP_KINDS_KEY = "sq_map_kinds";
/** Fetch Snappfood vendors / Divar ads again this far from the last fetch, or after this long. */
const VENDOR_REFETCH_M = 500;
const TOROB_REFETCH_M = 800;
const DIVAR_REFETCH_M = 800;
const EXT_REFRESH_MS = 10 * 60_000;
/** The world (money, jobs, players…) reloads this often while the app is on screen. */
const WORLD_REFRESH_MS = 25_000;
/** The world's "nearest few" are ranked from a point that moves only after this walk (m). */
const WORLD_ANCHOR_M = 250;
/** Navigation: re-route this far off the line, or this often for fresh traffic; arrived this close. */
const OFF_ROUTE_M = 70;
const ROUTE_REFRESH_MS = 2 * 60_000;
const ARRIVED_M = 35;

/** How far a point is from a route line (metres, flat-earth: fine at city scale). */
function offRouteM(p: LatLng, line: [number, number][]) {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180), ky = 110_540;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - p.lng) * kx, ay = (line[i - 1][0] - p.lat) * ky;
    const bx = (line[i][1] - p.lng) * kx, by = (line[i][0] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const k = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * k, ay + dy * k));
  }
  return best;
}
/** Longest an action waits for the latest position to reach the server. */
const FLUSH_WAIT_MS = 2500;
const TOAST_OUT_MS = 220;

const PHASE_ICON = { night: "🌙", dawn: "🌅", day: "☀️", dusk: "🌇" } as const;
const PHASE_LABEL = { night: msg("NIGHT"), dawn: msg("DAWN"), day: msg("DAY"), dusk: msg("DUSK") } as const;

export default function Game() {
  // The loading screen is also rendered on the server: it needs the request's language.
  const T = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [simPos, setSimPos] = useState<LatLng | null>(null);
  const [simMode, setSimMode] = useState(false);
  // Play from home: the commander travels toward where you tap, at a capped speed.
  const [homePos, setHomePos] = useState<LatLng | null>(null);
  const [travel, setTravel] = useState<LatLng | null>(null);
  const homeMode = !!me?.remotePlay && !simMode;
  const geo = useLocation(simMode ? simPos : homeMode ? homePos : null);
  const pos = geo.pos;
  const [follow, setFollow] = useState(true);
  const [panel, setPanel] = useState<PanelId | null>(null);
  // Opening a panel mounts a lot of UI. It renders as a transition, so the tapped tab
  // lights up at once and the phone stays responsive while the panel builds.
  const [panelPending, startPanel] = useTransition();
  const [navTo, setNavTo] = useState<PanelId | null>(null);
  const [marketFocus, setMarketFocus] = useState<string | null>(null); // a shop tapped on the map
  const [selected, setSelected] = useState<Selected | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toasts, setToasts] = useState<(Toast & { out?: boolean })[]>([]);
  const [picker, setPicker] = useState<{ label: string; cb: (p: LatLng) => void } | null>(null);
  const [chat, setChat] = useState<{ room: string; label: string } | null>(null);
  // The video call on screen (placing one, ringing, or live). Handled calls are
  // remembered so a poll that was already in flight can't ring the same call again.
  const [call, setCall] = useState<CallInvite | null>(null);
  const callRef = useRef(call);
  callRef.current = call;
  const handledCalls = useRef(new Set<string>());
  const [unread, setUnread] = useState(0);
  const [inbox, setInbox] = useState(0);
  const [tour, setTour] = useState(false);
  // Nav badges the player clears by opening the panel: each badge has a signature of
  // what it's about; once seen, it stays hidden until something new changes it.
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem("sq_seen") ?? "{}"));
    } catch {}
  }, []);
  const [announce, setAnnounce] = useState<{ id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  // The 3D city (drive mode), optionally heading somewhere; and a profile to open in Social.
  const [driveOn, setDriveOn] = useState<{ goal: LatLng | null } | null>(null);
  const [profileFocus, setProfileFocus] = useState<string | null>(null);
  // How the map looks: the illustrated fantasy map (default), satellite, terrain… (mapStyles.ts).
  const [mapStyle, setMapStyle] = useState<MapStyle>(styleById(null));
  const [stylesOpen, setStylesOpen] = useState(false);
  useEffect(() => {
    try {
      setMapStyle(styleById(localStorage.getItem(MAP_LOOK_KEY)));
    } catch {}
  }, []);
  const pickLook = (next: MapStyle) => {
    setMapStyle(next);
    try {
      localStorage.setItem(MAP_LOOK_KEY, next.id);
    } catch {}
  };
  // On the map: real places, Snappfood vendors by kind, Divar ads, live traffic (all on by default).
  const [filterOpen, setFilterOpen] = useState(false);
  const [layers, setLayers] = useState<MapLayer[]>(ALL_LAYERS);
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const vendorsAt = useRef<{ pos: LatLng; at: number; ok: boolean } | null>(null);
  const [torobShops, setTorobShops] = useState<TorobPlace[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const torobAt = useRef<{ pos: LatLng; at: number; ok: boolean } | null>(null);
  const [divar, setDivar] = useState<DivarArea[]>([]);
  const divarAt = useRef<{ pos: LatLng; at: number; ok: boolean } | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(MAP_LAYERS_KEY) ?? "null");
      // A layer added since the player last chose starts on, like everything did for them.
      const known = JSON.parse(localStorage.getItem(MAP_LAYERS_KNOWN_KEY) ?? "null") ?? LAYERS_BEFORE_TOROB;
      if (Array.isArray(v)) setLayers(ALL_LAYERS.filter((k) => v.includes(k) || !known.includes(k)));
      const kinds = JSON.parse(localStorage.getItem(MAP_KINDS_KEY) ?? "null");
      if (Array.isArray(kinds)) setHiddenKinds(kinds.filter((k) => typeof k === "string"));
    } catch {}
  }, []);
  /** Everything on (every kind of place too), or nothing. */
  const showAll = (show: boolean) => {
    toggleLayer(show ? "all" : "none");
    if (!show || !hiddenKinds.length) return;
    setHiddenKinds([]);
    try {
      localStorage.removeItem(MAP_KINDS_KEY);
    } catch {}
  };
  const toggleKind = (k: string) => {
    const next = hiddenKinds.includes(k) ? hiddenKinds.filter((x) => x !== k) : [...hiddenKinds, k];
    setHiddenKinds(next);
    try {
      localStorage.setItem(MAP_KINDS_KEY, JSON.stringify(next));
    } catch {}
  };
  const toggleLayer = (k: MapLayer | "all" | "none") => {
    const next = k === "all" ? [...ALL_LAYERS] : k === "none" ? [] : layers.includes(k) ? layers.filter((x) => x !== k) : [...layers, k];
    setLayers(next);
    try {
      localStorage.setItem(MAP_LAYERS_KEY, JSON.stringify(next));
      localStorage.setItem(MAP_LAYERS_KNOWN_KEY, JSON.stringify(ALL_LAYERS));
    } catch {}
  };
  const vendorsOn = VENDOR_KIND_KEYS.some((k) => layers.includes(k));
  const divarOn = layers.includes("divar");
  const torobOn = layers.includes("torob");
  // Load them around the player; again after a walk, every 10 minutes (open/closed, new
  // ads), or a minute after a failed try. `now` ticks while standing still.
  useEffect(() => {
    if (!vendorsOn || !pos) return;
    const last = vendorsAt.current;
    if (last && distanceM(last.pos, pos) < VENDOR_REFETCH_M && Date.now() - last.at < (last.ok ? EXT_REFRESH_MS : 60_000)) return;
    const tried = (vendorsAt.current = { pos, at: Date.now(), ok: false as boolean });
    api<{ vendors: Vendor[] }>(`/api/local?near=1&lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}`)
      .then((r) => {
        tried.ok = true;
        setVendors(r.vendors);
      })
      .catch(() => {});
  }, [vendorsOn, pos, now]);
  useEffect(() => {
    if (!divarOn || !pos) return;
    const last = divarAt.current;
    if (last && distanceM(last.pos, pos) < DIVAR_REFETCH_M && Date.now() - last.at < (last.ok ? EXT_REFRESH_MS : 60_000)) return;
    const tried = (divarAt.current = { pos, at: Date.now(), ok: false as boolean });
    api<{ areas: DivarArea[] }>(`/api/local?divar=1&lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}`)
      .then((r) => {
        tried.ok = true;
        setDivar(r.areas);
      })
      .catch(() => {});
  }, [divarOn, pos, now]);
  useEffect(() => {
    if (!torobOn || !pos) return;
    const last = torobAt.current;
    if (last && distanceM(last.pos, pos) < TOROB_REFETCH_M && Date.now() - last.at < (last.ok ? EXT_REFRESH_MS : 60_000)) return;
    const tried = (torobAt.current = { pos, at: Date.now(), ok: false as boolean });
    api<{ shops: TorobPlace[]; pending?: boolean }>(`/api/local?torobNear=1&lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}`)
      .then((r) => {
        // Still building the store map (the first time ever): ask again in a minute.
        tried.ok = !r.pending;
        setTorobShops(r.shops);
      })
      .catch(() => {});
  }, [torobOn, pos, now]);
  const shownVendors = useMemo(() => vendors.filter((v) => layers.includes(v.kind)), [vendors, layers]);
  // Real places with no job on the map: one sign per store (a Snappfood vendor that is the
  // same store keeps its sign — it has the menu).
  const spotsAround = useMemo(() => {
    if (!world || !layers.includes("places")) return [];
    const jobs = new Set(world.places.map((m) => m.place.id));
    return (world.spots ?? []).filter(
      (p) => !jobs.has(p.id) && !shownVendors.some((v) => Math.abs(v.lat - p.lat) < 0.004 && Math.abs(v.lng - p.lng) < 0.005 && sameStore(p, v, distanceM(p, v))),
    );
  }, [world, layers, shownVendors]);
  const shownSpots = useMemo(() => (hiddenKinds.length ? spotsAround.filter((p) => !hiddenKinds.includes(p.cat)) : spotsAround), [spotsAround, hiddenKinds]);
  // The game's own markers, as the filter has them.
  const mapWorld = useMemo(
    () =>
      world && {
        ...world,
        money: layers.includes("money") ? world.money : [],
        places: layers.includes("jobs") ? world.places : [],
        players: layers.includes("players") ? world.players : [],
        businesses: layers.includes("biz") ? world.businesses : [],
      },
    [world, layers],
  );
  /** The filter's chips, each with how many there are around. */
  const filterGroups = useMemo(() => {
    const count: Partial<Record<MapLayer, number>> = {
      money: world?.money.length ?? 0,
      jobs: world?.places.length ?? 0,
      players: world?.players.length ?? 0,
      biz: world?.businesses.length ?? 0,
      places: (world?.spots ?? []).length,
      torob: torobShops.length,
      divar: divar.length,
    };
    for (const k of VENDOR_KIND_KEYS) count[k] = vendors.filter((v) => v.kind === k).length;
    return LAYER_GROUPS.map((g) => ({ title: g, items: MAP_LAYERS.filter((l) => l.group === g).map((l) => ({ key: l.key, emoji: l.emoji, label: l.label, count: l.key === "traffic" ? undefined : count[l.key] })) }));
  }, [world, vendors, torobShops, divar]);
  const kindChips = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of spotsAround) n.set(p.cat, (n.get(p.cat) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([k, count]) => ({ key: k, emoji: (PLACE_CATS[k as PlaceCat] ?? PLACE_CATS.shop).emoji, label: (PLACE_CATS[k as PlaceCat] ?? PLACE_CATS.shop).label, count }));
  }, [spotsAround]);
  const hiddenCount = ALL_LAYERS.length - layers.length + hiddenKinds.filter((k) => kindChips.some((c) => c.key === k)).length;
  const [meTab, setMeTab] = useState<HeroTabId>("quests");
  const [adOpen, setAdOpen] = useState<AdOffer | null>(null);
  const lastWorldFetch = useRef<{ at: number; pos: LatLng } | null>(null);

  // ---- data loading
  // Several loads can be in flight (an action's refresh, the sync poll, a timer…) and
  // phones don't answer in order: each response carries a ticket and only one newer
  // than what's on screen is applied, so a slow old answer can't undo a fresh one.
  const meTicket = useRef({ issued: 0, shown: 0 });
  const worldTicket = useRef({ issued: 0, shown: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadMe = useCallback(() => {
    const t = ++meTicket.current.issued;
    return api<Me>("/api/me")
      .then((m) => {
        if (t < meTicket.current.shown) return;
        meTicket.current.shown = t;
        // Admin settings (reach radius, ranges, costs…) must be live before anything renders.
        applyConfig(m.settings);
        setMe(m);
        setLoadError(null);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);
  /** Optimistic local change: show it now and drop any older answer still on its way. */
  const patchMe = useCallback((fn: (m: Me) => Me) => {
    meTicket.current.shown = ++meTicket.current.issued;
    setMe((m) => m && fn(m));
  }, []);
  const patchWorld = useCallback((fn: (w: World) => World) => {
    worldTicket.current.shown = ++worldTicket.current.issued;
    setWorld((w) => w && fn(w));
  }, []);
  // Read the position through a ref so loadWorld stays stable: otherwise every GPS fix
  // recreated it and restarted the 45 s refresh timer, which then never fired.
  const posRef = useRef(pos);
  posRef.current = pos;
  const worldAnchor = useRef<LatLng | null>(null);
  const loadWorld = useCallback(async (force = false) => {
    const pos = posRef.current;
    if (!pos) return;
    const last = lastWorldFetch.current;
    if (!force && last && Date.now() - last.at < 30_000 && distanceM(last.pos, pos) < 80) return;
    lastWorldFetch.current = { at: Date.now(), pos };
    const t = ++worldTicket.current.issued;
    try {
      // Keep the ranking anchor still until the player has walked a block away (see /api/world).
      const a = worldAnchor.current;
      const anchor = a && distanceM(a, pos) < WORLD_ANCHOR_M ? a : (worldAnchor.current = { lat: pos.lat, lng: pos.lng });
      const w = await api<World>(`/api/world?lat=${pos.lat}&lng=${pos.lng}&alat=${anchor.lat.toFixed(6)}&alng=${anchor.lng.toFixed(6)}`);
      if (t < worldTicket.current.shown) return;
      worldTicket.current.shown = t;
      setWorld(w);
    } catch {}
  }, []);

  // Toasts slide out (TOAST_OUT_MS) before they're removed; the same message twice in a
  // row shows once.
  const dismissToast = useCallback((id: number | undefined) => {
    setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, out: true } : x)));
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), TOAST_OUT_MS);
  }, []);
  const toast = useCallback(
    (n: Toast) => {
      const id = Math.random();
      setToasts((ts) => (ts.some((x) => !x.out && x.title === n.title && x.body === n.body) ? ts : [...ts.slice(-3), { ...n, id }]));
      setTimeout(() => dismissToast(id), toastLife(n));
    },
    [dismissToast],
  );
  const lookFailed = useCallback(
    (s: MapStyle, fellBack: boolean) =>
      toast(fellBack ? { kind: "info", title: t("{style} map is blocked on this connection — showing a similar map instead", { style: t(s.name) }) } : { kind: "error", title: t("{style} map can't load on this connection — pick another style", { style: t(s.name) }) }),
    [toast],
  );

  const refresh = useCallback(() => {
    loadMe();
    // small delay lets the server's position heartbeat land first
    setTimeout(() => loadWorld(true), 150);
  }, [loadMe, loadWorld]);

  const flush = geo.flush;
  const act = useCallback<GameCtx["act"]>(
    async (fn) => {
      try {
        // Let the server see where we are first, but never hold the tap hostage to a
        // slow network: after a moment the action goes anyway.
        await Promise.race([flush(), new Promise((r) => setTimeout(r, FLUSH_WAIT_MS))]);
        const r = await fn();
        if (r?.message) toast({ kind: "reward", title: r.message });
        // Anything that paid out flies from the button into the HUD (Latin or Persian digits).
        if (r?.message) flyRewards(parseRewards(r.message));
        sfx("reward");
        navigator.vibrate?.([40, 30, 40]);
        refresh();
        return true;
      } catch (e) {
        toast({ kind: "error", title: (e as Error).message });
        sfx("error");
        // A rejected action usually means the screen was out of date ("Already collected",
        // "That squad is gone", a run that just failed): reload so it stops offering it.
        refresh();
        return false;
      }
    },
    [toast, refresh, flush],
  );

  useEffect(() => {
    loadMe();
    api<{ announcements: NonNullable<typeof announce>[] }>("/api/announcements").then((r) => setAnnounce(r.announcements[0] ?? null)).catch(() => {});
    // keep the server's notion of our timezone fresh (travelers!)
    api("/api/me", { method: "PATCH", body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }).catch(() => {});
  }, [loadMe]);

  useEffect(() => {
    loadWorld(); // throttled: only refetches after 30 s or 80 m of movement
  }, [pos?.lat, pos?.lng, loadWorld]);
  // Live while on screen: reload often, never in the background, at once on coming back.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState !== "hidden" && loadWorld(true), WORLD_REFRESH_MS);
    const back = () => document.visibilityState === "visible" && loadWorld(true);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [loadWorld]);

  // ---- navigation: a live route to a spot, re-routed off course and for fresh traffic
  const [route, setRoute] = useState<(LiveRoute & { to: LatLng; name?: string; at: number }) | null>(null);
  const routeBusy = useRef(0);
  const findRoute = useCallback(
    async (to: LatLng & { name?: string }, quiet = false) => {
      const from = posRef.current;
      if (!from || Date.now() - routeBusy.current < 4000) return;
      routeBusy.current = Date.now();
      try {
        const r = await api<LiveRoute>(`/api/route?from=${from.lat.toFixed(6)},${from.lng.toFixed(6)}&to=${to.lat.toFixed(6)},${to.lng.toFixed(6)}`);
        setRoute({ ...r, to: { lat: to.lat, lng: to.lng }, name: to.name, at: Date.now() });
      } catch (e) {
        if (!quiet) toast({ kind: "error", title: (e as Error).message });
      }
    },
    [toast],
  );
  useEffect(() => {
    if (!route || !pos) return;
    if (distanceM(pos, route.to) <= ARRIVED_M) {
      setRoute(null);
      toast({ kind: "reward", title: t("🏁 You've arrived{name}", { name: route.name ? ` · ${route.name}` : "" }) });
      return;
    }
    if (offRouteM(pos, route.line) > OFF_ROUTE_M || Date.now() - route.at > ROUTE_REFRESH_MS) void findRoute({ ...route.to, name: route.name }, true);
  }, [pos, route, findRoute, toast]);


  // ---- GPS mini-games & story chapters
  const gps = useGpsGame(me?.gpsGame?.id ?? null, loadMe, toast);

  // The clock behind every countdown on screen. Each tick re-renders the whole game,
  // open panels included, so it only ticks every second while a countdown is showing.
  const countdowns =
    !!me?.activeRun || !!gps.view;
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), countdowns ? 1000 : 15_000);
    return () => clearInterval(t);
  }, [countdowns]);
  // Keep the screen on while moving (driving with the map open) or playing a GPS game.
  useWakeLock(geo.speed > 2 || !!gps.view);
  const driving = geo.speed > 7;

  // First-run tutorial, once the map is up (real GPS or play-from-home).
  const mapReady = !!geo.pos;
  useEffect(() => {
    if (!me || !mapReady) return;
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTimeout(() => setTour(true), 1200);
    } catch {}
  }, [me?.id, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // Notifications already on: re-register this device for whoever is signed in now.
  useEffect(() => {
    if (me?.id) void syncPush();
  }, [me?.id]);
  // Left the screen (home button, another app, phone locked): tell the server right away,
  // so pushes start now instead of after the presence window runs out.
  useEffect(() => {
    if (!me?.id) return;
    const onHide = () => document.visibilityState === "hidden" && reportAway();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", reportAway);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", reportAway);
    };
  }, [me?.id]);
  // Offer notifications: on first visit, and again after a first call ("call" wording).
  const [askPush, setAskPush] = useState<false | "general" | "call">(false);
  const endTour = useCallback(() => {
    setTour(false);
    markModeAsked(); // the tour's last step just asked walking vs home
    try {
      localStorage.setItem(TOUR_KEY, "1");
      // Then, once, offer notifications (only where they can actually work).
      if (pushSupported() && swEnabled() && Notification.permission === "default" && !localStorage.getItem("sq_push_asked")) setTimeout(() => setAskPush("general"), 1500);
    } catch {}
  }, []);

  // Back from Stripe Checkout: credit the gems (the webhook may already have).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("purchase");
    if (!id || !me) return;
    history.replaceState(null, "", "/play");
    if (id === "cancelled") return;
    api<{ message: string }>("/api/store", { body: { action: "confirm", sessionId: id } })
      .then((r) => {
        celebrate({ title: t("THANK YOU!"), body: r.message, emoji: "💎" });
        loadMe();
      })
      .catch((e) => toast({ kind: "error", title: (e as Error).message }));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from paying for a business plan.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("bizpaid");
    if (!id || !me) return;
    history.replaceState(null, "", "/play");
    api<{ message: string }>("/api/business", { body: { action: "confirm", sessionId: id } })
      .then((r) => {
        celebrate({ title: t("THANK YOU!"), body: r.message, emoji: "🏪" });
        setPanel("biz");
      })
      .catch((e) => toast({ kind: "error", title: (e as Error).message }));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // A crisp tap on every game button.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(".btn, .nav button, .fab, .tabs button, .close")) sfx("tap");
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  // Background music: day/night mood, silent during first-person fights.
  useEffect(() => startMusic(), []);
  useEffect(() => setMusicMood(world?.phase === "night" || world?.phase === "dusk" ? "night" : "day"), [world?.phase]);

  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
    return onMuteChange(setMutedState);
  }, []);

  // ---- "realtime" via polling (works on serverless hosts like Vercel)
  const syncSince = useRef(Date.now());
  const panelRef = useRef(panel);
  panelRef.current = panel;
  useEffect(() => {
    let stop = false;
    let busy = false;
    const tick = async () => {
      // On a slow connection a poll can outlast the interval: never run two at once, or
      // both read the same `since` and every notification pops up twice.
      if (document.hidden || busy) return;
      busy = true;
      try {
        const r = await api<{ now: number; unread: number; inbox: number; notifications: Toast[]; call: { id: string; video: boolean; peer: CallPeer } | null }>(`/api/sync?since=${syncSince.current}`);
        if (stop) return;
        syncSince.current = r.now;
        if (r.call && !callRef.current && !handledCalls.current.has(r.call.id)) setCall({ id: r.call.id, peer: r.call.peer, video: r.call.video, role: "callee" });
        setInbox(panelRef.current === "inbox" ? 0 : r.inbox);
        for (const n of r.notifications) toast(n);
        // React to what a notification *is* (its tag), never to its translated text.
        const tagged = (tag: string) => r.notifications.find((n) => n.tag === tag);
        if (tagged("incoming")) sfx("siren");
        else if (tagged("levelup")) {
          const n = tagged("levelup")!;
          celebrate({ title: n.title, body: n.body ?? undefined, emoji: "⭐" });
        }
        else if (tagged("hurt")) sfx("hurt");
        else if (r.notifications.some((n) => n.kind === "reward")) sfx("coin");
        else if (r.notifications.length) sfx("beep");
        if (r.notifications.some((n) => n.kind === "reward" || n.kind === "delivery" || n.kind === "social")) loadMe();
        if (r.unread && panelRef.current !== "crew") setUnread((u) => u + r.unread);
      } catch {
      } finally {
        busy = false;
      }
    };
    const t = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [toast, loadMe]);

  useEffect(() => {
    if (panel === "crew" || panel === "social") setUnread(0);
  }, [panel, unread]);

  // A call notification was tapped: ring right away (or answer, if they tapped Answer)
  // instead of waiting for the next sync poll.
  const ringNow = useCallback(
    async (id: string, answer: boolean) => {
      if (callRef.current || handledCalls.current.has(id)) return;
      try {
        const r = await api<{ call: { id: string; video: boolean; peer: CallPeer } | null }>(`/api/sync?since=${Date.now()}`);
        if (r.call?.id === id) setCall({ id, peer: r.call.peer, video: r.call.video, role: "callee", autoAnswer: answer });
        else toast({ kind: "info", title: t("📵 That call already ended") });
      } catch {}
    },
    [toast],
  );
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => e.data?.type === "CALL" && ringNow(e.data.call, !!e.data.answer);
    sw.addEventListener("message", onMsg);
    return () => sw.removeEventListener("message", onMsg);
  }, [ringNow]);

  // Deep links: /play?event=<id> joins an event;
  // /play?call=<id>[&answer=1] picks up a ringing video call.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const ringing = sp.get("call");
    if (ringing && me) {
      history.replaceState(null, "", "/play");
      void ringNow(ringing, sp.get("answer") === "1");
      return;
    }
    // Home-screen shortcuts: /play?panel=wallet|play|me…
    const want = sp.get("panel");
    if (want && me && ["nearby", "wallet", "play", "market", "jobs", "crew", "me", "store", "inbox", "events"].includes(want)) {
      history.replaceState(null, "", "/play");
      setPanel(want as PanelId);
      return;
    }
    const id = sp.get("event");
    if (!id || !me) return;
    history.replaceState(null, "", "/play");
    act(() => api(`/api/events/${id}`, { body: { action: "join" } })).then(() => setPanel("events"));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The home-screen shortcut straight into the 3D city: /play?drive=1 (once there's somewhere to start).
  const wantDrive = useRef(typeof location !== "undefined" && new URLSearchParams(location.search).get("drive") === "1");
  const canStart = !!(pos || me?.lastPos);
  useEffect(() => {
    if (!wantDrive.current || !me || !canStart) return;
    wantDrive.current = false;
    history.replaceState(null, "", "/play");
    setDriveOn({ goal: null });
  }, [me?.id, canStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- map interactions
  const onMapClick = (p: LatLng) => {
    if (picker) {
      picker.cb(p);
      setPicker(null);
      return;
    }
    if (simMode) setSimPos(p);
    else if (homeMode && homePos) setTravel(p);
  };
  // Stable handlers so the (memoized) map doesn't re-render on every 1 s HUD tick.
  const mapClickRef = useRef(onMapClick);
  mapClickRef.current = onMapClick;
  const handleMapClick = useCallback((p: LatLng) => mapClickRef.current(p), []);
  const handleUnfollow = useCallback(() => setFollow(false), []);
  const handleFollow = useCallback(() => setFollow(true), []);
  const handleSelect = useCallback((s: Selected) => {
    setSelected(s);
    setPanel(null);
  }, []);

  // Test mode: no GPS or walking needed. Tap the map (or "Teleport here") to move.
  // Remembered in this browser so a reload keeps you where you were.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TEST_MODE_KEY) ?? "null");
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
        setSimMode(true);
        setSimPos(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (simMode && simPos) localStorage.setItem(TEST_MODE_KEY, JSON.stringify(simPos));
      else if (!simMode && me) localStorage.removeItem(TEST_MODE_KEY);
    } catch {}
  }, [simMode, simPos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Test mode saved in this browser but no longer allowed (e.g. switched off for the live
  // game), or the player plays from home: drop it, or every position update is rejected.
  useEffect(() => {
    if (me && simMode && (!me.canSimulate || me.remotePlay)) {
      setSimMode(false);
      setSimPos(null);
    }
  }, [me?.canSimulate, me?.remotePlay, simMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Home mode: start where the server last saw you (or your real GPS), else let the player pick.
  useEffect(() => {
    if (!homeMode || homePos) return;
    const start = me?.lastPos ?? geo.pos ?? (me?.ipPos ? { lat: me.ipPos.lat, lng: me.ipPos.lng } : null);
    if (start) setHomePos(start);
    else setPicker({ label: t("🛋️ Tap where your commander starts"), cb: (p) => setHomePos(p) });
  }, [homeMode, me?.lastPos?.lat, geo.pos?.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!homeMode) {
      setHomePos(null);
      setTravel(null);
    }
  }, [homeMode]);
  const homeRef = useRef(homePos);
  homeRef.current = homePos;
  useEffect(() => {
    if (!homeMode || !travel) return;
    const t = setInterval(() => {
      const cur = homeRef.current;
      if (!cur) return;
      const d = distanceM(cur, travel);
      const step = S.remoteSpeedKmh / 3.6; // metres per 1 s tick
      if (d <= step) {
        setHomePos(travel);
        setTravel(null);
      } else setHomePos({ lat: cur.lat + ((travel.lat - cur.lat) * step) / d, lng: cur.lng + ((travel.lng - cur.lng) * step) / d });
    }, 1000);
    return () => clearInterval(t);
  }, [homeMode, travel]);
  const setHomeMode = useCallback(
    (on: boolean) =>
      act(() =>
        api("/api/me", { method: "PATCH", body: { remotePlay: on } }).then(() => {
          patchMe((m) => ({ ...m, remotePlay: on })); // switch now, not after the refresh
          return { message: on ? t("🛋️ Playing from home — tap the map to travel ({n} toman per pickup)", { n: S.moneyHome }) : t("🚶 Back to GPS — {n} toman per pickup", { n: S.moneyGps }) };
        }),
      ),
    [act, patchMe],
  );

  // Coming back to the game: a quick "walking or from home?" (not in test mode or mid-tour).
  const [modeAsk, closeModeAsk] = useModePrompt(!!me && S.remoteEnabled && !simMode && !tour);

  const toggleSim = () => {
    // Test mode and play-from-home are exclusive: test mode teleports, home mode travels.
    if (!simMode && me?.remotePlay) {
      setHomeMode(false).then((ok) => ok && toggleSimOn());
      return;
    }
    toggleSimOn();
  };
  const toggleSimOn = () => {
    if (simMode) {
      setSimMode(false);
      setSimPos(null);
      toast({ title: t("Test mode off"), body: t("Using your real GPS location") });
    } else {
      setSimMode(true);
      setSimPos(pos ?? { lat: 51.5079, lng: -0.0877 });
      toast({ title: t("🕹️ Test mode on"), body: t("No walking needed — tap the map or use “Go here”") });
    }
  };

  /** Pick up money: gone from the map at once, the toman flies into the wallet. */
  const collect = (id: string) =>
    act(() => api("/api/money", { body: { id } })).then((ok) => {
      if (!ok) return;
      sfx("coin");
      setSelected(null);
      patchWorld((w) => ({ ...w, money: w.money.filter((m) => m.id !== id) }));
    });

  const ctx = useMemo<GameCtx | null>(
    () =>
      me && {
        me,
        pos,
        world,
        toast,
        act,
        refresh,
        pick: (label, cb) => setPicker({ label, cb }),
        openChat: (room, label) => {
          setChat({ room, label });
          setPanel("crew");
        },
        startCall: (peer, video = true) => {
          if (callRef.current) return toast({ kind: "error", title: t("You're already on a call") });
          setCall({ peer, video, role: "caller" });
        },
        setPanel,
        openLink: (link) => {
          setSelected(null);
          if (link.startsWith("me:")) {
            setMeTab(link.slice(3) as HeroTabId);
            setPanel("me");
          } else setPanel(link as PanelId);
        },
        openShop: (id) => {
          setSelected(null);
          setMarketFocus(id);
          setPanel("market");
        },
        teleport: simMode ? (p) => setSimPos({ lat: p.lat, lng: p.lng }) : homeMode && homePos ? (p) => setTravel({ lat: p.lat, lng: p.lng }) : null,
        moveIcon: simMode ? "🕹️" : "🛋️",
        setHomeMode,
        startTour: () => {
          setPanel(null);
          setSelected(null);
          setTour(true);
        },
        drive: pos || me.lastPos ? (goal) => {
          setSelected(null);
          setPanel(null);
          setTravel(null);
          setDriveOn({ goal: goal ? { lat: goal.lat, lng: goal.lng } : null });
        } : null,
        openProfile: (id) => {
          setSelected(null);
          setProfileFocus(id);
          setPanel("social");
        },
        navigate: pos
          ? (to) => {
              setSelected(null);
              setFollow(true);
              void findRoute(to);
            }
          : null,
      },
    [me, pos, world, toast, act, refresh, simMode, homeMode, !!homePos, setHomeMode, findRoute], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!me || !ctx)
    return (
      <div className="game" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        {loadError && !me ? (
          <div className="modal">
            <div style={{ fontSize: 44 }}>⚠️</div>
            <h2>{T("Couldn't start the game")}</h2>
            <p className="muted small">{loadError}</p>
            <Button className="btn" onClick={() => loadMe()}>{T("Retry")}</Button>
          </div>
        ) : (
          <div className="splash">
            <div className="splash-art">
              <Art k="castle" size={120} anim="float" />
              <Art k="coin" size={44} className="splash-coin" anim="spin" />
              <Art k="sneaker" size={46} className="splash-shoe" anim="bounce" />
            </div>
            <div className="splash-title">StreetQuest</div>
            <div className="splash-bar"><i /></div>
            <div className="small muted">{T("LOADING…")}</div>
          </div>
        )}
      </div>
    );

  const badges: Partial<Record<PanelId, { n: number | string; sig: string }>> = {
    nearby: { n: world?.money.length ?? 0, sig: (world?.money ?? []).map((m) => m.id).sort().join(",") },
    wallet: me.toman >= S.cashoutMin && !me.cashoutPending ? { n: "💸", sig: `cash|${Math.floor(me.toman / S.cashoutMin)}` } : undefined,
    play: { n: me.goalsReady || (me.gpsGame ? "▶" : 0), sig: `${me.goalsReady}|${me.gpsGame?.id ?? ""}` },
    jobs: { n: (world?.deliveries.length ?? 0) + (world?.rides.length ?? 0), sig: [...(world?.deliveries ?? []), ...(world?.rides ?? [])].map((d) => d.id).sort().join(",") },
    // Orders waiting to be handed over, or the shop about to close.
    market: me.shop ? { n: me.shop.pending || (me.shop.expiresAt - Date.now() < SHOP_WARN_MS ? "!" : 0), sig: `${me.shop.pending}|${me.shop.expiresAt}` } : undefined,
    social: { n: unread + me.pendingFriends, sig: `${unread}|${me.pendingFriends}` },
    me: {
      n: me.questsReady || (me.dailyAvailable ? "!" : 0),
      sig: `${me.questsReady}|${me.dailyAvailable}|${me.level}`,
    },
  };
  const showBadge = (id: PanelId) => {
    const b = badges[id];
    return b && b.n ? (seen[id] === b.sig ? null : b.n) : null;
  };
  const openPanel = (id: PanelId) => {
    setPanel(id);
    const b = badges[id];
    if (b) {
      const next = { ...seen, [id]: b.sig };
      setSeen(next);
      try {
        localStorage.setItem("sq_seen", JSON.stringify(next));
      } catch {}
    }
  };

  const run = me.activeRun;
  const runLeft = run ? Math.max(0, Math.round((new Date(run.deadline).getTime() - now) / 1000)) : 0;
  const atRunTarget = run && pos ? distanceM(pos, { lat: run.targetLat, lng: run.targetLng }) <= INTERACT_RADIUS_M : false;
  const close = () => setPanel(null);
  const peek = !!picker;

  return (
    <Ctx.Provider value={ctx}>
      <EmojiArtLayer />
      <div className={`game ${driveOn ? "in-drive" : ""} map-${mapStyle.id}`}>
        <GameMap
          world={mapWorld}
          me={me}
          look={mapStyle}
          onTilesFail={lookFailed}
          follow={follow}
          picking={!!picker}
          travelTo={homeMode ? travel : null}
          game={gps.view}
          onUnfollow={handleUnfollow}
          onFollow={handleFollow}
          onMapClick={handleMapClick}
          onSelect={handleSelect}
          vendors={shownVendors}
          spots={shownSpots}
          divar={divarOn ? divar : undefined}
          torob={torobOn ? torobShops : undefined}
          traffic={layers.includes("traffic")}
          route={route}
        />

        {/* HUD: who I am on one side, my wallet and status on the other — one tidy row. */}
        <div className="hud">
          <div className="player-card" onClick={() => setPanel("me")} role="button" title={t("Profile")}>
            <div className="avatar">
              {me.avatar}
              <span className="lvl">{me.level}</span>
            </div>
            <div className="pc-text">
              <div className="pc-name">{me.username}</div>
              <div className="pc-title small">{me.title}</div>
              <div className="xpbar" data-fx-target="xp">
                <i style={{ width: `${me.levelPct * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="hud-right" data-tour="wallet">
            <Wallet me={me} inbox={inbox} onWallet={() => openPanel("wallet")} onStore={() => setPanel("store")} onInbox={() => setPanel("inbox")} />
            {/* One quiet pill of status: mood, steps, and only the warnings that apply right now. */}
            <div className="hud-status">
              <OnlineChip total={world?.onlineTotal} onOpen={() => setOnlineOpen(true)} />
              <StepChip onOpen={() => openPanel("play")} />
              {driving && !geo.simulated && <div className="chip small" title={t("Driving: the map zooms out and walking goals pause")}>🚗 {t("{n} km/h", { n: Math.round(geo.speed * 3.6) })}</div>}
              <GpsChip geo={geo} />
              {homeMode && (
                <Button className="chip small home-chip" onClick={() => (setMeTab("stats"), setPanel("me"))} title={t("Playing from home — tap to switch back to GPS")}>
                  🛋️ {t("{n} toman", { n: S.moneyHome })}
                </Button>
              )}
              {geo.simulated && !homeMode && (
                <Button className="chip small" style={{ color: "var(--yellow)", cursor: "pointer" }} onClick={toggleSim} title={t("Turn test mode off")}>
                  🕹️ <span>{t("TEST")}</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Everything waiting on you (or the current quest), folded into one line under the profile. */}
        <ReadyTray
          me={me}
          now={now}
          hidden={!!run || !!picker || !!panel || (homeMode && !!travel)}
          news={announce}
          onNewsSeen={() => setAnnounce(null)}
          onQuest={() => {
            setMeTab("quests");
            setPanel("me");
          }}
        />

        {route && !run && <RouteChip route={route} pos={pos} onClear={() => setRoute(null)} />}
        {onlineOpen && <OnlineSheet onClose={() => setOnlineOpen(false)} />}

        {run && (
          <div className="run-banner">
            <div>
              <div className="small muted">{t("TIMED RUN")}</div>
              <b style={{ fontFamily: "var(--display)" }}>{t(run.title)}</b>
              {pos && <div className="small muted">{t("{d} to 🎯", { d: formatDistance(distanceM(pos, { lat: run.targetLat, lng: run.targetLng })) })}</div>}
            </div>
            <div className={`t ${runLeft < 30 ? "low" : ""}`}>
              {Math.floor(runLeft / 60)}:{String(runLeft % 60).padStart(2, "0")}
            </div>
            {homeMode && !atRunTarget && runLeft > 0 && (
              <Button className="btn green small" onClick={() => setTravel({ lat: run.targetLat, lng: run.targetLng })}>🛋️ {t("Go")}</Button>
            )}
            {simMode && !atRunTarget && runLeft > 0 && (
              <Button className="btn yellow small" onClick={() => setSimPos({ lat: run.targetLat, lng: run.targetLng })}>
                🕹️ {t("Jump")}
              </Button>
            )}
            {runLeft === 0 ? (
              <Button className="btn ghost small" onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                {t("Failed")}
              </Button>
            ) : (
              <Button className="btn green small" disabled={!atRunTarget} onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                {t("Finish")}
              </Button>
            )}
            <Button className="close" title={t("Abandon")} onClick={() => askConfirm(t("Abandon this delivery?"), { body: t("You won't get paid for it, and this store's job is used up for now."), ok: t("Yes, abandon it"), cancel: t("No, keep going"), danger: true }).then((ok) => ok && act(() => api("/api/runs", { body: { runId: run.id, action: "abandon" } })))}>
              ✕
            </Button>
          </div>
        )}

        {gps.view && !run && !picker && (
          <GpsBanner
            g={gps.view}
            now={now}
            onQuit={() => act(() => api("/api/gpsgame", { body: { action: "quit" } })).then(() => loadMe())}
            onReroute={() => act(() => api("/api/gpsgame", { body: { action: "reroute" } })).then(() => gps.reload())}
          />
        )}


        {picker && (
          <div className="pick-banner">
            {picker.label}
            <Button className="close" onClick={() => setPicker(null)}>✕</Button>
          </div>
        )}

        {modeAsk && (
          <ModePrompt
            name={me.username}
            home={!!me.remotePlay}
            onClose={closeModeAsk}
            onPick={(home) => {
              setHomeMode(home);
              if (!home) geo.retry(); // a tap is the best moment to (re)ask for GPS
            }}
          />
        )}
        {!pos && !homeMode && !modeAsk && <LocationGate error={geo.error} onRetry={geo.retry} onSimulate={me.canSimulate ? toggleSim : undefined} onHome={S.remoteEnabled ? () => setHomeMode(true) : undefined} />}

        {homeMode && travel && pos && !picker && (
          <div className="travel-banner">
            🛋️ <b>{t("Travelling")}</b>
            <span className="small">{t("{d} · {n} min", { d: formatDistance(distanceM(pos, travel)), n: Math.ceil(distanceM(pos, travel) / (S.remoteSpeedKmh / 3.6) / 60) })}</span>
            <Button className="btn ghost small" onClick={() => setTravel(null)}>{t("Stop")}</Button>
          </div>
        )}

        {/* Floating buttons: only what you need right now; the rest lives behind ⋯ */}
        <div className="fab-col">
          <Button className={`fab map-filter-fab ${filterOpen ? "on" : ""}`} title={t("Filter the map")} aria-label={t("Filter the map")} aria-expanded={filterOpen} onClick={() => (setFilterOpen(!filterOpen), setMoreOpen(false))}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5h16l-6.2 7.4V18l-3.6 1.8v-7.4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            {hiddenCount > 0 && <span className="badge">{fmtNum(hiddenCount)}</span>}
          </Button>
          {filterOpen && (
            <MapFilter
              groups={filterGroups}
              on={(k) => layers.includes(k as MapLayer)}
              onToggle={(k) => toggleLayer(k as MapLayer)}
              onAll={showAll}
              kinds={layers.includes("places") ? { items: kindChips, hidden: hiddenKinds, onToggle: toggleKind } : null}
              onClose={() => setFilterOpen(false)}
            />
          )}
          <Button className="fab" title={t("More")} aria-label={t("More")} aria-expanded={moreOpen} onClick={() => (setMoreOpen(!moreOpen), setStylesOpen(false), setFilterOpen(false))} style={{ outline: moreOpen ? "2px solid var(--yellow)" : undefined }}>
            ⋯
          </Button>
          {moreOpen && stylesOpen && (
            <div className="more-menu styles" role="menu" aria-label={t("Map style")}>
              <Button role="menuitem" className="back" onClick={() => setStylesOpen(false)}>
                ‹ {t("Map style")}
              </Button>
              {MAP_STYLES.map((s) => (
                <Button key={s.id} role="menuitemradio" aria-checked={s.id === mapStyle.id} className={s.id === mapStyle.id ? "on" : ""} onClick={() => pickLook(s)}>
                  <span aria-hidden>{s.emoji}</span> {t(s.name)}
                </Button>
              ))}
            </div>
          )}
          {moreOpen && !stylesOpen && (
            <div className="more-menu" role="menu">
              {me.canSimulate && (
                <Button role="menuitem" onClick={() => (toggleSim(), setMoreOpen(false))} className={simMode ? "on" : ""}>
                  🕹️ {simMode ? t("Test mode on — tap to use real GPS") : t("Test mode: play without walking")}
                </Button>
              )}
              <Button role="menuitem" aria-haspopup="menu" onClick={() => setStylesOpen(true)}>
                {mapStyle.emoji} {t("Map style")} <span className="small">· {t(mapStyle.name)}</span>
              </Button>
              <Button role="menuitem" aria-haspopup="dialog" onClick={() => (setFilterOpen(true), setMoreOpen(false))}>
                🗺️ {t("On the map")} <span className="small">· {fmtNum(layers.length)}/{fmtNum(ALL_LAYERS.length)}</span>
              </Button>
              <Button role="menuitem" onClick={() => setMuted(!muted)}>
                {muted ? "🔇" : "🔊"} {muted ? t("Turn sound on") : t("Turn sound off")}
              </Button>
            </div>
          )}
          <Button className={`fab ${!follow && pos ? "fab-recenter" : ""}`} title={t("Re-center on me")} aria-label={t("Re-center the map on me")} aria-pressed={follow} onClick={() => setFollow(true)} style={{ color: follow ? "var(--cyan)" : undefined }}>
            ◎
          </Button>
        </div>

        {/* Get in the car: the 3D city */}
        {!panel && !selected && !picker && !run && (pos || me.lastPos) && (
          <Button className="drive-fab" data-tour="drive" onClick={() => ctx.drive?.()} title={homeMode || simMode ? t("Drive the 3D city") : t("See your street in 3D")}>
            <span className="drive-fab-ic"><Icon name="wheel" size={22} /></span>
            <span className="drive-fab-lb">{homeMode || simMode ? t("DRIVE") : t("3D")}</span>
          </Button>
        )}

        <Toasts toasts={toasts} onDismiss={dismissToast} onOpen={(l) => ctx.openLink(l)} />

        {/* Selected object card */}
        {selected && !panel && (
          <InfoCard
            sel={selected}
            onClose={() => setSelected(null)}
            onCollect={collect}
          />
        )}

        {panel === "nearby" && <NearbyPanel onClose={close} peek={peek} />}
        {panel === "wallet" && <WalletPanel onClose={close} peek={peek} />}
        {panel === "jobs" && <JobsPanel onClose={close} peek={peek} />}
        {panel === "market" && <MarketPanel onClose={close} peek={peek} focus={marketFocus} onFocused={() => setMarketFocus(null)} />}
        {panel === "crew" && <CrewPanel onClose={close} peek={peek} chat={chat} setChat={setChat} />}
        {panel === "events" && <EventsPanel onClose={close} peek={peek} />}
        {panel === "inbox" && <InboxPanel onClose={close} peek={peek} onRead={() => setInbox(0)} />}
        {panel === "play" && <PlayPanel onClose={close} peek={peek} onStarted={loadMe} />}
        {panel === "store" && <StorePanel onClose={close} peek={peek} onWatch={setAdOpen} />}
        {panel === "social" && <SocialPanel onClose={close} peek={peek} profileId={profileFocus} onProfileShown={() => setProfileFocus(null)} />}
        {panel === "biz" && <BusinessPanel onClose={close} peek={peek} />}
        {panel === "me" && (
          <ProfilePanel
            key={meTab}
            initialTab={meTab}
            onClose={() => {
              close();
              setMeTab("quests");
            }}
            peek={peek}
          />
        )}

        {/* Phones hide it under an open panel; tablets/desktop keep it beside the side panel (CSS). */}
        <nav className={`nav ${panel || selected ? "with-sheet" : ""}`}>
          {NAV.map(([id, ic, label]) => {
            const b = showBadge(id);
            // Crew & chat opens from Social, so Social stays lit (and closes it) while it's open.
            const showing = panelPending && navTo ? navTo : panel;
            const on = showing === id || (id === "social" && showing === "crew");
            return (
              <Button
                key={id}
                data-tour={`nav-${id}`}
                title={t(label)}
                aria-label={b != null ? t("{label}, {n} new", { label: t(label), n: b }) : t(label)}
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  if (on) {
                    close();
                    if (id === "me") setMeTab("quests");
                    return;
                  }
                  setNavTo(id);
                  startPanel(() => {
                    setSelected(null);
                    if (panel === "me") setMeTab("quests");
                    openPanel(id);
                  });
                }}
                className={on ? "on" : ""}
              >
                <span className="ic">{ic}</span>
                <span className="nav-lb">{t(label)}</span>
                {b != null && <span className="badge pop">{typeof b === "number" ? fmtNum(b) : b}</span>}
              </Button>
            );
          })}
        </nav>

        {driveOn && (pos ?? me.lastPos) && (
          <Drive
            start={(pos ?? me.lastPos)!}
            goal={driveOn.goal}
            canDrive={simMode || homeMode}
            sim={simMode}
            follow={simMode || homeMode ? null : pos}
            onMove={simMode ? setSimPos : homeMode ? setHomePos : null}
            onCollect={(id) => collect(id).then(() => undefined)}
            onSelect={(s) => {
              setDriveOn(null);
              handleSelect(s);
            }}
            onProfile={() => {
              setDriveOn(null);
              setPanel("me");
            }}
            onExit={() => setDriveOn(null)}
          />
        )}

        {call && (
          <CallScreen
            key={call.id ?? `to:${call.peer.id}`}
            invite={call}
            onDone={(id) => {
              if (id) handledCalls.current.add(id);
              setCall(null);
              // Calls are the best reason to allow notifications: ask once, even after an earlier "Not now".
              try {
                if (pushSupported() && swEnabled() && Notification.permission === "default" && !localStorage.getItem("sq_push_asked_call")) {
                  localStorage.setItem("sq_push_asked_call", "1");
                  setAskPush("call");
                }
              } catch {}
            }}
          />
        )}

        {adOpen && <AdModal offer={adOpen} onClose={() => (setAdOpen(null), loadMe())} />}
        <CelebrationLayer />
        {askPush && (
          <div className="modal-bg" style={{ zIndex: 2500 }}>
            <div className="modal">
              <div style={{ fontSize: 56 }}>🔔</div>
              {askPush === "call" ? (
                <>
                  <h2>{t("Don't miss a call")}</h2>
                  <p className="muted small" style={{ lineHeight: 1.5 }}>{t("Let your phone ring when your crew video-calls you — even when the game is closed — and hear about money drops too. You can turn it off any time in Profile → Settings.")}</p>
                </>
              ) : (
                <>
                  <h2>{t("Don't miss a money drop")}</h2>
                  <p className="muted small" style={{ lineHeight: 1.5 }}>{t("Get a notification when money is dropped near you, a cash-out is paid or your crew needs you — even when the game is closed. You can turn it off any time in Profile → Settings.")}</p>
                </>
              )}
              <div className="row wrap" style={{ justifyContent: "center" }}>
                <Button className="btn ghost" onClick={() => { setAskPush(false); try { localStorage.setItem("sq_push_asked", "1"); } catch {} }}>{t("Not now")}</Button>
                <Button
                  className="btn green"
                  onClick={() => {
                    setAskPush(false);
                    try { localStorage.setItem("sq_push_asked", "1"); } catch {}
                    enablePush().then(() => toast({ kind: "reward", title: t("🔔 Notifications on") })).catch((e) => toast({ kind: "error", title: (e as Error).message }));
                  }}
                >
                  {t("Turn on")}
                </Button>
              </div>
            </div>
          </div>
        )}
        {tour && <Tour onDone={endTour} onChooseHome={(home) => home !== me.remotePlay && setHomeMode(home)} />}

      </div>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- HUD step counter
function StepChip({ onOpen }: { onOpen: () => void }) {
  const { today } = useSteps();
  const [tick, setTick] = useState(false);
  useEffect(
    () =>
      pedometer.onStep(() => {
        setTick(true);
        setTimeout(() => setTick(false), 360);
      }),
    [],
  );
  const R = 11;
  const C = 2 * Math.PI * R;
  return (
    <Button className={`chip small step-chip ${tick ? "tick" : ""}`} onClick={onOpen} title={t("{n} of {goal} steps today — they power your Empire", { n: today, goal: STEP_GOAL })} data-tour="steps">
      <span className="mini-ring">
        <svg viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r={R} className="track" />
          <circle cx="13" cy="13" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, today / STEP_GOAL))} />
        </svg>
        <Art k="sneaker" />
      </span>
      {fmtNum(today)}
    </Button>
  );
}

// ---------------------------------------------------------------- navigation
/** The route being followed: where to, how long in today's traffic, and the next turn. */
function RouteChip({ route, pos, onClear }: { route: LiveRoute & { to: LatLng; name?: string }; pos: LatLng | null; onClear: () => void }) {
  const left = pos ? distanceM(pos, route.to) : route.distanceM;
  // The next turn: the first step start still ahead of the closest one.
  let next = route.steps[0];
  if (pos && route.steps.length) {
    let i = 0, best = Infinity;
    route.steps.forEach((s, n) => {
      const d = distanceM(pos, { lat: s.at[0], lng: s.at[1] });
      if (d < best) (best = d), (i = n);
    });
    next = best < 40 ? route.steps[i + 1] ?? route.steps[i] : route.steps[i];
  }
  // Time left scales with the distance left (the route is refreshed every couple of minutes).
  const mins = Math.max(1, Math.round((route.durationS * Math.min(1, left / Math.max(1, route.distanceM))) / 60));
  return (
    <div className="route-chip" role="status">
      <div className="grow">
        <b dir="auto">🧭 {route.name ?? t("Route")}</b>
        <div className="small">{t("{n} min · {d} · live traffic", { n: fmtNum(mins), d: formatDistance(left) })}</div>
        {next && <div className="small muted" dir="auto">↪ {next.text}</div>}
      </div>
      <Button className="btn small ghost" onClick={onClear} aria-label={t("Stop navigation")}>✕</Button>
    </div>
  );
}

// ---------------------------------------------------------------- tap-on-map detail card
function InfoCard({ sel, onClose, onCollect }: { sel: Selected; onClose: () => void; onCollect: (id: string) => void }) {
  const { pos, act, me, world, openChat, startCall, setPanel, teleport, openShop, openProfile } = useGame();
  const target = sel.type === "delivery" || sel.type === "ride" ? { lat: sel.data.pickupLat, lng: sel.data.pickupLng } : sel.type === "place" ? sel.data.place : sel.data;
  const dist = pos ? distanceM(pos, target) : Infinity;
  const inRange = dist <= INTERACT_RADIUS_M;
  const tooFar = teleport ? (
    <Button className="btn yellow block" onClick={() => teleport(target)}><MoveIcon /> {t("Go here · {d}", { d: formatDistance(dist) })}</Button>
  ) : (
    <div className="row">
      <Button className="btn grow" disabled>{t("Get closer · {d}", { d: formatDistance(dist) })}</Button>
      {dist > 150 && <Directions to={target} />}
    </div>
  );

  // Stores: a job at a real restaurant/café/shop, or a business and its missions.
  if (sel.type === "place") return <PlaceCard m={world?.places.find((x) => x.id === sel.data.id) ?? sel.data} onClose={onClose} />;
  if (sel.type === "vendor") return <VendorCard v={sel.data} onClose={onClose} />;
  if (sel.type === "spot") {
    // A place whose job was just put on the map opens as that job.
    const job = world?.places.find((x) => x.place.id === sel.data.id);
    return job ? <PlaceCard m={job} onClose={onClose} /> : <SpotCard p={sel.data} onClose={onClose} />;
  }
  if (sel.type === "divar") return <DivarCard area={sel.data} onClose={onClose} />;
  if (sel.type === "torob") return <TorobPlaceCard p={sel.data} onClose={onClose} />;
  if (sel.type === "biz") return <BizCard b={world?.businesses.find((x) => x.id === sel.data.id) ?? sel.data} onClose={onClose} />;

  if (sel.type === "money") {
    const m = sel.data;
    return (
      <Sheet title={m.drop ? `✨ ${m.drop.label}` : t("💵 Money")} onClose={onClose}>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className={`icon-tile money-tile ${m.drop ? "gold" : ""}`} style={{ width: 70, height: 70, fontSize: 42 }}>💵</div>
          <div className="grow">
            <b className="money-amount">{t("{n} toman", { n: m.amount })}</b>
            {m.drop?.sponsor && <div><span className="tag" style={{ color: "var(--yellow)" }}>{t("Presented by {name}", { name: m.drop.sponsor })}</span></div>}
            <div className="small muted">
              {formatDistance(dist)} · {m.drop ? t("until {when}", { when: fmtTime(m.expiresAt) }) : t("gone in {n} min", { n: Math.max(0, Math.round((m.expiresAt - Date.now()) / 60000)) })}
            </div>
          </div>
        </div>
        {inRange ? <Button className="btn green block big-btn" onClick={() => onCollect(m.id)}>{t("💵 Pick it up")}</Button> : tooFar}
      </Sheet>
    );
  }

  if (sel.type === "note") {
    return (
      <Sheet title={sel.data.hasPhoto ? t("📸 Photo at this spot") : t("💬 Post at this spot")} onClose={onClose}>
        <NoteCard n={sel.data} dist={dist} />
        {!sel.data.unlocked && teleport && <Button className="btn yellow block" onClick={() => teleport(sel.data)}><MoveIcon /> {t("Go here")}</Button>}
      </Sheet>
    );
  }

  if (sel.type === "event") {
    const e = sel.data;
    return (
      <Sheet title={e.title} onClose={onClose}>
        <p className="small muted">{t("{start} – {end} · {n}/{max} going · {d}", { start: fmtTime(e.startsAt), end: fmtTime(e.endsAt), n: e.participants, max: e.maxPlayers, d: formatDistance(dist) })}</p>
        <p>{e.description}</p>
        <div className="row wrap">
          <Button className="btn" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "join" } }))}>{t("Join")}</Button>
          <Button className="btn green" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "checkin" } }))}>{t("Check in")}</Button>
          <Button className="btn cyan" onClick={() => openChat(`event:${e.id}`, e.title)}>{t("Chat")}</Button>
          <Button className="btn ghost" onClick={() => setPanel("events")}>{t("All events")}</Button>
        </div>
      </Sheet>
    );
  }

  if (sel.type === "delivery") {
    const d = sel.data;
    return (
      <Sheet title={`📦 ${d.title}`} onClose={onClose}>
        <p className="small muted">{t("Posted by {name} · reward {n} 🪙", { name: d.sender?.username ?? "", n: d.reward })}</p>
        {d.description && <p>{d.description}</p>}
        <p className="small">🟢 {d.pickupLabel}<br />🔴 {d.dropoffLabel} {t("({d} trip)", { d: formatDistance(distanceM({ lat: d.pickupLat, lng: d.pickupLng }, { lat: d.dropoffLat, lng: d.dropoffLng })) })}</p>
        <Button className="btn green block" onClick={() => act(() => api(`/api/deliveries/${d.id}`, { body: { action: "accept" } })).then((ok) => ok && onClose())}>
          {t("Accept job")}
        </Button>
      </Sheet>
    );
  }

  if (sel.type === "ride") {
    const r = sel.data;
    return (
      <Sheet title={t("🚕 {name} needs a ride", { name: r.rider?.username ?? t("Rider") })} onClose={onClose}>
        <p className="small muted">{t("{n, plural, one {# seat} other {# seats}} · pickup {d} from you · fare", { n: r.seats, d: formatDistance(dist) })} <b style={{ color: "var(--yellow)" }}>{fmtNum(r.fare)} 🪙</b></p>
        <p className="small">🟢 {r.pickupLabel}<br />🔴 {r.dropoffLabel} {t("({d} trip)", { d: formatDistance(distanceM({ lat: r.pickupLat, lng: r.pickupLng }, { lat: r.dropoffLat, lng: r.dropoffLng })) })}</p>
        {r.note && <p className="small muted">“{r.note}”</p>}
        <div className="row">
          <Button className="btn green grow" onClick={() => act(() => api(`/api/rides/${r.id}`, { body: { action: "accept" } })).then((ok) => ok && (onClose(), setPanel("jobs")))}>
            🚗 {t("Accept ride")}
          </Button>
          <Button className="btn ghost" onClick={() => setPanel("jobs")}>{t("All jobs")}</Button>
        </div>
      </Sheet>
    );
  }

  if (sel.type === "lottery") {
    // Read the live copy so the card updates after buying tickets.
    const l = world?.lotteries.find((x) => x.id === sel.data.id) ?? sel.data;
    return (
      <Sheet title={`🎰 ${l.official ? "⭐ " : ""}${l.name}`} onClose={onClose}>
        <LotteryCard l={l} />
      </Sheet>
    );
  }

  if (sel.type === "shop") {
    const sh = world?.shops.find((x) => x.id === sel.data.id) ?? sel.data;
    return (
      <Sheet title={`${sh.emoji} ${sh.name}`} onClose={onClose}>
        <p className="small muted">
          {sh.live ? t("Open") : t("Closed")} · {formatDistance(dist)}
          {sh.deal > 0 && <span className="deal-pill" style={{ marginInlineStart: 8 }}>{t("Up to {n}% off", { n: sh.deal })}</span>}
        </p>
        <div className="row wrap">
          <Button className="btn yellow" onClick={() => openShop(sh.id)}>{sh.mine ? `🛠️ ${t("My shop")}` : `🛍️ ${t("Visit the shop")}`}</Button>
          {teleport && dist > 40 && <Button className="btn ghost" onClick={() => teleport(sh)}><MoveIcon /> {t("Go there")}</Button>}
          {!teleport && dist > 150 && <Directions to={sh} />}
        </div>
        <StoreExtras query={{ store: "shop", id: sh.id }} at={sh} />
      </Sheet>
    );
  }

  const p = sel.data;
  return (
    <Sheet title={`${p.avatar} ${p.username}`} onClose={onClose} actions={<button className="close" onClick={() => openProfile(p.id)} title={t("Profile")} aria-label={t("Profile")}>👤</button>}>
      <p className="muted">
        {t("Level {n}", { n: p.level })} · {p.friend ? t("In your crew") : t("~ approximate location")}
      </p>
      {p.friend ? (
        <div className="row">
          <Button className="btn cyan grow" onClick={() => openChat(`dm:${[me.id, p.id].sort().join(":")}`, p.username)}>💬 {t("Message")}</Button>
          <Button className="btn green grow" onClick={() => startCall({ id: p.id, username: p.username, avatar: p.avatar }, false)}>📞 {t("Voice call")}</Button>
          <Button className="btn green grow" onClick={() => startCall({ id: p.id, username: p.username, avatar: p.avatar })}>📹 {t("Video call")}</Button>
        </div>
      ) : (
        <div className="row wrap">
          <Button className="btn ghost" onClick={() => act(() => api("/api/friends", { body: { action: "request", username: p.username } }))}>➕ {t("Add to crew")}</Button>
          <Button className="btn ghost" onClick={() => openProfile(p.id)}>👤 {t("Profile")}</Button>
        </div>
      )}
    </Sheet>
  );
}
