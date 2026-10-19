"use client";
// Tutorials: a first-run guided tour that spotlights each part of the screen, and
// a short "how this works" card for every panel (auto-shown the first time, and
// any time from the ? button in the panel header).
import { useEffect, useLayoutEffect, useState } from "react";
import { msg, t } from "@/lib/i18n";
import { Button } from "@/components/Button";

// ---------------------------------------------------------------- per-panel help
// English text is the translation key (msg marks it; t() translates it where it's shown).
export const HELP: Record<string, { title: string; tips: [string, string][] }> = {
  nearby: {
    title: msg("Nearby"),
    tips: [
      ["🎯", msg("Everything around you, closest first: loot, chests, power cells, runs, bosses and players.")],
      ["📍", msg("Get inside the dashed circle around you to interact — walk there, or travel there if you play from home.")],
      ["✨", msg("Dawn and dusk are golden hours: double XP on spawns. Spawns refresh every 20 minutes.")],
    ],
  },
  base: {
    title: msg("Your base"),
    tips: [
      ["🏛️", msg("Pick a faction, then plant your base where you stand. Everything else grows from here.")],
      ["⚡", msg("Build a Power Plant and Supply Center first: power keeps things fast, supplies earn coins while you're away.")],
      ["🪖", msg("Train troops in the Army tab — they join one by one as each finishes. Army Camps add room.")],
      ["🗼", msg("Defense: towers shoot rivals and raiders near your base. Research makes everything stronger.")],
      ["💎", msg("Out of patience? Gems finish any timer instantly.")],
    ],
  },
  play: {
    title: msg("Play"),
    tips: [
      ["🏙️", msg("Empire: an idle tycoon. Buy businesses, tap them to earn, hire managers so they earn on their own — even while you're away.")],
      ["👟", msg("Every step you walk today boosts your empire's income, up to ×2 at 10,000 steps. Power cells 🔋 on the map double it for a while.")],
      ["📖", msg("Story: chapters played on real streets. A gold beacon on the map shows where to go next.")],
      ["🔍", msg("Some steps hide the target: search the gold circle and follow the hot/cold detector.")],
      ["🧭", msg("GPS games: treasure hunt, street sprint and checkpoint rally — quick rounds with rewards.")],
      ["🏆", msg("Goals: a world operation everyone shares, a faction goal and your own milestones. Claim them here.")],
      ["🎰", msg("Lottery: buy tickets at the 🎰 spot on the map. At the draw time one random ticket wins the whole pot.")],
    ],
  },
  market: {
    title: msg("Market"),
    tips: [
      ["🛍️", msg("Shops run by players at real places. Browse the ones around you, search, and catch the deals.")],
      ["🔒", msg("Buying holds your coins safely. Go to the shop, show your pickup code, and the seller hands it over.")],
      ["🏪", msg("Open your own shop in My shop: add products with photos, set prices and discounts, and fill your shop window.")],
      ["📅", msg("A shop stays open for a month at a time. Renew it before it closes to keep selling.")],
    ],
  },
  store: {
    title: msg("Gems"),
    tips: [
      ["📺", msg("Free gems: watch a short sponsor spot (a few per day).")],
      ["💎", msg("Gems rush timers, buy coins, heal you instantly and shield your base.")],
      ["🎁", msg("You also earn gems from levels, quests, achievements, goals and story chapters.")],
    ],
  },
  jobs: {
    title: msg("Jobs"),
    tips: [
      ["📦", msg("Real deliveries posted by players nearby. Accept one, pick it up, hand it over with the code.")],
      ["🚕", msg("Rides: request a car and set your fare, or drive a waiting rider. The rider tells the driver a 4-digit PIN at pickup.")],
      ["🏁", msg("The driver is paid when both of you reach the drop-off, or when the rider taps “I've arrived”.")],
      ["🪙", msg("Coins are held in escrow, so couriers and drivers always get paid — and you're refunded if nobody takes the job.")],
    ],
  },
  crew: {
    title: msg("Crew"),
    tips: [
      ["🤝", msg("Add friends to see them exactly on the map and defend each other's bases.")],
      ["💬", msg("Chat with your crew, nearby players or everyone.")],
      ["📣", msg("Use the 📣 button on the map to ping your crew: attack, help, rally or loot.")],
    ],
  },
  events: {
    title: msg("Events"),
    tips: [
      ["🎉", msg("Meet-ups at real places. Join, show up, check in for rewards.")],
      ["⭐", msg("Official events pay extra.")],
    ],
  },
  hero: {
    title: msg("Your hero"),
    tips: [
      ["🦸", msg("Pick a class, then spend points from every level on attributes.")],
      ["🎒", msg("Gear drops from chests, battles and quests — equip it, forge it, salvage what you don't need.")],
      ["📜", msg("Quests guide you through the game; Powers are special abilities bought with Command Points.")],
      ["⚙️", msg("Profile: change your name, language, play mode (walk or from home), sound and music, or replay the tutorial.")],
    ],
  },
  inbox: {
    title: msg("Inbox"),
    tips: [
      ["🔔", msg("Everything the game told you: rewards, raids on your base, crew news. Opening it clears the badge.")],
      ["✕", msg("Tap ✕ to dismiss one, or Clear all.")],
    ],
  },
};

