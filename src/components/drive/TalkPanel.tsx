"use client";
// Talking to a passer-by in the 3D city (the rules: lib/street/npcTalk.ts). Walking up to someone on
// foot shows "💬 Talk (Y)"; then a panel at the bottom — phone-first, one thumb — with what you can
// say: hello, the way to a café / restaurant / pharmacy / supermarket, what's good round here, a
// chat, some money, an insult, "follow me", goodbye. Their answer is spoken (voices.talk: the
// on-device Persian voice, else the phone's) over their head, and written here as a subtitle. It
// closes when they walk off, run, follow you, or you leave. Styles: app/drive-talk.css.
import { useEffect, useRef, useState } from "react";
import { msg, t } from "@/lib/i18n";
import { WAY_KINDS, type Mood, type React as Reaction, type TalkAct, type WayKind } from "@/lib/street/npcTalk";

export type TalkAnswer = { text: string; react: Reaction; mood: Mood };
type Line = { me: string; them: string };

const MOOD_FACE: Record<Mood, string> = { friendly: "🙂", busy: "😬", grumpy: "😠" };
const MOOD_LABEL: Record<Mood, string> = { friendly: msg("Friendly"), busy: msg("In a hurry"), grumpy: msg("Grumpy") };
const ACTS: { act: TalkAct; emoji: string; label: string; said: string }[] = [
  { act: "greet", emoji: "👋", label: msg("Say hello"), said: msg("Hello!") },
  { act: "way", emoji: "🧭", label: msg("Ask the way"), said: "" },
  { act: "recommend", emoji: "⭐", label: msg("What's good here?"), said: msg("Is there anywhere good to eat round here?") },
  { act: "chat", emoji: "💬", label: msg("Chat"), said: msg("How's it going?") },
  { act: "money", emoji: "💵", label: msg("Give money"), said: msg("Here, take this.") },
  { act: "follow", emoji: "🚶", label: msg("Follow me"), said: msg("Come with me?") },
  { act: "insult", emoji: "😤", label: msg("Insult"), said: msg("Get out of my way!") },
  { act: "bye", emoji: "✋", label: msg("Goodbye"), said: msg("Bye!") },
];

export function TalkPanel({ woman, onAsk, onClose }: { woman: boolean; onAsk: (act: TalkAct, way?: WayKind) => TalkAnswer | null; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [mood, setMood] = useState<Mood | null>(null);
  const [ways, setWays] = useState(false);
  const [ending, setEnding] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => void log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }), [lines]);
  // Escape leaves.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  const ask = (act: TalkAct, way?: WayKind, said?: string) => {
    if (ending) return;
    setWays(false);
    const a = onAsk(act, way);
    if (!a) return onClose();
    setMood(a.mood);
    setLines((l) => [...l.slice(-3), { me: said ?? "", them: a.text }]);
    // They walk off, run, or come with you: the conversation is over (after reading the answer).
    if (a.react !== "stay" && a.react !== "angry") {
      setEnding(true);
      setTimeout(onClose, 2600);
    }
  };

  return (
    <section className="talk" role="dialog" aria-label={t("Talking to someone")}>
      <header className="talk-head">
        <span className="talk-face" aria-hidden>{woman ? "🧕" : "🧔"}</span>
        <b>{woman ? t("A woman on the street") : t("A man on the street")}</b>
        {mood && <span className={`talk-mood ${mood}`} title={t(MOOD_LABEL[mood])}>{MOOD_FACE[mood]}</span>}
        <button type="button" className="talk-x" onClick={onClose} aria-label={t("Leave")}>✕</button>
      </header>
      {lines.length > 0 && (
        <div className="talk-log" ref={log} aria-live="polite">
          {lines.map((l, i) => (
            <p key={i}>
              {l.me && <span className="talk-me" dir="auto">{l.me}</span>}
              <span className="talk-them" dir="auto">{l.them}</span>
            </p>
          ))}
        </div>
      )}
      {ways ? (
        <div className="talk-acts" role="group" aria-label={t("Ask the way")}>
          {WAY_KINDS.map((w) => (
            <button key={w.key} type="button" onClick={() => ask("way", w.key, t("Where's {kind}?", { kind: t(w.label) }))}>
              <span aria-hidden>{w.emoji}</span>
              {t(w.label)}
            </button>
          ))}
          <button type="button" className="ghost" onClick={() => setWays(false)}>‹ {t("Back")}</button>
        </div>
      ) : (
        <div className="talk-acts" role="group" aria-label={t("What to say")}>
          {ACTS.map((a) => (
            <button key={a.act} type="button" className={a.act === "insult" ? "bad" : ""} disabled={ending} onClick={() => (a.act === "way" ? setWays(true) : ask(a.act, undefined, t(a.said)))}>
              <span aria-hidden>{a.emoji}</span>
              {t(a.label)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
