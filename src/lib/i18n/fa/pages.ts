// Public pages and the screens that catch failures: the events list and event pages,
// the site header, the offline page and the error screens.
const pages: Record<string, string> = {
  // ---- site header
  "Play now": "بازی کن",

  // ---- events list
  "Live & upcoming real-world events": "رویدادهای زنده و در پیش در دنیای واقعی",
  "Join StreetQuest group quests near you. Meet up, check in with GPS and earn squad XP bonuses.": "توی مأموریت‌های گروهی StreetQuest نزدیک خودت شرکت کن. دورهم جمع شو، با GPS ثبت حضور کن و پاداش تجربهٔ جوخه بگیر.",
  "No public events right now — create one in the game!": "الان رویداد عمومی‌ای نیست — توی بازی یکی بساز!",
  "{n}/{max} going · by {name}": "{n}/{max} شرکت‌کننده · میزبان: {name}",
  Official: "رسمی",

  // ---- one event (public page)
  "Real-world group quest on {name}. Show up, check in, earn squad XP.": "مأموریت گروهی در دنیای واقعی روی {name}. حاضر شو، ثبت حضور کن، تجربهٔ جوخه بگیر.",
  "⭐ Official event": "⭐ رویداد رسمی",
  Going: "شرکت‌کننده",
  "Join in game": "ورود به بازی",
  "Open map": "باز کردن نقشه",
  "Hosted by {name}. Check in with GPS within {r} m of the meeting point.": "میزبان: {name}. با GPS تا {r} متری محل قرار ثبت حضور کن.",

  // ---- offline page (shown by the service worker)
  "You're offline": "آفلاینی",
  "StreetQuest needs a connection to sync your moves with other players. The map you've already visited is saved on this phone — open the game to see it, and everything syncs when you're back online.":
    "StreetQuest برای همگام‌سازی حرکت‌هات با بازیکن‌های دیگه به اینترنت نیاز داره. نقشه‌ای که قبلاً دیدی روی همین گوشی ذخیره شده — بازی رو باز کن تا ببینیش؛ وقتی دوباره آنلاین بشی، همه‌چی همگام می‌شه.",
  "Open the game": "باز کردن بازی",

  // ---- error screens
  "Something went wrong": "یه چیزی خراب شد",
  "Something broke": "یه مشکلی پیش اومد",
  "The game hit an error. Your progress is saved on the server.": "بازی به یه خطا خورد. پیشرفتت روی سرور ذخیره شده.",
};

export default pages;
