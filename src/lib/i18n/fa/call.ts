// Video and voice calls (Call.tsx): call states, permission problems and the call screen.
const call: Record<string, string> = {
  // ---- call states
  "Call ended": "تماس تموم شد",
  Declined: "رد شد",
  "No answer": "جواب نداد",
  Busy: "مشغوله",
  "Connection lost": "اتصال قطع شد",
  "Couldn't connect — the network blocked the call": "وصل نشد — شبکه تماس رو مسدود کرد",
  "Couldn't connect — this network blocks the call relay. Try Wi-Fi or another SIM": "وصل نشد — این شبکه رلهٔ تماس رو مسدود می‌کنه. وای‌فای یا سیم‌کارت دیگه رو امتحان کن",
  "Missed call": "تماس بی‌پاسخ",

  // ---- permission and device problems
  "Camera & mic are blocked": "دوربین و میکروفون مسدودن",
  "Camera is busy": "دوربین مشغوله",
  "Open in your browser": "توی مرورگرت باز کن",
  "Calls need https": "تماس‌ها به https نیاز دارن",
  "No camera found — voice only": "دوربینی پیدا نشد — فقط صدا",
  "No camera or mic found — you can still watch and listen": "دوربین یا میکروفونی پیدا نشد — هنوز می‌تونی ببینی و بشنوی",
  "Still blocked — check the steps above": "هنوز مسدوده — مراحل بالا رو چک کن",
  "Couldn't switch camera": "دوربین عوض نشد",
  "Another app is using the camera, or camera access is switched off in your phone's quick settings. Close the other app (or turn access on), then tap Try again.":
    "یه برنامهٔ دیگه داره از دوربین استفاده می‌کنه، یا دسترسی دوربین توی تنظیمات سریع گوشیت خاموشه. اون برنامه رو ببند (یا دسترسی رو روشن کن)، بعد «دوباره امتحان کن» رو بزن.",
  "You opened the game inside {app}, which can't use the camera.": "بازی رو داخل {app} باز کردی، که نمی‌تونه از دوربین استفاده کنه.",
  "Tap ••• or the share icon → Open in browser.": "روی ••• یا آیکن اشتراک بزن ← Open in browser.",
  "Open it in Chrome to make calls.": "برای تماس، توی Chrome بازش کن.",
  "Browsers only allow the camera on https:// pages. Open the game through its https link.": "مرورگرها فقط روی صفحات https:// اجازهٔ دوربین می‌دن. بازی رو از لینک https خودش باز کن.",
  "Open in Chrome": "باز کردن در Chrome",
  "Continue voice only": "ادامه فقط با صدا",
  "Continue without camera": "ادامه بدون دوربین",
  "Microphone is blocked": "میکروفون مسدوده",
  "No mic found — you can still listen": "میکروفونی پیدا نشد — هنوز می‌تونی بشنوی",
  "Continue without mic": "ادامه بدون میکروفون",

  // ---- the call screen
  "📹 Incoming video call": "📹 تماس تصویری ورودی",
  "📹 Answer": "📹 پاسخ",
  "📞 Incoming voice call": "📞 تماس صوتی ورودی",
  "📞 Answer": "📞 پاسخ",
  "Calling…": "در حال تماس…",
  "Connecting…": "در حال اتصال…",
  "Video call with {name}": "تماس تصویری با {name}",
  "Voice call with {name}": "تماس صوتی با {name}",
  "Camera off": "دوربین خاموش",
  Answer: "پاسخ",
  Unmute: "روشن کردن صدا",
  "Camera on": "روشن کردن دوربین",
  "Switch camera": "عوض کردن دوربین",
  "Minimize — keep playing": "کوچیک کن — بازی رو ادامه بده",
  "Hang up": "قطع تماس",
};

export default call;
