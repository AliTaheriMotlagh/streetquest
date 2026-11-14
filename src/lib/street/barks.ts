// What people in the open city say (pure; tests/barks.test.ts): short spoken lines in
// everyday Tehrani Persian for what's happening round them — running from gunfire, a driver
// whose car you hit, a pedestrian you nearly ran over, someone you greet in passing, the
// police shouting through the megaphone. Each line is recorded once per voice that can say
// it (npm run assets:voices → public/sounds/voice/<id>-<voice>.mp3); in the game it plays
// from the speaker with a speech bubble over their head (drive/voices.ts). The English is
// the subtitle for players not playing in Persian.
import type { StoreKind } from "../storeKinds";

export type Situation =
  | "flee" | "nearMiss" | "crashDriver" | "honk" | "carjack" | "greet" | "hurt" | "copStop" | "copHands" | "copDown" | "copBusted"
  // Street scenes (lib/street/scenes.ts): said in order, by the people in them.
  | "argue" | "friends" | "phone" | "vendor" | "taxi" | "snatch"
  // A shopkeeper at the door of an open store calling you in (SHOP_CALLS says which kind of store).
  | "shopCall";
/** A man, a woman, a police officer (a man's voice, through a megaphone or a radio's band). */
export type VoiceKind = "m" | "f" | "cop";
/**
 * A line: what a man says (`fa`, `en`) and, where women put it their own way, what a woman
 * says (`faF`, `enF`) — said by the same person in the same moment, just not in the same words.
 */
export type Bark = { id: string; s: Situation; voices: VoiceKind[]; fa: string; en: string; faF?: string; enF?: string };

/** What this voice says for the line (a woman's own words where there are some). */
export const textOf = (b: Bark, v: VoiceKind) => (v === "f" && b.faF ? { fa: b.faF, en: b.enF ?? b.en } : { fa: b.fa, en: b.en });

