// The game shell: HUD, banners, floating buttons and the tap-on-map cards (Game.tsx).
const game: Record<string, string> = {
  // ---- HUD & time of day
  NIGHT: "شب",
  DAWN: "سحر",
  DAY: "روز",
  DUSK: "غروب",
  "Gem store": "فروشگاه جم",
  "Driving: the map zooms out and walking goals pause": "در حال رانندگی: نقشه دورتر رو نشون می‌ده و هدف‌های پیاده‌روی متوقف می‌شن",
  "Playing from home — tap to switch back to GPS": "بازی از خونه — بزن تا برگردی به GPS",
  "Turn test mode off": "خاموش کردن حالت آزمایشی",
  TEST: "آزمایشی",
  "Claim reward!": "جایزه‌ات رو بگیر!",
  "Couldn't start the game": "بازی باز نشد",
  Retry: "دوباره امتحان کن",
  "LOADING…": "در حال بارگذاری…",

  // ---- toasts
  "THANK YOU!": "ممنونیم!",
  "📵 That call already ended": "📵 این تماس دیگه تموم شده",
  "🛋️ Tap where your commander starts": "🛋️ روی نقشه بزن که فرمانده‌ت از کجا شروع کنه",
  "Test mode off": "حالت آزمایشی خاموش شد",
  "Using your real GPS location": "از موقعیت واقعی GPS استفاده می‌شه",
  "🕹️ Test mode on": "🕹️ حالت آزمایشی روشن شد",
  "No walking needed — tap the map or use “Go here”": "لازم نیست راه بری — روی نقشه بزن یا از «برو اینجا» استفاده کن",
  "You're already on a call": "الان وسط یه تماس دیگه‌ای",

  // ---- banners
  "TIMED RUN": "مأموریت زمان‌دار",
  "{d} to 🎯": "{d} تا 🎯",
  Jump: "پرش",
  Failed: "شکست",
  Finish: "تمومش کن",
  Travelling: "در راه",
  "{d} · {n} min": "{d} · {n} دقیقه",
  "ends in {time}": "{time} تا پایان",

  // ---- floating buttons
  Inbox: "اعلان‌ها",
  "Inbox, {n} new": "اعلان‌ها، {n} تازه",
  "Test mode on — tap to use real GPS": "حالت آزمایشی روشنه — بزن تا از GPS واقعی استفاده کنی",
  "Test mode: play without walking": "حالت آزمایشی: بازی بدون راه رفتن",
  "Daily reward": "جایزهٔ روزانه",
  "Sound on": "صدا روشنه",
  "Turn sound on": "روشن کردن صدا",
  "Turn sound off": "خاموش کردن صدا",
  "Re-center on me": "برگرد روی من",
  "Re-center the map on me": "نقشه رو روی موقعیتم بیار",
  "Tap to dismiss": "برای بستن بزن",
  "{label}, {n} new": "{label}، {n} مورد تازه",

  // ---- notification prompt
  "Don't miss a call": "هیچ تماسی رو از دست نده",
  "Not now": "الان نه",
  "🔔 Notifications on": "🔔 اعلان‌ها روشن شد",
  "Turn on": "روشن کن",

  // ---- map card: common
  "Go here · {d}": "برو اینجا · {d}",
  "Get closer · {d}": "نزدیک‌تر شو · {d}",

  // ---- map card: spawns & missions
  "+{n} XP": "+{n} تجربه",
  "Already collected": "قبلاً برداشتی",
  "Presented by {name}": "با حمایت {name}",
  "📸 Photo at this spot": "📸 عکسی که اینجا گذاشتن",
  "💬 Post at this spot": "💬 پستی که اینجا گذاشتن",

  // ---- map card: events, jobs, shops
  "{start} – {end} · {n}/{max} going · {d}": "{start} تا {end} · {n}/{max} نفر میان · {d}",
  "All events": "همهٔ رویدادها",
  "Posted by {name} · reward {n} 🪙": "ثبت‌شده توسط {name} · دستمزد {n} 🪙",
  "({d} trip)": "(مسیر {d})",
  "Accept job": "قبول کار",
  "🚕 {name} needs a ride": "🚕 {name} ماشین می‌خواد",
  Rider: "مسافر",
  "{n, plural, one {# seat} other {# seats}} · pickup {d} from you · fare": "{n} صندلی · مبدأ {d} با تو فاصله داره · کرایه",
  "Accept ride": "قبول سفر",
  "All jobs": "همهٔ کارها",
  "Up to {n}% off": "تا {n}٪ تخفیف",
  "My shop": "مغازهٔ من",
  "Visit the shop": "سر زدن به مغازه",

  // ---- map card: bases & bosses
  "HQ level": "سطح مقر",

  // ---- map card: pings, flags, strikes, players
  "In your crew": "تو اکیپته",
  "~ approximate location": "~ موقعیت تقریبی",
  "Add to crew": "اضافه به اکیپ",

  // ---- who's online (Online.tsx)
  "Players online now — tap to see who": "بازیکن‌های آنلاین — بزن تا ببینی کی‌ان",
  "{n} players online": "{n} بازیکن آنلاین",
  "playing from home": "از خونه بازی می‌کنه",
  "far away": "دور",
  "about {d}": "حدود {d}",
  "Friends online": "دوست‌های آنلاین",
  "None of your friends is online right now.": "الان هیچ‌کدوم از دوست‌هات آنلاین نیست.",
  "Around you": "اطرافت",
  "No one else is playing within 5 km right now.": "الان کس دیگه‌ای تا ۵ کیلومتری‌ات بازی نمی‌کنه.",
  "Players see only roughly where you are; friends see you exactly.": "بقیه فقط حدودی می‌بینن کجایی؛ دوست‌هات دقیق.",
};

export default game;
