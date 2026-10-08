"use client";
// Multiplayer lobby at a spawn: waiting room → synced countdown → everyone plays the
// same seeded round → live scoreboard → podium. Squad runs hand off to the run HUD.
import { useCallback, useEffect, useRef, useState } from "react";
import { LOBBY_INFO } from "@/lib/minigames";
import { api, type LobbyView } from "./client";
import { BombDefuse, ShootingRange } from "./MiniGames";
import { useGame } from "./ui";
import { sfx } from "./sfx";
import { Button } from "@/components/Button";

type Resp = { now: number; lobby: LobbyView };
const MEDAL = ["🥇", "🥈", "🥉"];

export function LobbyModal({ open, onClose }: { open: { spawnId: string; mode?: "race" | "coop" } | { lobbyId: string }; onClose: () => void }) {
  const { me, toast, refresh } = useGame();
  const [l, setL] = useState<LobbyView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const offset = useRef(0); // server clock − local clock
  const [, setTick] = useState(0);

  // Polls overlap on a slow network and can land out of order: an old "OPEN" answer
  // must not flip a game that's already LIVE back to the waiting room.
  const newest = useRef(0);
  const take = useCallback((r: Resp) => {
    if (r.now < newest.current) return;
    newest.current = r.now;
    offset.current = r.now - Date.now();
    setL(r.lobby);
  }, []);

  // Open/join once, then poll.
  useEffect(() => {
    const first = "lobbyId" in open ? api<Resp>(`/api/lobby?id=${open.lobbyId}`) : api<Resp>("/api/lobby", { body: { action: "open", spawnId: open.spawnId, mode: open.mode } });
    first.then(take).catch((e) => setErr((e as Error).message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const id = l?.id;
  const status = l?.status;
  useEffect(() => {
    if (!id || status === "ENDED") return;
    const t = setInterval(() => api<Resp>(`/api/lobby?id=${id}`).then(take).catch(() => {}), 1000);
    const k = setInterval(() => setTick((x) => x + 1), 250);
    return () => {
      clearInterval(t);
      clearInterval(k);
    };
  }, [id, status, take]);

  const isRun = l?.kind === "race" || l?.kind === "coop";
  // Squad run started: the run banner + squadmates on the map take over.
  useEffect(() => {
    if (isRun && status === "LIVE") {
      toast({ kind: "reward", title: `${LOBBY_INFO[l!.kind].emoji} GO GO GO!`, body: "Your squad is on the map — first to the 🎯 wins" });
      refresh();
      onClose();
    }
    if (status === "ENDED") {
      refresh();
      const mine = l?.players.find((p) => p.userId === me.id);
      if ((l?.players.length ?? 0) > 1) sfx(mine?.place === 1 ? "win" : "lose");
      else sfx("reward");
    }
  }, [isRun, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(
    (score: number) => {
      if (!id) return;
      setSubmitted(true);
      api<Resp>("/api/lobby", { body: { action: "score", lobbyId: id, score } }).then(take).catch((e) => toast({ kind: "error", title: (e as Error).message }));
    },
    [id, take, toast],
  );

  const leave = () => {
    if (id && status === "OPEN") api("/api/lobby", { body: { action: "leave", lobbyId: id } }).catch(() => {});
    onClose();
  };

  if (err)
    return (
      <Shell onClose={onClose}>
        <div style={{ fontSize: 44 }}>🚫</div>
        <p>{err}</p>
        <Button className="btn ghost" onClick={onClose}>OK</Button>
      </Shell>
    );
  if (!l) return <Shell onClose={onClose}><div className="big-num">…</div></Shell>;

  const info = LOBBY_INFO[l.kind];
  const now = Date.now() + offset.current;
  const local = (serverMs: number) => serverMs - offset.current;
  const meP = l.players.find((p) => p.userId === me.id);

  if (l.status === "OPEN") {
    const left = Math.max(0, Math.ceil((l.openUntil - now) / 1000));
    return (
      <Shell onClose={leave}>
        <div style={{ fontSize: 44 }}>{info.emoji}</div>
        <h2 style={{ margin: "4px 0" }}>{info.name}</h2>
        <p className="small muted">{info.blurb}</p>
        <div className="lobby-players">
          {l.players.map((p) => (
            <div key={p.userId} className="lobby-player">
              <span style={{ fontSize: 26 }}>{p.avatar}</span>
              <b>{p.name}</b>
              {p.userId === l.hostId && <span className="tag">HOST</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - l.players.length) }, (_, i) => (
            <div key={i} className="lobby-player empty">waiting…</div>
          ))}
        </div>
        <p className="small" style={{ color: "var(--yellow)" }}>
          Players nearby were pinged · auto-start in <b>{left}s</b>
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          {l.hostId === me.id ? (
            <Button className="btn green" onClick={() => api<Resp>("/api/lobby", { body: { action: "start", lobbyId: l.id } }).then(take).catch((e) => toast({ kind: "error", title: (e as Error).message }))}>
              ▶ {l.players.length > 1 ? `Start (${l.players.length} players)` : "Play solo now"}
            </Button>
          ) : (
            <span className="small muted">Waiting for the host…</span>
          )}
          <Button className="btn ghost" onClick={leave}>Leave</Button>
        </div>
      </Shell>
    );
  }

  if (l.status === "LIVE" && !isRun && meP && meP.score == null && !submitted && l.startsAt) {
    return (
      <Shell wide>
        {l.kind === "range" ? <ShootingRange seed={l.seed} startAt={local(l.startsAt)} onDone={submit} /> : <BombDefuse seed={l.seed} startAt={local(l.startsAt)} onDone={submit} />}
        {l.players.length > 1 && <Scores l={l} meId={me.id} />}
      </Shell>
    );
  }

  if (l.status === "LIVE") {
    return (
      <Shell>
        <div style={{ fontSize: 40 }}>{isRun ? "🏃" : "⏳"}</div>
        <h2>{isRun ? "Starting…" : "Waiting for the others"}</h2>
        <Scores l={l} meId={me.id} />
      </Shell>
    );
  }

  // ENDED
  const ranked = [...l.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  return (
    <Shell onClose={onClose}>
      <div style={{ fontSize: 44 }}>{meP?.place === 1 && l.players.length > 1 ? "🏆" : info.emoji}</div>
      <h2 style={{ margin: "4px 0" }}>{l.players.length > 1 ? (meP?.place === 1 ? "You win!" : meP?.place ? `You placed #${meP.place}` : "Round over") : "Round over"}</h2>
      <div className="lobby-players">
        {ranked.map((p) => (
          <div key={p.userId} className={`lobby-player ${p.userId === me.id ? "me" : ""}`}>
            <span style={{ width: 26 }}>{p.place ? MEDAL[p.place - 1] ?? `#${p.place}` : "—"}</span>
            <span>{p.avatar}</span>
            <b className="grow" style={{ textAlign: "left" }}>{p.name}</b>
            <span className="mono">{p.score ?? "DNF"}</span>
          </div>
        ))}
      </div>
      {meP?.reward && <p style={{ color: "var(--yellow)", fontWeight: 800 }}>{meP.reward}</p>}
      <Button className="btn" onClick={onClose}>Done</Button>
    </Shell>
  );
}

function Scores({ l, meId }: { l: LobbyView; meId: string }) {
  return (
    <div className="lobby-players compact">
      {[...l.players].sort((a, b) => (b.score ?? -1e9) - (a.score ?? -1e9)).map((p) => (
        <div key={p.userId} className={`lobby-player ${p.userId === meId ? "me" : ""}`}>
          <span>{p.avatar}</span>
          <b className="grow" style={{ textAlign: "left" }}>{p.name}</b>
          <span className="mono">{p.score ?? (p.finished ? "✓" : "playing…")}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ children, onClose, wide }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modal-bg">
      <div className="modal" style={wide ? { maxWidth: 420, padding: 14 } : undefined}>
        {onClose && <Button className="close" style={{ float: "right" }} onClick={onClose} aria-label="Close">✕</Button>}
        {children}
      </div>
    </div>
  );
}
