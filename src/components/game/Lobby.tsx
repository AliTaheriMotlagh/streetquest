"use client";
// Squad-run lobby at a run spawn: waiting room → synced start → the run banner and
// squadmates on the map take over.
import { useCallback, useEffect, useRef, useState } from "react";
import { isLobbyKind, LOBBY_INFO } from "@/lib/lobbies";
import { fmtNum, t } from "@/lib/i18n";
import { api, type LobbyView } from "./client";
import { useGame } from "./ui";
import { sfx } from "./sfx";
import { Button } from "@/components/Button";

type Resp = { now: number; lobby: LobbyView };
const MEDAL = ["🥇", "🥈", "🥉"];

export function LobbyModal({ open, onClose }: { open: { spawnId: string; mode?: "race" | "coop" } | { lobbyId: string }; onClose: () => void }) {
  const { me, toast, refresh } = useGame();
  const [l, setL] = useState<LobbyView | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
    const poll = setInterval(() => api<Resp>(`/api/lobby?id=${id}`).then(take).catch(() => {}), 1000);
    const k = setInterval(() => setTick((x) => x + 1), 250);
    return () => {
      clearInterval(poll);
      clearInterval(k);
    };
  }, [id, status, take]);

  const isRun = !!l && isLobbyKind(l.kind);
  // Squad run started: the run banner + squadmates on the map take over.
  useEffect(() => {
    if (isRun && status === "LIVE") {
      toast({ kind: "reward", title: `${LOBBY_INFO[l!.kind].emoji} ${t("GO GO GO!")}`, body: t("Your squad is on the map — first to the 🎯 wins") });
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

  const leave = () => {
    if (id && status === "OPEN") api("/api/lobby", { body: { action: "leave", lobbyId: id } }).catch(() => {});
    onClose();
  };

  if (err)
    return (
      <Shell onClose={onClose}>
        <div style={{ fontSize: 44 }}>🚫</div>
        <p>{err}</p>
        <Button className="btn ghost" onClick={onClose}>{t("OK")}</Button>
      </Shell>
    );
  if (!l) return <Shell onClose={onClose}><div className="big-num">…</div></Shell>;
  if (!isLobbyKind(l.kind)) return <Shell onClose={onClose}><p>{t("This game has ended.")}</p><Button className="btn ghost" onClick={onClose}>{t("OK")}</Button></Shell>;

  const info = LOBBY_INFO[l.kind];
  const now = Date.now() + offset.current;
  const meP = l.players.find((p) => p.userId === me.id);

  if (l.status === "OPEN") {
    const left = Math.max(0, Math.ceil((l.openUntil - now) / 1000));
    return (
      <Shell onClose={leave}>
        <div style={{ fontSize: 44 }}>{info.emoji}</div>
        <h2 style={{ margin: "4px 0" }}>{t(info.name)}</h2>
        <p className="small muted">{t(info.blurb)}</p>
        <div className="lobby-players">
          {l.players.map((p) => (
            <div key={p.userId} className="lobby-player">
              <span style={{ fontSize: 26 }}>{p.avatar}</span>
              <b dir="auto">{p.name}</b>
              {p.userId === l.hostId && <span className="tag">{t("HOST")}</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - l.players.length) }, (_, i) => (
            <div key={i} className="lobby-player empty">{t("waiting…")}</div>
          ))}
        </div>
        <p className="small" style={{ color: "var(--yellow)" }}>
          {t("Players nearby were pinged · auto-start in {s}s", { s: left })}
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          {l.hostId === me.id ? (
            <Button className="btn green" onClick={() => api<Resp>("/api/lobby", { body: { action: "start", lobbyId: l.id } }).then(take).catch((e) => toast({ kind: "error", title: (e as Error).message }))}>
              ▶ {l.players.length > 1 ? t("Start ({n} players)", { n: l.players.length }) : t("Play solo now")}
            </Button>
          ) : (
            <span className="small muted">{t("Waiting for the host…")}</span>
          )}
          <Button className="btn ghost" onClick={leave}>{t("Leave")}</Button>
        </div>
      </Shell>
    );
  }

  if (l.status === "LIVE") {
    return (
      <Shell>
        <div style={{ fontSize: 40 }}>🏃</div>
        <h2>{t("Starting…")}</h2>
        <Scores l={l} meId={me.id} />
      </Shell>
    );
  }

  // ENDED
  const ranked = [...l.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  return (
    <Shell onClose={onClose}>
      <div style={{ fontSize: 44 }}>{meP?.place === 1 && l.players.length > 1 ? "🏆" : info.emoji}</div>
      <h2 style={{ margin: "4px 0" }}>{l.players.length > 1 && meP?.place === 1 ? t("You win!") : l.players.length > 1 && meP?.place ? t("You placed #{n}", { n: meP.place }) : t("Round over")}</h2>
      <div className="lobby-players">
        {ranked.map((p) => (
          <div key={p.userId} className={`lobby-player ${p.userId === me.id ? "me" : ""}`}>
            <span style={{ width: 26 }}>{p.place ? MEDAL[p.place - 1] ?? `#${fmtNum(p.place)}` : "—"}</span>
            <span>{p.avatar}</span>
            <b className="grow" style={{ textAlign: "start" }} dir="auto">{p.name}</b>
            <span className="mono">{p.place ? "" : t("DNF")}</span>
          </div>
        ))}
      </div>
      {meP?.reward && <p style={{ color: "var(--yellow)", fontWeight: 800 }}>{meP.reward}</p>}
      <Button className="btn" onClick={onClose}>{t("Done")}</Button>
    </Shell>
  );
}

function Scores({ l, meId }: { l: LobbyView; meId: string }) {
  return (
    <div className="lobby-players compact">
      {[...l.players].sort((a, b) => Number(b.finished) - Number(a.finished)).map((p) => (
        <div key={p.userId} className={`lobby-player ${p.userId === meId ? "me" : ""}`}>
          <span>{p.avatar}</span>
          <b className="grow" style={{ textAlign: "start" }} dir="auto">{p.name}</b>
          <span className="mono">{p.finished ? "✓" : t("running…")}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        {onClose && <Button className="close" style={{ float: "inline-end" }} onClick={onClose} aria-label={t("Close")}>✕</Button>}
        {children}
      </div>
    </div>
  );
}
