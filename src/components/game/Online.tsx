"use client";
// Who's online: the HUD's 🟢 chip (everyone online right now) and the list it opens —
// your online friends first, then players around you, nearest first, with how far they
// are (strangers' distances are rounded and never their real spot; /api/online).
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { Button } from "@/components/Button";
import { api } from "./client";
import { Sheet, useGame } from "./ui";

type OnlinePlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; home: boolean; distM: number | null };
type Online = { total: number; players: OnlinePlayer[] };
/** The list refreshes this often while it's open. */
const REFRESH_MS = 30_000;

export function OnlineChip({ total, onOpen }: { total: number | undefined; onOpen: () => void }) {
  if (total == null) return null;
  return (
    <Button className="chip small online-chip" onClick={onOpen} title={t("Players online now — tap to see who")} aria-label={t("{n} players online", { n: fmtNum(total) })}>
      <span className="dot on" aria-hidden /> {fmtNum(total)}
    </Button>
  );
}

function Row({ p }: { p: OnlinePlayer }) {
  const { openProfile } = useGame();
  return (
    <button className="online-row" onClick={() => openProfile(p.id)}>
      <span className="online-av" aria-hidden>
        {p.avatar}
        <span className="dot on" />
      </span>
      <span className="grow">
        <b dir="auto">{p.username}</b>
        <span className="small muted">
          {t("Level {n}", { n: fmtNum(p.level) })}
          {p.home && ` · 🛋️ ${t("playing from home")}`}
        </span>
      </span>
      <span className="small muted online-dist">{p.distM == null ? t("far away") : p.friend ? formatDistance(p.distM) : t("about {d}", { d: formatDistance(p.distM) })}</span>
    </button>
  );
}

export function OnlineSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Online | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api<Online>("/api/online")
        .then((d) => live && (setData(d), setError(null)))
        .catch((e) => live && setError((e as Error).message));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  const friends = data?.players.filter((p) => p.friend) ?? [];
  const around = data?.players.filter((p) => !p.friend) ?? [];
  return (
    <Sheet title={`🟢 ${t("Online now")}`} onClose={onClose} tall>
      {error && <p className="small warn-text">{error}</p>}
      {!data ? (
        !error && <p className="small muted">{t("Loading…")}</p>
      ) : (
        <>
          <p className="online-total">{t("{n} players online", { n: fmtNum(data.total) })}</p>
          <h4 className="online-h">👥 {t("Friends online")}</h4>
          {friends.length ? friends.map((p) => <Row key={p.id} p={p} />) : <p className="small muted">{t("None of your friends is online right now.")}</p>}
          <h4 className="online-h">📍 {t("Around you")}</h4>
          {around.length ? around.map((p) => <Row key={p.id} p={p} />) : <p className="small muted">{t("No one else is playing within 5 km right now.")}</p>}
          <p className="small muted ext-source">{t("Players see only roughly where you are; friends see you exactly.")}</p>
        </>
      )}
    </Sheet>
  );
}
