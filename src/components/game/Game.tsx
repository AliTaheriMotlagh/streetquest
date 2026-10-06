"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RARITY_COLOR } from "@/lib/catalog";
import { distanceM, formatDistance } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BREACH_RANGE_M, FACTION_BY_KEY, SIEGE_RANGE_M } from "@/lib/rts";
import { BasePanel } from "./BasePanel";
import { NeedsHud } from "./Life";
import { api, fmtTime, type LatLng, type Me, type Selected, type World } from "./client";
import { Lockpick, TapRush } from "./MiniGames";
import { CrewPanel, EventsPanel, JobsPanel, NearbyPanel, ProfilePanel } from "./Panels";
import { Ctx, Sheet, useGame, type GameCtx, type PanelId, type Toast } from "./ui";
import { useLocation, type GeoError } from "./useLocation";

const GameMap = dynamic(() => import("./GameMap"), { ssr: false, loading: () => <div className="map" /> });
const Fps = dynamic(() => import("../fps/Fps"), { ssr: false, loading: () => <div className="fps" /> });

const NAV: [PanelId, string, string][] = [
  ["nearby", "🎯", "Nearby"],
  ["base", "🏰", "Base"],
  ["jobs", "📦", "Jobs"],
  ["crew", "🤝", "Crew"],
  ["events", "🎉", "Events"],
  ["me", "🎒", "Me"],
];

const PHASE_ICON = { night: "🌙", dawn: "🌅", day: "☀️", dusk: "🌇" } as const;

