"use client";
// Lotteries at real places: buy tickets on the spot, one random ticket takes the pot at the draw.
import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
import { fmtNum, t, toAsciiDigits } from "@/lib/i18n";
import { LOTTERY_MAX_TICKETS, LOTTERY_MIN_PRICE, LOTTERY_RADIUS_M, winChance } from "@/lib/lottery";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import { api, fmtTime, type LatLng, type WorldLottery } from "./client";
import { GoTo, LocationField } from "./Panels";
import { MoveIcon, useGame } from "./ui";

/** Ticks every second while mounted (countdowns). */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function fmtCountdown(ms: number) {
  if (ms <= 0) return t("now");
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return t("{d}d {h}h", { d, h });
  if (h) return t("{h}h {m}m", { h, m });
  return `${fmtNum(m)}:${fmtNum(s % 60).padStart(2, fmtNum(0))}`;
}

/** Everything about one lottery, plus the buy controls. Used on the map card and in the list. */
export function LotteryCard({ l, onChanged }: { l: WorldLottery; onChanged?: () => void }) {
  const { pos, act, me, refresh, teleport } = useGame();
  const now = useNow();
  const [qty, setQty] = useState(1);
  const left = l.drawAt - now;
  const open = l.status === "OPEN" && left > 0;
  const dist = pos ? distanceM(pos, l) : Infinity;
  const here = dist <= l.radiusM;
  const canBuy = Math.max(0, l.maxTickets - l.myTickets);
  const n = Math.min(qty, Math.max(1, canBuy));
  const cost = n * l.ticketPrice;
  // With the new tickets in, what would my odds be?
  const after = winChance(l.myTickets + n, l.totalTickets + n);

  // The draw happens on the server the first time anyone looks after drawAt: nudge a reload.
  const due = l.status === "OPEN" && left <= 0;
  const asked = useRef(false);
  useEffect(() => {
    if (!due || asked.current) return;
    asked.current = true;
    const timer = setTimeout(() => (refresh(), onChanged?.()), 1500);
    return () => clearTimeout(timer);
  }, [due, refresh, onChanged]);

  const buy = () =>
    act(() => api(`/api/lotteries/${l.id}`, { body: { action: "buy", qty: n } })).then((ok) => {
      if (ok) {
        setQty(1);
        onChanged?.();
      }
    });
  const cancel = () =>
    askConfirm(t("Cancel this lottery?"), { body: t("Only possible while nobody else has bought tickets."), ok: t("Cancel lottery"), danger: true }).then(
      (ok) => ok && act(() => api(`/api/lotteries/${l.id}`, { body: { action: "cancel" } })).then((done) => done && onChanged?.()),
    );

  return (
    <div className={`lottery ${l.won ? "won" : ""}`}>
      <div className="lottery-pot">
        <span className="small muted">{l.status === "DRAWN" ? t("POT PAID OUT") : t("JACKPOT")}</span>
        <b>{fmtNum(l.pot)} 🪙</b>
      </div>
      <div className="grid3">
        <div className="stat"><b>{fmtNum(l.ticketPrice)}</b><span>{t("🪙 / ticket")}</span></div>
        <div className="stat"><b>{fmtNum(l.players)}</b><span>{t("players")}</span></div>
        <div className="stat"><b className={open && left < 60_000 ? "blink" : ""}>{open ? fmtCountdown(left) : l.status === "OPEN" ? "…" : t("done")}</b><span>{open ? t("until draw") : t("draw")}</span></div>
      </div>
      <p className="small muted" style={{ margin: "8px 0" }}>
        {t("Draw {when}", { when: fmtTime(l.drawAt) })} · {l.mine ? t("hosted by you") : t("hosted by {name}", { name: l.host })}{l.official ? ` · ${t("⭐ official")}` : ""} · {t("{d} away", { d: formatDistance(dist === Infinity ? 0 : dist) })}
      </p>

      {l.myTickets > 0 && (
        <div className="card small">
          {t("🎟️ You hold {mine} of {total} tickets · {pct}% chance", { mine: l.myTickets, total: l.totalTickets, pct: Math.round(winChance(l.myTickets, l.totalTickets) * 100) })}
        </div>
      )}

      {l.status === "DRAWN" && (
        <div className={`card ${l.won ? "hl" : ""}`} style={{ textAlign: "center" }}>
          {l.won ? <b style={{ fontSize: 18 }}>{t("🎉 YOU WON {n} 🪙!", { n: l.pot })}</b> : <>{t("🏆 Winner:")} <b dir="auto">{l.winner}</b></>}
        </div>
      )}
      {l.status === "REFUNDED" && <div className="card small">{t("Called off — every ticket was refunded.")}</div>}
      {l.status === "OPEN" && left <= 0 && <div className="card small">{t("🎲 Drawing the winner…")}</div>}

      {open && (
        <>
          {canBuy > 0 ? (
            <>
              <div className="row qty-row">
                <Button className="btn ghost small" disabled={n <= 1} onClick={() => setQty(n - 1)} aria-label={t("Fewer tickets")}>−</Button>
                <span className="qty">{t("{n, plural, one {# ticket} other {# tickets}}", { n })}</span>
                <Button className="btn ghost small" disabled={n >= canBuy} onClick={() => setQty(n + 1)} aria-label={t("More tickets")}>+</Button>
                <span className="grow small muted" style={{ textAlign: "end" }}>{t("→ {pct}% chance", { pct: Math.round(after * 100) })}</span>
              </div>
              {here ? (
                <Button className="btn yellow block" disabled={cost > me.coins} onClick={buy}>
                  {t("🎟️ Buy {n} · {cost} 🪙", { n, cost })}
                </Button>
              ) : teleport ? (
                <Button className="btn yellow block" onClick={() => teleport(l)}><MoveIcon /> {t("Go there to buy · {d}", { d: formatDistance(dist) })}</Button>
              ) : (
                <div className="row">
                  <Button className="btn grow" disabled>{t("Be within {r} m to buy · {d}", { r: l.radiusM, d: formatDistance(dist === Infinity ? 0 : dist) })}</Button>
                  <GoTo lat={l.lat} lng={l.lng} />
                </div>
              )}
              {cost > me.coins && here && <p className="small muted">{t("Not enough coins — you have {n}.", { n: me.coins })}</p>}
            </>
          ) : (
            <p className="small muted">{t("You've bought the maximum {n} tickets. Good luck!", { n: l.maxTickets })}</p>
          )}
          {l.mine && <Button className="btn ghost small" style={{ marginTop: 8 }} onClick={cancel}>{t("Cancel lottery")}</Button>}
        </>
      )}
    </div>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** The "Lottery" tab in the Play hub: nearby draws, the ones you're in, host your own. */
export function LotteryTab() {
  const { world, pos, act } = useGame();
  const [mine, setMine] = useState<WorldLottery[]>([]);
  const [hosting, setHosting] = useState(false);
  const [f, setF] = useState({ name: "", ticketPrice: 20, maxTickets: 10 });
  const [place, setPlace] = useState<LatLng | null>(null);
  const [drawAt, setDrawAt] = useState(() => toLocalInput(Date.now() + 3_600_000));

  const load = useCallback(() => api<{ lotteries: WorldLottery[] }>("/api/lotteries").then((r) => setMine(r.lotteries)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!place && pos) setPlace(pos);
  }, [pos, place]);

  const near = (world?.lotteries ?? []).filter((l) => l.status === "OPEN");
  const nearIds = new Set(near.map((l) => l.id));
  const other = mine.filter((l) => !nearIds.has(l.id));
  const byDist = (a: WorldLottery, b: WorldLottery) => (pos ? distanceM(pos, a) - distanceM(pos, b) : 0);

  const host = async () => {
    if (!place) return;
    const ok = await act(() => api("/api/lotteries", { body: { ...f, lat: place.lat, lng: place.lng, drawAt: new Date(drawAt).toISOString() } }));
    if (ok) {
      setHosting(false);
      setF({ name: "", ticketPrice: 20, maxTickets: 10 });
      load();
    }
  };
  const preset = (ms: number) => setDrawAt(toLocalInput(Date.now() + ms));

  return (
    <>
      <p className="small muted">{t("Go to a lottery spot, buy tickets, and at the draw time one random ticket wins the whole pot. More tickets, better odds.")}</p>

      {near.length ? (
        [...near].sort(byDist).map((l) => (
          <div key={l.id} className="card">
            <b dir="auto">🎰 {l.official ? "⭐ " : ""}{l.name}</b>
            <LotteryCard l={l} onChanged={load} />
          </div>
        ))
      ) : (
        <div className="empty">{t("No lotteries near you yet — host the first one!")}</div>
      )}

      {!!other.length && (
        <>
          <label>{t("Your lotteries")}</label>
          {other.map((l) => (
            <div key={l.id} className="card small">
              <div className="row">
                <b className="grow" dir="auto">🎰 {l.name}</b>
                <span className="tag">{l.status === "OPEN" ? fmtTime(l.drawAt) : l.status === "DRAWN" ? (l.won ? t("🎉 won") : `🏆 ${l.winner}`) : t("refunded")}</span>
              </div>
              <div className="muted">
                {t("Pot {n} 🪙", { n: l.pot })} · {t("{n, plural, one {# player} other {# players}}", { n: l.players })}{l.myTickets ? ` · ${t("your tickets: {mine}/{total}", { mine: l.myTickets, total: l.totalTickets })}` : ""} · <GoTo lat={l.lat} lng={l.lng} />
              </div>
            </div>
          ))}
        </>
      )}

      {!hosting ? (
        <Button className="btn cyan block" style={{ marginTop: 10 }} onClick={() => setHosting(true)}>{t("🎰 Host a lottery")}</Button>
      ) : (
        <div className="card" style={{ marginTop: 10 }}>
          <b>{t("Host a lottery")}</b>
          <label>{t("Name")}</label>
          <input value={f.name} maxLength={60} dir="auto" onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Friday Night Jackpot")} />
          <LocationField label={t("Where players buy tickets")} value={place} onChange={setPlace} />
          <div className="grid2">
            <div>
              <label>{t("Ticket price 🪙")}</label>
              <input type="number" inputMode="numeric" min={LOTTERY_MIN_PRICE} value={f.ticketPrice} onChange={(e) => setF({ ...f, ticketPrice: Math.floor(Number(toAsciiDigits(e.target.value)) || 0) })} />
            </div>
            <div>
              <label>{t("Max tickets / player")}</label>
              <input type="number" inputMode="numeric" min={1} max={LOTTERY_MAX_TICKETS} value={f.maxTickets} onChange={(e) => setF({ ...f, maxTickets: Math.floor(Number(toAsciiDigits(e.target.value)) || 0) })} />
            </div>
          </div>
          <label>{t("Draw time")}</label>
          <input type="datetime-local" value={drawAt} onChange={(e) => setDrawAt(e.target.value)} />
          <div className="row wrap" style={{ marginTop: 6 }}>
            {([[t("{n} min", { n: 30 }), 30 * 60_000], [t("{n} h", { n: 1 }), 3_600_000], [t("{n} h", { n: 3 }), 3 * 3_600_000], [t("1 day"), 86_400_000]] as const).map(([label, ms]) => (
              <Button key={ms} className="btn ghost small" onClick={() => preset(ms)}>+{label}</Button>
            ))}
          </div>
          <p className="small muted">{t("Players must stand within {r} m of the spot to buy. It needs at least 2 players, otherwise everyone is refunded. The winner takes everything.", { r: LOTTERY_RADIUS_M })}</p>
          <div className="row">
            <Button className="btn ghost" onClick={() => setHosting(false)}>{t("Cancel")}</Button>
            <Button className="btn yellow grow" disabled={!place || f.name.trim().length < 3 || f.ticketPrice < LOTTERY_MIN_PRICE || f.maxTickets < 1} onClick={host}>
              {t("Start lottery")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
