"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, msg, t, toAsciiDigits } from "@/lib/i18n";
import { useT } from "@/components/I18nProvider";
import { RARITY_COLOR, RARITY_LABEL } from "@/lib/catalog";
import { applyConfig } from "@/lib/config";
import { S } from "@/lib/settings";
import { distanceM, formatDistance } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BREACH_RANGE_M, FACTION_BY_KEY, SIEGE_RANGE_M } from "@/lib/rts";
import { BasePanel } from "./BasePanel";
import { TargetPowers } from "./Hero";
import { OUTPOST_INCOME_HOUR, outpostLabel } from "@/lib/outposts";
import { UNITS } from "@/lib/rts";
import type { HeroTabId } from "./Panels";
import { NeedsHud } from "./Life";
import { api, fmtTime, type LatLng, type LobbyView, type Me, type Selected, type World } from "./client";
import { NoteCard } from "./Panels";
import { LotteryCard } from "./Lottery";
import { sfx, isMuted, setMuted, onMuteChange } from "./sfx";
import { setMusicMood, startMusic } from "./music";
import { InboxPanel } from "./Inbox";
import { Tour, TOUR_KEY } from "./Help";
import { enablePush, pushSupported, reportAway, swEnabled, syncPush } from "@/components/pwaClient";
import { askConfirm, askText } from "@/components/Dialogs";
import { BOUNTY_DAYS, BOUNTY_MAX, BOUNTY_MIN, CAPTURE_SECONDS, FLAG_RADIUS_M } from "@/lib/flags";
import { SUPER_RANGE_M, SUPERWEAPONS } from "@/lib/superweapons";
import { LobbyModal } from "./Lobby";
import { useLiveWaves } from "./waves";
import { creepPos, PINGS, SHOOT_RANGE_M, squadPos, STRIKE_RANGE_M, STRIKES_PER_WAVE, towerStats, TOWER_MAX_LEVEL, towerCost, type PingKind, type Strike, type TowerKey } from "@/lib/td";
import { CallScreen, type CallInvite, type CallPeer } from "./Call";
import { CrewPanel, EventsPanel, JobsPanel, NearbyPanel, ProfilePanel } from "./Panels";
import { MarketPanel } from "./Market";
import { SHOP_WARN_MS } from "@/lib/shops";
import { Ctx, MoveIcon, Sheet, useGame, type GameCtx, type PanelId, type Toast } from "./ui";
import { useLocation, useWakeLock, type FireReport } from "./useLocation";
import { GpsChip, LocationGate, markModeAsked, ModePrompt, useModePrompt } from "./LocationUi";
import { AdModal, type AdOffer, burst, celebrate, CelebrationLayer, Directions, GpsBanner, PlayPanel, StorePanel, useGpsGame } from "./Play";
import { Button } from "@/components/Button";
import { EmojiArtLayer } from "@/components/art/EmojiArt";
import { Art } from "@/components/art/Art";
import { pedometer, useSteps } from "./steps";
import { BOOST_MAX_H, BOOST_MINUTES, STEP_GOAL } from "@/lib/idle";
import { BizCard, PlaceCard } from "./PlaceCards";
import { SocialPanel } from "./Social";
import { BusinessPanel } from "./Business";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false, loading: () => <div className="map" /> });
const Fps = dynamic(() => import("../fps/Fps"), { ssr: false, loading: () => <div className="fps" /> });
const Drive = dynamic(() => import("../drive/Drive"), { ssr: false, loading: () => <div className="drive drive-boot"><div className="splash-bar"><i /></div></div> });