export default function Game() {
  const [me, setMe] = useState<Me | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [simPos, setSimPos] = useState<LatLng | null>(null);
  const [simMode, setSimMode] = useState(false);
  const geo = useLocation(simPos);
  const pos = geo.pos;
  const [follow, setFollow] = useState(true);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [mini, setMini] = useState<{ kind: "chest" | "arcade"; spawnId: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [picker, setPicker] = useState<{ label: string; cb: (p: LatLng) => void } | null>(null);
  const [chat, setChat] = useState<{ room: string; label: string } | null>(null);
  const [unread, setUnread] = useState(0);
  const [announce, setAnnounce] = useState<{ id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [match, setMatch] = useState<string | null>(null);
  const [meTab, setMeTab] = useState<"stats" | "life">("stats");
  const lastWorldFetch = useRef<{ at: number; pos: LatLng } | null>(null);

  // ---- data loading
  const loadMe = useCallback(() => api<Me>("/api/me").then(setMe).catch(() => {}), []);
  const loadWorld = useCallback(async (force = false) => {
    if (!pos) return;
    const last = lastWorldFetch.current;
    if (!force && last && Date.now() - last.at < 30_000 && distanceM(last.pos, pos) < 80) return;
    lastWorldFetch.current = { at: Date.now(), pos };
    try {
      setWorld(await api<World>(`/api/world?lat=${pos.lat}&lng=${pos.lng}`));
    } catch {}
  }, [pos]);

  const toast = useCallback((t: Toast) => {
    const id = Math.random();
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === "error" ? 4000 : 3200);
  }, []);

  const refresh = useCallback(() => {
    loadMe();
    // small delay lets the server's position heartbeat land first
    setTimeout(() => loadWorld(true), 150);
  }, [loadMe, loadWorld]);

  const flush = geo.flush;
  const act = useCallback<GameCtx["act"]>(
    async (fn) => {
      try {
        await flush();
        const r = await fn();
        if (r?.message) toast({ kind: "reward", title: r.message });
        navigator.vibrate?.([40, 30, 40]);
        refresh();
        return true;
      } catch (e) {
        toast({ kind: "error", title: (e as Error).message });
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
    loadWorld();
    const t = setInterval(() => loadWorld(true), 45_000);
    return () => clearInterval(t);
  }, [loadWorld]);

  // ---- "realtime" via polling (works on serverless hosts like Vercel)
  const syncSince = useRef(Date.now());
  const panelRef = useRef(panel);
  panelRef.current = panel;
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await api<{ now: number; unread: number; notifications: Toast[] }>(`/api/sync?since=${syncSince.current}`);
        if (stop) return;
        syncSince.current = r.now;
        for (const n of r.notifications) toast(n);
        if (r.notifications.some((n) => n.kind === "reward" || n.kind === "delivery" || n.kind === "social")) loadMe();
        if (r.unread && panelRef.current !== "crew") setUnread((u) => u + r.unread);
      } catch {}
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

  // ---- map interactions
  const onMapClick = (p: LatLng) => {
    if (picker) {
      picker.cb(p);
      setPicker(null);
      return;
    }
    if (simMode) setSimPos(p);
  };

  const toggleSim = () => {
    if (simMode) {
      setSimMode(false);
      setSimPos(null);
      toast({ title: "GPS simulator off", body: "Using your real location" });
    } else {
      setSimMode(true);
      setSimPos(pos ?? { lat: 51.5079, lng: -0.0877 });
      toast({ title: "GPS simulator on", body: "Tap the map to teleport" });
    }
  };

  const claim = (spawnId: string, score?: number) => act(() => api("/api/claim", { body: { spawnId, score } })).then((ok) => ok && setSelected(null));

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
        enterMatch: (id) => {
          setSelected(null);
          setPanel(null);
          setMatch(id);
        },
      },
    [me, pos, world, toast, act, refresh],
  );

  if (!me || !ctx) return <div className="game" style={{ display: "grid", placeItems: "center" }}><div className="big-num">LOADING…</div></div>;

  const run = me.activeRun;
  const runLeft = run ? Math.max(0, Math.round((new Date(run.deadline).getTime() - now) / 1000)) : 0;
  const atRunTarget = run && pos ? distanceM(pos, { lat: run.targetLat, lng: run.targetLng }) <= INTERACT_RADIUS_M : false;
  const close = () => setPanel(null);
  const peek = !!picker;

  return (
    <Ctx.Provider value={ctx}>
      <div className="game">
        <GameMap
          pos={pos}
          world={world}
          me={me}
          follow={follow}
          picking={!!picker}
          onUnfollow={() => setFollow(false)}
          onMapClick={onMapClick}
          onSelect={(s) => {
            setSelected(s);
            setPanel(null);
          }}
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
          <div className="hud-right">
            <div className="chip">🪙 {me.coins.toLocaleString()}</div>
            {world && (
              <div className="chip phase">
                {PHASE_ICON[world.phase]} {world.phase.toUpperCase()}
                {(world.phase === "dawn" || world.phase === "dusk") && <span style={{ color: "var(--yellow)" }}>2× XP</span>}
              </div>
            )}
            {geo.simulated && <div className="chip small" style={{ color: "var(--yellow)" }}>🕹️ SIM GPS</div>}
          </div>
        </div>

        {announce && !run && !picker && (
          <div className="announce" style={{ position: "absolute", top: 76, left: 10, right: 10, zIndex: 450, background: "var(--panel)", maxWidth: 560, margin: "0 auto" }}>
            <b className="grow small">📣 {announce.title}</b>
            {announce.ctaUrl && (
              <a className="btn yellow small" href={announce.ctaUrl}>
                {announce.ctaLabel ?? "Go"}
              </a>
            )}
            <button className="close" onClick={() => setAnnounce(null)}>✕</button>
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
            {runLeft === 0 ? (
              <button className="btn ghost small" onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                Failed
              </button>
            ) : (
              <button className="btn green small" disabled={!atRunTarget} onClick={() => act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } }))}>
                Finish
              </button>
            )}
            <button className="close" title="Abandon" onClick={() => confirm("Abandon this run?") && act(() => api("/api/runs", { body: { runId: run.id, action: "abandon" } }))}>
              ✕
            </button>
          </div>
        )}

        {picker && (
          <div className="pick-banner">
            {picker.label}
            <button className="close" onClick={() => setPicker(null)}>✕</button>
          </div>
        )}

        {!pos && <LocationGate error={geo.error} onRetry={geo.retry} onSimulate={me.canSimulate ? toggleSim : undefined} />}

        {/* Floating buttons */}
        <div className="fab-col">
          {me.canSimulate && (
            <button className="fab" title="GPS simulator (dev/admin)" onClick={toggleSim} style={{ outline: simMode ? "2px solid var(--yellow)" : undefined }}>
              🕹️
            </button>
          )}
          {me.dailyAvailable && (
            <button className="fab" title="Daily reward" onClick={() => act(() => api("/api/daily", { body: {} }))}>
              🎁<span className="badge">!</span>
            </button>
          )}
          <button className="fab" title="Re-center" onClick={() => setFollow(true)} style={{ color: follow ? "var(--cyan)" : undefined }}>
            ◎
          </button>
        </div>

        {/* Toasts */}
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind ?? ""}`}>
              <b>{t.title}</b>
              {t.body && <span className="small muted">{t.body}</span>}
            </div>
          ))}
        </div>

        {/* Selected object card */}
        {selected && !panel && <InfoCard sel={selected} onClose={() => setSelected(null)} onClaim={claim} onMini={setMini} />}

        {panel === "nearby" && <NearbyPanel onClose={close} peek={peek} />}
        {panel === "base" && <BasePanel onClose={close} peek={peek} />}
        {panel === "jobs" && <JobsPanel onClose={close} peek={peek} />}
        {panel === "crew" && <CrewPanel onClose={close} peek={peek} chat={chat} setChat={setChat} />}
        {panel === "events" && <EventsPanel onClose={close} peek={peek} />}
        {panel === "me" && (
          <ProfilePanel
            key={meTab}
            initialTab={meTab}
            onClose={() => {
              close();
              setMeTab("stats");
            }}
            peek={peek}
          />
        )}

        {!panel && !selected && (
          <nav className="nav">
            {NAV.map(([id, ic, label]) => (
              <button key={id} onClick={() => setPanel(id)} className={id === "base" && !me.base ? "pulse" : ""}>
                <span className="ic">{ic}</span>
                {label}
                {id === "crew" && unread + me.pendingFriends > 0 && <span className="badge">{unread + me.pendingFriends}</span>}
                {id === "me" && (me.dailyAvailable || me.mood.score < 30) && <span className="badge">!</span>}
              </button>
            ))}
          </nav>
        )}

        {match && (
          <Fps
            matchId={match}
            onExit={() => {
              setMatch(null);
              refresh();
            }}
          />
        )}

        {mini && (
          <div className="modal-bg">
            <div className="modal">
              {mini.kind === "chest" ? (
                <Lockpick
                  onDone={(score) => {
                    setMini(null);
                    if (score === 0) toast({ kind: "error", title: "The lock held!", body: "Try again — the chest is still there." });
                    else claim(mini.spawnId, score);
                  }}
                />
              ) : (
                <TapRush
                  onDone={(score) => {
                    setMini(null);
                    claim(mini.spawnId, score);
                  }}
                />
              )}
              <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setMini(null)}>
                Walk away
              </button>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- "where are you?" screen
const GEO_HELP: Record<GeoError, { title: string; body: React.ReactNode }> = {
  insecure: {
    title: "Location needs a secure link",
    body: (
      <>
        Phones only share GPS with <b>https://</b> sites (or <b>localhost</b>). You opened <span className="mono">{typeof location !== "undefined" ? location.origin : ""}</span>.
        Open the game through its https link instead.
      </>
    ),
  },
  unsupported: { title: "No location on this device", body: "This browser can't share a location. Try Chrome or Safari on your phone." },
  denied: {
    title: "Location is blocked",
    body: (
      <>
        Allow location for this site, then tap Retry.
        <br />
        <b>iPhone:</b> Settings → Privacy → Location Services → Safari Websites → While Using.
        <br />
        <b>Android/Chrome:</b> tap the 🔒 next to the address → Permissions → Location → Allow.
        <br />
        <b>Mac:</b> System Settings → Privacy &amp; Security → Location Services → turn on your browser.
      </>
    ),
  },
  unavailable: {
    title: "Can't get a GPS fix",
    body: "Your device couldn't find its position. Turn on Location/GPS (and Wi-Fi helps), step near a window, then retry. On a Mac, check that Location Services is on for your browser.",
  },
  timeout: { title: "GPS is taking a while", body: "Still searching for satellites. Moving outdoors or near a window usually helps." },
};

function LocationGate({ error, onRetry, onSimulate }: { error: GeoError | null; onRetry: () => void; onSimulate?: () => void }) {
  const help = error ? GEO_HELP[error] : null;
  return (
    <div className="modal-bg" style={{ zIndex: 900 }}>
      <div className="modal">
        <div style={{ fontSize: 50 }}>{help ? "⚠️" : "📡"}</div>
        <h2>{help?.title ?? "Finding you…"}</h2>
        <p className="muted small" style={{ lineHeight: 1.6, textAlign: help && error === "denied" ? "left" : "center" }}>
          {help?.body ?? "Allow location access when your browser asks — the city around you becomes the game map."}
        </p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {error && error !== "insecure" && error !== "unsupported" && (
            <button className="btn cyan" onClick={onRetry}>
              Retry
            </button>
          )}
          {onSimulate && (
            <button className="btn yellow" onClick={onSimulate}>
              Play without GPS
            </button>
          )}
        </div>
        {onSimulate && <p className="small muted" style={{ marginTop: 10 }}>Simulator: tap the map to move (dev &amp; admins only).</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tap-on-map detail card
function InfoCard({
  sel,
  onClose,
  onClaim,
  onMini,
}: {
  sel: Selected;
  onClose: () => void;
  onClaim: (spawnId: string, score?: number) => void;
  onMini: (m: { kind: "chest" | "arcade"; spawnId: string }) => void;
}) {
  const { pos, act, me, world, openChat, setPanel, enterMatch } = useGame();
  const target = sel.type === "delivery" ? { lat: sel.data.pickupLat, lng: sel.data.pickupLng } : sel.data;
  const dist = pos ? distanceM(pos, target) : Infinity;
  const inRange = dist <= INTERACT_RADIUS_M;
  const tooFar = <button className="btn block" disabled>Get closer · {formatDistance(dist)}</button>;
  const startMatch = async (kind: "breach" | "raid", targetId: string) => {
    let id = "";
    const ok = await act(async () => {
      id = (await api<{ matchId: string }>("/api/match", { body: { kind, targetId } })).matchId;
      return {};
    });
    if (ok && id) enterMatch(id);
  };
  const fromBase = me.base ? distanceM(me.base, target) : Infinity;

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
          ? `Pick the lock to grab what's inside (maybe ${s.item!.emoji}). Flawless pick = double loot.`
          : s.kind === "arcade"
            ? "15 seconds of Tap Rush. More hits, more coins."
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
          <button className="btn block" disabled>Already collected</button>
        ) : !inRange ? (
          tooFar
        ) : s.kind === "derrick" ? (
          <button className="btn yellow block" disabled={!me.faction} onClick={() => act(() => api("/api/battle", { body: { kind: "derrick", targetId: s.id } })).then((ok) => ok && onClose())}>
            {me.faction ? "🎖️ Attack with your army" : "Join a faction first (Base tab)"}
          </button>
        ) : s.kind === "chest" || s.kind === "arcade" ? (
          <button className="btn yellow block" onClick={() => onMini({ kind: s.kind as "chest" | "arcade", spawnId: s.id })}>
            {s.kind === "chest" ? "🔓 Crack it" : "▶ Play"}
          </button>
        ) : s.kind === "run" ? (
          <button className="btn block" disabled={!!me.activeRun} onClick={() => onClaim(s.id)}>
            {me.activeRun ? "Finish your current run first" : "🏁 Start run"}
          </button>
        ) : (
          <button className="btn green block" onClick={() => onClaim(s.id)}>Collect</button>
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
        {m.claimed ? <button className="btn block" disabled>Completed</button> : inRange ? <button className="btn yellow block" onClick={() => onClaim(`m:${m.id}`)}>Complete mission</button> : tooFar}
      </Sheet>
    );
  }

  if (sel.type === "note") {
    const n = sel.data;
    return (
      <Sheet title="Message at this spot" onClose={onClose}>
        <div className="small muted">
          {n.author.avatar} {n.author.username} · {fmtTime(n.createdAt)}
        </div>
        <p style={{ fontSize: 18 }}>{n.unlocked ? n.body : <i className="muted">🔒 Walk within {n.radiusM} m to read this message ({formatDistance(dist)} away)</i>}</p>
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
          <button className="btn" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "join" } }))}>Join</button>
          <button className="btn green" onClick={() => act(() => api(`/api/events/${e.id}`, { body: { action: "checkin" } }))}>Check in</button>
          <button className="btn cyan" onClick={() => openChat(`event:${e.id}`, e.title)}>Chat</button>
          <button className="btn ghost" onClick={() => setPanel("events")}>All events</button>
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
        <button className="btn green block" onClick={() => act(() => api(`/api/deliveries/${d.id}`, { body: { action: "accept" } })).then((ok) => ok && onClose())}>
          Accept job
        </button>
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
            {b.mine && <button className="btn cyan" onClick={() => setPanel("base")}>Open base</button>}
            {b.liveMatch && <button className="btn" onClick={() => startMatch("breach", b.id)}>🛡️ Defend it (FPS)</button>}
            {!b.mine && !b.liveMatch && <p className="small muted">Your crew&apos;s base. If it&apos;s breached while you&apos;re close, you can jump in to defend.</p>}
          </div>
        ) : (
          <>
            <div className="row wrap">
              <button
                className="btn yellow"
                disabled={!me.base || fromBase > SIEGE_RANGE_M || b.shielded}
                onClick={() => confirm(`Send your whole army to siege ${b.name}?`) && act(() => api("/api/battle", { body: { kind: "siege", targetId: b.id } }))}
              >
                🎖️ Siege with army
              </button>
              {b.liveMatch ? (
                <button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("breach", b.id)}>⚔️ Join the firefight</button>
              ) : (
                <button className="btn" disabled={!breachable} onClick={() => startMatch("breach", b.id)}>⚔️ Breach (FPS)</button>
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
          <button className="btn" disabled={dist > BREACH_RANGE_M} onClick={() => startMatch("raid", b.id)}>
            ⚔️ {b.liveMatch ? "Join the raid" : "Raid (FPS)"}
          </button>
          <button className="btn yellow" disabled={!me.base || fromBase > SIEGE_RANGE_M} onClick={() => act(() => api("/api/battle", { body: { kind: "bombard", targetId: b.id } }))}>
            💥 Bombard with army
          </button>
        </div>
        <p className="small muted">Everyone who damages it shares the loot when it falls; top damage gets a 👑. {dist > BREACH_RANGE_M && `Walk within ${BREACH_RANGE_M} m to fight it in first person.`}</p>
      </Sheet>
    );
  }

  const p = sel.data;
  return (
    <Sheet title={`${p.avatar} ${p.username}`} onClose={onClose}>
      <p className="muted">Level {p.level} · {p.friend ? "In your crew" : "~ approximate location"}</p>
      {p.friend ? (
        <button className="btn cyan block" onClick={() => openChat(`dm:${[me.id, p.id].sort().join(":")}`, p.username)}>💬 Message</button>
      ) : (
        <button className="btn block" onClick={() => act(() => api("/api/friends", { body: { action: "request", username: p.username } }))}>➕ Add to crew</button>
      )}
    </Sheet>
  );
}

