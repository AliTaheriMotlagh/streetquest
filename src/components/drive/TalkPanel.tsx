"use client";
// Talking to a passer-by in the 3D city (the rules: lib/street/npcTalk.ts). Walking up to someone on
// foot shows "💬 Talk (Y)"; then a panel at the bottom — phone-first, one thumb — with what you can
// say: hello, the way to a café / restaurant / pharmacy / supermarket, what's good round here, what
// about this store, a chat, some money, an insult, "follow me", goodbye. Their answer is spoken
// (voices.talk: the on-device Persian voice, else the phone's) over their head, and written here as a
// subtitle that runs with the voice — word by word from the moment it starts, while their face pulses.
// Someone following you keeps the panel and takes orders (a little crew of your own): wait here, come on,
// stay close, keep back, wait at the shop, wait by my car, keep watch (they shout when the police come), go home.
// It closes when they walk off, run, or you leave. Styles: app/drive-talk.css.
// The voice of the player's language comes while the city loads (lib/tts/neural.ts); held back on data saver or a
// slow connection, the panel offers it in one tap (phones mostly have no Persian voice of their own).
import { useEffect, useRef, useState } from "react";
import { fmtNum, msg, t } from "@/lib/i18n";
import { downloadMb, languageProgress, neuralNow, onNeuralChange, setNeuralPref, warmFor, warmLanguage } from "./tts/neural";
import { WAY_KINDS, type Mood, type React as Reaction, type TalkAct, type WayKind } from "@/lib/street/npcTalk";
import { revealWords } from "@/lib/street/subtitle";

export type TalkAnswer = {
  text: string;
  react: Reaction;
  mood: Mood;
  /** Resolves when their voice starts, with how long it runs (s). */
  speak?: Promise<number>;
  /** They're following me now (the panel switches to their orders). */
  following?: boolean;
};
type Line = { me: string; them: string; id: number };

const MOOD_FACE: Record<Mood, string> = { friendly: "🙂", busy: "😬", grumpy: "😠" };
const MOOD_LABEL: Record<Mood, string> = { friendly: msg("Friendly"), busy: msg("In a hurry"), grumpy: msg("Grumpy") };
type Act = { act: TalkAct; emoji: string; label: string; said: string; bad?: boolean };
const ACTS: Act[] = [
  { act: "greet", emoji: "👋", label: msg("Say hello"), said: msg("Hello!") },
  { act: "way", emoji: "🧭", label: msg("Ask the way"), said: "" },
  { act: "store", emoji: "🏪", label: msg("This store?"), said: msg("What's this place like?") },
  { act: "recommend", emoji: "⭐", label: msg("What's good here?"), said: msg("Is there anywhere good to eat round here?") },
  { act: "chat", emoji: "💬", label: msg("Chat"), said: msg("How's it going?") },
  { act: "money", emoji: "💵", label: msg("Give money"), said: msg("Here, take this.") },
  { act: "follow", emoji: "🚶", label: msg("Follow me"), said: msg("Come with me?") },
  { act: "insult", emoji: "😤", label: msg("Insult"), said: msg("Get out of my way!"), bad: true },
  { act: "bye", emoji: "✋", label: msg("Goodbye"), said: msg("Bye!") },
];
/** What you can tell someone who's following you. */
const ORDERS: Act[] = [
  { act: "wait", emoji: "✋", label: msg("Wait here"), said: msg("Wait here for me.") },
  { act: "come", emoji: "🚶", label: msg("Come on"), said: msg("Come on, let's go!") },
  { act: "close", emoji: "🏃", label: msg("Stay close"), said: msg("Stay close to me.") },
  { act: "far", emoji: "↔️", label: msg("Keep back"), said: msg("Keep your distance, don't look like you're with me.") },
  { act: "shop", emoji: "🛍️", label: msg("Wait at the shop"), said: msg("Wait for me at the shop.") },
  { act: "car", emoji: "🚗", label: msg("Wait by my car"), said: msg("Go and wait by my car.") },
  { act: "watch", emoji: "👀", label: msg("Keep watch"), said: msg("Keep watch here — shout if the police come.") },
  { act: "store", emoji: "🏪", label: msg("This store?"), said: msg("What's this place like?") },
  { act: "chat", emoji: "💬", label: msg("Chat"), said: msg("How's it going?") },
  { act: "release", emoji: "🏠", label: msg("Go home"), said: msg("Thanks, you can go now.") },
];

