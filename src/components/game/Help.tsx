"use client";
// Tutorials: a first-run guided tour that spotlights each part of the screen, and
// a short "how this works" card for every panel (auto-shown the first time, and
// any time from the ? button in the panel header).
import { useEffect, useLayoutEffect, useState } from "react";

// ---------------------------------------------------------------- per-panel help
export const HELP: Record<string, { title: string; tips: [string, string][] }> = {
  nearby: {
    title: "Nearby",
    tips: [
      ["🎯", "Everything around you, closest first: loot, chests, arcades, runs, bosses and players."],
      ["📍", "Get inside the dashed circle around you to interact — walk there, or travel there if you play from home."],
      ["✨", "Dawn and dusk are golden hours: double XP on spawns. Spawns refresh every 20 minutes."],
    ],
  },
  base: {
    title: "Your base",
    tips: [
      ["🏛️", "Pick a faction, then plant your base where you stand. Everything else grows from here."],
      ["⚡", "Build a Power Plant and Supply Center first: power keeps things fast, supplies earn coins while you're away."],
      ["🪖", "Train troops in the Army tab — they join one by one as each finishes. Army Camps add room."],
      ["🗼", "Defense: towers shoot rivals and raiders near your base. Research makes everything stronger."],
      ["💎", "Out of patience? Gems finish any timer instantly."],
    ],
  },
  play: {
    title: "Play",
    tips: [
      ["📖", "Story: chapters played on real streets. A gold beacon on the map shows where to go next."],
      ["🔍", "Some steps hide the target: search the gold circle and follow the hot/cold detector."],
      ["🧭", "GPS games: treasure hunt, street sprint and checkpoint rally — quick rounds with rewards."],
      ["🏆", "Goals: a world operation everyone shares, a faction goal and your own milestones. Claim them here."],
    ],
  },
  store: {
    title: "Gems",
    tips: [
      ["📺", "Free gems: watch a short sponsor spot (a few per day)."],
      ["💎", "Gems rush timers, buy coins, heal you instantly and shield your base."],
      ["🎁", "You also earn gems from levels, quests, achievements, goals and story chapters."],
    ],
  },
  jobs: {
    title: "Jobs",
    tips: [
      ["📦", "Real deliveries posted by players nearby. Accept one, pick it up, hand it over with the code."],
      ["🪙", "Coins are held in escrow, so couriers always get paid."],
    ],
  },
  crew: {
    title: "Crew",
    tips: [
      ["🤝", "Add friends to see them exactly on the map and defend each other's bases."],
      ["💬", "Chat with your crew, nearby players or everyone."],
      ["📣", "Use the 📣 button on the map to ping your crew: attack, help, rally or loot."],
    ],
  },
  events: {
    title: "Events",
    tips: [
      ["🎉", "Meet-ups at real places. Join, show up, check in for rewards."],
      ["⭐", "Official events pay extra."],
    ],
  },
  hero: {
    title: "Your hero",
    tips: [
      ["🦸", "Pick a class, then spend points from every level on attributes."],
      ["🎒", "Gear drops from chests, battles and quests — equip it, forge it, salvage what you don't need."],
      ["📜", "Quests guide you through the game; Powers are special abilities bought with Command Points."],
      ["⚙️", "Profile: change your name, play mode (walk or from home), sound and music, or replay the tutorial."],
    ],
  },
  inbox: {
    title: "Inbox",
    tips: [
      ["🔔", "Everything the game told you: rewards, raids on your base, crew news. Opening it clears the badge."],
      ["✕", "Tap ✕ to dismiss one, or Clear all."],
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
        <b>💡 {h.title}: how it works</b>
      </div>
      {h.tips.map(([ic, t]) => (
        <div key={t} className="help-tip">
          <span>{ic}</span>
          <span>{t}</span>
        </div>
      ))}
      <button className="btn yellow small" onClick={onClose}>Got it</button>
    </div>
  );
}

// ---------------------------------------------------------------- first-run tour
export type TourStep = { target?: string; title: string; body: string; emoji?: string };
export const TOUR_KEY = "sq_tour_v2";

export const TOUR: TourStep[] = [
  { emoji: "👋", title: "Welcome, commander!", body: "Your real city is the game map. Collect loot, build a base, raise an army and team up with players around you. This quick tour shows you around." },
  { target: ".player-card", title: "This is you", body: "Your level and XP. Tap it any time to open your hero: stats, gear, quests and settings." },
  { target: ".needs-hud", title: "Keep your commander happy", body: "Hunger, energy, social and fun drain over time. A happy commander earns more XP — eat, rest at your base and hang out with players." },
  { target: "[data-tour=wallet]", title: "Coins & gems", body: "Coins build and train. Gems speed things up — tap the green + for the store and free gems." },
  { target: ".me-wrap", title: "Your reach", body: "The dashed circle is your reach. Things inside it can be collected or played — tap any icon on the map to see what it is." },
  { target: "[data-tour=nav-nearby]", title: "Nearby", body: "Everything around you in one list, closest first." },
  { target: "[data-tour=nav-base]", title: "Base", body: "Plant your base, build, train troops and defend it. Start here after the tour!" },
  { target: "[data-tour=nav-play]", title: "Play", body: "Story missions, GPS mini-games and weekly goals with big rewards." },
  { target: "[data-tour=nav-crew]", title: "Crew", body: "Friends, chat and teamwork. Red badges on these buttons mean something new — tap to see it and they clear." },
  { target: "[data-tour=inbox]", title: "Inbox", body: "Every reward, raid alert and message lands here." },
  { emoji: "🚶", title: "How do you want to play?", body: "Walk the real streets with GPS for full rewards, or play from home: tap the map and your commander travels there, for reduced rewards. You can switch any time in Hero → Profile." },
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" && !last) setI(i + 1);
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
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
    <div className="tour" role="dialog" aria-label="Tutorial">
      {rect ? (
        <div className="tour-hole" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle} key={i}>
        {step.emoji && <div className="tour-emoji">{step.emoji}</div>}
        <b className="tour-title">{step.title}</b>
        <p>{step.body}</p>
        <div className="tour-dots">{TOUR.map((_, j) => <i key={j} className={j === i ? "on" : j < i ? "done" : ""} />)}</div>
        {last && onChooseHome ? (
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <button className="btn green" onClick={() => (onChooseHome(false), onDone())}>🚶 I&apos;ll walk</button>
            <button className="btn cyan" onClick={() => (onChooseHome(true), onDone())}>🛋️ Play from home</button>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn ghost small" onClick={onDone}>Skip</button>
            <div className="row">
              {i > 0 && <button className="btn ghost small" onClick={() => setI(i - 1)}>Back</button>}
              <button className="btn yellow small" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Let's go!" : "Next"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
