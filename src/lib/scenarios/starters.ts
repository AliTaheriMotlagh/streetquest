// The six scenarios that ship with the game (original stories, Tehran flavour). They are data like
// any scenario an admin makes (the admin can duplicate one and change it); every place is an anchor
// resolved around the player, so they play in any city. Text is written in both languages here.
import type { L10n, Line, Scenario } from "./types";

const L = (fa: string, en: string): L10n => ({ fa, en });
const who = {
  kaveh: L("کاوه", "Kaveh"),
  roya: L("رؤیا", "Roya"),
  davoud: L("داوود", "Davoud"),
  nasim: L("نسیم", "Nasim"),
  behrooz: L("حاج بهروز", "Haj Behrooz"),
};
const line = (speaker: L10n, fa: string, en: string, bark?: string): Line => ({ speaker, text: L(fa, en), ...(bark ? { bark } : {}) });

export const STARTERS: Scenario[] = [
  {
    id: "midnight-getaway",
    title: L("فرار نیمه‌شب", "Midnight Getaway"),
    brief: L(
      "کاوه یه ماشین لازم داره که اسمش به اون ور شهر وصل نشه. ماشینی که خودت داری نه؛ یکی از همین کنار خیابون. بدزدش، یه دور خوش‌ریتم تو پیچ‌ها بزن و تا ماشین‌های گشت دست از سرت بردارن گم شو.",
      "Kaveh needs a car nobody can trace back. Not yours. Take one off the street, slide it round a few corners for show, and vanish before the patrol cars give up on you.",
    ),
    emoji: "🌙",
    difficulty: 2,
    giver: { name: who.kaveh, at: { at: "junction", min: 60, max: 260, from: "start" } },
    steps: [
      { type: "car", car: "any", text: L("یه ماشین از کنار خیابون بردار (پیاده شو و F بزن)", "Take a car off the street (get out and press F)"), say: [line(who.kaveh, "اون ماشین پارک‌شده رو می‌بینی؟ مال کسی نیست. فعلاً.", "See that parked car? Nobody's. For now.")] },
      { type: "drift", meters: 120, text: L("ماشین رو توی پیچ‌ها بلغزون", "Slide the car through the corners"), say: [line(who.kaveh, "یه کم بلغزون، تا شاهدا فکر کنن راننده حرفه‌ایه.", "Throw it around a bit. Let the witnesses think a pro is driving.")] },
      { type: "goto", at: { at: "junction", min: 500, max: 900 }, radius: 30, text: L("برو به نقطهٔ قرار", "Get to the meeting point"), checkpoint: true },
      { type: "evade", stars: 2, text: L("از دست گشت‌ها در برو", "Lose the patrol cars"), say: [line(who.kaveh, "گشت پشتته! تو کوچه‌ها گمشون کن!", "Patrol on your tail! Lose them in the alleys!")] },
    ],
    fail: { timeLimitS: 900, carDestroyed: true, playerDown: true },
    outro: { won: [line(who.kaveh, "تمیز بود. فردا صبح اسم تو هیچ جا نیست.", "Clean. By morning your name's nowhere.")], lost: [line(who.kaveh, "خراب کردی… دیگه باهام تماس نگیر.", "You blew it. Don't call me again.")] },
    reward: { coins: 450, xp: 260 },
    enabled: true,
  },
  {
    id: "bazaar-run",
    title: L("بار تا بازار", "Bazaar Run"),
    brief: L(
      "رؤیا قبل از اینکه مغازه‌ها بازار رو ببندن یه بسته داره که باید برسه. از نونوایی بردار و قبل از تموم شدن وقت تحویلش بده. ترافیک رو هم که می‌دونی…",
      "Roya has a parcel that must reach the bazaar before the shutters come down. Collect it from the bakery and drop it off before time runs out. You know the traffic…",
    ),
    emoji: "📦",
    difficulty: 1,
    giver: { name: who.roya, at: { at: "store", kind: "bakery", min: 80, max: 300, from: "start" } },
    steps: [
      { type: "pickup", what: "package", at: { at: "store", kind: "bakery", min: 150, max: 500 }, radius: 22, text: L("بسته رو از نونوایی بردار", "Pick up the parcel at the bakery"), say: [line(who.roya, "بسته آماده‌ست. سرد نشه!", "The parcel's ready. Don't let it go cold!")] },
      { type: "deliver", at: { at: "along", dist: 1100 }, radius: 25, text: L("بسته رو به بازار برسون", "Get the parcel to the bazaar"), timeLimitS: 300, checkpoint: false, say: [line(who.roya, "پنج دقیقه وقت داری. بدو!", "Five minutes. Go!")] },
    ],
    fail: { carDestroyed: false, playerDown: true },
    outro: { won: [line(who.roya, "سر وقت رسید! دمت گرم.", "Right on time! Nice one.")], lost: [line(who.roya, "دیر شد… مغازه‌ها بسته شدن.", "Too late. The shutters are down.")] },
    reward: { coins: 300, xp: 180 },
    enabled: true,
  },
  {
    id: "debt-collector",
    title: L("طلب داوود", "Davoud's Debt"),
    brief: L(
      "یکی با ماشین داوود در رفته. وقتی دیدیش بزن به عقبش تا داغون بشه؛ فقط نذار از دستت فرار کنه!",
      "Someone made off with Davoud's car. When you see it, ram it until it's wrecked. Just don't let it get away.",
    ),
    emoji: "💥",
    difficulty: 2,
    giver: { name: who.davoud, at: { at: "junction", min: 80, max: 260, from: "start" } },
    steps: [
      { type: "car", car: "any", text: L("سوار یه ماشین شو", "Get into a car"), say: [line(who.davoud, "سوار شو! اونه، جلوتر.", "Get in! That's him, up ahead.")] },
      { type: "chase", startM: 80, escapeM: 240, text: L("بزن بهش تا از کار بیفته", "Ram it until it's wrecked"), say: [line(who.davoud, "نذار بره! بکوبش!", "Don't let him go! Hit him!")] },
    ],
    fail: { carDestroyed: true, playerDown: true },
    outro: { won: [line(who.davoud, "حساب‌مون صافه.", "We're square.")], lost: [line(who.davoud, "فرار کرد؟ تو چیکار می‌کردی؟!", "He got away? What were you doing?!")] },
    reward: { coins: 380, xp: 240 },
    enabled: true,
  },
  {
    id: "cold-trail",
    title: L("رد سرد", "Cold Trail"),
    brief: L(
      "پلیس شمارهٔ ماشینت رو برداشته. تا اون‌ها رو گم نکردی هیچ‌جا امن نیستی. سه ستاره‌ست؛ بزن به کوچه‌ها و از ردیابی در برو.",
      "The police have your plate. Nowhere is safe until you shake them. Three stars: take to the back streets and go cold.",
    ),
    emoji: "🚨",
    difficulty: 3,
    giver: { name: who.kaveh, at: { at: "start" } },
    steps: [
      { type: "evade", stars: 3, text: L("از سه ستاره فرار کن", "Lose a three-star chase"), say: [line(who.kaveh, "همهٔ گشت‌ها دنبالتن! از خیابون اصلی برو بیرون!", "Every unit is after you! Get off the main road!")] },
      { type: "goto", at: { at: "store", kind: "any", min: 400, max: 900 }, radius: 25, text: L("برو به پناهگاه", "Get to the safe house"), checkpoint: false },
    ],
    fail: { timeLimitS: 600, carDestroyed: true, playerDown: true },
    outro: { won: [line(who.kaveh, "اینجا امنه. بشین یه چایی بخور.", "You're safe here. Have some tea.")], lost: [line(who.kaveh, "گرفتنت… خدا کنه حرف نزنی.", "They got you. Hope you keep quiet.")] },
    reward: { coins: 600, xp: 340 },
    enabled: true,
  },
  {
    id: "postcard",
    title: L("کارت‌پستال شهر", "City Postcard"),
    brief: L(
      "نسیم برای نمایشگاهش دو عکس از نمای شهر لازم داره. برو سمت هر نشانه، دماغهٔ ماشین رو بگیر طرفش و یه لحظه نگه‌دار.",
      "Nasim needs two shots of the skyline for her exhibition. Drive up to each landmark, point the nose at it and hold still for a moment.",
    ),
    emoji: "📸",
    difficulty: 1,
    giver: { name: who.nasim, at: { at: "landmark", min: 60, max: 400, from: "start" } },
    steps: [
      { type: "photo", at: { at: "landmark", min: 250, max: 800 }, radius: 70, text: L("از اولین نشانه عکس بگیر", "Photograph the first landmark"), say: [line(who.nasim, "نور الان عالیه. برو سمتش و رو به‌ش وایسا.", "The light's perfect. Drive up and face it.")] },
      { type: "photo", at: { at: "landmark", min: 350, max: 1000 }, radius: 70, text: L("از نشانهٔ دوم عکس بگیر", "Photograph the second landmark"), checkpoint: true },
      { type: "goto", at: { at: "start" }, radius: 40, text: L("برگرد پیش نسیم", "Take the film back to Nasim") },
    ],
    fail: { timeLimitS: 1200, carDestroyed: false, playerDown: true },
    outro: { won: [line(who.nasim, "فوق‌العاده‌ست! این عکسا تو نمایشگاه می‌درخشن.", "Wonderful! These will shine at the exhibition.")] },
    reward: { coins: 260, xp: 200 },
    enabled: true,
  },
  {
    id: "last-stand",
    title: L("مقاومت تا صبح", "Hold the Tea House"),
    brief: L(
      "چند مرد مسلح می‌خوان چایخانهٔ حاج بهروز رو بگیرن. پیاده برو اونجا، همه‌شون رو بزن بیرون و تا آروم شدن اوضاع محکم وایسا.",
      "A few armed men want Haj Behrooz's tea house. Get there on foot, take them all out, and hold your ground until it goes quiet.",
    ),
    emoji: "🛡️",
    difficulty: 3,
    giver: { name: who.behrooz, at: { at: "store", kind: "cafe", min: 60, max: 300, from: "start" } },
    steps: [
      { type: "goto", at: { at: "store", kind: "cafe", min: 120, max: 400 }, radius: 18, text: L("برو به چایخانه", "Get to the tea house"), checkpoint: true },
      { type: "hostiles", count: 5, text: L("مسلح‌ها رو از پا بنداز", "Take out the gunmen"), say: [line(who.behrooz, "اومدن! پشت پیشخوان قایم شو!", "They're here! Get behind the counter!")] },
      { type: "survive", seconds: 30, text: L("تا آروم شدن اوضاع مقاومت کن", "Hold out until it's quiet"), say: [line(who.behrooz, "هنوز تموم نشده. چشم‌هات باز!", "It's not over. Eyes open!")] },
    ],
    fail: { carDestroyed: false, playerDown: true },
    outro: { won: [line(who.behrooz, "الهی خیر ببینی پسر! چایی مهمون من.", "God bless you! Tea's on me.")], lost: [line(who.behrooz, "آخ… چایخانه رو از دست دادیم.", "Ah… we've lost the tea house.")] },
    reward: { coins: 520, xp: 320 },
    enabled: true,
  },
];

export const STARTER_BY_ID: Record<string, Scenario> = Object.fromEntries(STARTERS.map((s) => [s.id, s]));