export function TalkPanel({ woman, following: following0, onAsk, onClose }: { woman: boolean; following?: boolean; onAsk: (act: TalkAct, way?: WayKind) => TalkAnswer | null; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [mood, setMood] = useState<Mood | null>(null);
  const [ways, setWays] = useState(false);
  const [ending, setEnding] = useState(false);
  const [following, setFollowing] = useState(!!following0);
  /** The last answer while it's being said: how much of it shows (0…1), and whether they're talking now. */
  const [said, setSaid] = useState<{ id: number; k: number; talking: boolean } | null>(null);
  const seq = useRef(0);
  const raf = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => void log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }), [lines, said?.k]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Their voice starts loading as you walk up, so the first answer isn't late.
  useEffect(() => warmFor(woman ? "f" : "m"), [woman]);
  // Escape leaves.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  /** Run the subtitle with the voice: dots until it starts, then the words as they're said. */
  const play = (id: number, speak: Promise<number> | undefined) => {
    cancelAnimationFrame(raf.current);
    setSaid({ id, k: 0, talking: false });
    const run = (secs: number) => {
      if (seq.current !== id) return;
      const t0 = performance.now(), dur = Math.max(0.6, secs) * 1000;
      const step = () => {
        if (seq.current !== id) return;
        const k = Math.min(1, (performance.now() - t0) / dur);
        setSaid({ id, k, talking: k < 1 });
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      step();
    };
    // No word from the voice within 2.5 s (slow model, no voice at all): show it all the same.
    const late = setTimeout(() => run(0.6), 2500);
    if (speak) void speak.then((s) => (clearTimeout(late), run(s)));
    else (clearTimeout(late), run(0.6));
  };

  const ask = (act: TalkAct, way?: WayKind, words?: string) => {
    if (ending) return;
    setWays(false);
    const a = onAsk(act, way);
    if (!a) return onClose();
    setMood(a.mood);
    const id = ++seq.current;
    setLines((l) => [...l.slice(-3), { me: words ?? "", them: a.text, id }]);
    play(id, a.speak);
    setFollowing(!!a.following);
    // They walk off, run, or wait behind: the conversation is over (after reading the answer).
    if (!a.following && a.react !== "stay" && a.react !== "angry") {
      setEnding(true);
      setTimeout(onClose, 2800);
    }
  };

  const acts = following ? ORDERS : ACTS;
  const talking = !!said?.talking;
  return (
    <section className={`talk${talking ? " speaking" : ""}`} role="dialog" aria-label={t("Talking to someone")}>
      <header className="talk-head">
        <span className="talk-face" aria-hidden>
          {woman ? "🧕" : "🧔"}
          <i className="talk-wave" />
        </span>
        <span className="talk-who">
          <b>{woman ? t("A woman on the street") : t("A man on the street")}</b>
          <small>{following ? t("Following you") : talking ? t("Speaking…") : mood ? t(MOOD_LABEL[mood]) : t("Listening")}</small>
        </span>
        {mood && <span className={`talk-mood ${mood}`} title={t(MOOD_LABEL[mood])}>{MOOD_FACE[mood]}</span>}
        <button type="button" className="talk-x" onClick={onClose} aria-label={t("Leave")}>✕</button>
      </header>
      {lines.length > 0 && (
        <div className="talk-log" ref={log} aria-live="polite">
          {lines.map((l) => {
            const live = said?.id === l.id;
            const shown = live ? revealWords(l.them, said!.k) : l.them;
            return (
              <p key={l.id}>
                {l.me && <span className="talk-me" dir="auto">{l.me}</span>}
                <span className="talk-them" dir="auto">
                  {live && said!.k === 0 ? (
                    <span className="talk-dots" aria-label={t("Speaking…")}><i /><i /><i /></span>
                  ) : (
                    <>
                      {shown}
                      {live && said!.k < 1 && <span className="talk-rest" aria-hidden>{l.them.slice(shown.length)}</span>}
                    </>
                  )}
                </span>
              </p>
            );
          })}
        </div>
      )}
      <VoiceOffer woman={woman} />
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
        <div className={`talk-acts${following ? " orders" : ""}`} role="group" aria-label={following ? t("Tell them") : t("What to say")}>
          {acts.map((a) => (
            <button key={a.act} type="button" className={a.bad ? "bad" : ""} disabled={ending} onClick={() => (a.act === "way" ? setWays(true) : ask(a.act, undefined, t(a.said)))}>
              <span aria-hidden>{a.emoji}</span>
              {t(a.label)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The voice of the player's language while it's still coming ("🔊 Downloading the voice… 40%"), or — where it was held
 * back (data saver, a slow connection) — "🔊 Hear them speak": one tap turns voices on and fetches them.
 */
function VoiceOffer({ woman }: { woman: boolean }) {
  const [, redraw] = useState(0);
  useEffect(() => onNeuralChange(() => redraw((n) => n + 1)), []);
  const plan = neuralNow();
  if (plan.use) {
    const lp = languageProgress();
    if (!lp.busy) return null;
    return (
      <p className="talk-voice" role="status">
        🔊 {t("Downloading the voice… {n}%", { n: fmtNum(Math.round(lp.pct * 100)) })}
      </p>
    );
  }
  if (plan.why !== "data-saver" && plan.why !== "slow-net") return null;
  return (
    <button
      type="button"
      className="talk-voice"
      onClick={() => {
        setNeuralPref("on");
        // (The one you're talking to first, then the rest of the language.)
        warmFor(woman ? "f" : "m");
        warmLanguage();
      }}
    >
      🔊 {t("Hear them speak — get the voice ({mb} MB)", { mb: fmtNum(downloadMb()) })}
    </button>
  );
}