const seenKey = (k: string) => `sq_help_${k}`;
export function helpSeen(k: string) {
  try {
    return localStorage.getItem(seenKey(k)) === "1";
  } catch {
    return true;
  }
}
export function markHelpSeen(k: string) {
  try {
    localStorage.setItem(seenKey(k), "1");
  } catch {}
}

export function HelpCard({ k, onClose }: { k: string; onClose: () => void }) {
  const h = HELP[k];
  if (!h) return null;
  return (
    <div className="help-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>💡 {t("{title}: how it works", { title: t(h.title) })}</b>
      </div>
      {h.tips.map(([ic, tip]) => (
        <div key={tip} className="help-tip">
          <span>{ic}</span>
          <span>{t(tip)}</span>
        </div>
      ))}
      <Button className="btn yellow small" onClick={onClose}>{t("Got it")}</Button>
    </div>
  );
}

// ---------------------------------------------------------------- first-run tour
export type TourStep = { target?: string; title: string; body: string; emoji?: string };
export const TOUR_KEY = "sq_tour_v2";

export const TOUR: TourStep[] = [
  { emoji: "👋", title: msg("Welcome, commander!"), body: msg("Your real city is the game map. Collect loot, build a base, raise an army and team up with players around you. This quick tour shows you around.") },
  { target: ".player-card", title: msg("This is you"), body: msg("Your level and XP. Tap it any time to open your hero: stats, gear, quests and settings.") },
  { target: ".needs-hud", title: msg("Keep your commander happy"), body: msg("Hunger, energy, social and fun drain over time. A happy commander earns more XP — eat, rest at your base and hang out with players.") },
  { target: "[data-tour=wallet]", title: msg("Coins & gems"), body: msg("Coins build and train. Gems speed things up — tap the green + for the store and free gems.") },
  { target: ".me-wrap", title: msg("Your reach"), body: msg("The dashed circle is your reach. Things inside it can be collected or played — tap any icon on the map to see what it is.") },
  { target: "[data-tour=nav-nearby]", title: msg("Nearby"), body: msg("Everything around you in one list, closest first.") },
  { target: "[data-tour=nav-base]", title: msg("Base"), body: msg("Plant your base, build, train troops and defend it. Start here after the tour!") },
  { target: "[data-tour=nav-play]", title: msg("Play"), body: msg("Your Street Empire idle game, story missions, GPS games and weekly goals with big rewards.") },
  { target: "[data-tour=steps]", title: msg("Every step counts"), body: msg("Your steps today. Walking boosts your Street Empire's income up to ×2, and banked steps buy instant Step Rushes.") },
  { target: "[data-tour=nav-market]", title: msg("Market"), body: msg("Shops run by players around you — buy with coins, or open your own shop and sell.") },
  { target: "[data-tour=nav-crew]", title: msg("Crew"), body: msg("Friends, chat and teamwork. Red badges on these buttons mean something new — tap to see it and they clear.") },
  { target: "[data-tour=inbox]", title: msg("Inbox"), body: msg("Every reward, raid alert and message lands here.") },
  { emoji: "🚶", title: msg("How do you want to play?"), body: msg("Walk the real streets with GPS for full rewards, or play from home: tap the map and your commander travels there, for reduced rewards. You can switch any time in Hero → Profile.") },
];

export function Tour({ onDone, onChooseHome }: { onDone: () => void; onChooseHome?: (home: boolean) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setInterval(measure, 500); // the map can move under us
    return () => {
      window.removeEventListener("resize", measure);
      clearInterval(t);
    };
  }, [i, step.target]);

  useEffect(() => {
    // "Forward" is the reading direction: → in English, ← in Persian.
    const rtl = document.documentElement.dir === "rtl";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === (rtl ? "ArrowLeft" : "ArrowRight") && !last) setI(i + 1);
      if (e.key === (rtl ? "ArrowRight" : "ArrowLeft") && i > 0) setI(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, last, onDone]);

  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  // Put the card below the target if there's room, else above; centred when no target.
  const cardW = Math.min(340, vw - 24);
  const below = rect ? rect.bottom + 170 < vh : true;
  const cardStyle: React.CSSProperties = rect
    ? {
        left: Math.min(vw - cardW - 12, Math.max(12, rect.left + rect.width / 2 - cardW / 2)),
        ...(below ? { top: rect.bottom + pad + 10 } : { bottom: vh - rect.top + pad + 10 }),
        width: cardW,
      }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cardW };

  return (
    <div className="tour" role="dialog" aria-label={t("Tutorial")}>
      {rect ? (
        <div className="tour-hole" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle} key={i}>
        {step.emoji && <div className="tour-emoji">{step.emoji}</div>}
        <b className="tour-title">{t(step.title)}</b>
        <p>{t(step.body)}</p>
        <div className="tour-dots">{TOUR.map((_, j) => <i key={j} className={j === i ? "on" : j < i ? "done" : ""} />)}</div>
        {last && onChooseHome ? (
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <Button className="btn green" onClick={() => (onChooseHome(false), onDone())}>🚶 {t("I'll walk")}</Button>
            <Button className="btn cyan" onClick={() => (onChooseHome(true), onDone())}>🛋️ {t("Play from home")}</Button>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Button className="btn ghost small" onClick={onDone}>{t("Skip")}</Button>
            <div className="row">
              {i > 0 && <Button className="btn ghost small" onClick={() => setI(i - 1)}>{t("Back")}</Button>}
              <Button className="btn yellow small" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? t("Let's go!") : t("Next")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
