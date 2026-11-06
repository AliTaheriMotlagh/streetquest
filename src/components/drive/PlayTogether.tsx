"use client";
// The 3D city menu's Play together tab: everything for playing with other people in one
// place —
//  - your party: start one, join by code or an invite, invite friends and players online
//    near you, and go to the host (everyone in one spot, so you see each other move);
//  - the game: party rounds (race, tag, coin rush — the server referees them from the
//    position stream) or Street Arena matches (deathmatch … hardpoint, bots optional);
//    the host starts it for the whole party, and the members are pulled in (Drive.tsx);
//    without a party a match is open to anyone nearby;
//  - matches nearby, and fighting in the open city (passive mode).
import { useCallback, useEffect, useState } from "react";
import { formatDistance, type LatLng } from "@/lib/geo";
import { fmtNum, t } from "@/lib/i18n";
import { GATHER_M, PARTY_GAMES, type PartyGame, type PartyView } from "@/lib/party";
import { MODE_KEYS, MODES, type ModeKey } from "@/lib/arena/modes";
import { VEHICLES, isVehicle } from "@/lib/vehicles";
import { Button } from "@/components/Button";
import { api } from "../game/client";
import { useGame } from "../game/ui";
import { sfx } from "../game/sfx";
import { ArenaSetup, ARENA_DEFAULTS, FightToggle, GunPicker, MatchPanel, NearbyMatches, type ArenaSettings } from "../arena/ArenaMenu";
import { useCombat } from "../arena/CombatHud";
import type { Combat } from "../arena/combat";

type Friend = { id: string; username: string; avatar: string; level: number; online: boolean };
type Invite = { id: string; code: string; host: string; players: number; game: string };
type Resp = { party: PartyView | null; invites: Invite[]; friends: Friend[] };
type OnlinePlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; home: boolean; distM: number | null };

type GameKey = PartyGame | ModeKey;
const ROUNDS: PartyGame[] = ["race", "tag", "coins"];
const isRound = (g: GameKey): g is PartyGame => (ROUNDS as string[]).includes(g);
const GAME_KEY = "sq_play_game";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const gameInfo = (g: GameKey) => (isRound(g) ? { emoji: PARTY_GAMES[g].emoji, name: PARTY_GAMES[g].name, blurb: t(PARTY_GAMES[g].blurb) } : { emoji: MODES[g].emoji, name: MODES[g].name, blurb: t(MODES[g].blurb, { n: MODES[g].killLimit }) });

type Props = {
  party: PartyView | null;
  meId: string;
  canDrive: boolean;
  sim: boolean;
  combat: Combat | null;
  course: (g: PartyGame) => { start: LatLng & { yaw: number }; points: LatLng[] } | null;
  onChange: () => void;
  /** Put my car here (going to the party's host). */
  onTeleport: (at: LatLng & { yaw: number }) => void;
  onGo: (p: LatLng, label: string) => void;
  onClose: () => void;
};

