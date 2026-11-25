// One voice channel for conversations (pure; tests/talkVoice.test.ts). Whatever says a conversation's line —
// the on-device neural voice, a recorded line, the phone's own speech — goes through one TalkChannel: a new
// line stops the one before, an answer that's no longer the latest is never voiced, so two voices never
// overlap. Which voice: the neural one (any words) → else a recorded line, but only one whose words are
// exactly the line's (matchBark) → else the phone's speechSynthesis → else silence (the bubble and the panel
// carry the words). A recording of other words (a random greeting standing in) says the wrong thing: never.
import { textOf, type Bark, type VoiceKind } from "./barks";
import type { VoiceLang } from "./voiceLang";

/** Words compared as said: case, punctuation, Arabic/Persian letter forms, ZWNJ and spacing ignored. */
export function normLine(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‍ً-ٟ]/g, "")
    .replace(/[.,!?؟،؛;:…—–\-"'«»“”‘’()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The recorded line with exactly these words in this language, said by `v` (a cop by a man's line); null if none. */
export function matchBark(text: string, lang: VoiceLang, v: VoiceKind, barks: readonly Bark[]): { bark: Bark; voice: VoiceKind } | null {
  const want = normLine(text);
  if (!want) return null;
  const voices: VoiceKind[] = v === "cop" ? ["cop", "m"] : [v];
  for (const voice of voices)
    for (const b of barks) if (b.voices.includes(voice) && normLine(textOf(b, voice)[lang]) === want) return { bark: b, voice };
  return null;
}

/** What can say a line, in the order tried. */
export type TalkSource = "neural" | "recorded" | "device";
export function talkOrder(o: { neural: boolean; recorded: boolean; device: boolean }): TalkSource[] {
  return (["neural", "recorded", "device"] as const).filter((k) => o[k]);
}

/**
 * The one conversation voice. begin() a new line (stopping whatever is being said); a voice that starts
 * registers how to stop it with playing(turn, stop) — refused (and stopped) if a newer line has begun;
 * ended(stop) when it finishes by itself.
 */
export class TalkChannel {
  private turn = 0;
  private stopNow: (() => void) | null = null;

  begin(): number {
    this.cut();
    return ++this.turn;
  }
  get current() {
    return this.turn;
  }
  live(turn: number) {
    return turn === this.turn;
  }
  /** A voice is saying something now. */
  get busy() {
    return this.stopNow != null;
  }
  playing(turn: number, stop: () => void): boolean {
    if (!this.live(turn)) {
      stop();
      return false;
    }
    if (this.stopNow !== stop) this.cut();
    this.stopNow = stop;
    return true;
  }
  ended(stop: () => void) {
    if (this.stopNow === stop) this.stopNow = null;
  }
  /** Silence now. */
  cut() {
    const s = this.stopNow;
    this.stopNow = null;
    try {
      s?.();
    } catch {}
  }
}
