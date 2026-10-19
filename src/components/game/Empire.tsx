"use client";
// Street Empire — the idle tycoon screen. The server settles and validates everything;
// this screen runs the same maths (lib/idle) between syncs so the cash counter, the
// production bars and the "+cash" pops move smoothly, and applies taps instantly
// (the server's answer then replaces the guess).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import {
  BIZ_BY_KEY,
  bigNum,
  boostNow,
  buyCost,
  BUSINESSES,
  cycleRevenue,
  cycleSecs,
  DIVIDEND_H,
  fameMult,
  maxAffordable,
  nextMilestone,
  offlineHours,
  rankAt,
  rankReward,
  RUSH_MINUTES,
  RUSH_STEPS,
  settle,
  STEP_GOAL,
  stepMult,
  UPGRADES,
  type EmpireState,
} from "@/lib/idle";
import { Art } from "@/components/art/Art";
import { Button } from "@/components/Button";
import { askConfirm } from "@/components/Dialogs";
import { api } from "./client";
import { sfx } from "./sfx";
import { burst, celebrate } from "./Play";
import { useGame } from "./ui";
import { useSteps, type StepStatus } from "./steps";

type View = {
  state: EmpireState;
  now: number;
  stepsToday: number;
  stepBank: number;
  perSec: number;
  fullPerSec: number;
  fameGain: number;
  rank: number;
  rankClaimed: number;
  dividend: { coins: number; readyAt: number };
  prestiges: number;
  offline?: { earned: number; seconds: number } | null;
  message?: string;
};

const BUY_STEPS = [1, 10, 100, -1] as const;
const fa = () => getLocale() === "fa";
/** Idle-game number: 1.23M (۱٫۲۳ میلیون). */
export const money = (n: number) => bigNum(n, fa(), (x, o) => fmtNum(x, undefined, o));
const clock = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  if (s >= 3600) return t("{h}h {m}m", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  if (s >= 60) return `${fmtNum(Math.floor(s / 60))}:${fmtNum(s % 60, undefined, { minimumIntegerDigits: 2 })}`;
  return t("{n}s", { n: s });
};