const NAV: [PanelId, string, string][] = [
  ["nearby", "🎯", msg("Nearby")],
  ["base", "🏰", msg("Base")],
  ["play", "🎮", msg("Play")],
  ["market", "🛍️", msg("Market")],
  ["jobs", "📦", msg("Jobs")],
  ["social", "🌐", msg("Social")],
  ["me", "🦸", msg("Hero")],
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
  const [fire, setFire] = useState<(FireReport & { at: number }) | null>(null);
  const [shake, setShake] = useState(0);
  const quake = useCallback(() => {
    setShake(Date.now());
    setTimeout(() => setShake(0), 650);
  }, []);
  const geo = useLocation(simMode ? simPos : homeMode ? homePos : null, (f) => setFire({ ...f, at: Date.now() }));
  const pos = geo.pos;
  const [follow, setFollow] = useState(true);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [marketFocus, setMarketFocus] = useState<string | null>(null); // a shop tapped on the map
  const [selected, setSelected] = useState<Selected | null>(null);
  const [lobby, setLobby] = useState<{ spawnId: string; mode?: "race" | "coop" } | { lobbyId: string } | null>(null);
  const [c4, setC4] = useState<{ towerId: string } | null>(null);
  const [strike, setStrike] = useState<string | null>(null); // wave id while choosing an airstrike spot
  const [pingMenu, setPingMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [runners, setRunners] = useState<LobbyView["players"] | undefined>(undefined);
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
  const [match, setMatch] = useState<string | null>(null);
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
  const [meTab, setMeTab] = useState<HeroTabId>("hero");
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
      setTimeout(() => dismissToast(id), n.kind === "error" ? 4000 : 3200);
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
        // Clash-style reward fly-up for anything that paid out (Latin or Persian digits).
        if (r?.message && /\+[\d۰-۹,٬]+ ?(🪙|coins|سکه)/.test(r.message)) burst("🪙", 8);
        if (r?.message && /\+[\d۰-۹,٬]+ ?(💎|gems|جم)/.test(r.message)) burst("💎", 5);
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadMe]);

  useEffect(() => {
    loadWorld(); // throttled: only refetches after 30 s or 80 m of movement
  }, [pos?.lat, pos?.lng, loadWorld]);
  useEffect(() => {
    const t = setInterval(() => loadWorld(true), 45_000);
    return () => clearInterval(t);
  }, [loadWorld]);

  // ---- tower defense: getting shot on the street
  useEffect(() => {
    if (!fire) return;
    if (fire.downed) {
      sfx("down");
      quake();
      toast({ kind: "error", title: t("☠️ DOWNED by {name}'s defenses", { name: fire.downed.by }), body: t("Lost {n} 🪙 · patching up for 3 min — move out of tower range", { n: fire.downed.coins }) });
      navigator.vibrate?.([300, 100, 300]);
      loadMe();
    } else if (fire.hits.length) {
      const total = fire.hits.reduce((a, h) => a + h.dmg, 0);
      sfx("hurt");
      toast({ kind: "error", title: t("{emoji} Under fire! −{n} HP", { emoji: fire.hits.map((h) => h.emoji).join(""), n: total }), body: t("{names}'s defenses — get out of the red rings", { names: [...new Set(fire.hits.map((h) => h.by))].join(t(", ")) }) });
      navigator.vibrate?.([80, 40, 80]);
    }
  }, [fire?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- squad run: track squadmates on the map
  const runLobby = me?.activeRun?.lobbyId ?? null;
  useEffect(() => {
    if (!runLobby) {
      setRunners(undefined);
      return;
    }
    const poll = () => api<{ lobby: LobbyView }>(`/api/lobby?id=${runLobby}`).then((r) => setRunners(r.lobby.players)).catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [runLobby]);

  // ---- raider waves near me: refresh faster while one is running
  const liveWaves = useLiveWaves(world);
  const myWave = liveWaves.find(({ w }) => !w.resolved && now >= w.startAt - 10 * 60_000 && now <= w.endAt + 2000 && (w.ownerId === me?.id || world?.bases.find((b) => b.id === w.baseId)?.friend));
  const waveLive = !!myWave && now >= myWave.w.startAt;
  useEffect(() => {
    if (!waveLive) return;
    const t = setInterval(() => loadWorld(true), 5000);
    return () => clearInterval(t);
  }, [waveLive, loadWorld]);

  // ---- GPS mini-games & story chapters
  const gps = useGpsGame(me?.gpsGame?.id ?? null, loadMe, toast);
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
        burst("💎", 14);
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

  // ---- sound cues for things happening on the map
  const heard = useRef(new Set<string>());
  useEffect(() => {
    if (!world) return;
    for (const x of world.strikes) {
      const k = `sw${x.id}`;
      if (x.impactAt <= now && now - x.impactAt < 4000 && !heard.current.has(k)) {
        heard.current.add(k);
        sfx(x.kind === "particle" ? "explode" : "nuke");
        quake();
        navigator.vibrate?.([400, 100, 400]);
      }
    }
    if (myWave && now >= myWave.w.startAt && !heard.current.has(`wv${myWave.w.id}`)) {
      heard.current.add(`wv${myWave.w.id}`);
      sfx("alarm");
    }
  }, [now, world, myWave]);

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
  useEffect(() => setMusicMood(match ? "off" : world?.phase === "night" || world?.phase === "dusk" ? "night" : "day"), [match, world?.phase]);

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
          celebrate({ title: n.title, body: n.body, emoji: "⭐" });
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

  // Deep links: /play?match=<id> drops straight into a live fight; /play?event=<id> joins an event;
  // /play?call=<id>[&answer=1] picks up a ringing video call.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const ringing = sp.get("call");
    if (ringing && me) {
      history.replaceState(null, "", "/play");
      void ringNow(ringing, sp.get("answer") === "1");
      return;
    }
    // Home-screen shortcuts: /play?panel=base|play|me…
    const want = sp.get("panel");
    if (want && me && ["nearby", "base", "play", "market", "jobs", "crew", "me", "store", "inbox", "events"].includes(want)) {
      history.replaceState(null, "", "/play");
      setPanel(want as PanelId);
      return;
    }
    const fight = sp.get("match");
    if (fight && me) {
      history.replaceState(null, "", "/play");
      setMatch(fight);
      return;
    }
    const id = sp.get("event");
    if (!id || !me) return;
    history.replaceState(null, "", "/play");
    act(() => api(`/api/events/${id}`, { body: { action: "join" } })).then(() => setPanel("events"));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exitMatch = useCallback(() => {
    setMatch(null);
    refresh();
  }, [refresh]);

  // ---- map interactions
  const onMapClick = (p: LatLng) => {
    if (strike) {
      const id = strike;
      setStrike(null);
      act(() => api("/api/waves", { body: { action: "strike", waveId: id, lat: p.lat, lng: p.lng } })).then((ok) => {
        if (ok) loadWorld(true);
      });
      return;
    }
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
          return { message: on ? t("🛋️ Playing from home — tap the map to travel (rewards ×{mult})", { mult: S.remoteRewardMult }) : t("🚶 Back to GPS — full rewards for walking") };
        }),
      ),
    [act, patchMe],
  );

  // Coming back to the game: a quick "walking or from home?" (not in test mode or mid-tour).
  const [modeAsk, closeModeAsk] = useModePrompt(!!me && S.remoteEnabled && !simMode && !tour && !match);

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

  const claim = (spawnId: string) => {
    const kind = world?.spawns.find((x) => x.id === spawnId)?.kind;
    return act(() => api("/api/claim", { body: { spawnId } })).then((ok) => {
      if (!ok) return;
      if (kind === "chest") {
        celebrate({ title: t("CHEST OPENED!"), art: "chestOpen" });
        burst("🪙", 10);
      } else if (kind === "arcade") {
        celebrate({ title: t("POWER UP!"), art: "powerCell", body: t("Your Empire earns ×2 for {n} min", { n: BOOST_MINUTES }) });
        sfx("win");
      }
      setSelected(null);
      // Gone from the map right away; the refresh confirms it.
      const id = spawnId.replace(/^m:/, "");
      patchWorld((w) => (spawnId.startsWith("m:") ? { ...w, missions: w.missions.map((m) => (m.id === id ? { ...m, claimed: true } : m)) } : { ...w, spawns: w.spawns.map((x) => (x.id === id ? { ...x, claimed: true } : x)) }));
    });
  };

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
        enterMatch: (id) => {
          setSelected(null);
          setPanel(null);
          setMatch(id);
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

  const nearbyLobbies = world?.spawns.filter((s) => s.lobby && !s.claimed) ?? [];
  const badges: Partial<Record<PanelId, { n: number | string; sig: string }>> = {
    nearby: { n: nearbyLobbies.length, sig: nearbyLobbies.map((s) => s.lobby!.id).join(",") },
    base: !me.base ? { n: "!", sig: "nobase" } : me.baseAlert ? { n: me.baseAlert.supply >= 100 ? "🪙" : "!", sig: `${me.baseAlert.doneAt}|${me.baseAlert.supply >= 100}` } : undefined,
    play: { n: me.goalsReady || (me.gpsGame ? "▶" : 0), sig: `${me.goalsReady}|${me.gpsGame?.id ?? ""}` },
    jobs: { n: (world?.deliveries.length ?? 0) + (world?.rides.length ?? 0), sig: [...(world?.deliveries ?? []), ...(world?.rides ?? [])].map((d) => d.id).sort().join(",") },
    // Orders waiting to be handed over, or the shop about to close.
    market: me.shop ? { n: me.shop.pending || (me.shop.expiresAt - Date.now() < SHOP_WARN_MS ? "!" : 0), sig: `${me.shop.pending}|${me.shop.expiresAt}` } : undefined,
    social: { n: unread + me.pendingFriends, sig: `${unread}|${me.pendingFriends}` },
    me: {
      n: me.questsReady || me.freePoints || me.commandPoints || (me.dailyAvailable || me.mood.score < 30 ? "!" : 0),
      sig: `${me.questsReady}|${me.freePoints}|${me.commandPoints}|${me.dailyAvailable}|${me.mood.score < 30}|${me.level}`,
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
      <div className={`game ${shake ? "shake" : ""} ${match ? "in-fight" : ""} ${driveOn ? "in-drive" : ""} map-${mapStyle}`}>
        <GameMap
          world={world}
          me={me}
          look={mapStyle}
          follow={follow}
          picking={!!picker}
          runners={runners}
          travelTo={homeMode ? travel : null}
          game={gps.view}
          strikeMode={!!strike}
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
              <div className="xpbar">
                <i style={{ width: `${me.levelPct * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="hud-right" data-tour="wallet">
            <div className="hud-wallet">
              <div className="chip">🪙 {fmtNum(me.coins)}</div>
              <Button className="chip small gem-chip" onClick={() => setPanel("store")} title={t("Gem store")}>💎 {fmtNum(me.gems)} <span className="plus">+</span></Button>
              <Button className="chip small bell-chip" data-tour="inbox" title={t("Inbox")} aria-label={inbox ? t("Inbox, {n} new", { n: inbox }) : t("Inbox")} onClick={() => setPanel("inbox")}>
                🔔{inbox > 0 && <span className="badge pop">{inbox > 99 ? `${fmtNum(99)}+` : fmtNum(inbox)}</span>}
              </Button>
            </div>
            <div className="hud-status">
              <NeedsHud
                onClick={() => {
                  setMeTab("life");
                  setPanel("me");
                }}
              />
              <HpChip me={me} fire={fire} now={now} />
              <StepChip onOpen={() => openPanel("play")} />
              {driving && !geo.simulated && <div className="chip small" title={t("Driving: the map zooms out and walking goals pause")}>🚗 {t("{n} km/h", { n: Math.round(geo.speed * 3.6) })}</div>}
              <GpsChip geo={geo} />
              {world && (
                <div className="chip small phase" title={t(PHASE_LABEL[world.phase])}>
                  {PHASE_ICON[world.phase]}
                  {(world.phase === "dawn" || world.phase === "dusk") && <span style={{ color: "var(--yellow)" }}>{t("2× XP")}</span>}
                </div>
              )}
              {homeMode && (
                <Button className="chip small home-chip" onClick={() => (setMeTab("stats"), setPanel("me"))} title={t("Playing from home — tap to switch back to GPS")}>
                  🛋️ ×{fmtNum(S.remoteRewardMult)}
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

        {me.quest && !run && !picker && !panel && !(homeMode && travel) && (
          <Button
            className={`quest-hud ${me.quest.done ? "done" : ""}`}
            onClick={() => {
              setMeTab("quests");
              setPanel("me");
            }}
          >
            📜 <b>{t(me.quest.title)}</b>
            <span>{me.quest.done ? t("Claim reward!") : t("{desc} · {progress}/{target}", { desc: t(me.quest.desc), progress: me.quest.progress, target: me.quest.target })}</span>
          </Button>
        )}

        {announce && !run && !picker && !me.quest && (
          <div className="announce" style={{ position: "absolute", top: 76, left: 10, right: 10, zIndex: 450, background: "var(--panel)", maxWidth: 560, margin: "0 auto" }}>
            <b className="grow small">📣 {announce.title}</b>
            {announce.ctaUrl && (
              <a className="btn yellow small" href={announce.ctaUrl}>
                {announce.ctaLabel ?? t("Go")}
              </a>
            )}
            <Button className="close" onClick={() => setAnnounce(null)}>✕</Button>
          </div>
        )}

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
            <Button className="close" title={t("Abandon")} onClick={() => askConfirm(t("Abandon this run?"), { ok: t("Abandon run"), danger: true }).then((ok) => ok && act(() => api("/api/runs", { body: { runId: run.id, action: "abandon" } })))}>
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

        {me.downedUntil && me.downedUntil > now && (
          <div className="downed-banner">
            ☠️ <b>{t("DOWNED")}</b> · {t("back on your feet in {n}s", { n: Math.ceil((me.downedUntil - now) / 1000) })}
          </div>
        )}

        {myWave && !run && !picker && (
          <WaveBanner
            wave={myWave}
            now={now}
            meId={me.id}
            dist={pos ? distanceM(pos, { lat: myWave.w.baseLat, lng: myWave.w.baseLng }) : Infinity}
            striking={strike === myWave.w.id}
            onStrike={() => setStrike(strike ? null : myWave.w.id)}
            onGo={simMode ? () => setSimPos({ lat: myWave.w.baseLat, lng: myWave.w.baseLng }) : homeMode ? () => setTravel({ lat: myWave.w.baseLat, lng: myWave.w.baseLng }) : undefined}
          />
        )}

        {strike && (
          <div className="pick-banner" style={{ background: "#ff8a00" }}>
            ✈️ {t("Tap the map where the bombs should fall")}
            <Button className="close" onClick={() => setStrike(null)}>✕</Button>
          </div>
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
          {me.dailyAvailable && (
            <Button className="fab" title={t("Daily reward")} onClick={() => act(() => api("/api/daily", { body: {} }))}>
              🎁<span className="badge">!</span>
            </Button>
          )}
          {me.superweapon && (
            <SuperweaponFab
              sw={me.superweapon}
              now={now}
              onFire={() =>
                setPicker({
                  label: t("{emoji} Tap the target (within {km} km of your base)", { emoji: me.superweapon!.emoji, km: SUPER_RANGE_M / 1000 }),
                  cb: (p) =>
                    askConfirm(t("Launch the {name}?", { name: t(me.superweapon!.name) }), { body: t("Everyone near the target gets a countdown warning. You can't call it back."), ok: t("LAUNCH"), danger: true }).then((ok) => {
                      if (ok)
                        act(() => api("/api/superweapon", { body: p })).then((done) => {
                          if (done) {
                            sfx("siren");
                            loadWorld(true);
                          }
                        });
                    }),
                })
              }
            />
          )}
          <Button className="fab" title={t("More")} aria-label={t("More")} aria-expanded={moreOpen} onClick={() => (setMoreOpen(!moreOpen), setPingMenu(false))} style={{ outline: moreOpen ? "2px solid var(--yellow)" : undefined }}>
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
              <Button role="menuitem" onClick={() => (setPingMenu(!pingMenu), setMoreOpen(false))}>
                📣 {t("Ping your crew")}
              </Button>
            </div>
          )}
          {pingMenu && (
            <div className="ping-menu">
              {(Object.keys(PINGS) as PingKind[]).map((k) => (
                <Button
                  key={k}
                  onClick={() => {
                    setPingMenu(false);
                    setPicker({ label: t("{emoji} Tap where to ping", { emoji: PINGS[k].emoji }), cb: (p) => act(() => api("/api/pings", { body: { kind: k, lat: p.lat, lng: p.lng } })) });
                  }}
                >
                  {PINGS[k].emoji} {t(PINGS[k].label)}
                </Button>
              ))}
            </div>
          )}
          <Button className={`fab ${!follow && pos ? "fab-recenter" : ""}`} title={t("Re-center on me")} aria-label={t("Re-center the map on me")} aria-pressed={follow} onClick={() => setFollow(true)} style={{ color: follow ? "var(--cyan)" : undefined }}>
            ◎
          </Button>
        </div>

        {/* Get in the car: the 3D city */}
        {!panel && !selected && !picker && !run && (pos || me.lastPos) && (
          <Button className="drive-fab" data-tour="drive" onClick={() => ctx.drive?.()} title={homeMode || simMode ? t("Drive the 3D city") : t("See your street in 3D")}>
            <span className="drive-fab-car">🚗</span>
            <span className="drive-fab-lb">{homeMode || simMode ? t("DRIVE") : t("3D")}</span>
          </Button>
        )}

        {/* Toasts */}
        <div className="toasts">
          {toasts.map((x) => (
            <div key={x.id} className={`toast ${x.kind ?? ""} ${x.out ? "out" : ""}`} onClick={() => dismissToast(x.id)} title={t("Tap to dismiss")} role={x.kind === "error" ? "alert" : "status"}>
              <b>{x.title}</b>
              {x.body && <span className="small muted">{x.body}</span>}
            </div>
          ))}
        </div>

        {/* Selected object card */}
        {selected && !panel && (
          <InfoCard
            sel={selected}
            onClose={() => setSelected(null)}
            onClaim={claim}
            onLobby={(l) => {
              setSelected(null);
              setLobby(l);
            }}
            onC4={(towerId) => setC4({ towerId })}
          />
        )}

        {panel === "nearby" && <NearbyPanel onClose={close} peek={peek} />}
        {panel === "base" && <BasePanel onClose={close} peek={peek} />}
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
              setMeTab("hero");
            }}
            peek={peek}
          />
        )}

        {/* Phones hide it under an open panel; tablets/desktop keep it beside the side panel (CSS). */}
        <nav className={`nav ${panel || selected ? "with-sheet" : ""}`}>
          {NAV.map(([id, ic, label]) => {
            const b = showBadge(id);
            // Crew & chat opens from Social, so Social stays lit (and closes it) while it's open.
            const on = panel === id || (id === "social" && panel === "crew");
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
                    if (id === "me") setMeTab("hero");
                    return;
                  }
                  setSelected(null);
                  if (panel === "me") setMeTab("hero");
                  openPanel(id);
                }}
                className={`${on ? "on" : ""} ${id === "base" && !me.base ? "pulse" : ""}`}
              >
                <span className="ic">{ic}</span>
                <span className="nav-lb">{t(label)}</span>
                {b != null && <span className="badge pop">{typeof b === "number" ? fmtNum(b) : b}</span>}
              </Button>
            );
          })}
        </nav>

        {match && <Fps matchId={match} onExit={exitMatch} />}
        {driveOn && (pos ?? me.lastPos) && (
          <Drive
            start={(pos ?? me.lastPos)!}
            goal={driveOn.goal}
            canDrive={simMode || homeMode}
            sim={simMode}
            follow={simMode || homeMode ? null : pos}
            onMove={simMode ? setSimPos : homeMode ? setHomePos : null}
            onClaim={(id) => claim(id).then(() => undefined)}
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

        {lobby && <LobbyModal open={lobby} onClose={() => setLobby(null)} />}
        {adOpen && <AdModal offer={adOpen} onClose={() => (setAdOpen(null), loadMe())} />}
        <CelebrationLayer />
        {askPush && (
          <div className="modal-bg" style={{ zIndex: 2500 }}>
            <div className="modal">
              <div style={{ fontSize: 56 }}>🔔</div>
              {askPush === "call" ? (
                <>
                  <h2>{t("Don't miss a call")}</h2>
                  <p className="muted small" style={{ lineHeight: 1.5 }}>{t("Let your phone ring when your crew video-calls you — even when the game is closed — and get raid alerts too. You can turn it off any time in Hero → Profile.")}</p>
                </>
              ) : (
                <>
                  <h2>{t("Don't miss a raid")}</h2>
                  <p className="muted small" style={{ lineHeight: 1.5 }}>{t("Get a notification when your base is attacked, a reward is waiting or your crew needs you — even when the game is closed. You can turn it off any time in Hero → Profile.")}</p>
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

        {c4 && (
          <div className="modal-bg">
            <div className="modal c4-modal">
              <Art k="dynamite" size={96} anim="wiggle" />
              <h2>{t("Plant the C4")}</h2>
              <p className="small muted">{t("Press and hold to wire the charge. The closer you stand to the tower, the bigger the blast — but its guns are on you.")}</p>
              <HoldButton
                label={t("HOLD TO PLANT")}
                ms={2200}
                onDone={() => {
                  const towerId = c4.towerId;
                  setC4(null);
                  sfx("explode");
                  quake();
                  act(() => api("/api/towers", { body: { action: "sabotage", towerId } })).then(() => loadWorld(true));
                }}
              />
              <Button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setC4(null)}>{t("Abort")}</Button>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- hold-to-confirm
/** A button you press and hold until the ring fills (no accidental taps). */
function HoldButton({ label, ms, onDone }: { label: string; ms: number; onDone: () => void }) {
  const [p, setP] = useState(0);
  const start = useRef(0);
  const raf = useRef(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    start.current = 0;
    setP(0);
  };
  const tick = () => {
    const x = Math.min(1, (performance.now() - start.current) / ms);
    setP(x);
    if (x >= 1) {
      navigator.vibrate?.([60, 30, 120]);
      start.current = 0;
      onDone();
      return;
    }
    if (Math.floor(x * 10) !== Math.floor((x - 0.016) * 10)) {
      sfx("beep");
      navigator.vibrate?.(12);
    }
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      className="hold-btn"
      style={{ ["--p" as string]: p }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = performance.now();
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{p > 0 ? t("{n}%", { n: Math.floor(p * 100) }) : label}</span>
    </button>
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
function InfoCard({
  sel,
  onClose,
  onClaim,
  onLobby,
  onC4,
}: {
  sel: Selected;
  onClose: () => void;
  onClaim: (spawnId: string) => void;
  onLobby: (l: { spawnId: string; mode?: "race" | "coop" }) => void;
  onC4: (towerId: string) => void;
}) {
  const { pos, act, me, world, openChat, startCall, setPanel, enterMatch, teleport, pick, openShop, openProfile } = useGame();
  const target = sel.type === "delivery" || sel.type === "ride" ? { lat: sel.data.pickupLat, lng: sel.data.pickupLng } : sel.type === "squad" ? squadPos(sel.data) : sel.type === "place" ? sel.data.place : sel.data;
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
  // Bases and bosses can be fought from up to BREACH_RANGE_M away.
  const jump = teleport && dist > BREACH_RANGE_M && (
    <Button className="btn yellow" onClick={() => teleport(target)}><MoveIcon /> {t("Go next to it")}</Button>
  );
  const startMatch = async (kind: "breach" | "raid", targetId: string) => {
    let id = "";
    const ok = await act(async () => {
      id = (await api<{ matchId: string }>("/api/match", { body: { kind, targetId } })).matchId;
      return {};
    });
    if (ok && id) enterMatch(id);
  };
  const fromBase = me.base ? distanceM(me.base, target) : Infinity;
  // Street combat: shoot it yourself (players, towers, squads within range).
  const shoot = (kind: "player" | "tower" | "squad", id: string, label = t("🔫 Shoot")) => (
    <Button
      className="btn"
      disabled={!!me.downedUntil || me.rookie}
      title={me.rookie ? t("Reach level 3 to fight") : undefined}
      onClick={() => {
        sfx("shot");
        return act(() => api("/api/attack", { body: { kind, id } }));
      }}
    >
      {label}
    </Button>
  );
  // RTS on the map: march your home army out as a squad against this target.
  const marchOn = (kind: "tower" | "squad" | "base" | "outpost", id: string, label: string) => (
    <Button
      className="btn cyan"
      disabled={!me.base || fromBase > SIEGE_RANGE_M}
      onClick={() => askConfirm(t("March your home army to {target}? Everyone will see it coming.", { target: label }), { ok: t("March") }).then((ok) => ok && act(() => api("/api/squads", { body: { action: "deploy", target: { kind, id } } })).then((ok) => ok && onClose()))}
    >
      🎖️ {t("March a squad")}
    </Button>
  );

  // Real places: a job at a real restaurant/café/shop, or a business and its missions.
  if (sel.type === "place") return <PlaceCard m={world?.places.find((x) => x.id === sel.data.id) ?? sel.data} onClose={onClose} />;
  if (sel.type === "biz") return <BizCard b={world?.businesses.find((x) => x.id === sel.data.id) ?? sel.data} onClose={onClose} />;

  if (sel.type === "spawn") {
    const s = sel.data;
    const title = s.kind === "run" ? t(s.run!.title) : s.kind === "chest" ? t("Supply Chest") : s.kind === "arcade" ? t("Power Cell") : s.kind === "derrick" ? t("Oil Derrick") : t(s.item!.name);
    const emoji = s.kind === "chest" ? "🧰" : s.kind === "run" ? "🏁" : s.kind === "arcade" ? "🔋" : s.kind === "derrick" ? "🛢️" : s.item!.emoji;
    const desc =
      s.kind === "derrick"
        ? t("Neutral militia (strength {n}) guards this derrick. Lead your army here in person and take it: +{coins} 🪙.", { n: s.guard ?? 0, coins: s.rewardCoins })
        : s.kind === "run"
        ? `${t(s.run!.brief)} ${t("Target is {d} away — you have {n} min.", { d: formatDistance(s.run!.distanceM), n: Math.round(s.run!.timeLimitS / 60) })}`
        : s.kind === "chest"
          ? t("A supply crate (maybe {emoji} inside). Crack it open for loot, coins and a shot at new gear.", { emoji: s.item!.emoji })
          : s.kind === "arcade"
            ? t("Grab it to double your Street Empire's income for {n} minutes. Power cells stack up to {h} hours.", { n: BOOST_MINUTES, h: BOOST_MAX_H })
            : s.place
              ? `${t(s.item!.blurb)} ${t("📍 At {place}, a real place near you.", { place: s.place.name })}`
              : t(s.item!.blurb);
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="icon-tile" style={{ width: 70, height: 70, fontSize: 42, boxShadow: s.item ? `0 0 24px ${RARITY_COLOR[s.item.rarity]}` : undefined }}>{emoji}</div>
          <div className="grow">
            {s.item && s.kind !== "derrick" && <span className="tag" style={{ color: RARITY_COLOR[s.item.rarity] }}>{t(RARITY_LABEL[s.item.rarity])}</span>}
            <p className="small" style={{ margin: "6px 0" }}>{desc}</p>
            <div className="small muted">
              {t("+{n} XP", { n: s.rewardXp })} {s.rewardCoins ? `· +${fmtNum(s.rewardCoins)} 🪙` : ""} {s.goldenHour && `· ${t("✨ golden hour 2×")}`} ·{" "}
              {t("despawns in {n} min", { n: Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000)) })}
            </div>
          </div>
        </div>
        {s.claimed ? (
          <Button className="btn block" disabled>{t("Already collected")}</Button>
        ) : !inRange ? (
          tooFar
        ) : s.kind === "derrick" ? (
          <Button className="btn yellow block" disabled={!me.faction} onClick={() => act(() => api("/api/battle", { body: { kind: "derrick", targetId: s.id } })).then((ok) => ok && onClose())}>
            {me.faction ? t("🎖️ Attack with your army") : t("Join a faction first (Base tab)")}
          </Button>
        ) : s.kind === "chest" ? (
          <Button className="btn yellow block big-btn" disabled={!!me.downedUntil} onClick={() => onClaim(s.id)}>{t("🧰 Open chest")}</Button>
        ) : s.kind === "arcade" ? (
          <Button className="btn green block big-btn" disabled={!!me.downedUntil} onClick={() => onClaim(s.id)}>{t("⚡ Grab power cell")}</Button>
        ) : s.kind === "run" ? (
          me.activeRun ? (
            <Button className="btn block" disabled>{t("Finish your current run first")}</Button>
          ) : s.lobby ? (
            <Button className="btn yellow block" onClick={() => onLobby({ spawnId: s.id })}>{s.lobby.kind === "coop" ? t("👥 Join the co-op run ({n})", { n: s.lobby.players }) : t("👥 Join the race ({n})", { n: s.lobby.players })}</Button>
          ) : (
            <div className="row wrap">
              <Button className="btn" onClick={() => onClaim(s.id)}>🏁 {t("Solo")}</Button>
              <Button className="btn yellow" onClick={() => onLobby({ spawnId: s.id, mode: "race" })}>🏎️ {t("Race others")}</Button>
              <Button className="btn green" onClick={() => onLobby({ spawnId: s.id, mode: "coop" })}>🤝 {t("Co-op run")}</Button>
            </div>
          )
        ) : (
          <Button className="btn green block" onClick={() => onClaim(s.id)}>{t("Collect")}</Button>
        )}
      </Sheet>
    );
  }

  if (sel.type === "mission") {
    const m = sel.data;
    return (
      <Sheet title={m.title} onClose={onClose}>
        {m.sponsor && <span className="tag" style={{ color: "var(--yellow)" }}>{t("Presented by {name}", { name: m.sponsor })}</span>}
        <p>{m.description}</p>
        <p className="small muted">{t("Reward: {item} · +{xp} XP · +{coins} 🪙 · ends {when}", { item: m.item ? `${m.item.emoji} ${t(m.item.name)}` : "", xp: m.rewardXp, coins: m.rewardCoins, when: fmtTime(m.activeTo) })}</p>
        {m.claimed ? <Button className="btn block" disabled>{t("Completed")}</Button> : inRange ? <Button className="btn yellow block" onClick={() => onClaim(`m:${m.id}`)}>{t("Complete mission")}</Button> : tooFar}
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

  if (sel.type === "base") {
    const b = sel.data;
    const f = b.faction ? FACTION_BY_KEY[b.faction] : null;
    const humansOnline = b.owner.online || (world?.onlineNearby ?? 0) > 0;
    const breachable = dist <= BREACH_RANGE_M && humansOnline && !b.shielded;
    return (
      <Sheet title={`🏰 ${b.name}`} onClose={onClose}>
        <div className="small muted" style={{ marginBottom: 8 }}>
          <span className={`dot ${b.owner.online ? "on" : ""}`} /> {b.owner.avatar} {b.owner.username} {f && <span style={{ color: f.color }}>· {f.emoji} {t(f.name)}</span>} · {formatDistance(dist)}
        </div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{fmtNum(b.hq)}</b><span>{t("HQ level")}</span></div>
          <div className="stat"><b>🗼 {fmtNum(b.turrets)}</b><span>{t("Turrets")}</span></div>
          <div className="stat"><b>{fmtNum(b.hp)}</b><span>{t("Integrity")}</span></div>
        </div>
        {b.shielded && <p className="small" style={{ color: "var(--cyan)" }}>{t("🛡️ Cease-fire shield is up.")}</p>}
        {b.mine || b.friend ? (
          <div className="row wrap">
            {b.mine && <Button className="btn cyan" onClick={() => setPanel("base")}>{t("Open base")}</Button>}
            {teleport && dist > 60 && <Button className="btn yellow" onClick={() => teleport(b)}><MoveIcon /> {t("Go home")}</Button>}
            {b.liveMatch && <Button className="btn" onClick={() => startMatch("breach", b.id)}>{t("🛡️ Defend it (FPS)")}</Button>}
            {!b.mine && !b.liveMatch && <p className="small muted">{t("Your crew's base. If it's breached while you're close, you can jump in to defend.")}</p>}
          </div>
        ) : (
          <>
            <div className="row wrap">
              <Button
                className="btn yellow"
                disabled={!me.base || fromBase > SIEGE_RANGE_M || b.shielded}
                onClick={() => askConfirm(t("Send your whole army to siege {name}?", { name: b.name }), { ok: t("Attack") }).then((ok) => ok && act(() => api("/api/battle", { body: { kind: "siege", targetId: b.id } })))}
              >
                🎖️ {t("Siege with army")}
              </Button>
              {marchOn("base", b.id, b.name)}
              <OrderSquads kind="base" id={b.id} />
              {jump}
              {b.liveMatch ? (
                <Button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("breach", b.id)}>⚔️ {t("Join the firefight")}</Button>
              ) : (
                <Button className="btn" disabled={!breachable} onClick={() => startMatch("breach", b.id)}>⚔️ {t("Breach (FPS)")}</Button>
              )}
            </div>
            <p className="small muted">
              {!me.base
                ? t("Plant your own base to send armies.")
                : fromBase > SIEGE_RANGE_M
                  ? t("Out of siege range ({d} from your base, max {km} km).", { d: formatDistance(fromBase), km: SIEGE_RANGE_M / 1000 })
                  : t("Siege is auto-resolved: your army vs their garrison and turrets.")}{" "}
              {dist > BREACH_RANGE_M ? t("Walk within {m} m to breach it in first person.", { m: BREACH_RANGE_M }) : !humansOnline ? t("Breach unlocks when players are online nearby.") : t("You're close — breach it in first person!")}
            </p>
            <TargetPowers targetId={b.id} allow={["spy_drone", "barrage"]} />
          </>
        )}
      </Sheet>
    );
  }

  if (sel.type === "boss") {
    const b = sel.data;
    return (
      <Sheet title={`${b.def.emoji} ${t(b.def.name)}`} onClose={onClose}>
        <p className="small" style={{ margin: "0 0 8px" }}>{t(b.def.blurb)}</p>
        <div className="need-bar boss"><i style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>
        <p className="small muted">
          {t("{hp} / {max} HP · shared by every player · leaves in {n} min · {d}", { hp: b.hp, max: b.maxHp, n: Math.max(0, Math.round((b.expiresAt - Date.now()) / 60000)), d: formatDistance(dist) })}
        </p>
        <div className="row wrap">
          {jump}
          <Button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("raid", b.id)}>
            ⚔️ {b.liveMatch ? t("Join the raid") : t("Raid (FPS)")}
          </Button>
          <Button className="btn yellow" disabled={!me.base || fromBase > SIEGE_RANGE_M} onClick={() => act(() => api("/api/battle", { body: { kind: "bombard", targetId: b.id } }))}>
            💥 {t("Bombard with army")}
          </Button>
        </div>
        <TargetPowers targetId={b.id} allow={["barrage"]} />
        <p className="small muted">{t("Everyone who damages it shares the loot when it falls; top damage gets a 👑.")} {dist > BREACH_RANGE_M && t("Walk within {m} m to fight it in first person.", { m: BREACH_RANGE_M })}</p>
      </Sheet>
    );
  }

  if (sel.type === "outpost") {
    const o = sel.data;
    const g = o.garrison ?? {};
    const station = (unit: string, qty: number) => act(() => api("/api/outposts", { body: { action: "station", outpostId: o.id, unit, qty } }));
    return (
      <Sheet title={`${o.owner ? "🚩" : "🏴"} ${outpostLabel(o.name)}`} onClose={onClose}>
        <p className="small muted">
          {o.mine ? t("Held by you") : o.owner ? t("Held by {name}", { name: o.owner.username }) : t("Neutral — guarded by militia")} · {t("pays {n} 🪙/hour to its holder", { n: OUTPOST_INCOME_HOUR })} · {formatDistance(dist)}
        </p>
        <div className="card small">
          {o.owner ? (
            o.garrison ? (
              <>🪖 {t("Garrison:")} {Object.entries(g).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji} ${fmtNum(q ?? 0)}`).join("  ") || t("none (only the fortification)")}</>
            ) : (
              <>🪖 {t("Garrison:")} <b>{o.garrisonSize && /^\d+$/.test(o.garrisonSize) ? fmtNum(Number(o.garrisonSize)) : t(o.garrisonSize ?? "")}</b> <span className="muted">{t("(research 📡 Radar or use a 🛰️ Spy Drone for details)")}</span></>
            )
          ) : (
            <>{t("⚔️ Militia strength {n}", { n: o.guard ?? 0 })}</>
          )}
          {o.shielded && <div style={{ color: "var(--cyan)" }}>{t("🛡️ Freshly captured — dug in for a few minutes")}</div>}
        </div>
        {o.mine ? (
          <>
            <label>{t("Station troops from your army")}</label>
            <div className="row wrap">
              {UNITS.map((u) => (
                <Button key={u.key} className="btn ghost small" onClick={() => station(u.key, u.key === "ranger" ? 5 : 1)}>
                  +{fmtNum(u.key === "ranger" ? 5 : 1)} {u.emoji}
                </Button>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <Button className="btn ghost small" onClick={() => act(() => api("/api/outposts", { body: { action: "withdraw", outpostId: o.id } }))}>↩️ {t("Withdraw all")}</Button>
              <Button className="btn yellow small" onClick={() => act(() => api("/api/outposts", { body: { action: "collect" } }))}>🪙 {t("Collect tribute")}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="row wrap">
              {jump}
              <Button
                className="btn yellow"
                disabled={!me.base || fromBase > SIEGE_RANGE_M || o.shielded}
                onClick={() => askConfirm(t("Send your whole army to assault {name}?", { name: outpostLabel(o.name) }), { ok: t("Attack") }).then((ok) => ok && act(() => api("/api/outposts", { body: { action: "assault", outpostId: o.id } })))}
              >
                🎖️ {t("Assault with army")}
              </Button>
              {marchOn("outpost", o.id, outpostLabel(o.name))}
              <OrderSquads kind="outpost" id={o.id} />
            </div>
            <p className="small muted">{!me.base ? t("Plant a base to send armies.") : fromBase > SIEGE_RANGE_M ? t("Out of range ({d} from your base, max {km} km).", { d: formatDistance(fromBase), km: SIEGE_RANGE_M / 1000 }) : t("Win and it's yours — then garrison it before someone takes it back.")}</p>
            {o.owner && <TargetPowers targetId={o.id} allow={["spy_drone", "barrage"]} />}
          </>
        )}
      </Sheet>
    );
  }

  if (sel.type === "tower") {
    const tw = sel.data;
    const st = towerStats(tw);
    const ready = tw.readyAt <= Date.now();
    const hostile = !tw.mine && !tw.friend;
    const up = tw.level < TOWER_MAX_LEVEL ? towerCost(tw.type as TowerKey, tw.level + 1) : null;
    return (
      <Sheet title={`${st.def.emoji} ${t(st.def.name)}`} onClose={onClose}>
        <div className="small muted" style={{ marginBottom: 6 }}>
          {tw.mine ? t("Your tower") : tw.friend ? t("{name}'s tower (crew)", { name: tw.owner }) : <span style={{ color: "var(--red)" }}>{t("Hostile — {name}", { name: tw.owner })}</span>} · {t("Lv {n}", { n: tw.level })} · {formatDistance(dist)}
          {!ready && ` · ${t("🚧 under construction")}`}
        </div>
        <div className="need-bar"><i style={{ width: `${(tw.hp / st.maxHp) * 100}%`, background: hostile ? "var(--red)" : "var(--green)" }} /></div>
        <p className="small">{t(st.def.blurb)}</p>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{fmtNum(tw.hp)}</b><span>{t("HP")}</span></div>
          <div className="stat"><b>{t("{n} m", { n: st.range })}</b><span>{t("Range")}</span></div>
          <div className="stat"><b>☠️ {fmtNum(tw.kills)}</b><span>{t("Kills")}</span></div>
        </div>
        {tw.mine ? (
          <div className="row wrap">
            {up && ready && <Button className="btn" onClick={() => act(() => api("/api/towers", { body: { action: "upgrade", towerId: tw.id } }))}>{t("↑ Level {n} · {coins} 🪙", { n: tw.level + 1, coins: up.coins })}</Button>}
            {tw.hp < st.maxHp && <Button className="btn ghost" onClick={() => act(() => api("/api/towers", { body: { action: "repair", towerId: tw.id } }))}>🔧 {t("Repair")}</Button>}
            <Button className="btn ghost" onClick={() => setPanel("base")}>{t("All defenses")}</Button>
          </div>
        ) : hostile ? (
          <>
            <div className="row wrap">
              {shoot("tower", tw.id)}
              <Button className="btn yellow" disabled={dist > st.range + 15 || !!me.downedUntil} onClick={() => onC4(tw.id)}>{t("💣 Plant C4")}</Button>
              {marchOn("tower", tw.id, t("{owner}'s {name}", { owner: tw.owner, name: t(st.def.name) }))}
              <OrderSquads kind="tower" id={tw.id} />
              {teleport && dist > st.range + 15 && <Button className="btn ghost" onClick={() => teleport(tw)}><MoveIcon /> {t("Go there")}</Button>}
            </div>
            <p className="small muted">
              {me.rookie ? t("Rookie cover: it won't shoot you until level 3.") : t("It shoots commanders inside {m} m — run in, wire the charge fast, get out.", { m: st.range })} {t("Or march a squad at it from your base.")}
            </p>
          </>
        ) : (
          <p className="small muted">{t("Your crew's tower. It covers you and shoots raiders attacking crew bases.")}</p>
        )}
      </Sheet>
    );
  }

  if (sel.type === "squad") {
    const q = sel.data;
    const marching = q.status === "MARCH" && q.arriveAt > Date.now();
    const units = q.units ? Object.entries(q.units).filter(([, n]) => n).map(([k, n]) => `${UNITS.find((u) => u.key === k)?.emoji} ${fmtNum(n ?? 0)}`).join("  ") : t("~{n} units (research 📡 Radar to see more)", { n: q.size });
    return (
      <Sheet title={`${q.icon} ${q.mine ? t("Your squad") : t("{name}'s squad", { name: q.owner })}`} onClose={onClose}>
        <p className="small muted">
          {q.friend ? `${t("Crew")} · ` : !q.mine ? <span style={{ color: "var(--red)" }}>{t("Hostile")} · </span> : null}
          {marching ? `${q.order === "attack" ? t("On the attack") : q.order === "return" ? t("Heading home") : t("On the move")} · ${t("arrives in {n}s", { n: Math.max(0, Math.ceil((q.arriveAt - Date.now()) / 1000)) })}` : t("Holding position")} · {formatDistance(dist)}
        </p>
        <div className="card small">🪖 {units}</div>
        {q.mine ? (
          <div className="row wrap">
            <Button className="btn cyan" onClick={() => { onClose(); pick(t("Tap where this squad should move"), (to) => act(() => api("/api/squads", { body: { action: "move", squadId: q.id, to } }))); }}>📍 {t("Move")}</Button>
            {q.order !== "return" && <Button className="btn ghost" onClick={() => act(() => api("/api/squads", { body: { action: "recall", squadId: q.id } })).then((ok) => ok && onClose())}>↩️ {t("Recall")}</Button>}
            <p className="small muted">{t("To attack with it, tap an enemy tower, squad, base or outpost and use “Order my squads”.")}</p>
          </div>
        ) : !q.friend ? (
          <>
            <div className="row wrap">
              {shoot("squad", q.id)}
              {!marching && marchOn("squad", q.id, t("{name}'s squad", { name: q.owner }))}
              {!marching && <OrderSquads kind="squad" id={q.id} />}
            </div>
            <p className="small muted">{marching ? t("It's on the move — wait for it to stop before you can engage.") : t("Guard squads shoot commanders within 55 m and join any fight at nearby bases and outposts.")}</p>
          </>
        ) : null}
      </Sheet>
    );
  }

  if (sel.type === "ping") {
    const pg = sel.data;
    return (
      <Sheet title={`${PINGS[pg.kind]?.emoji} ${t(PINGS[pg.kind]?.label ?? "")}`} onClose={onClose}>
        <p className="small muted">
          {pg.avatar}{" "}
          {pg.mine
            ? t("You pinged this spot · {d} · fades in {n} min", { d: formatDistance(dist), n: Math.max(0, Math.ceil((pg.expiresAt - Date.now()) / 60000)) })
            : t("{name} pinged this spot · {d} · fades in {n} min", { name: pg.by, d: formatDistance(dist), n: Math.max(0, Math.ceil((pg.expiresAt - Date.now()) / 60000)) })}
        </p>
        {teleport && <Button className="btn yellow" onClick={() => teleport(pg)}><MoveIcon /> {t("Go there")}</Button>}
      </Sheet>
    );
  }

  if (sel.type === "flag") {
    const f = sel.data;
    const capLeft = f.capture ? Math.max(0, Math.ceil((f.capture.endsAt - Date.now()) / 1000)) : 0;
    const inRange = dist <= FLAG_RADIUS_M;
    const ours = f.mine || f.friend;
    const doFlag = (action: string) => act(() => api("/api/flags", { body: { action, flagId: f.id } })).then((ok) => {
        if (ok) sfx(action === "capture" ? "capture" : "reward");
      });
    return (
      <Sheet title={`🚩 ${f.name}`} onClose={onClose}>
        <p className="small muted">
          {f.mine ? t("Your flag") : `${f.ownerAvatar} ${f.owner}${f.friend ? ` ${t("(crew)")}` : ""}`} · {t("held {m} min · captured {n}× · {d}", { m: Math.max(1, Math.round((Date.now() - f.heldSince) / 60000)), n: f.captures, d: formatDistance(dist) })}
        </p>
        {f.capture && <div className="card small" style={{ borderColor: "var(--red)" }}>{f.capture.mine ? t("⚔️ You are capturing it — {s}s left", { s: capLeft }) : t("⚔️ {name} is capturing it — {s}s left", { name: f.capture.by ?? "", s: capLeft })}</div>}
        {f.shielded && <p className="small" style={{ color: "var(--cyan)" }}>{t("🛡️ Just captured — can't be flipped for a few minutes")}</p>}
        <div className="row wrap">
          {ours ? (
            <>
              {f.capture && <Button className="btn green" disabled={!inRange} onClick={() => doFlag("defend")}>🛡️ {t("Defend")}</Button>}
              {f.mine && <Button className="btn yellow" onClick={() => act(() => api("/api/flags", { body: { action: "collect" } }))}>🪙 {t("Collect tribute")}</Button>}
              {f.mine && <Button className="btn ghost" aria-label={t("Abandon")} onClick={() => askConfirm(t("Abandon “{name}”?", { name: f.name }), { ok: t("Abandon"), danger: true }).then((ok) => (ok ? doFlag("abandon").then(onClose) : undefined))}>🏳️</Button>}
            </>
          ) : (
            <Button className="btn" disabled={!inRange || f.shielded || !!me.downedUntil} onClick={() => doFlag("capture")}>
              🚩 {f.capture?.mine ? (capLeft > 0 ? t("Hold… {s}s", { s: capLeft }) : t("Claim it!")) : t("Capture")}
            </Button>
          )}
          {teleport && !inRange && <Button className="btn yellow" onClick={() => teleport(f)}><MoveIcon /> {t("Go there")}</Button>}
        </div>
        <p className="small muted">
          {ours
            ? t("Rivals capture it by standing within {r} m for {s}s. Being there yourself stops them.", { r: FLAG_RADIUS_M, s: CAPTURE_SECONDS })
            : inRange
              ? t("Stay within {r} m for {s}s, then tap again to claim it. Defenders standing here block you — shoot them first.", { r: FLAG_RADIUS_M, s: CAPTURE_SECONDS })
              : t("Walk within {r} m to capture it.", { r: FLAG_RADIUS_M })}
        </p>
      </Sheet>
    );
  }

  if (sel.type === "strike") {
    const x = sel.data;
    const def = SUPERWEAPONS[x.kind];
    const left = Math.ceil((x.impactAt - Date.now()) / 1000);
    return (
      <Sheet title={`${def.emoji} ${t(def.name)}`} onClose={onClose}>
        <p>
          {left > 0
            ? <b style={{ color: "var(--red)" }}>{t("Impact in {s}s!", { s: left })} {dist <= x.radius ? t("You're inside the blast — RUN!") : t("You're outside the blast.")}</b>
            : x.hazardUntil && x.hazardUntil > Date.now()
              ? <>{t("☣️ {hazard} — dangerous for another {n} min. Stay out of the circle.", { hazard: t(def.hazard?.label ?? ""), n: Math.ceil((x.hazardUntil - Date.now()) / 60000) })}</>
              : t("The dust has settled.")}
        </p>
        <p className="small muted">{x.mine ? t("Launched by you · {r} m radius · {blurb}", { r: x.radius, blurb: t(def.blurb) }) : t("Launched by {name} · {r} m radius · {blurb}", { name: x.owner, r: x.radius, blurb: t(def.blurb) })}</p>
      </Sheet>
    );
  }

  const p = sel.data;
  return (
    <Sheet title={`${p.avatar} ${p.username}`} onClose={onClose} actions={<button className="close" onClick={() => openProfile(p.id)} title={t("Profile")} aria-label={t("Profile")}>👤</button>}>
      <p className="muted">
        {t("Level {n}", { n: p.level })} · {p.friend ? t("In your crew") : t("~ approximate location")}
        {p.bounty > 0 && <span style={{ color: "var(--yellow)" }}> · {t("💀 WANTED {n} 🪙", { n: p.bounty })}</span>}
      </p>
      {p.friend ? (
        <div className="row">
          <Button className="btn cyan grow" onClick={() => openChat(`dm:${[me.id, p.id].sort().join(":")}`, p.username)}>💬 {t("Message")}</Button>
          <Button className="btn green grow" onClick={() => startCall({ id: p.id, username: p.username, avatar: p.avatar }, false)}>📞 {t("Voice call")}</Button>
          <Button className="btn green grow" onClick={() => startCall({ id: p.id, username: p.username, avatar: p.avatar })}>📹 {t("Video call")}</Button>
        </div>
      ) : (
        <>
          <div className="row wrap">
            {shoot("player", p.id, `🔫 ${t("Attack")}`)}
            <Button className="btn ghost" onClick={() => act(() => api("/api/friends", { body: { action: "request", username: p.username } }))}>➕ {t("Add to crew")}</Button>
            <Button
              className="btn ghost"
              onClick={() =>
                askText(t("Bounty on {name}", { name: p.username }), "200", { body: t("Coins are held until someone downs them (refunded after {days} days). {min}–{max} 🪙.", { days: BOUNTY_DAYS, min: BOUNTY_MIN, max: BOUNTY_MAX }), ok: t("Place bounty") }).then((v) => {
                  const amount = Math.round(Number(toAsciiDigits(v ?? "")));
                  if (v && Number.isFinite(amount)) return act(() => api("/api/bounties", { body: { targetId: p.id, amount } }));
                })
              }
            >
              💀 {t("Bounty")}
            </Button>
          </div>
          <p className="small muted">
            {me.rookie ? t("Reach level 3 to fight other commanders.") : t("Shots land within {m} m (their map position is approximate — get close). Downing them steals some coins and 5 🏆.", { m: SHOOT_RANGE_M })}
          </p>
        </>
      )}
    </Sheet>
  );
}