const MF: VoiceKind[] = ["m", "f"], COP: VoiceKind[] = ["cop"];
/** [situation, voices, a man's words, English, a woman's words, English]. */
const lines: [Situation, VoiceKind[], string, string, string?, string?][] = [
  ["flee", MF, "وای! فرار کنید!", "Oh no! Run!", "وای خدا! بدویید!", "Oh God! Run!"],
  ["flee", MF, "یا خدا!", "Oh my God!", "ای وای، خدایا!", "Oh no, God!"],
  ["flee", MF, "تیراندازی شد! بخوابید!", "Shots! Get down!", "تیراندازی شده! سرتونو بدزدید!", "They're shooting! Keep your heads down!"],
  ["flee", MF, "کمک! یکی کمک کنه!", "Help! Somebody help!", "کمک! تو رو خدا یکی کمک کنه!", "Help! For God's sake, somebody help!"],
  ["flee", MF, "بدو، بدو!", "Run, run!", "بچه‌ها بدویید!", "Everyone, run!"],
  ["flee", ["m"], "این دیوونه شده!", "He's gone mad!"],
  ["nearMiss", MF, "هوی! حواست کجاست؟", "Hey! Watch where you're going!", "آقا حواستون کجاست؟!", "Sir, where's your head at?!"],
  ["nearMiss", MF, "مگه کوری؟!", "Are you blind?!", "مگه نمی‌بینی؟!", "Can't you see?!"],
  ["nearMiss", MF, "یواش‌تر برو!", "Slow down!", "یواش‌تر، تو رو خدا!", "Slower, for God's sake!"],
  ["nearMiss", MF, "داشتی منو می‌کشتی!", "You nearly killed me!", "نزدیک بود منو زیر کنی!", "You nearly ran me over!"],
  ["crashDriver", MF, "چیکار کردی؟!", "What have you done?!", "وای! چیکار کردین؟!", "Oh no! What have you done?!"],
  ["crashDriver", MF, "ماشینمو داغون کردی!", "You wrecked my car!", "ماشینم! ببین چیکارش کردی!", "My car! Look what you did to it!"],
  ["crashDriver", MF, "وایسا ببینم! کجا در میری؟", "Hold it! Where do you think you're going?", "کجا می‌ری؟ وایسا!", "Where are you going? Stop!"],
  ["crashDriver", ["m"], "بیمه داری اصلاً؟", "Have you even got insurance?"],
  ["honk", ["m"], "برو دیگه!", "Go already!"],
  ["honk", MF, "چرا وسط خیابون وایسادی؟", "Why are you stopped in the middle of the street?", "آقا، برید دیگه! دیرم شده!", "Come on, move! I'm late!"],
  ["honk", ["m"], "راه بده آقا!", "Make way, mister!"],
  ["carjack", MF, "ماشینم! دزد! دزد!", "My car! Thief! Thief!", "ماشینمو بردن! دزد!", "They took my car! Thief!"],
  ["carjack", MF, "آهای! وایسا! ماشینمو بردن!", "Hey! Stop! They took my car!", "آهای! کجا؟! ماشینم!", "Hey! Where are you going?! My car!"],
  ["carjack", MF, "پلیس! یکی زنگ بزنه پلیس!", "Police! Someone call the police!", "یکی زنگ بزنه صد و ده!", "Someone call 110!"],
  ["greet", MF, "سلام، خسته نباشی.", "Hi there.", "سلام، خسته نباشید.", "Hello there."],
  ["greet", MF, "سلام! روز بخیر.", "Hello! Good day.", "سلام عزیزم، روزت بخیر.", "Hi dear, have a nice day."],
  ["greet", MF, "چه هوای خوبیه امروز.", "Lovely weather today.", "هوا چه خوبه امروز، نه؟", "Lovely day today, isn't it?"],
  ["greet", MF, "مراقب خودت باش.", "Take care.", "مواظب خودت باش عزیزم.", "Take care of yourself, dear."],
  ["greet", ["m"], "داداش، ماشینت خیلی خوشگله!", "Bro, nice car!"],
  ["hurt", MF, "آخ!", "Ow!", "آی!", "Ouch!"],
  ["hurt", MF, "آی! پام!", "Ow! My leg!", "وای! دستم!", "Oh! My arm!"],
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
  // ---- street scenes
  ["argue", MF, "ببخشید، من زودتر اومده بودم!", "Excuse me, I was here first!", "ببخشیدا، من زودتر اومدم!", "Excuse me, I came first!"],
  ["argue", MF, "نخیر، من از اول اینجا بودم!", "No, I've been here all along!", "نه عزیزم، من از اول اینجا بودم!", "No dear, I've been here all along!"],
  ["argue", MF, "یعنی چی؟ نوبت منه!", "What do you mean? It's my turn!", "وا! یعنی چی؟ نوبت منه!", "Huh! What do you mean? It's my turn!"],
  ["argue", MF, "برو بابا، حوصله داری‌ها!", "Oh come off it, you've got some nerve!", "اِ! چه آدمی هستیا!", "Well! What a person you are!"],
  ["friends", MF, "سلام! کجایی تو؟ خیلی وقته ندیدمت!", "Hi! Where have you been? Haven't seen you in ages!", "وای سلام! کجایی تو؟ دلم برات تنگ شده بود!", "Oh hi! Where have you been? I've missed you!"],
  ["friends", MF, "سلام داداش! چطوری؟ چه خبرا؟", "Hey bro! How are you? What's new?", "سلام عزیزم! خوبی؟ چه خبرا؟", "Hi dear! How are you? What's new?"],
  ["friends", MF, "هیچی، سلامتی. بریم یه چایی بخوریم؟", "Nothing much. Shall we get a tea?", "هیچی، سلامتی. بریم یه کافه بشینیم؟", "Nothing much. Shall we sit in a café?"],
  ["friends", MF, "بریم! من مهمون تو.", "Let's go! Your treat.", "بریم! ولی این دفعه مهمون من.", "Let's go! But this time it's on me."],
  ["phone", MF, "الو؟ آره، دارم میام.", "Hello? Yes, I'm on my way.", "الو مامان؟ آره، دارم میام.", "Hello, Mum? Yes, I'm on my way."],
  ["phone", MF, "نه بابا، ترافیکه. پنج دقیقه دیگه می‌رسم.", "No, it's the traffic. I'll be there in five minutes.", "نه عزیزم، ترافیکه. یه ربع دیگه می‌رسم.", "No dear, it's the traffic. I'll be there in a quarter of an hour."],
  ["phone", MF, "باشه، باشه. خداحافظ.", "Okay, okay. Bye.", "باشه قربونت برم، فعلاً.", "Okay, love you, bye for now."],
  ["vendor", ["m"], "فال حافظ! فال! بیا فال بگیر!", "Hafez fortunes! Get your fortune told!"],
  ["vendor", ["m"], "آب معدنی خنک! آب خنک!", "Cold water! Cold mineral water!"],
  ["vendor", ["m"], "بستنی! بستنی خنک داریم!", "Ice cream! Cold ice cream!"],
  ["taxi", ["m"], "آزادی! آزادی!", "Azadi! Azadi!"],
  ["taxi", ["m"], "ونک، یه نفر!", "Vanak, one more!"],
  ["taxi", ["m"], "تجریش دربست؟", "Tajrish, private hire?"],
  ["snatch", MF, "دزد! کیفمو زد! بگیریدش!", "Thief! He took my bag! Stop him!", "وای کیفم! دزد! بگیریدش!", "Oh, my bag! Thief! Stop him!"],
  // ---- more of the street (appended: earlier lines keep their ids and recordings)
  ["greet", MF, "به‌به! چه عجب از این طرفا!", "Well well! Look who's around here!", "به‌به! چه عجب، از این ورا!", "Oh my! Fancy seeing you round here!"],
  ["greet", ["m"], "داداش، لاستیکت کم‌باده‌ها!", "Bro, your tyre's a bit flat!"],
  ["greet", MF, "ببخشید، ساعت چنده؟", "Excuse me, what's the time?", "ببخشید خانم، ساعت چنده؟", "Excuse me, do you have the time?"],
  ["greet", ["m"], "قربون دستت، یه آدرس می‌پرسم.", "Sorry to bother you, I'm asking for directions."],
  ["greet", MF, "تو رو خدا یواش برو، بچه هست.", "Go slowly, for God's sake, there are kids.", "یواش برید تو رو خدا، بچه‌ها هستن.", "Please go slowly, there are children."],
  ["nearMiss", ["m"], "گواهینامه‌تو از کجا خریدی؟!", "Where did you buy your licence?!"],
  ["nearMiss", MF, "اینجا پیاده‌روئه، نه اتوبان!", "This is a pavement, not a motorway!", "اینجا پیاده‌روئه آقا!", "This is the pavement, mister!"],
  ["nearMiss", ["m"], "فکر کردی فیلم اکشنه؟!", "Think you're in an action film?!"],
  ["honk", ["m"], "سبز شد، سبز!", "It's green, green!"],
  ["honk", ["m"], "خوابت برده عمو؟", "Fallen asleep, uncle?"],
  ["honk", MF, "ای بابا، این ترافیک تموم نمی‌شه!", "Oh come on, this traffic never ends!", "وای، این ترافیک کی تموم می‌شه!", "Ugh, when will this traffic end!"],
  ["crashDriver", ["m"], "خدا بهت رحم کرد که سپرم ضد ضربه بود!", "Lucky for you my bumper's tough!"],
  ["crashDriver", MF, "بیا پایین ببینم! کروکی می‌کشیم!", "Get out! We're drawing up the accident report!", "وایسید! باید کروکی بکشیم!", "Wait! We need to do the accident report!"],
  ["hurt", ["m"], "آخ کمرم! دیسکم!", "Ow, my back! My disc!"],
  ["vendor", ["m"], "لبو داغ! باقالی داغ!", "Hot beetroot! Hot broad beans!"],
  ["vendor", ["m"], "جوراب، سه جفت صد تومن!", "Socks, three pairs a hundred!"],
  ["vendor", ["m"], "اسپند دود کنم برات؟ چشم نخوری!", "Shall I burn some espand for you? Keep the evil eye off!"],
  ["taxi", ["m"], "انقلاب، انقلاب! یه نفر جا داره!", "Enghelab, Enghelab! Room for one!"],
  ["taxi", ["m"], "میدون ونک مستقیم!", "Vanak Square, straight there!"],
  // ---- shopkeepers (SHOP_CALLS below: which kind of store says which)
  ["shopCall", MF, "بفرمایید، باز هستیم!", "Come on in, we're open!", "بفرمایید داخل، بازیم!", "Come in, we're open!"],
  ["shopCall", MF, "بفرمایید، قدمتون روی چشم!", "Step inside, you're most welcome!", "بفرمایید، خوش اومدید!", "Come in, welcome!"],
  ["shopCall", MF, "تخفیف ویژهٔ امروز! بفرمایید!", "Today's special discount! Come in!", "تخفیف امروز رو از دست ندید!", "Don't miss today's discount!"],
  ["shopCall", ["m"], "نون تازه، نون داغ!", "Fresh bread, hot bread!"],
  ["shopCall", ["m"], "سنگک داغ داریم، بدون صف!", "Hot sangak, no queue!"],
  ["shopCall", ["m"], "چلوکباب داغ، بفرمایید ناهار!", "Hot chelow kabab, come in for lunch!"],
  ["shopCall", ["m"], "دیزی داریم، دیزی سنگی!", "We've got dizi, stone-pot dizi!"],
  ["shopCall", ["m"], "پیتزا داغ، ساندویچ تازه!", "Hot pizza, fresh sandwiches!"],
  ["shopCall", MF, "یه چای تازه‌دم بزنید!", "Have a freshly brewed tea!", "یه قهوهٔ خوب مهمون ما باشید!", "Come have a good coffee with us!"],
  ["shopCall", ["m"], "زولبیا بامیهٔ تازه!", "Fresh zoolbia and bamieh!"],
  ["shopCall", ["m"], "بستنی سنتی، فالوده شیرازی!", "Traditional ice cream, Shirazi faloodeh!"],
  ["shopCall", ["m"], "همه چی داریم، بفرمایید!", "We've got everything, come in!"],
  ["shopCall", ["m"], "هندونه به شرط چاقو!", "Watermelon — we cut it before you buy!"],
  ["shopCall", ["m"], "گوجه، خیار، ارزون ارزون!", "Tomatoes, cucumbers, cheap cheap!"],
  ["shopCall", ["m"], "گوشت تازهٔ گوسفندی، امروز رسیده!", "Fresh lamb, came in today!"],
  ["shopCall", MF, "بفرمایید، داروخانه بازه.", "Come in, the pharmacy's open.", "بفرمایید، داروخانه بازه عزیزم.", "Come in dear, the pharmacy's open."],
  ["shopCall", MF, "حراج! حراج! تا آخر هفته!", "Sale! Sale! Till the end of the week!", "حراج فصل! بفرمایید!", "End-of-season sale! Come in!"],
  ["shopCall", ["m"], "قاب و گلس، فقط امروز ارزون!", "Cases and screen protectors, cheap today only!"],
];

