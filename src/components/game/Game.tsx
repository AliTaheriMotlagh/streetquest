"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RARITY_COLOR } from "@/lib/catalog";
import { applyConfig } from "@/lib/config";
import { S } from "@/lib/settings";
import { distanceM, formatDistance } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BREACH_RANGE_M, FACTION_BY_KEY, SIEGE_RANGE_M } from "@/lib/rts";
import { BasePanel } from "./BasePanel";
import { TargetPowers } from "./Hero";
import { OUTPOST_INCOME_HOUR } from "@/lib/outposts";
import { UNITS } from "@/lib/rts";
import type { HeroTabId } from "./Panels";
import { NeedsHud } from "./Life";
import { api, fmtTime, type LatLng, type LobbyView, type Me, type Selected, type World } from "./client";
import { BombDefuse } from "./MiniGames";
import { NoteCard } from "./Panels";
import { sfx, isMuted, setMuted, onMuteChange } from "./sfx";
import { setMusicMood, startMusic } from "./music";
import { InboxPanel } from "./Inbox";
import { Tour, TOUR_KEY } from "./Help";
import { enablePush, pushSupported, swEnabled } from "@/components/pwaClient";
import { askConfirm, askText } from "@/components/Dialogs";
import { BOUNTY_DAYS, BOUNTY_MAX, BOUNTY_MIN, CAPTURE_SECONDS, FLAG_RADIUS_M } from "@/lib/flags";
import { SUPER_RANGE_M, SUPERWEAPONS } from "@/lib/superweapons";
import { LobbyModal } from "./Lobby";
import { useLiveWaves } from "./waves";
import { creepPos, PINGS, SHOOT_RANGE_M, squadPos, STRIKE_RANGE_M, STRIKES_PER_WAVE, towerStats, TOWER_MAX_LEVEL, towerCost, type PingKind, type Strike, type TowerKey } from "@/lib/td";
import { CrewPanel, EventsPanel, JobsPanel, NearbyPanel, ProfilePanel } from "./Panels";
import { Ctx, MoveIcon, Sheet, useGame, type GameCtx, type PanelId, type Toast } from "./ui";
import { useLocation, useWakeLock, type FireReport } from "./useLocation";
import { GpsChip, LocationGate, markModeAsked, ModePrompt, useModePrompt } from "./LocationUi";
import { AdModal, burst, celebrate, CelebrationLayer, Directions, GpsBanner, PlayPanel, StorePanel, useGpsGame } from "./Play";
import { Button } from "@/components/Button";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false, loading: () => <div className="map" /> });
const Fps = dynamic(() => import("../fps/Fps"), { ssr: false, loading: () => <div className="fps" /> });

const NAV: [PanelId, string, string][] = [
  ["nearby", "🎯", "Nearby"],
  ["base", "🏰", "Base"],
  ["play", "🎮", "Play"],
  ["jobs", "📦", "Jobs"],
  ["crew", "🤝", "Crew"],
  ["me", "🦸", "Hero"],
];

const TEST_MODE_KEY = "sq_test_mode";
/** Longest an action waits for the latest position to reach the server. */
const FLUSH_WAIT_MS = 2500;
const TOAST_OUT_MS = 220;

const PHASE_ICON = { night: "🌙", dawn: "🌅", day: "☀️", dusk: "🌇" } as const;

