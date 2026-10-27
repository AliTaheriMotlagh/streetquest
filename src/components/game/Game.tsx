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
import { BizCard, PlaceCard } from "./PlaceCards";
import { SocialPanel } from "./Social";
import { BusinessPanel } from "./Business";
import { WalletPanel } from "./WalletPanel";

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
type MapLook = "fantasy" | "dark" | "classic";
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
  // How the map looks: an illustrated fantasy map (default), dark ops, or plain street map.
  const [mapStyle, setMapStyle] = useState<MapLook>("fantasy");
  useEffect(() => {
    try {
      const v = localStorage.getItem(MAP_LOOK_KEY);
      if (v === "fantasy" || v === "dark" || v === "classic") setMapStyle(v);
    } catch {}
  }, []);
  const cycleLook = () => {
    const next: MapLook = mapStyle === "fantasy" ? "dark" : mapStyle === "dark" ? "classic" : "fantasy";
    setMapStyle(next);
    try {
      localStorage.setItem(MAP_LOOK_KEY, next);
    } catch {}
    toast({ title: next === "fantasy" ? t("🗺️ Fantasy map") : next === "dark" ? t("🌃 Night-ops map") : t("🧭 Street map") });
  };
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
  const loadWorld = useCallback(async (force = false) => {
    const pos = posRef.current;
    if (!pos) return;
    const last = lastWorldFetch.current;
    if (!force && last && Date.now() - last.at < 30_000 && distanceM(last.pos, pos) < 80) return;
    lastWorldFetch.current = { at: Date.now(), pos };
    const t = ++worldTicket.current.issued;
    try {
      const w = await api<World>(`/api/world?lat=${pos.lat}&lng=${pos.lng}`);
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
  useEffect(() => {
    const t = setInterval(() => loadWorld(true), 45_000);
    return () => clearInterval(t);
  }, [loadWorld]);


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
      },
    [me, pos, world, toast, act, refresh, simMode, homeMode, !!homePos, setHomeMode], // eslint-disable-line react-hooks/exhaustive-deps
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
      <div className={`game ${driveOn ? "in-drive" : ""} map-${mapStyle}`}>
        <GameMap
          world={world}
          me={me}
          look={mapStyle}
          follow={follow}
          picking={!!picker}
          travelTo={homeMode ? travel : null}
          game={gps.view}
          onUnfollow={handleUnfollow}
          onFollow={handleFollow}
          onMapClick={handleMapClick}
          onSelect={handleSelect}
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
          <Button className="fab" title={t("More")} aria-label={t("More")} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} style={{ outline: moreOpen ? "2px solid var(--yellow)" : undefined }}>
            ⋯
          </Button>
          {moreOpen && (
            <div className="more-menu" role="menu">
              {me.canSimulate && (
                <Button role="menuitem" onClick={() => (toggleSim(), setMoreOpen(false))} className={simMode ? "on" : ""}>
                  🕹️ {simMode ? t("Test mode on — tap to use real GPS") : t("Test mode: play without walking")}
                </Button>
              )}
              <Button role="menuitem" onClick={cycleLook}>
                {mapStyle === "fantasy" ? "🗺️" : mapStyle === "dark" ? "🌃" : "🧭"} {t("Map style")}
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
