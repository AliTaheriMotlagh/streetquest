// What people in the open city say (pure; tests/barks.test.ts): short spoken lines in
// everyday Tehrani Persian for what's happening round them — running from gunfire, a driver
// whose car you hit, a pedestrian you nearly ran over, someone you greet in passing, the
// police shouting through the megaphone. Each line is recorded once per voice that can say
// it (npm run assets:voices → public/sounds/voice/<id>-<voice>.mp3); in the game it plays
// from the speaker with a speech bubble over their head (drive/voices.ts). The English is
// the subtitle for players not playing in Persian.

export type Situation = "flee" | "nearMiss" | "crashDriver" | "honk" | "carjack" | "greet" | "hurt" | "copStop" | "copHands" | "copDown" | "copBusted";
/** A man, a woman, a police officer (a man's voice, through a megaphone or a radio's band). */
export type VoiceKind = "m" | "f" | "cop";
export type Bark = { id: string; s: Situation; voices: VoiceKind[]; fa: string; en: string };

const MF: VoiceKind[] = ["m", "f"], COP: VoiceKind[] = ["cop"];
const lines: [Situation, VoiceKind[], string, string][] = [
  ["flee", MF, "وای! فرار کنید!", "Oh no! Run!"],
  ["flee", MF, "یا خدا!", "Oh my God!"],
  ["flee", MF, "تیراندازی شد! بخوابید!", "Shots! Get down!"],
  ["flee", MF, "کمک! یکی کمک کنه!", "Help! Somebody help!"],
  ["flee", MF, "بدو، بدو!", "Run, run!"],
  ["flee", ["m"], "این دیوونه شده!", "He's gone mad!"],
  ["nearMiss", MF, "هوی! حواست کجاست؟", "Hey! Watch where you're going!"],
  ["nearMiss", MF, "مگه کوری؟!", "Are you blind?!"],
  ["nearMiss", MF, "یواش‌تر برو!", "Slow down!"],
  ["nearMiss", MF, "داشتی منو می‌کشتی!", "You nearly killed me!"],
  ["crashDriver", MF, "چیکار کردی؟!", "What have you done?!"],
  ["crashDriver", MF, "ماشینمو داغون کردی!", "You wrecked my car!"],
  ["crashDriver", MF, "وایسا ببینم! کجا در میری؟", "Hold it! Where do you think you're going?"],
  ["crashDriver", ["m"], "بیمه داری اصلاً؟", "Have you even got insurance?"],
  ["honk", ["m"], "برو دیگه!", "Go already!"],
  ["honk", MF, "چرا وسط خیابون وایسادی؟", "Why are you stopped in the middle of the street?"],
  ["honk", ["m"], "راه بده آقا!", "Make way, mister!"],
  ["carjack", MF, "ماشینم! دزد! دزد!", "My car! Thief! Thief!"],
  ["carjack", MF, "آهای! وایسا! ماشینمو بردن!", "Hey! Stop! They took my car!"],
  ["carjack", MF, "پلیس! یکی زنگ بزنه پلیس!", "Police! Someone call the police!"],
  ["greet", MF, "سلام، خسته نباشی.", "Hi there."],
  ["greet", MF, "سلام! روز بخیر.", "Hello! Good day."],
  ["greet", MF, "چه هوای خوبیه امروز.", "Lovely weather today."],
  ["greet", MF, "مراقب خودت باش.", "Take care."],
  ["greet", ["m"], "داداش، ماشینت خیلی خوشگله!", "Bro, nice car!"],
  ["hurt", MF, "آخ!", "Ow!"],
  ["hurt", MF, "آی! پام!", "Ow! My leg!"],
  ["copStop", COP, "ایست! پلیس!", "Halt! Police!"],
  ["copStop", COP, "راننده، بزن کنار!", "Driver, pull over!"],
  ["copStop", COP, "ماشین رو نگه دار! همین الان!", "Stop the car! Right now!"],
  ["copHands", COP, "دستا بالا!", "Hands up!"],
  ["copHands", COP, "تکون نخور!", "Don't move!"],
  ["copHands", COP, "بخواب رو زمین!", "Get on the ground!"],
  ["copHands", COP, "اسلحه‌تو بنداز!", "Drop your weapon!"],
  ["copDown", COP, "افسر زخمی شد! نیروی کمکی بفرستید!", "Officer down! Send backup!"],
  ["copDown", COP, "تیراندازی! پناه بگیرید!", "Shots fired! Take cover!"],
  ["copBusted", COP, "بازداشتی! راه بیفت!", "You're under arrest! Move!"],
];

/** Every line, with a stable id (situation and number: the recording's file name). */
export const BARKS: Bark[] = (() => {
  const n: Partial<Record<Situation, number>> = {};
  return lines.map(([s, voices, fa, en]) => ({ id: `${s}-${(n[s] = (n[s] ?? 0) + 1)}`, s, voices, fa, en }));
})();

/** A recording's file name (under /sounds/voice/). */
export const barkFile = (b: Bark, v: VoiceKind) => `${b.id}-${v}.mp3`;

/**
 * A line for this situation in this voice, not one of the `recent` ones if there's
 * another to say (nobody repeats themselves straight away). Null: nothing fits.
 */
export function pickBark(s: Situation, v: VoiceKind, rand: () => number, recent: readonly string[] = []): Bark | null {
  const all = BARKS.filter((b) => b.s === s && b.voices.includes(v));
  const fresh = all.filter((b) => !recent.includes(b.id));
  const from = fresh.length ? fresh : all;
  return from.length ? from[Math.floor(rand() * from.length) % from.length] : null;
}

/** How long a line's bubble stays up (s): long enough to read it. */
export const sayFor = (b: Bark) => Math.max(1.8, Math.min(4.5, 0.9 + b.fa.length * 0.075));

/** Seconds before anyone near you says something else, per situation (so the street isn't a chorus). */
export const QUIET_S: Record<Situation, number> = { flee: 2.5, nearMiss: 4, crashDriver: 3, honk: 8, carjack: 3, greet: 6, hurt: 1.5, copStop: 7, copHands: 4, copDown: 4, copBusted: 1 };
