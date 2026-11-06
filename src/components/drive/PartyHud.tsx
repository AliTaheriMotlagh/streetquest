"use client";
// A party round in the 3D city: the strip at the top during the round and the podium
// after it. (Starting a party, inviting and picking the game: PlayTogether.tsx.)
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { PARTY_GAMES, standings, type PartyView } from "@/lib/party";
import { sfx } from "../game/sfx";

const MEDAL = ["🥇", "🥈", "🥉"];

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
