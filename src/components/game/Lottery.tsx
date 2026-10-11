"use client";
// Lotteries at real places: buy tickets on the spot, one random ticket takes the pot at the draw.
import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM, formatDistance } from "@/lib/geo";
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function fmtCountdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
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
    const t = setTimeout(() => (refresh(), onChanged?.()), 1500);
    return () => clearTimeout(t);
  }, [due, refresh, onChanged]);

  const buy = () =>
    act(() => api(`/api/lotteries/${l.id}`, { body: { action: "buy", qty: n } })).then((ok) => {
      if (ok) {
        setQty(1);
        onChanged?.();
      }
    });
  const cancel = () =>
    askConfirm("Cancel this lottery?", { body: "Only possible while nobody else has bought tickets.", ok: "Cancel lottery", danger: true }).then(
      (ok) => ok && act(() => api(`/api/lotteries/${l.id}`, { body: { action: "cancel" } })).then((done) => done && onChanged?.()),
    );

  return (
    <div className={`lottery ${l.won ? "won" : ""}`}>
      <div className="lottery-pot">
        <span className="small muted">{l.status === "DRAWN" ? "POT PAID OUT" : "JACKPOT"}</span>
        <b>{l.pot.toLocaleString()} 🪙</b>
      </div>
      <div className="grid3">
        <div className="stat"><b>{l.ticketPrice}</b><span>🪙 / ticket</span></div>
        <div className="stat"><b>{l.players}</b><span>players</span></div>
        <div className="stat"><b className={open && left < 60_000 ? "blink" : ""}>{open ? fmtCountdown(left) : l.status === "OPEN" ? "…" : "done"}</b><span>{open ? "until draw" : "draw"}</span></div>
      </div>
      <p className="small muted" style={{ margin: "8px 0" }}>
        Draw {fmtTime(l.drawAt)} · hosted by {l.mine ? "you" : l.host}{l.official ? " · ⭐ official" : ""} · {formatDistance(dist === Infinity ? 0 : dist)} away
      </p>

      {l.myTickets > 0 && (
        <div className="card small">
          🎟️ You hold <b>{l.myTickets}</b> of {l.totalTickets} tickets · <b>{Math.round(winChance(l.myTickets, l.totalTickets) * 100)}%</b> chance
        </div>
      )}

      {l.status === "DRAWN" && (
        <div className={`card ${l.won ? "hl" : ""}`} style={{ textAlign: "center" }}>
          {l.won ? <b style={{ fontSize: 18 }}>🎉 YOU WON {l.pot.toLocaleString()} 🪙!</b> : <>🏆 Winner: <b>{l.winner}</b></>}
        </div>
      )}
      {l.status === "REFUNDED" && <div className="card small">Called off — every ticket was refunded.</div>}
      {l.status === "OPEN" && left <= 0 && <div className="card small">🎲 Drawing the winner…</div>}

      {open && (
        <>
          {canBuy > 0 ? (
            <>
              <div className="row qty-row">
                <Button className="btn ghost small" disabled={n <= 1} onClick={() => setQty(n - 1)} aria-label="Fewer tickets">−</Button>
                <span className="qty"><b>{n}</b> ticket{n > 1 ? "s" : ""}</span>
                <Button className="btn ghost small" disabled={n >= canBuy} onClick={() => setQty(n + 1)} aria-label="More tickets">+</Button>
                <span className="grow small muted" style={{ textAlign: "right" }}>→ {Math.round(after * 100)}% chance</span>
              </div>
              {here ? (
                <Button className="btn yellow block" disabled={cost > me.coins} onClick={buy}>
                  🎟️ Buy {n} · {cost.toLocaleString()} 🪙
                </Button>
              ) : teleport ? (
                <Button className="btn yellow block" onClick={() => teleport(l)}><MoveIcon /> Go there to buy · {formatDistance(dist)}</Button>
              ) : (
                <div className="row">
                  <Button className="btn grow" disabled>Be within {l.radiusM} m to buy · {formatDistance(dist === Infinity ? 0 : dist)}</Button>
                  <GoTo lat={l.lat} lng={l.lng} />
                </div>
              )}
              {cost > me.coins && here && <p className="small muted">Not enough coins — you have {me.coins}.</p>}
            </>
          ) : (
            <p className="small muted">You&apos;ve bought the maximum {l.maxTickets} tickets. Good luck!</p>
          )}
          {l.mine && <Button className="btn ghost small" style={{ marginTop: 8 }} onClick={cancel}>Cancel lottery</Button>}
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
      <p className="small muted">
        Go to a lottery spot, buy tickets, and at the draw time one random ticket wins <b>the whole pot</b>. More tickets, better odds.
      </p>

      {near.length ? (
        [...near].sort(byDist).map((l) => (
          <div key={l.id} className="card">
            <b>🎰 {l.official ? "⭐ " : ""}{l.name}</b>
            <LotteryCard l={l} onChanged={load} />
          </div>
        ))
      ) : (
        <div className="empty">No lotteries near you yet — host the first one!</div>
      )}

      {!!other.length && (
        <>
          <label>Your lotteries</label>
          {other.map((l) => (
            <div key={l.id} className="card small">
              <div className="row">
                <b className="grow">🎰 {l.name}</b>
                <span className="tag">{l.status === "OPEN" ? fmtTime(l.drawAt) : l.status === "DRAWN" ? (l.won ? "🎉 won" : `🏆 ${l.winner}`) : "refunded"}</span>
              </div>
              <div className="muted">
                Pot {l.pot.toLocaleString()} 🪙 · {l.players} players{l.myTickets ? ` · your tickets: ${l.myTickets}/${l.totalTickets}` : ""} · <GoTo lat={l.lat} lng={l.lng} />
              </div>
            </div>
          ))}
        </>
      )}

      {!hosting ? (
        <Button className="btn cyan block" style={{ marginTop: 10 }} onClick={() => setHosting(true)}>🎰 Host a lottery</Button>
      ) : (
        <div className="card" style={{ marginTop: 10 }}>
          <b>Host a lottery</b>
          <label>Name</label>
          <input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Friday Night Jackpot" />
          <LocationField label="Where players buy tickets" value={place} onChange={setPlace} />
          <div className="grid2">
            <div>
              <label>Ticket price 🪙</label>
              <input type="number" min={LOTTERY_MIN_PRICE} value={f.ticketPrice} onChange={(e) => setF({ ...f, ticketPrice: Math.floor(Number(e.target.value) || 0) })} />
            </div>
            <div>
              <label>Max tickets / player</label>
              <input type="number" min={1} max={LOTTERY_MAX_TICKETS} value={f.maxTickets} onChange={(e) => setF({ ...f, maxTickets: Math.floor(Number(e.target.value) || 0) })} />
            </div>
          </div>
          <label>Draw time</label>
          <input type="datetime-local" value={drawAt} onChange={(e) => setDrawAt(e.target.value)} />
          <div className="row wrap" style={{ marginTop: 6 }}>
            {([["30 min", 30 * 60_000], ["1 h", 3_600_000], ["3 h", 3 * 3_600_000], ["1 day", 86_400_000]] as const).map(([label, ms]) => (
              <Button key={label} className="btn ghost small" onClick={() => preset(ms)}>+{label}</Button>
            ))}
          </div>
          <p className="small muted">
            Players must stand within {LOTTERY_RADIUS_M} m of the spot to buy. It needs at least 2 players, otherwise everyone is refunded. The winner takes everything.
          </p>
          <div className="row">
            <Button className="btn ghost" onClick={() => setHosting(false)}>Cancel</Button>
            <Button className="btn yellow grow" disabled={!place || f.name.trim().length < 3 || f.ticketPrice < LOTTERY_MIN_PRICE || f.maxTickets < 1} onClick={host}>
              Start lottery
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
