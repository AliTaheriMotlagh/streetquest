// Shared UI words, units, errors and the site copy.
const common: Record<string, string> = {
  // ---- navigation & everyday words
  Language: "زبان",
  Nearby: "اطراف",
  Base: "پایگاه",
  Play: "بازی",
  Market: "بازار",
  Jobs: "کارها",
  Crew: "اکیپ",
  Go: "برو",
  "Go here": "برو اینجا",
  "Go there": "برو اونجا",
  Stop: "توقف",
  Close: "بستن",
  Open: "باز",
  Closed: "بسته",
  Attack: "حمله",
  Join: "پیوستن",
  "Check in": "ثبت حضور",
  Chat: "گفتگو",
  Collect: "برداشتن",
  Abandon: "رها کردن",
  Message: "پیام",
  "Video call": "تماس تصویری",
  "Voice call": "تماس صوتی",
  HP: "جان",
  Range: "برد",
  "Level {n}": "سطح {n}",
  "Lv {n}": "سطح {n}",
  ", ": "، ",
  "How this works": "این بخش چطور کار می‌کنه؟",
  "Previous tabs": "زبانه‌های قبلی",
  "More tabs": "زبانه‌های بیشتر",

  // ---- units
  "{n} m": "{n} متر",
  "{n} km": "{n} کیلومتر",
  "{n} km/h": "{n} کیلومتر بر ساعت",

  // ---- rarity
  Common: "معمولی",
  Rare: "کمیاب",
  Epic: "حماسی",
  Legendary: "افسانه‌ای",

  // ---- connection & server errors
  "Couldn't start a game ({status})": "بازی شروع نشد ({status})",
  "The server is taking too long — check your connection and try again": "سرور خیلی دیر جواب می‌ده — اینترنتت رو چک کن و دوباره امتحان کن",
  "You're offline — try again when you're back online": "آفلاینی — وقتی اینترنت وصل شد دوباره امتحان کن",
  "Request failed ({status})": "درخواست انجام نشد ({status})",
  "Something you entered isn't valid ({field})": "یکی از چیزهایی که وارد کردی درست نیست ({field})",
  "That's no longer there — refresh and try again": "این دیگه وجود نداره — صفحه رو تازه کن و دوباره امتحان کن",
  "That was already done": "این کار قبلاً انجام شده",
  "Server error — please try again": "خطای سرور — لطفاً دوباره امتحان کن",
  "Photos must be JPEG, WebP or PNG": "عکس باید JPEG، WebP یا PNG باشه",
  "Photo is too large": "حجم عکس زیاده",
  "That file isn't an image": "این فایل عکس نیست",
  "That callsign is taken": "این اسم رو قبلاً یکی دیگه برداشته",

  // ---- the site (marketing copy: polite written Persian)
  "Your city is the game map.": "شهر شما، نقشهٔ بازی است.",
  "GPS game": "بازی GPS",
  "location-based game": "بازی مکان‌محور",
  "real world game": "بازی در دنیای واقعی",
  "AR game": "بازی واقعیت افزوده",
  "Pokémon GO alternative": "جایگزین پوکمون گو",
  "city exploration game": "بازی گشت‌وگذار شهری",
  geocaching: "گنج‌یابی با GPS",
  "outdoor game": "بازی در فضای باز",
  "courier game": "بازی پیک",

  // ---- dialogs
  Cancel: "انصراف",
  OK: "باشه",
  Unauthorized: "دسترسی غیرمجاز",
  "Cloudflare TURN {status}": "خطای سرویس TURN کلودفلر {status}",
  "Metered TURN {status}": "خطای سرویس TURN (Metered) {status}",
};

export default common;
