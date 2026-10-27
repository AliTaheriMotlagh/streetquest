"use client";
// Hanging out in the 3D city: a party of friends and the games you play together.
// DriveParty is the panel (open a party, invite friends, join by code, pick a game,
// start); PartyHud is the strip at the top during a round and the results after it.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import type { LatLng } from "@/lib/geo";
import { PARTY_GAMES, standings, type PartyGame, type PartyView } from "@/lib/party";
import { VEHICLES, isVehicle } from "@/lib/vehicles";
import { Button } from "@/components/Button";
import { api } from "../game/client";
import { useGame } from "../game/ui";
import { sfx } from "../game/sfx";

type Friend = { id: string; username: string; avatar: string; level: number; online: boolean };
type Invite = { id: string; code: string; host: string; players: number; game: string };
type Resp = { party: PartyView | null; invites: Invite[]; friends: Friend[] };
const GAMES: PartyGame[] = ["race", "tag", "coins"];
const MEDAL = ["🥇", "🥈", "🥉"];

type Props = {
  party: PartyView | null;
  meId: string;
  canDrive: boolean;
  sim: boolean;
  course: (g: PartyGame) => { start: LatLng & { yaw: number }; points: LatLng[] } | null;
  onChange: () => void;
  onClose: () => void;
  embedded?: boolean;
};

