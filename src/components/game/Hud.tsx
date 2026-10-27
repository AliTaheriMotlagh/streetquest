"use client";
// HUD pieces: the wallet (counters that roll and catch flying rewards) and the Ready
// tray — one place under the profile card for everything waiting on you (daily drop,
// supplies, quests, goals, dividends, points to spend), instead of a button for each.
// With nothing waiting it shows the current quest.
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/Button";
import { api, type Me } from "./client";
import { useGame } from "./ui";
import { RollingNumber, celebrate } from "./Rewards";

export function Wallet({ me, onStore, onInbox, inbox }: { me: Me; onStore: () => void; onInbox: () => void; inbox: number }) {
  return (
    <div className="hud-wallet">
      <div className="chip coin-chip" data-fx-target="coin" title={t("Coins")}>
        🪙 <RollingNumber value={me.coins} kind="coin" />
      </div>
      <Button className="chip gem-chip" data-fx-target="gem" onClick={onStore} title={t("Gem store")}>
        💎 <RollingNumber value={me.gems} kind="gem" /> <span className="plus">+</span>
      </Button>
      <Button className={`chip bell-chip ${inbox ? "has-new" : ""}`} data-tour="inbox" title={t("Inbox")} aria-label={inbox ? t("Inbox, {n} new", { n: inbox }) : t("Inbox")} onClick={onInbox}>
        🔔{inbox > 0 && <span className="badge pop">{inbox > 99 ? "99+" : inbox}</span>}
      </Button>
    </div>
  );
}

type ReadyItem = { key: string; icon: string; title: string; sub?: string; go: () => unknown; claim?: boolean };

export type News = { title: string; ctaLabel: string | null; ctaUrl: string | null };

export function ReadyTray({ me, now, onQuest, hidden, news, onNewsSeen }: { me: Me; now: number; onQuest: () => void; hidden?: boolean; news?: News | null; onNewsSeen?: () => void }) {
  const { act, openLink } = useGame();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Tap anywhere else to fold it back.
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", off, true);
    return () => window.removeEventListener("pointerdown", off, true);
  }, [open]);

  const items: ReadyItem[] = [];
  if (me.dailyAvailable)
    items.push({
      key: "daily",
      icon: "🎁",
      title: t("Daily reward"),
      sub: t("Day {n} · +{coins} 🪙", { n: me.streak + 1, coins: me.dailyReward.coins }),
      claim: true,
      go: () =>
        act(() => api<{ message?: string }>("/api/daily", { body: {} }).then((r) => ({ ...r, message: undefined }))).then(
          (ok) => ok && celebrate({ title: t("Day {n} reward", { n: me.streak + 1 }), emoji: "🎁", rewards: me.dailyReward }),
        ),
    });
  if (me.baseAlert && me.baseAlert.supply >= 50)
    items.push({ key: "supply", icon: "📦", title: t("Supplies"), sub: t("+{n} 🪙 at your base", { n: me.baseAlert.supply }), claim: true, go: () => act(() => api("/api/base", { body: { action: "collect" } })) });
  if (me.questsReady) items.push({ key: "quests", icon: "📜", title: t("{n, plural, one {# quest to claim} other {# quests to claim}}", { n: me.questsReady }), go: () => openLink("me:quests") });
  if (me.goalsReady) items.push({ key: "goals", icon: "🏆", title: t("{n, plural, one {# goal reward} other {# goal rewards}}", { n: me.goalsReady }), go: () => openLink("play") });
  if (me.empire && me.empire.rank >= 1 && me.empire.dividendAt <= now) items.push({ key: "dividend", icon: "🏦", title: t("Empire dividend"), sub: t("Play → Empire"), go: () => openLink("play") });
  if (me.empire?.rankUp) items.push({ key: "rank", icon: "👑", title: t("Empire rank reward"), sub: t("Play → Empire"), go: () => openLink("play") });
  if (me.freePoints) items.push({ key: "points", icon: "💪", title: t("{n, plural, one {# attribute point} other {# attribute points}}", { n: me.freePoints }), sub: t("Spend them in Hero"), go: () => openLink("me:hero") });
  if (me.shop?.pending) items.push({ key: "orders", icon: "🛍️", title: t("{n, plural, one {# order to hand over} other {# orders to hand over}}", { n: me.shop.pending }), go: () => openLink("market") });
  // An admin announcement rides along as the last item; opening it follows its link.
  if (news)
    items.push({
      key: "news",
      icon: "📣",
      title: news.title,
      sub: news.ctaLabel ?? t("Tap to dismiss"),
      go: () => {
        onNewsSeen?.();
        if (news.ctaUrl) location.href = news.ctaUrl;
      },
    });

  if (hidden) return null;
  if (!items.length) {
    if (!me.quest) return null;
    return (
      <Button className={`ready-tray quest ${me.quest.done ? "done" : ""}`} onClick={onQuest}>
        <span className="rt-ic">📜</span>
        <span className="rt-txt">
          <b>{t(me.quest.title)}</b>
          <span className="rt-sub">{me.quest.done ? t("Claim reward!") : t("{progress}/{target}", { progress: me.quest.progress, target: me.quest.target })}</span>
        </span>
        {!me.quest.done && (
          <span className="rt-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (100 * me.quest.progress) / Math.max(1, me.quest.target))}%` }} />
          </span>
        )}
      </Button>
    );
  }
  const first = items[0];
  return (
    <div className={`ready-wrap ${open ? "open" : ""}`} ref={box}>
      <Button className="ready-tray has-items" onClick={() => setOpen(!open)} aria-expanded={open} title={t("Ready for you")}>
        <span className="rt-ic">{first.icon}</span>
        <span className="rt-txt">
          <b>{first.title}</b>
          {items.length > 1 ? <span className="rt-sub">{t("+{n} more ready", { n: items.length - 1 })}</span> : first.sub && <span className="rt-sub">{first.sub}</span>}
        </span>
        <span className="rt-count">{items.length}</span>
      </Button>
      {open && (
        <div className="ready-list" role="menu">
          <div className="rl-head">{t("Ready for you")}</div>
          {items.map((i) => (
            <Button
              key={i.key}
              role="menuitem"
              className="rl-item"
              onClick={async () => {
                if (!i.claim) setOpen(false);
                await i.go();
              }}
            >
              <span className="rl-ic">{i.icon}</span>
              <span className="rt-txt">
                <b>{i.title}</b>
                {i.sub && <span className="rt-sub">{i.sub}</span>}
              </span>
              <span className={`rl-cta ${i.claim ? "claim" : ""}`}>{i.claim ? t("Claim") : "›"}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
