"use client";
// The "Play" hub (story missions, GPS mini-games, goals), the gem store with
// rewarded sponsor spots, the live GPS-game banner on the map, turn-by-turn
// directions hand-off, and the reward celebrations.
import { useCallback, useEffect, useRef, useState } from "react";
import { bearingTo, distanceM, formatDistance } from "@/lib/geo";
import { FACTION_BY_KEY, type FactionKey } from "@/lib/rts";
import { askConfirm } from "@/components/Dialogs";
import { api, type GpsView, type LatLng } from "./client";
import { sfx } from "./sfx";
import { duckMusic } from "./music";
import { AutoVideo } from "@/components/AutoVideo";
import { MoveIcon, Sheet, Tabs, useGame, type Toast } from "./ui";
import { Button } from "@/components/Button";

// ---------------------------------------------------------------- celebrations
type Celebration = { title: string; body?: string; emoji?: string };
export const celebrate = (c: Celebration) => window.dispatchEvent(new CustomEvent("sq:celebrate", { detail: c }));
/** Coins/gems flying up to the HUD after a reward. */
export const burst = (emoji: string, n = 10) => window.dispatchEvent(new CustomEvent("sq:burst", { detail: { emoji, n } }));

export function CelebrationLayer() {
  const [show, setShow] = useState<(Celebration & { id: number }) | null>(null);
  const [parts, setParts] = useState<{ id: number; emoji: string; x: number; d: number }[]>([]);
  useEffect(() => {
    const onCel = (e: Event) => {
      const c = (e as CustomEvent<Celebration>).detail;
      const id = Date.now();
      setShow({ ...c, id });
      sfx("levelup");
      navigator.vibrate?.([60, 40, 60, 40, 120]);
      setTimeout(() => setShow((s) => (s?.id === id ? null : s)), 3200);
    };
    const onBurst = (e: Event) => {
      const { emoji, n } = (e as CustomEvent<{ emoji: string; n: number }>).detail;
      const batch = Array.from({ length: n }, (_, i) => ({ id: Math.random(), emoji, x: (Math.random() - 0.5) * 160, d: i * 45 }));
      setParts((p) => [...p, ...batch]);
      setTimeout(() => setParts((p) => p.filter((x) => !batch.includes(x))), 1600);
    };
    window.addEventListener("sq:celebrate", onCel);
    window.addEventListener("sq:burst", onBurst);
    return () => {
      window.removeEventListener("sq:celebrate", onCel);
      window.removeEventListener("sq:burst", onBurst);
    };
  }, []);
  return (
    <>
      {parts.map((p) => (
        <span key={p.id} className="fly" style={{ ["--x" as string]: `${p.x}px`, animationDelay: `${p.d}ms` }}>{p.emoji}</span>
      ))}
      {show && (
        <div className="celebrate" onClick={() => setShow(null)}>
          <div className="rays" />
          <div className="cel-card">
            <div className="cel-emoji">{show.emoji ?? "🏆"}</div>
            <div className="cel-title">{show.title}</div>
            {show.body && <div className="cel-body">{show.body}</div>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- directions (car / walking hand-off)
const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent);
export function Directions({ to, label = "🧭 Directions", className = "btn cyan" }: { to: LatLng; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { lat, lng } = to;
  const links: [string, string][] = [
    ["🚗 Google Maps · drive", `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`],
    ["🚶 Google Maps · walk", `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`],
    ...(isApple() ? ([["🍎 Apple Maps", `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`]] as [string, string][]) : []),
    ["🟦 Waze", `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`],
  ];
  return (
    <span className="dir-wrap">
      <Button className={className} onClick={() => setOpen(!open)}>{label}</Button>
      {open && (
        <span className="dir-menu" onClick={() => setOpen(false)}>
          {links.map(([l, href]) => (
            <a key={l} href={href} target="_blank" rel="noreferrer">{l}</a>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- live GPS game
/** Polls the active GPS game and asks the server to check progress every few seconds. */
export function useGpsGame(activeId: string | null, onChange: () => void, toast: (t: Toast) => void) {
  const [view, setView] = useState<GpsView | null>(null);
  const lastHeat = useRef<number | null>(null);
  const load = useCallback(() => api<{ active: GpsView | null; lost: { kind: string } | null }>("/api/gpsgame").then((r) => {
    setView(r.active);
    if (r.lost) {
      toast({ kind: "error", title: "⏰ Time's up!", body: "The GPS game ran out of time — try again from 🎮 Play" });
      onChange();
    }
    return r.active;
  }), [toast, onChange]);

  useEffect(() => {
    if (!activeId) {
      setView(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const r = await api<{ won: boolean; message?: string; outro?: string }>("/api/gpsgame", { body: { action: "check" } });
        if (r.message) toast({ kind: r.won ? "reward" : "info", title: r.message });
        if (r.won) {
          sfx("levelup");
          celebrate({ title: "VICTORY!", body: r.outro ?? r.message, emoji: "🏆" });
          burst("🪙", 12);
          burst("💎", 5);
          setView(null);
          onChange();
          return;
        }
        if (r.message) sfx("reward");
        const v = await load();
        // Hot/cold detector: buzz harder as you get closer.
        const lvl = v?.heat?.level ?? null;
        if (lvl != null && lvl !== lastHeat.current) {
          if (lastHeat.current != null) sfx(lvl > lastHeat.current ? "beep" : "tap");
          navigator.vibrate?.(Array.from({ length: lvl }, () => 60).flatMap((x) => [x, 60]));
          lastHeat.current = lvl;
        }
      } catch {
        load().catch(() => {});
      }
    };
    load().catch(() => {});
    const t = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { view, reload: load };
}

export function GpsBanner({ g, now, onQuit, onReroute }: { g: GpsView; now: number; onQuit: () => void; onReroute: () => void }) {
  const { pos, teleport } = useGame();
  const left = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
  const target = g.points && g.next != null ? g.points[g.next] : g.target ?? null;
  const dist = target && pos ? distanceM(pos, target) : null;
  // Where to head: the waypoint, the search area, or back into the hold zone.
  const aim = target ?? g.area?.center ?? (g.hold && !g.hold.inside ? g.center : null) ?? null;
  const aimDist = aim && pos ? distanceM(pos, aim) : null;
  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const brg = aim && pos ? bearingTo(pos, aim) : 0;
  const holdLeft = g.hold?.since ? Math.max(0, g.hold.seconds - Math.floor((now - g.hold.since) / 1000)) : g.hold?.seconds;
  return (
    <div className="gps-banner">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <div className="small muted">{g.kind === "story" ? `STORY · step ${(g.step ?? 0) + 1}/${g.steps}` : "GPS GAME"}</div>
          <b style={{ fontFamily: "var(--display)" }}>{g.title}</b>
        </div>
        <div className={`t ${left < 60 ? "low" : ""}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
        <Button className="gb-x" aria-label="Quit game" title="Quit" onClick={() => askConfirm("Quit this game? You won't get the reward.", { ok: "Quit", danger: true }).then((ok) => ok && onQuit())}>✕</Button>
      </div>
      {g.kind === "story" && g.steps && (
        <div className="step-pills">{Array.from({ length: g.steps }, (_, i) => <i key={i} className={i < (g.step ?? 0) ? "done" : i === g.step ? "on" : ""} />)}</div>
      )}
      {g.text && <div className="step-text">{g.stepKind === "find" ? "🔍 " : g.stepKind === "hold" ? "🛡️ " : "📍 "}{g.text}</div>}
      {aim && aimDist != null && aimDist > 15 && (
        <div className="aim">
          <span className="dir-arrow" style={{ transform: `rotate(${brg - 90}deg)` }}>➤</span>
          <b>{formatDistance(aimDist)}</b>
          <span className="small muted">{COMPASS[Math.round(brg / 45) % 8]} · {g.area ? "to the search area" : g.hold ? "back to the zone" : "to the gold beacon"}</span>
        </div>
      )}
      {g.heat && (
        <div className="heat">
          <div className="heat-bars">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= g.heat!.level ? `on l${g.heat!.level}` : ""} />)}</div>
          <b>{g.heat.emoji} {g.heat.label}</b>
          <span className="small muted">~{formatDistance(g.heat.approx)}</span>
          {g.heat.trend !== 0 && <span className={`trend ${g.heat.trend > 0 ? "up" : "down"}`}>{g.heat.trend > 0 ? "▲ warmer" : "▼ colder"}</span>}
        </div>
      )}
      {g.kind === "sprint" && (
        <>
          <div className="meter big"><i style={{ width: `${Math.min(100, ((g.progress ?? 0) / (g.goal ?? 1)) * 100)}%` }} /></div>
          <div className="small">{g.progress ?? 0} / {g.goal} m on foot <span className="muted">(driving doesn&apos;t count)</span></div>
        </>
      )}
      {g.kind === "rally" && g.points && <div className="small">Checkpoint <b>{(g.next ?? 0) + 1}/{g.points.length}</b>{dist != null && ` · ${formatDistance(dist)}`}</div>}
      {g.hold && (
        <div className="small">
          {g.hold.inside ? <span style={{ color: "var(--green)" }}>✅ In the zone — hold {holdLeft}s</span> : <span style={{ color: "var(--red)" }}>⚠️ Get back inside the circle</span>}
          <div className="meter"><i style={{ width: `${g.hold.since ? Math.min(100, ((now - g.hold.since) / 1000 / g.hold.seconds) * 100) : 0}%`, background: "var(--green)" }} /></div>
        </div>
      )}

      <div className="row" style={{ marginTop: 4 }}>
        {aim && aimDist != null && aimDist > 15 && (teleport ? <Button className="btn yellow small" onClick={() => teleport(aim)}><MoveIcon /> Go</Button> : <Directions to={aim} label="🧭 Route" className="btn cyan small" />)}
        {(g.reroutes ?? 0) > 0 && g.kind !== "sprint" && g.stepKind !== "hold" && <Button className="btn ghost small" onClick={onReroute} title="Waypoint unreachable? Get a new one">🔀 New spot ({g.reroutes})</Button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Play hub
type PlayData = {
  active: GpsView | null;
  games: { kind: "hunt" | "sprint" | "rally"; name: string; emoji: string; blurb: string; reward: { xp: number; coins: number }; gems: number; minutes: number; detail: string }[];
  story: { enabled: boolean; chapter: number; replay: boolean; total: number; completed: number; chapters: { title: string; emoji: string; intro: string; steps: number; minutes: number; reward: { xp: number; coins: number; gems: number; gear?: string }; done: boolean }[] };
  walkedM: number;
};
type Goal = { key: string; title: string; emoji: string; metric: string; target: number; value: number; mine: number; done: boolean; claimKey: string | null; claimed: boolean; rewardText: string };
type GoalsData = {
  enabled: boolean;
  endsAt: number;
  world: Goal | null;
  worldTop: { name: string; avatar: string; value: number; me: boolean }[];
  faction: Goal | null;
  factionRace: { faction: string; value: number }[];
  personal: { key: string; title: string; emoji: string; metric: string; value: number; next: number; ready: number; tiers: { target: number; done: boolean; claimed: boolean; reward: string }[] }[];
};

const METRIC_UNIT: Record<string, (n: number) => string> = { walk_m: (n) => `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} km` };
const fmtMetric = (m: string, n: number) => (METRIC_UNIT[m] ?? ((x: number) => x.toLocaleString()))(n);
const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
};

export function PlayPanel({ onClose, peek, onStarted }: { onClose: () => void; peek: boolean; onStarted: () => void }) {
  const { act, setPanel, me } = useGame();
  const [tab, setTab] = useState<"story" | "games" | "goals">(me.goalsReady ? "goals" : "story");
  const [d, setD] = useState<PlayData | null>(null);
  const [goals, setGoals] = useState<GoalsData | null>(null);
  const load = useCallback(() => {
    api<PlayData>("/api/gpsgame").then(setD).catch(() => {});
    api<GoalsData>("/api/goals").then(setGoals).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const start = (kind: string, intro?: string) =>
    act(() => api<{ message: string; intro?: string }>("/api/gpsgame", { body: { action: "start", kind } })).then((ok) => {
      if (!ok) return;
      if (intro) celebrate({ title: kind === "story" ? "NEW CHAPTER" : "GAME ON!", body: intro, emoji: kind === "story" ? "📖" : "🎮" });
      onStarted();
      onClose();
    });
  const claim = (key: string) =>
    act(() => api("/api/goals", { body: { key } })).then((ok) => {
      if (ok) {
        burst("💎", 6);
        burst("🪙", 10);
        load();
      }
    });

  return (
    <Sheet title="🎮 Play" onClose={onClose} peek={peek} help="play">
      <Tabs value={tab} onChange={setTab} tabs={[["story", "📖 Story"], ["games", "🧭 GPS games"], ["goals", `🏆 Goals${me.goalsReady ? ` (${me.goalsReady})` : ""}`]]} />
      {d?.active && (
        <div className="card hl small">▶️ <b>{d.active.title}</b> is running — see the banner on the map.</div>
      )}

      {tab === "story" && d && (
        <>
          {!d.story.enabled && <div className="empty">Story missions are switched off right now.</div>}
          {d.story.enabled && (
            <>
              <div className="story-head">
                <div className="small muted">CHAPTER {d.story.chapter + 1} OF {d.story.total}{d.story.replay ? " · REPLAY (half rewards)" : ""}</div>
                <div className="meter"><i style={{ width: `${(d.story.completed / d.story.total) * 100}%` }} /></div>
              </div>
              {(() => {
                const c = d.story.chapters[d.story.chapter];
                return (
                  <div className="story-card">
                    <div className="story-emoji">{c.emoji}</div>
                    <h3>{c.title}</h3>
                    <p className="lore">{c.intro}</p>
                    <div className="small muted">{c.steps} steps · about {c.minutes} min · walk it, the waypoints appear around you</div>
                    <div className="reward-row">
                      <span>✨ {c.reward.xp} XP</span>
                      <span>🪙 {c.reward.coins}</span>
                      <span>💎 {c.reward.gems}</span>
                      {c.reward.gear && !d.story.replay && <span>🎁 {c.reward.gear} gear</span>}
                    </div>
                    <Button className="btn yellow block big-btn" disabled={!!d.active} onClick={() => start("story", c.intro)}>▶ Start chapter</Button>
                  </div>
                );
              })()}
              <label>Chapters</label>
              <div className="chapters">
                {d.story.chapters.map((c, i) => (
                  <div key={c.title} className={`chapter ${c.done ? "done" : i === d.story.chapter ? "now" : "locked"}`}>
                    <span>{c.done ? "✅" : i === d.story.chapter ? c.emoji : "🔒"}</span>
                    <span className="small">{i + 1}. {i <= d.story.chapter || c.done ? c.title : "???"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "games" && d && (
        <>
          <p className="small muted">Real-world mini-games around wherever you are. You&apos;ve walked <b>{(d.walkedM / 1000).toFixed(1)} km</b> so far.</p>
          {d.games.map((g) => (
            <div key={g.kind} className="game-tile">
              <div className="gt-icon">{g.emoji}</div>
              <div className="grow">
                <b>{g.name}</b>
                <div className="small muted">{g.blurb}</div>
                <div className="small">⏱ {g.minutes} min · {g.detail} · <span style={{ color: "var(--yellow)" }}>+{g.reward.xp} XP · +{g.reward.coins} 🪙{g.gems ? ` · +${g.gems} 💎` : ""}</span></div>
              </div>
              <Button className="btn yellow" disabled={!!d.active || (g.kind === "sprint" && me.remotePlay)} title={g.kind === "sprint" && me.remotePlay ? "Sprints need real walking" : undefined} onClick={() => start(g.kind, g.blurb)}>Play</Button>
            </div>
          ))}
          <div className="game-tile" onClick={() => setPanel("events")} style={{ cursor: "pointer" }}>
            <div className="gt-icon">🎉</div>
            <div className="grow"><b>Events near you</b><div className="small muted">Meet-ups, check-ins and sponsored drops on the map.</div></div>
            <span className="btn ghost small">Open</span>
          </div>
        </>
      )}

      {tab === "goals" && goals && (
        <>
          {!goals.enabled && <div className="empty">Goals are switched off right now.</div>}
          {goals.enabled && goals.world && (
            <GoalCard kind="🌍 WORLD OPERATION" g={goals.world} endsAt={goals.endsAt} onClaim={claim}>
              {goals.worldTop.length > 0 && (
                <div className="top-list">
                  {goals.worldTop.map((t, i) => (
                    <div key={i} className={t.me ? "me" : ""}>
                      <span>{["🥇", "🥈", "🥉", "4", "5"][i]}</span> {t.avatar} {t.name} <b>{fmtMetric(goals.world!.metric, t.value)}</b>
                    </div>
                  ))}
                </div>
              )}
            </GoalCard>
          )}
          {goals.enabled && goals.faction && (
            <GoalCard kind={`${me.faction ? FACTION_BY_KEY[me.faction as FactionKey]?.emoji : "🚩"} FACTION GOAL`} g={goals.faction} endsAt={goals.endsAt} onClaim={claim}>
              <div className="top-list">
                {goals.factionRace.map((r) => {
                  const f = FACTION_BY_KEY[r.faction as FactionKey];
                  return (
                    <div key={r.faction} className={r.faction === me.faction ? "me" : ""}>
                      {f?.emoji} <span style={{ color: f?.color }}>{f?.name ?? r.faction}</span> <b>{fmtMetric(goals.faction!.metric, r.value)}</b>
                    </div>
                  );
                })}
              </div>
            </GoalCard>
          )}
          {goals.enabled && !goals.faction && <div className="card small muted">🚩 Join a faction (Base tab) to unlock weekly faction goals.</div>}
          {goals.enabled && (
            <>
              <label>🎯 Personal milestones</label>
              {goals.personal.map((p) => {
                const next = p.tiers[p.next];
                const prev = p.next > 0 ? p.tiers[p.next - 1].target : 0;
                const ready = p.tiers.map((t, i) => ({ t, i })).filter(({ t }) => t.done && !t.claimed);
                return (
                  <div key={p.key} className={`milestone ${ready.length ? "hl" : ""}`}>
                    <div className="ms-ic">{p.emoji}</div>
                    <div className="grow">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <b>{p.title}</b>
                        <span className="pips">{p.tiers.map((t, i) => <i key={i} className={t.claimed ? "c" : t.done ? "d" : ""} />)}</span>
                      </div>
                      <div className="meter"><i style={{ width: `${next ? Math.min(100, ((p.value - prev) / (next.target - prev)) * 100) : 100}%` }} /></div>
                      <div className="small muted">{fmtMetric(p.metric, p.value)}{next ? ` / ${fmtMetric(p.metric, next.target)} · next: ${next.reward}` : " · all tiers reached!"}</div>
                    </div>
                    {ready.length > 0 && <Button className="btn yellow small" onClick={() => claim(`p:${p.key}:${ready[0].i}`)}>Claim</Button>}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
      {!d && <div className="empty">Loading…</div>}
    </Sheet>
  );
}

function GoalCard({ kind, g, endsAt, onClaim, children }: { kind: string; g: Goal; endsAt: number; onClaim: (k: string) => void; children?: React.ReactNode }) {
  const pct = Math.min(100, (g.value / g.target) * 100);
  return (
    <div className={`goal-card ${g.done ? "done" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small" style={{ color: "var(--yellow)", fontWeight: 800 }}>{kind}</span>
        <span className="small muted">ends in {fmtLeft(endsAt - Date.now())}</span>
      </div>
      <div className="goal-title">{g.emoji} {g.title}</div>
      <div className="meter big"><i style={{ width: `${pct}%` }} /><span>{Math.floor(pct)}%</span></div>
      <div className="small">{fmtMetric(g.metric, g.value)} / {fmtMetric(g.metric, g.target)} · your part: <b>{fmtMetric(g.metric, g.mine)}</b></div>
      <div className="small muted">Reward for everyone who helps: {g.rewardText}</div>
      {children}
      {g.done && g.claimKey && (g.claimed ? <Button className="btn block" disabled>✓ Claimed</Button> : g.mine > 0 ? <Button className="btn yellow block" onClick={() => onClaim(g.claimKey!)}>🎁 Claim reward</Button> : <p className="small muted">Contribute this week to share the reward.</p>)}
    </div>
  );
}

// ---------------------------------------------------------------- Store
type StoreData = {
  enabled: boolean;
  payments: boolean;
  currency: string;
  packs: { key: string; gems: number; priceCents: number; label: string; bonus?: string }[];
  offers: { key: string; gems: number; coins: number; label: string }[];
  boosts: { heal: number; refresh: number; shield: number };
  gems: number;
  ads: { enabled: boolean; left: number; seconds: number; gems: number; coins: number };
};

const money = (cents: number, cur: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`;
  }
};

export function StorePanel({ onClose, peek, onWatch }: { onClose: () => void; peek: boolean; onWatch: () => void }) {
  const { act, me, toast } = useGame();
  const [d, setD] = useState<StoreData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<StoreData>("/api/store").then(setD).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, me.gems]);

  const buy = async (pack: string) => {
    setBusy(pack);
    try {
      const r = await api<{ url: string }>("/api/store", { body: { action: "checkout", pack } });
      location.href = r.url;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      setBusy(null);
    }
  };
  const spend = (body: object) =>
    act(() => api("/api/store", { body })).then((ok) => {
      if (ok) load();
    });

  return (
    <Sheet title="💎 Store" onClose={onClose} peek={peek} help="store">
      <div className="gem-hero">
        <span className="gem-big">💎</span>
        <div>
          <b className="mono" style={{ fontSize: 26 }}>{me.gems.toLocaleString()}</b>
          <div className="small muted">gems · rush timers, buy coins, heal, shield your base</div>
        </div>
      </div>
      {!d && <div className="empty">Loading…</div>}
      {d && (
        <>
          {d.ads.enabled && (
            <div className="free-card">
              <div className="gt-icon">📺</div>
              <div className="grow">
                <b>Free gems</b>
                <div className="small muted">Watch a {d.ads.seconds}s sponsor spot: +{d.ads.gems} 💎{d.ads.coins ? ` +${d.ads.coins} 🪙` : ""} · {d.ads.left} left today</div>
              </div>
              <Button className="btn green" disabled={d.ads.left <= 0} onClick={onWatch}>▶ Watch</Button>
            </div>
          )}

          {d.enabled && (
            <>
              <label>Gem packs</label>
              {!d.payments && <p className="small muted">Purchases open soon.{me.role === "ADMIN" && " (Admin: set STRIPE_SECRET_KEY on the server to take payments.)"}</p>}
              <div className="store-grid">
                {d.packs.map((p, i) => (
                  <Button key={p.key} className={`pack tier${Math.min(i, 4)}`} disabled={!d.payments || !!busy} onClick={() => buy(p.key)}>
                    {p.bonus && <span className="pack-bonus">{p.bonus}</span>}
                    <span className="pack-gems">{"💎".repeat(Math.min(3, i + 1))}</span>
                    <b>{p.gems.toLocaleString()}</b>
                    <span className="small">{p.label}</span>
                    <span className="price">{busy === p.key ? "…" : money(p.priceCents, d.currency)}</span>
                  </Button>
                ))}
              </div>
            </>
          )}

          <label>Coins</label>
          <div className="store-grid">
            {d.offers.map((o) => (
              <Button key={o.key} className="pack coins" disabled={me.gems < o.gems} onClick={() => spend({ action: "offer", key: o.key })}>
                <span className="pack-gems">🪙</span>
                <b>{o.coins.toLocaleString()}</b>
                <span className="small">{o.label}</span>
                <span className="price">💎 {o.gems}</span>
              </Button>
            ))}
          </div>

          <label>Boosts</label>
          <div className="boosts">
            <Button className="btn ghost" disabled={me.gems < d.boosts.heal} onClick={() => spend({ action: "heal" })}>❤️ Instant heal · 💎{d.boosts.heal}</Button>
            <Button className="btn ghost" disabled={me.gems < d.boosts.refresh} onClick={() => spend({ action: "refresh" })}>🥤 Energy drink · 💎{d.boosts.refresh}</Button>
            <Button className="btn ghost" disabled={!me.base || me.gems < d.boosts.shield} onClick={() => spend({ action: "shield" })}>🛡️ 4 h base shield · 💎{d.boosts.shield}</Button>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Gems also come from levels, quests, achievements, goals, story chapters and GPS games.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Rewarded sponsor spot
type AdStart = { viewId: string; seconds: number; creative: { id: string; sponsor: string; title: string; body?: string; imageUrl?: string; videoUrl?: string; clickUrl?: string } };

export function AdModal({ onClose }: { onClose: () => void }) {
  const { act, toast } = useGame();
  const [ad, setAd] = useState<(AdStart & { at: number }) | null>(null);
  const [now, setNow] = useState(Date.now());
  const started = useRef(false);
  // The ad has its own soundtrack: pause the game music while it's open.
  useEffect(() => {
    duckMusic(true);
    return () => duckMusic(false);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<AdStart>("/api/ads", { body: { action: "start" } })
      .then((r) => setAd({ ...r, at: Date.now() }))
      .catch((e) => {
        toast({ kind: "error", title: (e as Error).message });
        onClose();
      });
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ad) return <div className="modal-bg"><div className="big-num">LOADING…</div></div>;
  const left = Math.max(0, Math.ceil(ad.seconds - (now - ad.at) / 1000));
  const c = ad.creative;
  const done = left === 0;
  const close = () => (done ? onClose() : askConfirm("Leave now? You won't get the reward.", { ok: "Leave", danger: true }).then((ok) => ok && onClose()));
  return (
    <div className="modal-bg ad-bg">
      <div className="ad-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="tag">Sponsored · {c.sponsor}</span>
          <span className="ad-timer" style={{ ["--p" as string]: `${(1 - left / ad.seconds) * 360}deg` }}><span className="ad-timer-n">{done ? "✓" : left}</span></span>
        </div>
        {c.videoUrl ? (
          <div className="ad-video-wrap">
            <AutoVideo className="ad-media video" src={c.videoUrl} poster={c.videoUrl.replace(/\.mp4$/, ".jpg")} label={c.title} soundButton />
          </div>
        ) : c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ad-media" src={c.imageUrl} alt={c.title} />
        ) : (
          <div className="ad-media house">🤝</div>
        )}
        <h2>{c.title}</h2>
        {c.body && <p className="small muted">{c.body}</p>}
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {c.clickUrl && (
            <a className="btn cyan" href={c.clickUrl} target="_blank" rel="noreferrer sponsored" onClick={() => api("/api/ads", { body: { action: "click", viewId: ad.viewId } }).catch(() => {})}>
              Visit {c.sponsor}
            </a>
          )}
          <Button
            className="btn yellow"
            disabled={!done}
            onClick={() =>
              act(() => api("/api/ads", { body: { action: "claim", viewId: ad.viewId } })).then((ok) => {
                if (ok) {
                  burst("💎", 6);
                  onClose();
                }
              })
            }
          >
            {done ? "🎁 Collect reward" : `Reward in ${left}s`}
          </Button>
          <Button className="btn ghost" onClick={close}>{done ? "Close" : "✕"}</Button>
        </div>
      </div>
    </div>
  );
}