export function EmpireTab() {
  const { toast, refresh: refreshMe } = useGame();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [buyN, setBuyN] = useState<(typeof BUY_STEPS)[number]>(1);
  const [welcome, setWelcome] = useState<View["offline"]>(null);
  const [pops, setPops] = useState<{ id: number; biz: string; text: string }[]>([]);
  const [, setFrame] = useState(0);
  const skew = useRef(0); // server clock − local clock
  const busy = useRef(0);
  const steps = useSteps();

  const apply = useCallback((r: View) => {
    skew.current = r.now - Date.now();
    setV(r);
  }, []);
  const load = useCallback(
    () =>
      api<View>("/api/empire")
        .then((r) => {
          apply(r);
          if (r.offline && r.offline.earned > 0) setWelcome(r.offline);
          setErr(null);
        })
        .catch((e) => setErr((e as Error).message)),
    [apply],
  );
  useEffect(() => {
    void load();
    const t1 = setInterval(() => busy.current === 0 && void load(), 20_000);
    const t2 = setInterval(() => setFrame((f) => f + 1), 100);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [load]);

  const now = Date.now() + skew.current;
  const mods = { now, stepsToday: v?.stepsToday ?? 0 };
  // What the empire looks like this very moment.
  const live = useMemo(() => (v ? settle(v.state, mods).s : null), [v, Math.floor(now / 100)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual cycles finishing: a coin sound and a "+cash" pop over the business.
  const ran = useRef(new Map<string, number>());
  useEffect(() => {
    if (!v || !live) return;
    for (const b of BUSINESSES) {
      const at = v.state.biz[b.key]?.at;
      if (at == null || v.state.biz[b.key]?.mgr) continue;
      const done = at + cycleSecs(v.state, b.key) * 1000;
      if (now >= done && ran.current.get(b.key) !== at) {
        ran.current.set(b.key, at);
        sfx("coin");
        pop(b.key, `+${money(cycleRevenue(v.state, b.key, mods) * boostNow(v.state, done))}`);
      }
    }
  });
  const pop = (biz: string, text: string) => {
    const id = Math.random();
    setPops((p) => [...p.slice(-6), { id, biz, text }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100);
  };

  /** Send an action: show the guess now, then the server's truth. */
  const send = useCallback(
    async (body: Record<string, unknown>, guess?: (s: EmpireState) => void) => {
      if (v && guess && live) {
        const s = structuredClone(live);
        guess(s);
        setV({ ...v, state: { ...s, tickAt: Date.now() + skew.current } });
      }
      busy.current++;
      try {
        const r = await api<View>("/api/empire", { body });
        apply(r);
        if (r.message) toast({ kind: "reward", title: r.message });
        return true;
      } catch (e) {
        toast({ kind: "error", title: (e as Error).message });
        sfx("error");
        void load();
        return false;
      } finally {
        busy.current--;
      }
    },
    [v, live, apply, toast, load],
  );

  if (!v || !live)
    return (
      <div className="empty">
        {err ? (
          <>
            {err} <Button className="btn small" onClick={() => void load()}>{t("Retry")}</Button>
          </>
        ) : (
          t("Opening your empire…")
        )}
      </div>
    );

  const s = live;
  const boost = boostNow(s, now);
  const sMult = stepMult(v.stepsToday);
  const owned = BUSINESSES.filter((b) => (s.biz[b.key]?.n ?? 0) > 0);
  const nextLocked = BUSINESSES.find((b) => !(s.biz[b.key]?.n ?? 0));
  const shown = nextLocked ? [...owned, nextLocked] : owned;
  const upgrades = UPGRADES.filter((u) => !s.upg.includes(u.id) && (u.kind !== "biz" || (s.biz[u.biz!]?.n ?? 0) > 0)).slice(0, 4);
  const divReady = v.rank >= 1 && now >= v.dividend.readyAt;

  const buy = (key: string) => {
    const def = BIZ_BY_KEY[key];
    const n = s.biz[key]?.n ?? 0;
    const count = buyN > 0 ? buyN : maxAffordable(def, n, s.cash);
    if (count < 1 || buyCost(def, n, count) > s.cash) return sfx("error");
    const before = nextMilestone(n);
    sfx("reward");
    navigator.vibrate?.(15);
    if (before && n + count >= before.at) {
      sfx("levelup");
      pop(key, before.kind === "speed" ? t("SPEED ×2!") : t("PROFIT ×2!"));
    }
    void send({ action: "buy", biz: key, count: buyN }, (x) => {
      x.cash -= buyCost(def, n, count);
      x.biz[key] = { ...(x.biz[key] ?? { at: null }), n: n + count };
    });
  };
  const run = (key: string) => {
    const st = s.biz[key];
    if (!st?.n || st.mgr || st.at != null) return;
    sfx("tap");
    navigator.vibrate?.(10);
    void send({ action: "run", biz: key }, (x) => {
      x.biz[key] = { ...x.biz[key], at: Date.now() + skew.current };
    });
  };
  const hire = (key: string) => {
    const def = BIZ_BY_KEY[key];
    sfx("win");
    void send({ action: "hire", biz: key }, (x) => {
      x.cash -= def.manager;
      x.biz[key] = { ...x.biz[key], mgr: true, at: null };
    }).then((ok) => ok && burst("💵", 8));
  };

  return (
    <div className="empire">
      {/* ---- the money */}
      <div className="emp-hero">
        <div className="emp-sky" aria-hidden="true" />
        <div className="emp-cash">
          <Art k="cash" size={40} anim="float" />
          <b>{money(s.cash)}</b>
        </div>
        <div className="emp-rate">
          {v.perSec > 0 ? t("+{n} per second", { n: money(v.perSec * boost) }) : t("Tap a business to run it — hire a manager to automate it")}
        </div>
        <div className="emp-mults">
          <span className="pill" title={t("Steps walked today boost income, up to ×2 at {n}", { n: STEP_GOAL })}>
            <Art k="sneaker" /> ×{fmtNum(Math.round(sMult * 100) / 100)}
          </span>
          {s.fame > 0 && (
            <span className="pill">
              <Art k="fame" /> ×{fmtNum(Math.round(fameMult(s.fame) * 100) / 100)}
            </span>
          )}
          {boost > 1 && (
            <span className="pill hot">
              <Art k="bolt" anim="pulse" /> ×2 · {clock((s.boostUntil - now) / 1000)}
            </span>
          )}
          <span className="pill" title={t("Managers keep earning while you're away, up to this long")}>
            <Art k="vault" /> {t("{n}h offline", { n: offlineHours(s) })}
          </span>
        </div>
      </div>

      <StepsCard today={steps.today || v.stepsToday} bank={v.stepBank} status={steps.status} onEnable={steps.enable} canRush={v.stepBank >= RUSH_STEPS && v.fullPerSec > 0} rushGain={v.fullPerSec * RUSH_MINUTES * 60} onRush={() => send({ action: "rush" }).then((ok) => ok && (burst("💵", 12), sfx("levelup")))} />

      {/* ---- buy amount */}
      <div className="emp-buybar" role="radiogroup" aria-label={t("How many to buy")}>
        {BUY_STEPS.map((n) => (
          <button key={n} role="radio" aria-checked={buyN === n} className={buyN === n ? "on" : ""} onClick={() => setBuyN(n)}>
            {n > 0 ? `×${fmtNum(n)}` : t("MAX")}
          </button>
        ))}
      </div>

      {/* ---- businesses */}
      <div className="emp-list">
        {shown.map((b) => {
          const st = s.biz[b.key] ?? { n: 0, at: null };
          const locked = st.n === 0;
          const count = buyN > 0 ? buyN : Math.max(1, maxAffordable(b, st.n, s.cash));
          const cost = buyCost(b, st.n, count);
          const can = cost <= s.cash;
          const cyc = cycleSecs(s, b.key);
          const rev = cycleRevenue(s, b.key, mods) * boost;
          const running = st.at != null;
          const pct = st.mgr ? ((now / 1000) % cyc) / cyc : running ? Math.min(1, (now - st.at!) / 1000 / cyc) : 0;
          const ms = nextMilestone(st.n);
          const prevAt = ms ? [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900].filter((x) => x < ms.at).pop() ?? 0 : 0;
          const idle = !locked && !st.mgr && !running;
          return (
            <div key={b.key} className={`biz ${locked ? "locked" : ""} ${st.mgr ? "auto" : ""} ${idle ? "idle" : ""}`}>
              <button className="biz-art" onClick={() => run(b.key)} disabled={locked || st.mgr} aria-label={idle ? t("Run {name}", { name: t(b.name) }) : t(b.name)}>
                <Art k={b.art} size={58} className={idle ? "anim-bounce" : st.mgr ? "anim-float" : ""} />
                {!locked && <span className="biz-n">{fmtNum(st.n)}</span>}
                {idle && <span className="biz-tap">{t("TAP")}</span>}
                {pops.filter((p) => p.biz === b.key).map((p) => (
                  <span key={p.id} className="biz-pop">{p.text}</span>
                ))}
              </button>
              <div className="biz-main">
                <div className="biz-top">
                  <b>{t(b.name)}</b>
                  {st.mgr && <span className="biz-mgr" title={t(b.mgrName)}><Art k="manager" /> {t("AUTO")}</span>}
                </div>
                {locked ? (
                  <div className="small muted">{t("Earns {n} every {t}", { n: money(BIZ_BY_KEY[b.key].rev), t: clock(b.secs) })}</div>
                ) : (
                  <>
                    <div className={`biz-bar ${cyc < 0.6 && (st.mgr || running) ? "blur" : ""}`}>
                      <i style={{ width: `${pct * 100}%` }} />
                      <span>{money(rev)}</span>
                      <em>{st.mgr || running ? clock(cyc - pct * cyc) : clock(cyc)}</em>
                    </div>
                    {ms && (
                      <div className="biz-ms" title={ms.kind === "speed" ? t("Speed ×2 at {n}", { n: ms.at }) : t("Profit ×2 at {n}", { n: ms.at })}>
                        <i style={{ width: `${Math.min(100, ((st.n - prevAt) / (ms.at - prevAt)) * 100)}%` }} />
                        <span>{ms.kind === "speed" ? t("{n} → speed ×2", { n: fmtNum(ms.at) }) : t("{n} → profit ×2", { n: fmtNum(ms.at) })}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="biz-actions">
                  <Button className={`btn small ${can ? "green" : "ghost"} grow`} disabled={!can} onClick={() => buy(b.key)}>
                    {locked ? t("Unlock") : t("Buy ×{n}", { n: fmtNum(count) })} · <Art k="cash" /> {money(cost)}
                  </Button>
                  {!locked && !st.mgr && (
                    <Button className={`btn small ${s.cash >= b.manager ? "yellow" : "ghost"}`} disabled={s.cash < b.manager} onClick={() => hire(b.key)} title={t("Hire {name} to run it for you", { name: t(b.mgrName) })}>
                      <Art k="manager" /> {money(b.manager)}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- upgrades */}
      {upgrades.length > 0 && (
        <>
          <h3 className="emp-h">{t("Upgrades")}</h3>
          <div className="emp-upgrades">
            {upgrades.map((u) => {
              const can = s.cash >= u.cost;
              const art = u.kind === "vault" ? "vault" : u.kind === "all" ? "chartUp" : BIZ_BY_KEY[u.biz!].art;
              return (
                <button key={u.id} className={`upg ${can ? "can" : ""}`} disabled={!can} onClick={() => (sfx("levelup"), void send({ action: "upgrade", id: u.id }))}>
                  <Art k={art} size={34} />
                  <span className="grow">
                    <b>{u.kind === "vault" ? t("Bigger vault") : u.kind === "all" ? t("Whole empire") : t(u.name)}</b>
                    <span className="small muted">{u.kind === "vault" ? t("+1h of offline earnings") : t("Profits ×{x}", { x: u.x })}</span>
                  </span>
                  <span className="upg-cost"><Art k="cash" /> {money(u.cost)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ---- rank, dividends, fame */}
      <div className="emp-cards">
        <div className="emp-card">
          <Art k="trophy" size={40} anim={v.rank > v.rankClaimed ? "bounce" : undefined} />
          <b>{t("Empire rank {n}", { n: v.rank })}</b>
          <span className="small muted">{t("Your empire ranks up as it grows — each rank pays coins and gems in the main game.")}</span>
          {v.rank > v.rankClaimed ? (
            <Button className="btn yellow small" onClick={() => send({ action: "rank" }).then((ok) => ok && (burst("🪙", 12), celebrate({ title: t("EMPIRE RANK {n}", { n: v.rank }), emoji: "🏆", body: t("+{n} 🪙", { n: rankReward(v.rank).coins }) })))}>{t("Claim rewards")}</Button>
          ) : (
            <span className="small">{t("Next at {n}", { n: money(rankAt(v.rank + 1)) })}</span>
          )}
        </div>
        <div className="emp-card">
          <Art k="moneybag" size={40} anim={divReady ? "wiggle" : undefined} />
          <b>{t("Dividend")}</b>
          <span className="small muted">{t("Your empire pays {n} 🪙 every {h} hours.", { n: v.dividend.coins, h: DIVIDEND_H })}</span>
          {divReady ? (
            <Button className="btn green small" onClick={() => send({ action: "dividend" }).then((ok) => ok && (burst("🪙", 10), refreshMe()))}>{t("Collect")}</Button>
          ) : (
            <span className="small">{v.rank < 1 ? t("Earn {n} to unlock", { n: money(1000) }) : t("Ready in {t}", { t: clock((v.dividend.readyAt - now) / 1000) })}</span>
          )}
        </div>
        <div className="emp-card fame">
          <Art k="fame" size={40} anim={v.fameGain > 0 ? "pulse" : undefined} />
          <b>{t("Fame ⭐ {n}", { n: s.fame })}</b>
          <span className="small muted">{t("Each fame star adds 2% to all income, forever. Cashing in restarts your businesses.")}</span>
          {v.fameGain > 0 ? (
            <Button
              className="btn small"
              onClick={() =>
                askConfirm(t("Cash in for {n} fame?", { n: v.fameGain }), {
                  body: t("Your businesses, managers, cash and upgrades start over. Fame, ranks and boosts stay — and every business earns {pct}% more.", { pct: Math.round((s.fame + v.fameGain) * 2) }),
                  ok: t("Cash in"),
                }).then((ok) => ok && send({ action: "prestige" }).then((done) => done && celebrate({ title: t("FAMOUS!"), body: t("+{n} fame stars", { n: v.fameGain }), emoji: "⭐" })))
              }
            >
              {t("Cash in +{n}", { n: v.fameGain })}
            </Button>
          ) : (
            <span className="small">{t("Earn more to gain fame")}</span>
          )}
        </div>
      </div>

      {welcome && (
        <div className="modal-bg" style={{ zIndex: 2600 }} onClick={() => setWelcome(null)}>
          <div className="modal emp-welcome">
            <Art k="coinStack" size={110} anim="pop" />
            <h2>{t("Welcome back, boss!")}</h2>
            <p className="muted">{t("While you were away for {t}, your managers earned", { t: clock(welcome.seconds) })}</p>
            <div className="emp-welcome-n"><Art k="cash" /> {money(welcome.earned)}</div>
            <Button className="btn yellow block" onClick={() => (setWelcome(null), sfx("coin"), burst("💵", 14))}>{t("Collect")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- steps
function StepsCard({ today, bank, status, onEnable, canRush, rushGain, onRush }: { today: number; bank: number; status: StepStatus; onEnable: () => void; canRush: boolean; rushGain: number; onRush: () => void }) {
  const pct = Math.min(1, today / STEP_GOAL);
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="steps-card">
      <div className="steps-ring" role="img" aria-label={t("{n} of {goal} steps today", { n: today, goal: STEP_GOAL })}>
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={R} className="track" />
          <circle cx="36" cy="36" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <Art k="sneaker" size={30} anim={status === "on" ? "bounce" : undefined} />
      </div>
      <div className="grow">
        <div className="steps-n">
          <b>{fmtNum(today)}</b> <span className="small muted">/ {fmtNum(STEP_GOAL)} {t("steps today")}</span>
        </div>
        <div className="small muted">{t("Every step boosts your income — up to ×2 at {n}.", { n: STEP_GOAL })}</div>
        {status === "needs-permission" && (
          <Button className="btn cyan small" onClick={onEnable}>{t("Count my steps")}</Button>
        )}
        {(status === "unsupported" || status === "denied") && <div className="small" style={{ color: "var(--yellow)" }}>{t("Steps come from GPS walking on this device.")}</div>}
      </div>
      <Button className={`btn small ${canRush ? "yellow" : "ghost"} steps-rush`} disabled={!canRush} onClick={onRush} title={t("Spend {n} walked steps for {m} minutes of income", { n: RUSH_STEPS, m: RUSH_MINUTES })}>
        <Art k="stepBoost" size={26} />
        <span>
          {t("Rush")} <small>{canRush ? `+${money(rushGain)}` : t("{n} / {goal}", { n: fmtNum(Math.min(bank, RUSH_STEPS)), goal: fmtNum(RUSH_STEPS) })}</small>
        </span>
      </Button>
    </div>
  );
}