export function PlayTogether({ party: live, meId, canDrive, sim, combat, course, onChange, onTeleport, onGo, onClose }: Props) {
  const { toast, setHomeMode } = useGame();
  const s = useCombat(combat);
  const [data, setData] = useState<Resp | null>(null);
  const [near, setNear] = useState<OnlinePlayer[]>([]);
  const [code, setCode] = useState("");
  const [game, setGameState] = useState<GameKey>(() => {
    const g = store.get(GAME_KEY);
    return g && (isRound(g as GameKey) || (MODE_KEYS as string[]).includes(g)) ? (g as GameKey) : "tdm";
  });
  const [arena, setArena] = useState<ArenaSettings>(ARENA_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const setGame = (g: GameKey) => (setGameState(g), store.set(GAME_KEY, g));

  const load = useCallback(() => api<Resp>("/api/party").then(setData).catch(() => {}), []);
  useEffect(() => {
    void load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [load]);
  // The live stream (/api/drive) is fresher than this panel's own poll.
  const party = live ?? data?.party ?? null;
  const hasParty = !!party;
  // Players online around me (not friends): they can be invited too.
  useEffect(() => {
    if (!hasParty) return;
    const get = () =>
      api<{ players: OnlinePlayer[] }>("/api/online")
        .then((r) => setNear(r.players.filter((p) => !p.friend).slice(0, 8)))
        .catch(() => {});
    void get();
    const i = setInterval(get, 30_000);
    return () => clearInterval(i);
  }, [hasParty]);

  const run = async <T extends { party?: PartyView | null }>(body: Record<string, unknown>, ok?: string): Promise<T | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await api<T>("/api/party", { body });
      if (r.party !== undefined) setData((d) => (d ? { ...d, party: r.party ?? null } : d));
      onChange();
      if (ok) toast({ kind: "social", title: ok });
      return r;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Go to the host: my car lines up right behind theirs. */
  const gather = async (quiet = false) => {
    try {
      const r = await api<{ at: (LatLng & { yaw: number }) | null; party: PartyView | null }>("/api/party", { body: { action: "gather", sim } });
      if (r.at) {
        onTeleport(r.at);
        const h = r.party?.members.find((m) => m.userId === r.party?.hostId);
        toast({ kind: "social", title: t("🚀 You're with {name} now", { name: h?.name ?? "" }) });
      }
      onChange();
    } catch (e) {
      if (!quiet) toast({ kind: "error", title: (e as Error).message });
    }
  };

  const join = async (c: string) => {
    if (await run({ action: "join", code: c, sim }, t("You joined the party"))) await gather(true);
  };

  const host = party?.members.find((m) => m.userId === party.hostId);
  const isHost = !!party && party.hostId === meId;
  const members = new Set(party?.members.map((m) => m.userId) ?? []);
  const friends = (data?.friends ?? []).filter((f) => !members.has(f.id));
  const strangers = near.filter((p) => !members.has(p.id));
  const roundLive = party?.status === "LIVE";
  const info = gameInfo(game);

  const start = async () => {
    if (isRound(game)) {
      if (!party) return;
      const c = course(game);
      if (!c) return toast({ kind: "error", title: t("Not enough streets loaded around you — drive into town and try again") });
      if (await run({ action: "start", partyId: party.id, game, start: c.start, points: game === "tag" ? undefined : c.points })) {
        sfx("reward");
        onClose();
      }
      return;
    }
    if (!combat) return;
    combat.create(game, arena.radius, arena.bots, arena.diff, party ? { id: party.id, members: party.members.map((m) => m.userId).filter((id) => id !== meId) } : undefined);
    onClose();
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

  // In a Street Arena match: that's all this tab is about.
  if (s?.match && combat) return <MatchPanel combat={combat} s={s} onClose={onClose} />;

  const live2 = s?.rt === "on";
  const needs = isRound(game) ? PARTY_GAMES[game].min : 1;
  let startLabel = "";
  let canStart = canDrive && !busy;
  if (isRound(game)) {
    if (!party) (startLabel = t("Start a party to play {game}", { game: t(info.name) })), (canStart = false);
    else if (party.members.length < needs) (startLabel = t("Needs {n} players", { n: needs })), (canStart = false);
    else startLabel = t("Start {game}", { game: t(info.name) });
  } else if (!live2) (startLabel = t("Connecting to the live city…")), (canStart = false);
  else startLabel = party ? t("Start {game} with the party", { game: t(info.name) }) : t("Start {game} here", { game: t(info.name) });
  if (roundLive) canStart = false;

  return (
    <div className="drive-tab arena-tab play-tab">
      {!canDrive && (
        <div className="arena-pvp">
          <div className="grow">
            <b>🛋️ {t("Play from home to play together")}</b>
            <span className="small muted">{t("Players following their real GPS can watch the city, but games with others are played from home.")}</span>
          </div>
          <Button className="btn small yellow" onClick={() => void setHomeMode(true)}>{t("Switch")}</Button>
        </div>
      )}

      {/* ---- the party */}
      <section className="play-sec">
        <h4>🎉 {t("Your party")}</h4>
        {!party ? (
          <>
            <p className="small muted">{t("Get friends in the 3D city and play together: start a party, invite them (or players online near you), pick a game, start.")}</p>
            <Button className="btn yellow" disabled={busy || !canDrive} onClick={() => run({ action: "create", sim }, t("Party open — invite your friends!"))}>🎉 {t("Start a party")}</Button>
            <div className="row party-join">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder={t("Party code")} aria-label={t("Party code")} autoCapitalize="characters" spellCheck={false} />
              <Button className="btn" disabled={busy || code.length !== 6 || !canDrive} onClick={() => join(code)}>{t("Join")}</Button>
            </div>
            {!!data?.invites.length && (
              <>
                <b className="small">{t("Invites")}</b>
                {data.invites.map((i) => (
                  <div key={i.id} className="drive-job">
                    <span className="ic">{PARTY_GAMES[i.game as PartyGame]?.emoji ?? "🎉"}</span>
                    <span className="grow">{t("{name}'s party · {n} players", { name: i.host, n: i.players })}</span>
                    <Button className="btn small yellow" disabled={busy || !canDrive} onClick={() => join(i.code)}>{t("Join")}</Button>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <div className="party-code">
              <span className="small muted">{t("Party code")}</span>
              <b>{party.code}</b>
              <Button className="btn small ghost" onClick={share}>📤 {t("Share")}</Button>
            </div>
            {party.members.map((m) => (
              <div key={m.userId} className="drive-job play-member">
                <span className="ic">{m.avatar}</span>
                <span className="grow">
                  {m.name}
                  {m.userId === party.hostId ? ` · ${t("host")}` : ""}
                  {m.vehicle && isVehicle(m.vehicle) ? ` · ${VEHICLES[m.vehicle].emoji}` : ""}
                  {m.userId !== meId && m.dist != null && m.dist > 30 && <span className="dist"> · {formatDistance(m.dist)}</span>}
                </span>
                {party.status === "ENDED" && m.reward ? <span className="small">{m.reward}</span> : <span className={`dot ${m.online ? "on" : ""}`} aria-label={m.online ? t("online") : t("offline")} />}
              </div>
            ))}
            {!isHost && host && (host.dist == null || host.dist > GATHER_M) && (
              <Button className="btn green" disabled={busy || !canDrive} onClick={() => gather()}>🚀 {t("Go to {name}", { name: host.name })}</Button>
            )}
            {party.arena && !isHost && (
              <Button className="btn yellow" disabled={!canDrive || !combat} onClick={() => combat?.join(party.arena!.id, party.arena!.kind)}>
                {MODES[party.arena.mode as ModeKey]?.emoji ?? "🔫"} {t("Join the party's match")}
              </Button>
            )}
            {(!!friends.length || !!strangers.length) && <b className="small">{t("Invite")}</b>}
            {[...friends.map((f) => ({ id: f.id, name: f.username, avatar: f.avatar, level: f.level, online: f.online, sub: "" })), ...strangers.map((p) => ({ id: p.id, name: p.username, avatar: p.avatar, level: p.level, online: true, sub: p.distM != null ? t("about {d}", { d: formatDistance(p.distM) }) : "" }))].map((f) => (
              <div key={f.id} className="drive-job">
                <span className="ic">{f.avatar}</span>
                <span className="grow">
                  {f.name} · {fmtNum(f.level)}
                  {f.sub && <span className="small muted"> · {f.sub}</span>}
                </span>
                <span className={`dot ${f.online ? "on" : ""}`} />
                <Button
                  className="btn small"
                  disabled={busy || invited.has(f.id)}
                  onClick={() => run({ action: "invite", partyId: party.id, userId: f.id }, t("Invite sent to {name}", { name: f.name })).then((ok) => ok && setInvited(new Set([...invited, f.id])))}
                >
                  {invited.has(f.id) ? "✓" : t("Invite")}
                </Button>
              </div>
            ))}
            <Button className="btn ghost small" disabled={busy} onClick={() => run({ action: "leave" }).then(() => setInvited(new Set()))}>{t("Leave party")}</Button>
          </>
        )}
      </section>

      {/* ---- the game */}
      <section className="play-sec">
        <h4>🎮 {party && !isHost ? t("Waiting for {name} to start a round", { name: host?.name ?? "" }) : t("Pick a game")}</h4>
        {roundLive && <p className="small muted">{t("A round is already running")}</p>}
        {(!party || isHost) && !roundLive && (
          <>
            <div className="play-games" role="radiogroup" aria-label={t("Pick a game")}>
              <span className="lbl">🚗 {t("Party games")}</span>
              {ROUNDS.map((g) => (
                <button key={g} role="radio" aria-checked={game === g} className={`play-game ${game === g ? "on" : ""}`} onClick={() => setGame(g)}>
                  <span className="ic">{PARTY_GAMES[g].emoji}</span>
                  {t(PARTY_GAMES[g].name)}
                </button>
              ))}
              <span className="lbl">🔫 {t("Street Arena")}</span>
              {MODE_KEYS.map((k) => (
                <button key={k} role="radio" aria-checked={game === k} className={`play-game ${game === k ? "on" : ""}`} onClick={() => setGame(k)}>
                  <span className="ic">{MODES[k].emoji}</span>
                  {t(MODES[k].name)}
                </button>
              ))}
            </div>
            <p className="play-blurb">
              {info.emoji} <b>{t(info.name)}</b> — {info.blurb}
            </p>
            {!isRound(game) && (
              <>
                <ArenaSetup value={arena} onChange={setArena} />
                {combat && <GunPicker combat={combat} />}
                {!party && <p className="small muted">{t("Players near you can join it from Matches nearby — or start a party to bring friends from anywhere.")}</p>}
              </>
            )}
            <Button className="btn yellow big-btn wide" disabled={!canStart} onClick={start}>
              {info.emoji} {startLabel}
            </Button>
          </>
        )}
      </section>

      {/* ---- matches around me, and fighting in the open city */}
      {combat && s && (
        <section className="play-sec">
          <h4>📍 {t("Matches nearby")}</h4>
          <NearbyMatches combat={combat} s={s} canDrive={canDrive} onGo={onGo} />
          {s.rt === "on" && <FightToggle combat={combat} s={s} />}
          {s.rt === "connecting" && (
            <p className="small muted">
              <i className="drive-spinner" aria-hidden /> {t("Connecting to the live city…")}
            </p>
          )}
          {s.rt === "off" && <p className="small muted">{t("Live multiplayer is offline right now — you can still walk around and drive.")}</p>}
        </section>
      )}
    </div>
  );
}