/** Every line, with a stable id (situation and number: the recording's file name). */
export const BARKS: Bark[] = (() => {
  const n: Partial<Record<Situation, number>> = {};
  return lines.map(([s, voices, fa, en, faF, enF]) => ({ id: `${s}-${(n[s] = (n[s] ?? 0) + 1)}`, s, voices, fa, en, ...(faF ? { faF, enF } : {}) }));
})();

/** A short hash of what a line says (FNV-1a): the spoken copy's address changes when the words do. */
export function barkKey(b: Bark, v: VoiceKind) {
  let h = 0x811c9dc5;
  for (const ch of `${v}|${textOf(b, v).fa}`) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(36);
}

/** A line by its id. */
export const barkById = (id: string) => BARKS.find((b) => b.id === id) ?? null;

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
export const sayFor = (b: Bark, v: VoiceKind = "m") => Math.max(1.8, Math.min(4.5, 0.9 + textOf(b, v).fa.length * 0.075));

/** Seconds before anyone near you says something else, per situation (so the street isn't a chorus). */
export const QUIET_S: Record<Situation, number> = { flee: 2.5, nearMiss: 4, crashDriver: 3, honk: 8, carjack: 3, greet: 6, hurt: 1.5, copStop: 7, copHands: 4, copDown: 4, copBusted: 1, argue: 0, friends: 0, phone: 0, vendor: 0, taxi: 0, snatch: 0, shopCall: 9 };

/**
 * Which shopkeeper calls say what (by their id, "shopCall-<n>"): every store can say the
 * welcomes (1–3), a store's own trade the rest. Kept by id so the recordings line up.
 */
export const SHOP_CALLS: Record<StoreKind, number[]> = {
  bakery: [4, 5], restaurant: [6, 7], fastfood: [8], cafe: [9], sweets: [10, 11], market: [12], produce: [13, 14],
  butcher: [15], pharmacy: [16], fashion: [17], tech: [18], general: [12],
};

/** A shopkeeper's call for this kind of store: its own trade's line more often than a plain welcome. */
export function shopCallFor(kind: StoreKind, rand: () => number, recent: readonly string[] = []): Bark | null {
  const own = (SHOP_CALLS[kind] ?? []).map((n) => `shopCall-${n}`), any = ["shopCall-1", "shopCall-2", "shopCall-3"];
  const pool = (rand() < 0.65 && own.length ? own : any).filter((id) => !recent.includes(id));
  const ids = pool.length ? pool : own.length ? own : any;
  return barkById(ids[Math.floor(rand() * ids.length) % ids.length]);
}