// ---------------------------------------------------------------- RTS: order squads already in the field
function OrderSquads({ kind, id }: { kind: "tower" | "squad" | "base" | "outpost"; id: string }) {
  const { world, act } = useGame();
  const mine = world?.squads.filter((q) => q.mine && q.order !== "return") ?? [];
  const [open, setOpen] = useState(false);
  if (!mine.length) return null;
  return (
    <>
      <Button className="btn ghost" onClick={() => setOpen(!open)}>{t("⚔️ Order my squads ({n})", { n: mine.length })}</Button>
      {open && (
        <div className="row wrap" style={{ width: "100%" }}>
          {mine.map((q) => (
            <Button key={q.id} className="btn small" onClick={() => act(() => api("/api/squads", { body: { action: "attack", squadId: q.id, target: { kind, id } } })).then((ok) => ok && setOpen(false))}>
              {t("{icon} {n} → attack", { icon: q.icon, n: q.size })}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- tower defense HUD
function HpChip({ me, fire, now }: { me: Me; fire: (FireReport & { at: number }) | null; now: number }) {
  // Prefer the freshest number: a recent fire report, else /api/me plus regen.
  const fresh = fire && now - fire.at < 60_000 ? fire : null;
  const hp = fresh ? Math.min(fresh.maxHp, fresh.hp + Math.floor((now - fresh.at) / 6000)) : me.hp;
  const max = fresh?.maxHp ?? me.maxHp;
  const hurt = fresh?.hits.length && now - fresh.at < 1500;
  if (hp >= max && !hurt) return null;
  return (
    <>
      <div className={`chip small hp-chip ${hp < max * 0.3 ? "low" : ""}`} title={t("Your health on the street — hostile towers and guards shoot you")}>
        ❤️ {fmtNum(hp)}/{fmtNum(max)}
        <span className="hpline"><i style={{ width: `${(hp / max) * 100}%` }} /></span>
      </div>
      {hurt && <div className="hurt-flash" />}
    </>
  );
}

function WaveBanner({ wave, now, meId, dist, striking, onStrike, onGo }: { wave: ReturnType<typeof useLiveWaves>[number]; now: number; meId: string; dist: number; striking: boolean; onStrike: () => void; onGo?: () => void }) {
  const { w, def, out } = wave;
  const started = now >= w.startAt;
  const alive = def.creeps.filter((c, i) => {
    const at = creepPosOrNull(def, i, now);
    return (out.deathAt[i] == null || out.deathAt[i]! > now) && (!at || at.f < 1);
  }).length;
  const used = ((w.strikes as Strike[]) ?? []).filter((s) => s.by === meId).length;
  const left = Math.max(0, Math.ceil(((started ? w.endAt : w.startAt) - now) / 1000));
  return (
    <div className={`wave-banner ${started ? "live" : ""}`}>
      <div className="grow">
        <div className="small" style={{ color: "var(--red)", fontWeight: 800 }}>{w.ownerId === meId ? t("🏴‍☠️ RAIDERS → YOUR BASE") : t("🏴‍☠️ RAIDERS → CREW BASE")}{w.boost > 1 ? ` · ×${fmtNum(1.5)}` : ""}</div>
        <b style={{ fontFamily: "var(--display)" }}>{started ? t("{alive}/{total} left", { alive, total: def.creeps.length }) : t("{n} incoming", { n: def.creeps.length })}</b>
        <span className="small muted"> · {started ? t("ends in {time}", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` }) : t("starts in {time}", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</span>
      </div>
      {started && (
        <Button className="btn small" style={{ background: striking ? "#ff8a00" : undefined }} disabled={dist > STRIKE_RANGE_M || used >= STRIKES_PER_WAVE} onClick={onStrike} title={dist > STRIKE_RANGE_M ? t("Get within {m} m of the base", { m: STRIKE_RANGE_M }) : ""}>
          ✈️ {dist > STRIKE_RANGE_M ? t("Get closer") : t("Strike ({n})", { n: STRIKES_PER_WAVE - used })}
        </Button>
      )}
      {onGo && dist > 150 && <Button className="btn yellow small" onClick={onGo}><MoveIcon /> {t("Go")}</Button>}
    </div>
  );
}

const creepPosOrNull = (def: ReturnType<typeof useLiveWaves>[number]["def"], i: number, now: number) => creepPos(def, def.creeps[i], now);

function SuperweaponFab({ sw, now, onFire }: { sw: NonNullable<Me["superweapon"]>; now: number; onFire: () => void }) {
  const ready = !sw.readyAt || sw.readyAt <= now;
  const left = sw.readyAt ? Math.max(0, sw.readyAt - now) : 0;
  const h = Math.floor(left / 3_600_000);
  const m = Math.ceil((left % 3_600_000) / 60_000);
  return (
    <Button className={`fab sw-fab ${ready ? "ready" : ""}`} title={ready ? t("Launch {name}", { name: t(sw.name) }) : t("{name} charging", { name: t(sw.name) })} disabled={!ready} onClick={onFire}>
      {sw.emoji}
      {!ready && <span className="sw-charge">{h ? t("{n}h", { n: h }) : t("{n}m", { n: m })}</span>}
    </Button>
  );
}