export function DriveParty({ party: live, meId, canDrive, sim, course, onChange, onClose, embedded }: Props) {
  const { toast } = useGame();
  const [data, setData] = useState<Resp | null>(null);
  const [code, setCode] = useState("");
  const [game, setGame] = useState<PartyGame>("race");
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const load = useCallback(() => api<Resp>("/api/party").then(setData).catch(() => {}), []);
  useEffect(() => {
    void load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [load]);
  // The live stream (/api/drive) is fresher than this panel's own poll.
  const party = live ?? data?.party ?? null;

  const run = async (body: Record<string, unknown>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ party: PartyView | null }>("/api/party", { body });
      setData((d) => (d ? { ...d, party: r.party } : d));
      onChange();
      if (ok) toast({ kind: "social", title: ok });
      return true;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!party) return;
    const c = course(game);
    if (!c) return toast({ kind: "error", title: t("Not enough streets loaded around you — drive into town and try again") });
    if (await run({ action: "start", partyId: party.id, game, start: c.start, points: game === "tag" ? undefined : c.points })) {
      sfx("reward");
      onClose();
    }
  };

  const share = async () => {
    if (!party) return;
    const text = t("Join my party in StreetQuest's 3D city — code {code}", { code: party.code });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(party.code);
        toast({ title: t("Code copied") });
      }
    } catch {}
  };

  const host = party?.members.find((m) => m.userId === party.hostId);
  const isHost = party?.hostId === meId;
  const members = new Set(party?.members.map((m) => m.userId) ?? []);
  const friends = (data?.friends ?? []).filter((f) => !members.has(f.id));

  return (
    <div className={embedded ? "drive-tab" : "drive-sheet"} role={embedded ? undefined : "dialog"} aria-label={t("Party games")}>
      {!embedded && (
        <div className="row">
          <b className="grow">🎉 {t("Party games")}</b>
          <button className="close" onClick={onClose} aria-label={t("Close")}>✕</button>
        </div>
      )}

      {!canDrive && <p className="small muted">{t("Party games are for Play from home — switch it on to join your friends")}</p>}

      {canDrive && !party && (
        <>
          <p className="small muted">{t("Get your friends in the 3D city and play a round together: race through checkpoints, play tag, grab coins.")}</p>
          <Button className="btn yellow" disabled={busy} onClick={() => run({ action: "create", sim }, t("Party open — invite your friends!"))}>🎉 {t("Start a party")}</Button>
          <div className="row party-join">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder={t("Party code")} aria-label={t("Party code")} autoCapitalize="characters" spellCheck={false} />
            <Button className="btn" disabled={busy || code.length !== 6} onClick={() => run({ action: "join", code, sim }, t("You joined the party"))}>{t("Join")}</Button>
          </div>
          {!!data?.invites.length && (
            <>
              <b className="small">{t("Invites")}</b>
              {data.invites.map((i) => (
                <div key={i.id} className="drive-job">
                  <span className="ic">{PARTY_GAMES[i.game as PartyGame]?.emoji ?? "🎉"}</span>
                  <span className="grow">{t("{name}'s party · {n} players", { name: i.host, n: i.players })}</span>
                  <Button className="btn small yellow" disabled={busy} onClick={() => run({ action: "join", code: i.code, sim }, t("You joined the party"))}>{t("Join")}</Button>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {party && (
        <>
          <div className="party-code">
            <span className="small muted">{t("Party code")}</span>
            <b>{party.code}</b>
            <Button className="btn small ghost" onClick={share}>📤 {t("Share")}</Button>
          </div>
          <b className="small">{t("Players")}</b>
          {party.members.map((m) => (
            <div key={m.userId} className="drive-job">
              <span className="ic">{m.avatar}</span>
              <span className="grow">
                {m.name}
                {m.userId === party.hostId ? ` · ${t("host")}` : ""}
                {m.vehicle && isVehicle(m.vehicle) ? ` · ${VEHICLES[m.vehicle].emoji}` : ""}
              </span>
              {party.status === "ENDED" && m.reward ? <span className="small">{m.reward}</span> : <span className={`dot ${m.online ? "on" : ""}`} aria-label={m.online ? t("online") : t("offline")} />}
            </div>
          ))}

          {party.status !== "LIVE" && (
            <>
              <b className="small">{isHost ? t("Pick a game") : t("Waiting for {name} to start a round", { name: host?.name ?? "" })}</b>
              <div className="party-games">
                {GAMES.map((g) => {
                  const d = PARTY_GAMES[g];
                  return (
                    <button key={g} className={`garage-car ${game === g ? "on" : ""}`} disabled={!isHost} onClick={() => setGame(g)} aria-pressed={game === g}>
                      <span className="ic">{d.emoji}</span>
                      <b>{t(d.name)}</b>
                      <span className="small muted">{t(d.blurb)}</span>
                    </button>
                  );
                })}
              </div>
              {isHost && (
                <Button className="btn yellow big-btn" disabled={busy || party.members.length < PARTY_GAMES[game].min} onClick={start}>
                  {PARTY_GAMES[game].emoji} {party.members.length < PARTY_GAMES[game].min ? t("Needs {n} players", { n: PARTY_GAMES[game].min }) : t("Start {game}", { game: t(PARTY_GAMES[game].name) })}
                </Button>
              )}
            </>
          )}

          {!!friends.length && (
            <>
              <b className="small">{t("Invite friends")}</b>
              {friends.map((f) => (
                <div key={f.id} className="drive-job">
                  <span className="ic">{f.avatar}</span>
                  <span className="grow">{f.username} · {fmtNum(f.level)}</span>
                  <span className={`dot ${f.online ? "on" : ""}`} />
                  <Button className="btn small" disabled={busy || invited.has(f.id)} onClick={() => run({ action: "invite", partyId: party.id, userId: f.id }, t("Invite sent to {name}", { name: f.username })).then((ok) => ok && setInvited(new Set([...invited, f.id])))}>
                    {invited.has(f.id) ? "✓" : t("Invite")}
                  </Button>
                </div>
              ))}
            </>
          )}
          <Button className="btn ghost small" disabled={busy} onClick={() => run({ action: "leave" }).then(() => setInvited(new Set()))}>{t("Leave party")}</Button>
        </>
      )}
    </div>
  );
}

/** The round at a glance (top of the screen), and the podium when it's over. */
export function PartyHud({ party, meId, serverNow }: { party: PartyView; meId: string; serverNow: number }) {
  const s = party.state;
  const [seenEnd, setSeenEnd] = useState<string | null>(null);
  const endKey = `${party.id}|${s?.round ?? 0}`;
  useEffect(() => {
    if (party.status === "ENDED" && s && seenEnd !== endKey) {
      const mine = party.members.find((m) => m.userId === meId);
      sfx(mine?.place === 1 ? "win" : "reward");
    }
  }, [party.status, endKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const d = PARTY_GAMES[s.game];
  const nameOf = (id: string) => party.members.find((m) => m.userId === id)?.name ?? "?";

  if (party.status === "ENDED") {
    if (seenEnd === endKey || !party.endsAt || serverNow - party.endsAt > 45_000) return null;
    const rows = [...party.members].filter((m) => m.place != null).sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
    return (
      <div className="party-hud party-results">
        <div className="row">
          <b className="grow">{d.emoji} {t("{game} — results", { game: t(d.name) })}</b>
          <button className="close" onClick={() => setSeenEnd(endKey)} aria-label={t("Close")}>✕</button>
        </div>
        {rows.map((m) => (
          <div key={m.userId} className={`party-row ${m.userId === meId ? "me" : ""}`}>
            <span>{MEDAL[(m.place ?? 9) - 1] ?? `#${fmtNum(m.place ?? 0)}`}</span>
            <span className="grow">{m.avatar} {m.name}</span>
            <span className="small">{m.reward}</span>
          </div>
        ))}
      </div>
    );
  }
  if (party.status !== "LIVE" || !party.startsAt || !party.endsAt) return null;
  const left = Math.max(0, Math.ceil((party.endsAt - Math.max(serverNow, party.startsAt)) / 1000));
  const table = standings(s, s.ids, party.startsAt);
  const myRow = table.find((r) => r.userId === meId);
  let status = "";
  if (s.game === "race") status = s.finished[meId] != null ? t("Finished!") : t("Checkpoint {n}/{total}", { n: Math.min((s.progress[meId] ?? 0) + 1, s.cps?.length ?? 0), total: s.cps?.length ?? 0 });
  else if (s.game === "coins") status = t("{n} coins", { n: s.progress[meId] ?? 0 });
  else status = s.it === meId ? t("You're IT — tag someone!") : t("{name} is IT — run!", { name: nameOf(s.it ?? "") });
  return (
    <div className={`party-hud ${s.game === "tag" && s.it === meId ? "is-it" : ""}`}>
      <b>{d.emoji} {status}</b>
      <span className="small">
        {myRow ? `${MEDAL[myRow.place - 1] ?? `#${fmtNum(myRow.place)}`} · ` : ""}⏱ {fmtNum(Math.floor(left / 60))}:{left % 60 < 10 ? fmtNum(0) : ""}{fmtNum(left % 60)}
      </span>
    </div>
  );
}
