"use client";
// The requests waiting on the player's answer (lib/asks.ts), as cards over everything — the map
// and the 3D city alike: a friend request (Accept / Decline) or an invite to a party (Join /
// Not now). Joining from the map opens the 3D city, puts the car next to the host and opens
// Play together (Drive.tsx listens for PARTY_JOINED); in the 3D city it does the same in place.
import { useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import type { Ask } from "@/lib/asks";
import { Button } from "@/components/Button";
import { api } from "./client";
import { sfx } from "./sfx";
import type { Toast } from "./ui";

/** Fired on window when the player joined a party from a card (Drive gathers at the host and opens Play together). */
export const PARTY_JOINED = "sq:party-joined";
let joinedPending = false;
/** A party was joined from the map: the 3D city, when it opens, takes the player to the host. */
export function markPartyJoined() {
  joinedPending = true;
  window.dispatchEvent(new Event(PARTY_JOINED));
}
/** True once after markPartyJoined (the 3D city consumes it as it opens, or when the event fires). */
export function takePartyJoined() {
  const was = joinedPending;
  joinedPending = false;
  return was;
}

type Props = {
  asks: Ask[];
  /** The card was answered or waved away: drop it (and don't bring it back). */
  onDone: (key: string) => void;
  toast: (t: Toast) => void;
  /** After joining a party: open the 3D city if it isn't (Game). */
  onJoined: () => void;
  /** Friends changed (accepted): refresh what shows them. */
  onFriends?: () => void;
};

export function AskCards({ asks, onDone, toast, onJoined, onFriends }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!asks.length) return null;
  const act = async (a: Ask, work: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(a.key);
    try {
      await work();
      if (ok) toast({ kind: "social", title: ok });
      onDone(a.key);
      return true;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      // Gone on the server (already answered elsewhere, the party ended): nothing left to answer.
      if (/not found|no party/i.test((e as Error).message)) onDone(a.key);
      return false;
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="asks" role="region" aria-label={t("Requests")}>
      {asks.map((a) => (
        <div key={a.key} className={`ask ask-${a.kind}`} role="alertdialog" aria-labelledby={`ask-${a.key}`}>
          <span className="ask-av" aria-hidden>{a.avatar || (a.kind === "friend" ? "👋" : "🎉")}</span>
          <div className="grow ask-text">
            <b id={`ask-${a.key}`} dir="auto">
              {a.kind === "friend" ? t("{name} wants to be friends", { name: a.name || t("A player") }) : t("{name} invited you to play together", { name: a.name || t("A player") })}
            </b>
            <span className="small muted">
              {a.kind === "friend" ? t("Friends see each other on the map and in the 3D city, and can invite each other to matches.") : a.players ? t("Party of {n} in the 3D city", { n: fmtNum(a.players) }) : t("Party in the 3D city")}
            </span>
          </div>
          <div className="ask-btns">
            {a.kind === "friend" ? (
              <>
                <Button
                  className="btn small green"
                  disabled={!!busy}
                  onClick={() =>
                    void act(a, () => api("/api/friends", { body: { action: "accept", friendshipId: a.friendshipId } }), t("You're now friends with {name}", { name: a.name })).then((ok) => {
                      if (ok) (sfx("reward"), onFriends?.());
                    })
                  }
                >
                  {busy === a.key ? "…" : t("Accept")}
                </Button>
                <Button className="btn small ghost" disabled={!!busy} onClick={() => void act(a, () => api("/api/friends", { body: { action: "decline", friendshipId: a.friendshipId } }))}>
                  {t("Decline")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="btn small yellow"
                  disabled={!!busy}
                  onClick={() =>
                    void act(a, () => api("/api/party", { body: { action: "join", code: a.code } }), t("You joined the party")).then((ok) => {
                      if (!ok) return;
                      sfx("reward");
                      markPartyJoined();
                      onJoined();
                    })
                  }
                >
                  {busy === a.key ? "…" : t("Join")}
                </Button>
                <Button className="btn small ghost" disabled={!!busy} onClick={() => onDone(a.key)}>
                  {t("Not now")}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