export default function Game() {
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
  const [selected, setSelected] = useState<Selected | null>(null);
  const [lobby, setLobby] = useState<{ spawnId: string; mode?: "race" | "coop" } | { lobbyId: string } | null>(null);
  const [c4, setC4] = useState<{ towerId: string; seed: number; startAt: number } | null>(null);
  const [strike, setStrike] = useState<string | null>(null); // wave id while choosing an airstrike spot
  const [pingMenu, setPingMenu] = useState(false);
  const [runners, setRunners] = useState<LobbyView["players"] | undefined>(undefined);
  const [toasts, setToasts] = useState<(Toast & { out?: boolean })[]>([]);
  const [picker, setPicker] = useState<{ label: string; cb: (p: LatLng) => void } | null>(null);
  const [chat, setChat] = useState<{ room: string; label: string } | null>(null);
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
  const [meTab, setMeTab] = useState<HeroTabId>("hero");
  const [adOpen, setAdOpen] = useState(false);
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
    (t: Toast) => {
      const id = Math.random();
      setToasts((ts) => (ts.some((x) => !x.out && x.title === t.title && x.body === t.body) ? ts : [...ts.slice(-3), { ...t, id }]));
      setTimeout(() => dismissToast(id), t.kind === "error" ? 4000 : 3200);
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
        // Clash-style reward fly-up for anything that paid out.
        if (r?.message && /\+[\d,]+ ?(🪙|coins)/.test(r.message)) burst("🪙", 8);
        if (r?.message && /\+[\d,]+ ?💎/.test(r.message)) burst("💎", 5);
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
      toast({ kind: "error", title: `☠️ DOWNED by ${fire.downed.by}'s defenses`, body: `Lost ${fire.downed.coins} 🪙 · patching up for 3 min — move out of tower range` });
      navigator.vibrate?.([300, 100, 300]);
      loadMe();
    } else if (fire.hits.length) {
      const total = fire.hits.reduce((a, h) => a + h.dmg, 0);
      sfx("hurt");
      toast({ kind: "error", title: `${fire.hits.map((h) => h.emoji).join("")} Under fire! −${total} HP`, body: `${[...new Set(fire.hits.map((h) => h.by))].join(", ")}'s defenses — get out of the red rings` });
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
  const [askPush, setAskPush] = useState(false);
  const endTour = useCallback(() => {
    setTour(false);
    markModeAsked(); // the tour's last step just asked walking vs home
    try {
      localStorage.setItem(TOUR_KEY, "1");
      // Then, once, offer notifications (only where they can actually work).
      if (pushSupported() && swEnabled() && Notification.permission === "default" && !localStorage.getItem("sq_push_asked")) setTimeout(() => setAskPush(true), 1500);
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
        celebrate({ title: "THANK YOU!", body: r.message, emoji: "💎" });
        burst("💎", 14);
        loadMe();
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
        const r = await api<{ now: number; unread: number; inbox: number; notifications: Toast[] }>(`/api/sync?since=${syncSince.current}`);
        if (stop) return;
        syncSince.current = r.now;
        setInbox(panelRef.current === "inbox" ? 0 : r.inbox);
        for (const n of r.notifications) toast(n);
        const titles = r.notifications.map((n) => n.title).join(" ");
        if (/INCOMING/.test(titles)) sfx("siren");
        else if (/LEVEL UP/.test(titles)) {
          const n = r.notifications.find((x) => /LEVEL UP/.test(x.title));
          celebrate({ title: n!.title, body: n!.body, emoji: "⭐" });
        }
        else if (/shot you|took you down|DOWN/.test(titles)) sfx("hurt");
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
    if (panel === "crew") setUnread(0);
  }, [panel, unread]);

  // Deep links: /play?match=<id> drops straight into a live fight; /play?event=<id> joins an event.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    // Home-screen shortcuts: /play?panel=base|play|me…
    const want = sp.get("panel");
    if (want && me && ["nearby", "base", "play", "jobs", "crew", "me", "store", "inbox", "events"].includes(want)) {
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
    const start = me?.lastPos ?? geo.pos;
    if (start) setHomePos(start);
    else setPicker({ label: "🛋️ Tap where your commander starts", cb: (p) => setHomePos(p) });
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
          return { message: on ? `🛋️ Playing from home — tap the map to travel (rewards ×${S.remoteRewardMult})` : "🚶 Back to GPS — full rewards for walking" };
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
      toast({ title: "Test mode off", body: "Using your real GPS location" });
    } else {
      setSimMode(true);
      setSimPos(pos ?? { lat: 51.5079, lng: -0.0877 });
      toast({ title: "🕹️ Test mode on", body: "No walking needed — tap the map or use “Teleport here”" });
    }
  };

  const claim = (spawnId: string) =>
    act(() => api("/api/claim", { body: { spawnId } })).then((ok) => {
      if (!ok) return;
      setSelected(null);
      // Gone from the map right away; the refresh confirms it.
      const id = spawnId.replace(/^m:/, "");
      patchWorld((w) => (spawnId.startsWith("m:") ? { ...w, missions: w.missions.map((m) => (m.id === id ? { ...m, claimed: true } : m)) } : { ...w, spawns: w.spawns.map((x) => (x.id === id ? { ...x, claimed: true } : x)) }));
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
        setPanel,
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
      },
    [me, pos, world, toast, act, refresh, simMode, homeMode, !!homePos, setHomeMode], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!me || !ctx)
    return (
      <div className="game" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        {loadError && !me ? (
          <div className="modal">
            <div style={{ fontSize: 44 }}>⚠️</div>
            <h2>Couldn&apos;t start the game</h2>
            <p className="muted small">{loadError}</p>
            <Button className="btn" onClick={() => loadMe()}>Retry</Button>
          </div>
        ) : (
          <div className="big-num">LOADING…</div>
        )}
      </div>
    );

  const nearbyLobbies = world?.spawns.filter((s) => s.lobby && !s.claimed) ?? [];
  const badges: Partial<Record<PanelId, { n: number | string; sig: string }>> = {
    nearby: { n: nearbyLobbies.length, sig: nearbyLobbies.map((s) => s.lobby!.id).join(",") },
    base: !me.base ? { n: "!", sig: "nobase" } : me.baseAlert ? { n: me.baseAlert.supply >= 100 ? "🪙" : "!", sig: `${me.baseAlert.doneAt}|${me.baseAlert.supply >= 100}` } : undefined,
    play: { n: me.goalsReady || (me.gpsGame ? "▶" : 0), sig: `${me.goalsReady}|${me.gpsGame?.id ?? ""}` },
    jobs: { n: world?.deliveries.length ?? 0, sig: (world?.deliveries ?? []).map((d) => d.id).sort().join(",") },
    crew: { n: unread + me.pendingFriends, sig: `${unread}|${me.pendingFriends}` },
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
      <div className={`game ${shake ? "shake" : ""} ${match ? "in-fight" : ""}`}>
        <GameMap
          world={world}
          me={me}
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

        {/* HUD */}
        <div className="hud">
          <div className="player-card" onClick={() => setPanel("me")}>
            <div className="avatar">
              {me.avatar}
              <span className="lvl">{me.level}</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{me.username}</div>
              <div className="small" style={{ color: "var(--yellow)" }}>{me.title}</div>
              <div className="xpbar">
                <i style={{ width: `${me.levelPct * 100}%` }} />
              </div>
            </div>
          </div>
          <NeedsHud
            onClick={() => {
              setMeTab("life");
              setPanel("me");
            }}
          />
          <div className="hud-right" data-tour="wallet">
            <div className="chip">🪙 {me.coins.toLocaleString()}</div>
            <HpChip me={me} fire={fire} now={now} />
            <Button className="chip small gem-chip" onClick={() => setPanel("store")} title="Gem store">💎 {me.gems} <span className="plus">+</span></Button>
            <div className="chip small hide-sm">{me.league.emoji} {me.trophies}</div>
            {driving && !geo.simulated && <div className="chip small" title="Driving: the map zooms out and walking goals pause">🚗 {Math.round(geo.speed * 3.6)} km/h</div>}
            <GpsChip geo={geo} />
            {world && (
              <div className="chip phase">
                {PHASE_ICON[world.phase]} <span className="hide-sm">{world.phase.toUpperCase()}</span>
                {(world.phase === "dawn" || world.phase === "dusk") && <span style={{ color: "var(--yellow)" }}>2× XP</span>}
              </div>
            )}
            {homeMode && (
              <Button className="chip small home-chip" onClick={() => (setMeTab("stats"), setPanel("me"))} title="Playing from home — tap to switch back to GPS">
                🛋️ <span className="hide-sm">HOME</span> ×{S.remoteRewardMult}
              </Button>
            )}
            {geo.simulated && !homeMode && (
              <Button className="chip small" style={{ color: "var(--yellow)", cursor: "pointer" }} onClick={toggleSim} title="Turn test mode off">
                🕹️ <span className="hide-sm">TEST MODE</span><span className="show-sm">TEST</span>
              </Button>
            )}
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
            📜 <b>{me.quest.title}</b>
            <span>{me.quest.done ? "Claim reward!" : `${me.quest.desc} · ${me.quest.progress}/${me.quest.target}`}</span>
          </Button>
        )}

        {announce && !run && !picker && !me.quest && (
          <div className="announce" style={{ position: "absolute", top: 76, left: 10, right: 10, zIndex: 450, background: "var(--panel)", maxWidth: 560, margin: "0 auto" }}>
            <b className="grow small">📣 {announce.title}</b>
            {announce.ctaUrl && (
              <a className="btn yellow small" href={announce.ctaUrl}>
                {announce.ctaLabel ?? "Go"}
              </a>
            )}
            <Button className="close" onClick={() => setAnnounce(null)}>✕</Button>
          </div>
        )}

        {run && (
          <div className="run-banner">
            <div>
              <div className="small muted">RUN</div>
              <b style={{ fontFamily: "var(--display)" }}>{run.title}</b>
              {pos && <div className="small muted">{formatDistance(distanceM(pos, { lat: run.targetLat, lng: run.targetLng }))} to 🎯</div>}
            </div>
            <div className={`t ${runLeft < 30 ? "low" : ""}`}>
              {Math.floor(runLeft / 60)}:{String(runLeft % 60).padStart(2, "0")}
            </div>
            {homeMode && !atRunTarget && runLeft > 0 && (
              <Button className="btn green small" onClick={() => setTravel({ lat: run.targetLat, lng: run.targetLng })}>🛋️ Go</Button>
            )}
            {simMode && !atRunTarget && runLeft > 0 && (
              <Button className="btn yellow small" onClick={() => setSimPos({ lat: run.targetLat, lng: run.targetLng })}>
                🕹️ Jump
              </Button>
            )}
            {runLeft === 0 ? (
              <Button className="btn ghost small" onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                Failed
              </Button>
            ) : (
              <Button className="btn green small" disabled={!atRunTarget} onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                Finish
              </Button>
            )}
            <Button className="close" title="Abandon" onClick={() => askConfirm("Abandon this run?", { ok: "Abandon run", danger: true }).then((ok) => ok && act(() => api("/api/runs", { body: { runId: run.id, action: "abandon" } })))}>
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
            ☠️ <b>DOWNED</b> · back on your feet in {Math.ceil((me.downedUntil - now) / 1000)}s
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
            ✈️ Tap the map where the bombs should fall
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
            🛋️ <b>Travelling</b>
            <span className="small">{formatDistance(distanceM(pos, travel))} · {Math.ceil(distanceM(pos, travel) / (S.remoteSpeedKmh / 3.6) / 60)} min</span>
            <Button className="btn ghost small" onClick={() => setTravel(null)}>Stop</Button>
          </div>
        )}

        {/* Floating buttons */}
        <div className="fab-col">
          <Button className="fab" data-tour="inbox" title="Inbox" aria-label={`Inbox${inbox ? `, ${inbox} new` : ""}`} onClick={() => setPanel("inbox")}>
            🔔{inbox > 0 && <span className="badge pop">{inbox > 99 ? "99+" : inbox}</span>}
          </Button>
          {me.canSimulate && (
            <Button className="fab" title={simMode ? "Test mode on — tap to use real GPS" : "Test mode: play without walking"} onClick={toggleSim} style={{ outline: simMode ? "2px solid var(--yellow)" : undefined }}>
              🕹️
            </Button>
          )}
          {me.dailyAvailable && (
            <Button className="fab" title="Daily reward" onClick={() => act(() => api("/api/daily", { body: {} }))}>
              🎁<span className="badge">!</span>
            </Button>
          )}
          {me.superweapon && (
            <SuperweaponFab
              sw={me.superweapon}
              now={now}
              onFire={() =>
                setPicker({
                  label: `${me.superweapon!.emoji} Tap the target (within ${SUPER_RANGE_M / 1000} km of your base)`,
                  cb: (p) =>
                    askConfirm(`Launch the ${me.superweapon!.name}?`, { body: "Everyone near the target gets a countdown warning. You can't call it back.", ok: "LAUNCH", danger: true }).then((ok) => {
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
          <Button className="fab" title={muted ? "Sound off" : "Sound on"} aria-label={muted ? "Turn sound on" : "Turn sound off"} onClick={() => setMuted(!muted)}>
            {muted ? "🔇" : "🔊"}
          </Button>
          <Button className="fab" title="Ping your crew" onClick={() => setPingMenu(!pingMenu)} style={{ outline: pingMenu ? "2px solid var(--yellow)" : undefined }}>
            📣
          </Button>
          {pingMenu && (
            <div className="ping-menu">
              {(Object.keys(PINGS) as PingKind[]).map((k) => (
                <Button
                  key={k}
                  onClick={() => {
                    setPingMenu(false);
                    setPicker({ label: `${PINGS[k].emoji} Tap where to ping`, cb: (p) => act(() => api("/api/pings", { body: { kind: k, lat: p.lat, lng: p.lng } })) });
                  }}
                >
                  {PINGS[k].emoji} {PINGS[k].label}
                </Button>
              ))}
            </div>
          )}
          <Button className={`fab ${!follow && pos ? "fab-recenter" : ""}`} title="Re-center on me" aria-label="Re-center the map on me" aria-pressed={follow} onClick={() => setFollow(true)} style={{ color: follow ? "var(--cyan)" : undefined }}>
            ◎
          </Button>
        </div>

        {/* Toasts */}
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind ?? ""} ${t.out ? "out" : ""}`} onClick={() => dismissToast(t.id)} title="Tap to dismiss" role={t.kind === "error" ? "alert" : "status"}>
              <b>{t.title}</b>
              {t.body && <span className="small muted">{t.body}</span>}
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
            onC4={(towerId) => setC4({ towerId, seed: Math.floor(Math.random() * 2 ** 31), startAt: Date.now() + 2500 })}
          />
        )}

        {panel === "nearby" && <NearbyPanel onClose={close} peek={peek} />}
        {panel === "base" && <BasePanel onClose={close} peek={peek} />}
        {panel === "jobs" && <JobsPanel onClose={close} peek={peek} />}
        {panel === "crew" && <CrewPanel onClose={close} peek={peek} chat={chat} setChat={setChat} />}
        {panel === "events" && <EventsPanel onClose={close} peek={peek} />}
        {panel === "inbox" && <InboxPanel onClose={close} peek={peek} onRead={() => setInbox(0)} />}
        {panel === "play" && <PlayPanel onClose={close} peek={peek} onStarted={loadMe} />}
        {panel === "store" && <StorePanel onClose={close} peek={peek} onWatch={() => setAdOpen(true)} />}
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

        {!panel && !selected && (
          <nav className="nav">
            {NAV.map(([id, ic, label]) => {
              const b = showBadge(id);
              return (
                <Button key={id} data-tour={`nav-${id}`} onClick={() => openPanel(id)} className={id === "base" && !me.base ? "pulse" : ""}>
                  <span className="ic">{ic}</span>
                  {label}
                  {b != null && <span className="badge pop">{b}</span>}
                </Button>
              );
            })}
          </nav>
        )}

        {match && <Fps matchId={match} onExit={exitMatch} />}

        {lobby && <LobbyModal open={lobby} onClose={() => setLobby(null)} />}
        {adOpen && <AdModal onClose={() => (setAdOpen(false), loadMe())} />}
        <CelebrationLayer />
        {askPush && (
          <div className="modal-bg" style={{ zIndex: 2500 }}>
            <div className="modal">
              <div style={{ fontSize: 56 }}>🔔</div>
              <h2>Don&apos;t miss a raid</h2>
              <p className="muted small" style={{ lineHeight: 1.5 }}>Get a notification when your base is attacked, a reward is waiting or your crew needs you — even when the game is closed. You can turn it off any time in Hero → Profile.</p>
              <div className="row wrap" style={{ justifyContent: "center" }}>
                <Button className="btn ghost" onClick={() => { setAskPush(false); try { localStorage.setItem("sq_push_asked", "1"); } catch {} }}>Not now</Button>
                <Button
                  className="btn green"
                  onClick={() => {
                    setAskPush(false);
                    try { localStorage.setItem("sq_push_asked", "1"); } catch {}
                    enablePush().then(() => toast({ kind: "reward", title: "🔔 Notifications on" })).catch((e) => toast({ kind: "error", title: (e as Error).message }));
                  }}
                >
                  Turn on
                </Button>
              </div>
            </div>
          </div>
        )}
        {tour && <Tour onDone={endTour} onChooseHome={(home) => home !== me.remotePlay && setHomeMode(home)} />}

        {c4 && (
          <div className="modal-bg">
            <div className="modal" style={{ maxWidth: 420, padding: 14 }}>
              <BombDefuse
                title="💣 Wire the C4"
                seed={c4.seed}
                startAt={c4.startAt}
                onDone={(score) => {
                  const towerId = c4.towerId;
                  setC4(null);
                  // Rounds cleared (0–3) decide the blast.
                  act(() => api("/api/towers", { body: { action: "sabotage", towerId, score: Math.min(3, Math.floor(score / 100)) } })).then(() => loadWorld(true));
                }}
              />
              <Button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setC4(null)}>Abort</Button>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
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
  const { pos, act, me, world, openChat, setPanel, enterMatch, teleport, pick } = useGame();
  const target = sel.type === "delivery" ? { lat: sel.data.pickupLat, lng: sel.data.pickupLng } : sel.type === "squad" ? squadPos(sel.data) : sel.data;
  const dist = pos ? distanceM(pos, target) : Infinity;
  const inRange = dist <= INTERACT_RADIUS_M;
  const tooFar = teleport ? (
    <Button className="btn yellow block" onClick={() => teleport(target)}><MoveIcon /> Go here · {formatDistance(dist)}</Button>
  ) : (
    <div className="row">
      <Button className="btn grow" disabled>Get closer · {formatDistance(dist)}</Button>
      {dist > 150 && <Directions to={target} />}
    </div>
  );
  // Bases and bosses can be fought from up to BREACH_RANGE_M away.
  const jump = teleport && dist > BREACH_RANGE_M && (
    <Button className="btn yellow" onClick={() => teleport(target)}><MoveIcon /> Go next to it</Button>
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
  const shoot = (kind: "player" | "tower" | "squad", id: string, label = "🔫 Shoot") => (
    <Button
      className="btn"
      disabled={!!me.downedUntil || me.rookie}
      title={me.rookie ? "Reach level 3 to fight" : undefined}
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
      onClick={() => askConfirm(`March your home army to ${label}? Everyone will see it coming.`, { ok: "March" }).then((ok) => ok && act(() => api("/api/squads", { body: { action: "deploy", target: { kind, id } } })).then((ok) => ok && onClose()))}
    >
      🎖️ March a squad
    </Button>
  );

  if (sel.type === "spawn") {
    const s = sel.data;
    const title = s.kind === "run" ? s.run!.title : s.kind === "chest" ? "Locked Chest" : s.kind === "arcade" ? "Arcade Machine" : s.kind === "derrick" ? "Oil Derrick" : s.item!.name;
    const emoji = s.kind === "chest" ? "🧰" : s.kind === "run" ? "🏁" : s.kind === "arcade" ? "🕹️" : s.kind === "derrick" ? "🛢️" : s.item!.emoji;
    const desc =
      s.kind === "derrick"
        ? `Neutral militia (strength ${s.guard}) guards this derrick. Lead your army here in person and take it: +${s.rewardCoins} 🪙.`
        : s.kind === "run"
        ? `${s.run!.brief} Target is ${formatDistance(s.run!.distanceM)} away — you have ${Math.round(s.run!.timeLimitS / 60)} min.`
        : s.kind === "chest"
          ? `A booby-trapped supply crate (maybe ${s.item!.emoji} inside). Defuse the bomb — flawless = double loot. Nearby players can join and race you for a winner's bonus.`
          : s.kind === "arcade"
            ? "Shooting Range: 20 seconds, hostiles in the windows, spare the civilians. Players nearby can join — highest score takes the pot."
            : s.item!.blurb;
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="icon-tile" style={{ width: 70, height: 70, fontSize: 42, boxShadow: s.item ? `0 0 24px ${RARITY_COLOR[s.item.rarity]}` : undefined }}>{emoji}</div>
          <div className="grow">
            {s.item && s.kind !== "derrick" && <span className="tag" style={{ color: RARITY_COLOR[s.item.rarity] }}>{s.item.rarity}</span>}
            <p className="small" style={{ margin: "6px 0" }}>{desc}</p>
            <div className="small muted">
              +{s.rewardXp} XP {s.rewardCoins ? `· +${s.rewardCoins} 🪙` : ""} {s.goldenHour && "· ✨ golden hour 2×"} · despawns in{" "}
              {Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000))} min
            </div>
          </div>
        </div>
        {s.claimed ? (
          <Button className="btn block" disabled>Already collected</Button>
        ) : !inRange ? (
          tooFar
        ) : s.kind === "derrick" ? (
          <Button className="btn yellow block" disabled={!me.faction} onClick={() => act(() => api("/api/battle", { body: { kind: "derrick", targetId: s.id } })).then((ok) => ok && onClose())}>
            {me.faction ? "🎖️ Attack with your army" : "Join a faction first (Base tab)"}
          </Button>
        ) : s.kind === "chest" || s.kind === "arcade" ? (
          <Button className="btn yellow block" disabled={!!me.downedUntil} onClick={() => onLobby({ spawnId: s.id })}>
            {s.lobby ? `👥 Join ${s.lobby.players} player${s.lobby.players > 1 ? "s" : ""} — ${Math.max(0, Math.ceil((s.lobby.openUntil - Date.now()) / 1000))}s` : s.kind === "chest" ? "💣 Defuse it" : "🎯 Play"}
          </Button>
        ) : s.kind === "run" ? (
          me.activeRun ? (
            <Button className="btn block" disabled>Finish your current run first</Button>
          ) : s.lobby ? (
            <Button className="btn yellow block" onClick={() => onLobby({ spawnId: s.id })}>👥 Join the {s.lobby.kind === "coop" ? "co-op run" : "race"} ({s.lobby.players})</Button>
          ) : (
            <div className="row wrap">
              <Button className="btn" onClick={() => onClaim(s.id)}>🏁 Solo</Button>
              <Button className="btn yellow" onClick={() => onLobby({ spawnId: s.id, mode: "race" })}>🏎️ Race others</Button>
              <Button className="btn green" onClick={() => onLobby({ spawnId: s.id, mode: "coop" })}>🤝 Co-op run</Button>
            </div>
          )
        ) : (
          <Button className="btn green block" onClick={() => onClaim(s.id)}>Collect</Button>
        )}
      </Sheet>
    );
  }

  if (sel.type === "mission") {
    const m = sel.data;
    return (
      <Sheet title={m.title} onClose={onClose}>
        {m.sponsor && <span className="tag" style={{ color: "var(--yellow)" }}>Presented by {m.sponsor}</span>}
        <p>{m.description}</p>
        <p className="small muted">Reward: {m.item?.emoji} {m.item?.name} · +{m.rewardXp} XP · +{m.rewardCoins} 🪙 · ends {fmtTime(m.activeTo)}</p>
        {m.claimed ? <Button className="btn block" disabled>Completed</Button> : inRange ? <Button className="btn yellow block" onClick={() => onClaim(`m:${m.id}`)}>Complete mission</Button> : tooFar}
      </Sheet>
    );
  }

  if (sel.type === "note") {
    return (
      <Sheet title={sel.data.hasPhoto ? "📸 Photo at this spot" : "💬 Post at this spot"} onClose={onClose}>
        <NoteCard n={sel.data} dist={dist} />
        {!sel.data.unlocked && teleport && <Button className="btn yellow block" onClick={() => teleport(sel.data)}><MoveIcon /> Go here</Button>}
      </Sheet>
    );
  }

  if (sel.type === "event") {
    const e = sel.data;
    return (
      <Sheet title={e.title} onClose={onClose}>
        <p className="small muted">{fmtTime(e.startsAt)} – {fmtTime(e.endsAt)} · {e.participants}/{e.maxPlayers} going · {formatDistance(dist)}</p>
        <p>{e.description}</p>
        <div className="row wrap">
          <Button className="btn" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "join" } }))}>Join</Button>
          <Button className="btn green" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "checkin" } }))}>Check in</Button>
          <Button className="btn cyan" onClick={() => openChat(`event:${e.id}`, e.title)}>Chat</Button>
          <Button className="btn ghost" onClick={() => setPanel("events")}>All events</Button>
        </div>
      </Sheet>
    );
  }

  if (sel.type === "delivery") {
    const d = sel.data;
    return (
      <Sheet title={`📦 ${d.title}`} onClose={onClose}>
        <p className="small muted">Posted by {d.sender?.username} · reward {d.reward} 🪙</p>
        {d.description && <p>{d.description}</p>}
        <p className="small">🟢 {d.pickupLabel}<br />🔴 {d.dropoffLabel} ({formatDistance(distanceM({ lat: d.pickupLat, lng: d.pickupLng }, { lat: d.dropoffLat, lng: d.dropoffLng }))} trip)</p>
        <Button className="btn green block" onClick={() => act(() => api(`/api/deliveries/${d.id}`, { body: { action: "accept" } })).then((ok) => ok && onClose())}>
          Accept job
        </Button>
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
          <span className={`dot ${b.owner.online ? "on" : ""}`} /> {b.owner.avatar} {b.owner.username} {f && <span style={{ color: f.color }}>· {f.emoji} {f.name}</span>} · {formatDistance(dist)}
        </div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{b.hq}</b><span>HQ level</span></div>
          <div className="stat"><b>🗼 {b.turrets}</b><span>Turrets</span></div>
          <div className="stat"><b>{b.hp}</b><span>Integrity</span></div>
        </div>
        {b.shielded && <p className="small" style={{ color: "var(--cyan)" }}>🛡️ Cease-fire shield is up.</p>}
        {b.mine || b.friend ? (
          <div className="row wrap">
            {b.mine && <Button className="btn cyan" onClick={() => setPanel("base")}>Open base</Button>}
            {teleport && dist > 60 && <Button className="btn yellow" onClick={() => teleport(b)}><MoveIcon /> Go home</Button>}
            {b.liveMatch && <Button className="btn" onClick={() => startMatch("breach", b.id)}>🛡️ Defend it (FPS)</Button>}
            {!b.mine && !b.liveMatch && <p className="small muted">Your crew&apos;s base. If it&apos;s breached while you&apos;re close, you can jump in to defend.</p>}
          </div>
        ) : (
          <>
            <div className="row wrap">
              <Button
                className="btn yellow"
                disabled={!me.base || fromBase > SIEGE_RANGE_M || b.shielded}
                onClick={() => askConfirm(`Send your whole army to siege ${b.name}?`, { ok: "Attack" }).then((ok) => ok && act(() => api("/api/battle", { body: { kind: "siege", targetId: b.id } })))}
              >
                🎖️ Siege with army
              </Button>
              {marchOn("base", b.id, b.name)}
              <OrderSquads kind="base" id={b.id} />
              {jump}
              {b.liveMatch ? (
                <Button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("breach", b.id)}>⚔️ Join the firefight</Button>
              ) : (
                <Button className="btn" disabled={!breachable} onClick={() => startMatch("breach", b.id)}>⚔️ Breach (FPS)</Button>
              )}
            </div>
            <p className="small muted">
              {!me.base
                ? "Plant your own base to send armies."
                : fromBase > SIEGE_RANGE_M
                  ? `Out of siege range (${formatDistance(fromBase)} from your base, max ${SIEGE_RANGE_M / 1000} km).`
                  : "Siege is auto-resolved: your army vs their garrison and turrets."}{" "}
              {dist > BREACH_RANGE_M ? `Walk within ${BREACH_RANGE_M} m to breach it in first person.` : !humansOnline ? "Breach unlocks when players are online nearby." : "You're close — breach it in first person!"}
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
      <Sheet title={`${b.def.emoji} ${b.def.name}`} onClose={onClose}>
        <p className="small" style={{ margin: "0 0 8px" }}>{b.def.blurb}</p>
        <div className="need-bar boss"><i style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>
        <p className="small muted">
          {b.hp.toLocaleString()} / {b.maxHp.toLocaleString()} HP · shared by every player · leaves in {Math.max(0, Math.round((b.expiresAt - Date.now()) / 60000))} min · {formatDistance(dist)}
        </p>
        <div className="row wrap">
          {jump}
          <Button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("raid", b.id)}>
            ⚔️ {b.liveMatch ? "Join the raid" : "Raid (FPS)"}
          </Button>
          <Button className="btn yellow" disabled={!me.base || fromBase > SIEGE_RANGE_M} onClick={() => act(() => api("/api/battle", { body: { kind: "bombard", targetId: b.id } }))}>
            💥 Bombard with army
          </Button>
        </div>
        <TargetPowers targetId={b.id} allow={["barrage"]} />
        <p className="small muted">Everyone who damages it shares the loot when it falls; top damage gets a 👑. {dist > BREACH_RANGE_M && `Walk within ${BREACH_RANGE_M} m to fight it in first person.`}</p>
      </Sheet>
    );
  }

  if (sel.type === "outpost") {
    const o = sel.data;
    const g = o.garrison ?? {};
    const station = (unit: string, qty: number) => act(() => api("/api/outposts", { body: { action: "station", outpostId: o.id, unit, qty } }));
    return (
      <Sheet title={`${o.owner ? "🚩" : "🏴"} ${o.name}`} onClose={onClose}>
        <p className="small muted">
          {o.mine ? "Held by you" : o.owner ? `Held by ${o.owner.username}` : "Neutral — guarded by militia"} · pays {OUTPOST_INCOME_HOUR} 🪙/hour to its holder · {formatDistance(dist)}
        </p>
        <div className="card small">
          {o.owner ? (
            o.garrison ? (
              <>🪖 Garrison: {Object.entries(g).filter(([, q]) => q).map(([k, q]) => `${UNITS.find((u) => u.key === k)?.emoji} ${q}`).join("  ") || "none (only the fortification)"}</>
            ) : (
              <>🪖 Garrison: <b>{o.garrisonSize}</b> <span className="muted">(research 📡 Radar or use a 🛰️ Spy Drone for details)</span></>
            )
          ) : (
            <>⚔️ Militia strength {o.guard}</>
          )}
          {o.shielded && <div style={{ color: "var(--cyan)" }}>🛡️ Freshly captured — dug in for a few minutes</div>}
        </div>
        {o.mine ? (
          <>
            <label>Station troops from your army</label>
            <div className="row wrap">
              {UNITS.map((u) => (
                <Button key={u.key} className="btn ghost small" onClick={() => station(u.key, u.key === "ranger" ? 5 : 1)}>
                  +{u.key === "ranger" ? 5 : 1} {u.emoji}
                </Button>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <Button className="btn ghost small" onClick={() => act(() => api("/api/outposts", { body: { action: "withdraw", outpostId: o.id } }))}>↩️ Withdraw all</Button>
              <Button className="btn yellow small" onClick={() => act(() => api("/api/outposts", { body: { action: "collect" } }))}>🪙 Collect tribute</Button>
            </div>
          </>
        ) : (
          <>
            <div className="row wrap">
              {jump}
              <Button
                className="btn yellow"
                disabled={!me.base || fromBase > SIEGE_RANGE_M || o.shielded}
                onClick={() => askConfirm(`Send your whole army to assault ${o.name}?`, { ok: "Attack" }).then((ok) => ok && act(() => api("/api/outposts", { body: { action: "assault", outpostId: o.id } })))}
              >
                🎖️ Assault with army
              </Button>
              {marchOn("outpost", o.id, o.name)}
              <OrderSquads kind="outpost" id={o.id} />
            </div>
            <p className="small muted">{!me.base ? "Plant a base to send armies." : fromBase > SIEGE_RANGE_M ? `Out of range (${formatDistance(fromBase)} from your base, max ${SIEGE_RANGE_M / 1000} km).` : "Win and it's yours — then garrison it before someone takes it back."}</p>
            {o.owner && <TargetPowers targetId={o.id} allow={["spy_drone", "barrage"]} />}
          </>
        )}
      </Sheet>
    );
  }

  if (sel.type === "tower") {
    const t = sel.data;
    const st = towerStats(t);
    const ready = t.readyAt <= Date.now();
    const hostile = !t.mine && !t.friend;
    const up = t.level < TOWER_MAX_LEVEL ? towerCost(t.type as TowerKey, t.level + 1) : null;
    return (
      <Sheet title={`${st.def.emoji} ${st.def.name}`} onClose={onClose}>
        <div className="small muted" style={{ marginBottom: 6 }}>
          {t.mine ? "Your tower" : t.friend ? `${t.owner}'s tower (crew)` : <span style={{ color: "var(--red)" }}>Hostile — {t.owner}</span>} · Lv {t.level} · {formatDistance(dist)}
          {!ready && " · 🚧 under construction"}
        </div>
        <div className="need-bar"><i style={{ width: `${(t.hp / st.maxHp) * 100}%`, background: hostile ? "var(--red)" : "var(--green)" }} /></div>
        <p className="small">{st.def.blurb}</p>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <div className="stat"><b>{t.hp}</b><span>HP</span></div>
          <div className="stat"><b>{st.range} m</b><span>Range</span></div>
          <div className="stat"><b>☠️ {t.kills}</b><span>Kills</span></div>
        </div>
        {t.mine ? (
          <div className="row wrap">
            {up && ready && <Button className="btn" onClick={() => act(() => api("/api/towers", { body: { action: "upgrade", towerId: t.id } }))}>↑ Level {t.level + 1} · {up.coins} 🪙</Button>}
            {t.hp < st.maxHp && <Button className="btn ghost" onClick={() => act(() => api("/api/towers", { body: { action: "repair", towerId: t.id } }))}>🔧 Repair</Button>}
            <Button className="btn ghost" onClick={() => setPanel("base")}>All defenses</Button>
          </div>
        ) : hostile ? (
          <>
            <div className="row wrap">
              {shoot("tower", t.id)}
              <Button className="btn yellow" disabled={dist > st.range + 15 || !!me.downedUntil} onClick={() => onC4(t.id)}>💣 Plant C4</Button>
              {marchOn("tower", t.id, `${t.owner}'s ${st.def.name}`)}
              <OrderSquads kind="tower" id={t.id} />
              {teleport && dist > st.range + 15 && <Button className="btn ghost" onClick={() => teleport(t)}><MoveIcon /> Go there</Button>}
            </div>
            <p className="small muted">
              {me.rookie ? "Rookie cover: it won't shoot you until level 3." : `It shoots commanders inside ${st.range} m — run in, wire the charge fast, get out.`} Or march a squad at it from your base.
            </p>
          </>
        ) : (
          <p className="small muted">Your crew&apos;s tower. It covers you and shoots raiders attacking crew bases.</p>
        )}
      </Sheet>
    );
  }

  if (sel.type === "squad") {
    const q = sel.data;
    const marching = q.status === "MARCH" && q.arriveAt > Date.now();
    const units = q.units ? Object.entries(q.units).filter(([, n]) => n).map(([k, n]) => `${UNITS.find((u) => u.key === k)?.emoji} ${n}`).join("  ") : `~${q.size} units (research 📡 Radar to see more)`;
    return (
      <Sheet title={`${q.icon} ${q.mine ? "Your squad" : `${q.owner}'s squad`}`} onClose={onClose}>
        <p className="small muted">
          {q.friend ? "Crew · " : !q.mine ? <span style={{ color: "var(--red)" }}>Hostile · </span> : null}
          {marching ? `${q.order === "attack" ? "On the attack" : q.order === "return" ? "Heading home" : "On the move"} · arrives in ${Math.max(0, Math.ceil((q.arriveAt - Date.now()) / 1000))}s` : "Holding position"} · {formatDistance(dist)}
        </p>
        <div className="card small">🪖 {units}</div>
        {q.mine ? (
          <div className="row wrap">
            <Button className="btn cyan" onClick={() => { onClose(); pick("Tap where this squad should move", (to) => act(() => api("/api/squads", { body: { action: "move", squadId: q.id, to } }))); }}>📍 Move</Button>
            {q.order !== "return" && <Button className="btn ghost" onClick={() => act(() => api("/api/squads", { body: { action: "recall", squadId: q.id } })).then((ok) => ok && onClose())}>↩️ Recall</Button>}
            <p className="small muted">To attack with it, tap an enemy tower, squad, base or outpost and use <b>Order my squads</b>.</p>
          </div>
        ) : !q.friend ? (
          <>
            <div className="row wrap">
              {shoot("squad", q.id)}
              {!marching && marchOn("squad", q.id, `${q.owner}'s squad`)}
              {!marching && <OrderSquads kind="squad" id={q.id} />}
            </div>
            <p className="small muted">{marching ? "It's on the move — wait for it to stop before you can engage." : "Guard squads shoot commanders within 55 m and join any fight at nearby bases and outposts."}</p>
          </>
        ) : null}
      </Sheet>
    );
  }

  if (sel.type === "ping") {
    const pg = sel.data;
    return (
      <Sheet title={`${PINGS[pg.kind]?.emoji} ${PINGS[pg.kind]?.label}`} onClose={onClose}>
        <p className="small muted">{pg.avatar} {pg.mine ? "You" : pg.by} pinged this spot · {formatDistance(dist)} · fades in {Math.max(0, Math.ceil((pg.expiresAt - Date.now()) / 60000))} min</p>
        {teleport && <Button className="btn yellow" onClick={() => teleport(pg)}><MoveIcon /> Go there</Button>}
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
          {f.mine ? "Your flag" : `${f.ownerAvatar} ${f.owner}${f.friend ? " (crew)" : ""}`} · held {Math.max(1, Math.round((Date.now() - f.heldSince) / 60000))} min · captured {f.captures}× · {formatDistance(dist)}
        </p>
        {f.capture && <div className="card small" style={{ borderColor: "var(--red)" }}>⚔️ {f.capture.mine ? "You are" : `${f.capture.by} is`} capturing it — {capLeft}s left</div>}
        {f.shielded && <p className="small" style={{ color: "var(--cyan)" }}>🛡️ Just captured — can&apos;t be flipped for a few minutes</p>}
        <div className="row wrap">
          {ours ? (
            <>
              {f.capture && <Button className="btn green" disabled={!inRange} onClick={() => doFlag("defend")}>🛡️ Defend</Button>}
              {f.mine && <Button className="btn yellow" onClick={() => act(() => api("/api/flags", { body: { action: "collect" } }))}>🪙 Collect tribute</Button>}
              {f.mine && <Button className="btn ghost" onClick={() => askConfirm(`Abandon "${f.name}"?`, { ok: "Abandon", danger: true }).then((ok) => (ok ? doFlag("abandon").then(onClose) : undefined))}>🏳️</Button>}
            </>
          ) : (
            <Button className="btn" disabled={!inRange || f.shielded || !!me.downedUntil} onClick={() => doFlag("capture")}>
              🚩 {f.capture?.mine ? (capLeft > 0 ? `Hold… ${capLeft}s` : "Claim it!") : "Capture"}
            </Button>
          )}
          {teleport && !inRange && <Button className="btn yellow" onClick={() => teleport(f)}><MoveIcon /> Go there</Button>}
        </div>
        <p className="small muted">
          {ours
            ? `Rivals capture it by standing within ${FLAG_RADIUS_M} m for ${CAPTURE_SECONDS}s. Being there yourself stops them.`
            : inRange
              ? `Stay within ${FLAG_RADIUS_M} m for ${CAPTURE_SECONDS}s, then tap again to claim it. Defenders standing here block you — shoot them first.`
              : `Walk within ${FLAG_RADIUS_M} m to capture it.`}
        </p>
      </Sheet>
    );
  }

  if (sel.type === "strike") {
    const x = sel.data;
    const def = SUPERWEAPONS[x.kind];
    const left = Math.ceil((x.impactAt - Date.now()) / 1000);
    return (
      <Sheet title={`${def.emoji} ${def.name}`} onClose={onClose}>
        <p>
          {left > 0
            ? <b style={{ color: "var(--red)" }}>Impact in {left}s! {dist <= x.radius ? "You're inside the blast — RUN!" : "You're outside the blast."}</b>
            : x.hazardUntil && x.hazardUntil > Date.now()
              ? <>☣️ {def.hazard?.label} — dangerous for another {Math.ceil((x.hazardUntil - Date.now()) / 60000)} min. Stay out of the circle.</>
              : "The dust has settled."}
        </p>
        <p className="small muted">Launched by {x.mine ? "you" : x.owner} · {x.radius} m radius · {def.blurb}</p>
      </Sheet>
    );
  }

  const p = sel.data;
  return (
    <Sheet title={`${p.avatar} ${p.username}`} onClose={onClose}>
      <p className="muted">
        Level {p.level} · {p.friend ? "In your crew" : "~ approximate location"}
        {p.bounty > 0 && <span style={{ color: "var(--yellow)" }}> · 💀 WANTED {p.bounty.toLocaleString()} 🪙</span>}
      </p>
      {p.friend ? (
        <Button className="btn cyan block" onClick={() => openChat(`dm:${[me.id, p.id].sort().join(":")}`, p.username)}>💬 Message</Button>
      ) : (
        <>
          <div className="row wrap">
            {shoot("player", p.id, `🔫 Attack`)}
            <Button className="btn ghost" onClick={() => act(() => api("/api/friends", { body: { action: "request", username: p.username } }))}>➕ Add to crew</Button>
            <Button
              className="btn ghost"
              onClick={() =>
                askText(`Bounty on ${p.username}`, "200", { body: `Coins are held until someone downs them (refunded after ${BOUNTY_DAYS} days). ${BOUNTY_MIN}–${BOUNTY_MAX} 🪙.`, ok: "Place bounty" }).then((v) => {
                  const amount = Math.round(Number(v));
                  if (v && Number.isFinite(amount)) return act(() => api("/api/bounties", { body: { targetId: p.id, amount } }));
                })
              }
            >
              💀 Bounty
            </Button>
          </div>
          <p className="small muted">
            {me.rookie ? "Reach level 3 to fight other commanders." : `Shots land within ${SHOOT_RANGE_M} m (their map position is approximate — get close). Downing them steals some coins and 5 🏆.`}
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
      <Button className="btn ghost" onClick={() => setOpen(!open)}>⚔️ Order my squads ({mine.length})</Button>
      {open && (
        <div className="row wrap" style={{ width: "100%" }}>
          {mine.map((q) => (
            <Button key={q.id} className="btn small" onClick={() => act(() => api("/api/squads", { body: { action: "attack", squadId: q.id, target: { kind, id } } })).then((ok) => ok && setOpen(false))}>
              {q.icon} {q.size} → attack
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
      <div className={`chip small hp-chip ${hp < max * 0.3 ? "low" : ""}`} title="Your health on the street — hostile towers and guards shoot you">
        ❤️ {hp}/{max}
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
        <div className="small" style={{ color: "var(--red)", fontWeight: 800 }}>🏴‍☠️ RAIDERS {w.ownerId === meId ? "→ YOUR BASE" : "→ CREW BASE"}{w.boost > 1 ? " · ×1.5" : ""}</div>
        <b style={{ fontFamily: "var(--display)" }}>{started ? `${alive}/${def.creeps.length} left` : `${def.creeps.length} incoming`}</b>
        <span className="small muted"> · {started ? "ends" : "in"} {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
      {started && (
        <Button className="btn small" style={{ background: striking ? "#ff8a00" : undefined }} disabled={dist > STRIKE_RANGE_M || used >= STRIKES_PER_WAVE} onClick={onStrike} title={dist > STRIKE_RANGE_M ? `Get within ${STRIKE_RANGE_M} m of the base` : ""}>
          ✈️ {dist > STRIKE_RANGE_M ? "Get closer" : `Strike (${STRIKES_PER_WAVE - used})`}
        </Button>
      )}
      {onGo && dist > 150 && <Button className="btn yellow small" onClick={onGo}><MoveIcon /> Go</Button>}
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
    <Button className={`fab sw-fab ${ready ? "ready" : ""}`} title={ready ? `Launch ${sw.name}` : `${sw.name} charging`} disabled={!ready} onClick={onFire}>
      {sw.emoji}
      {!ready && <span className="sw-charge">{h ? `${h}h` : `${m}m`}</span>}
    </Button>
  );
}
