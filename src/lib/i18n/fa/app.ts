// App shell: the inbox, install and update prompts, notification permission, video and
// photo helpers (Inbox.tsx, Pwa.tsx, pwaClient.ts, AutoVideo.tsx, photo.ts, ShareButton.tsx).
const app: Record<string, string> = {
  // ---- inbox
  "just now": "همین الان",
  "{n} min ago": "{n} دقیقه پیش",
  "{n} h ago": "{n} ساعت پیش",
  "{n} d ago": "{n} روز پیش",
  "🔔 Inbox": "🔔 صندوق ورودی",
  "Clear all": "پاک کردن همه",
  "📭 All caught up! Rewards, raids, crew news and events show up here.": "📭 همه‌چی رو خوندی! جایزه‌ها، یورش‌ها، خبرهای اکیپ و رویدادها اینجا میان.",
  Dismiss: "حذف",

  // ---- install & update prompts
  "showing your last map": "آخرین نقشهٔ ذخیره‌شده رو نشون می‌دیم",
  "Updating…": "در حال به‌روزرسانی…",
  "one moment": "یه لحظه صبر کن",
  "New version ready": "نسخهٔ جدید آماده‌ست",
  "Game updated": "بازی به‌روز شد",
  "new features and fixes": "ویژگی‌ها و رفع اشکال‌های جدید",
  "reload to get the latest": "برای داشتن آخرین نسخه، صفحه رو دوباره بارگذاری کن",
  Later: "بعداً",
  Update: "به‌روزرسانی",
  Reload: "بارگذاری دوباره",

  // ---- notifications permission
  "On iPhone, add StreetQuest to your Home Screen first (Share → Add to Home Screen), then turn notifications on from the app.": "توی آیفون، اول StreetQuest رو به صفحهٔ اصلی اضافه کن (Share ← Add to Home Screen)، بعد از داخل بازی اعلان‌ها رو روشن کن.",
  "This browser can't show notifications.": "این مرورگر نمی‌تونه اعلان نشون بده.",
  "Notifications work in the installed / production app.": "اعلان‌ها فقط توی نسخهٔ نصب‌شدهٔ بازی کار می‌کنن.",
  "Notifications are blocked — allow them in your browser's site settings.": "اعلان‌ها مسدودن — توی تنظیمات سایت مرورگرت مجازشون کن.",
  "Notifications aren't set up on the server yet.": "اعلان‌ها هنوز روی سرور راه‌اندازی نشدن.",
  "Couldn't turn notifications on": "اعلان‌ها روشن نشد",

  // ---- video & photos
  "Play video": "پخش ویدیو",
  "Tap to play": "برای پخش بزن",
  Mute: "بی‌صدا",
  "🔊 Sound on": "🔊 صدا روشنه",
  "🔇 Tap for sound": "🔇 برای صدا بزن",
  "Pick an image": "یه عکس انتخاب کن",
  "Couldn't read that image": "اون عکس خونده نشد",
  "That photo is too detailed — try another one": "این عکس خیلی پیچیده‌ست — یکی دیگه رو امتحان کن",
  "Link copied ✓": "لینک کپی شد ✓",
  "My base": "پایگاه من",
  "Story missions": "مأموریت‌های داستان",
  Story: "داستان",
  "Story missions on real streets": "مأموریت‌های داستان توی خیابون‌های واقعی",
  "Weekly goals with your crew": "هدف‌های هفتگی با اکیپت",
  "Your city is the map": "شهر تو همون نقشه‌ست",
};

export default app;
