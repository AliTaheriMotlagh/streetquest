// First-person battles (fps/Fps.tsx): the objective, the HUD and the result screen.
const fps: Record<string, string> = {
  // ---- objectives
  "Take down the boss — strafe out of its red beam": "غول رو بزن — از پرتو قرمزش کنار برو",
  "Capture the zone in front of the Command Center — or wipe out the defenders": "منطقهٔ جلوی مقر فرماندهی رو تصرف کن — یا مدافع‌ها رو نابود کن",
  "Hold the Command Center until time runs out": "تا تموم شدن وقت، مقر فرماندهی رو نگه دار",
  "Can't join": "نمی‌تونی وارد بشی",
  "Back to map": "برگشت به نقشه",

  // ---- HUD
  "CAPTURING…": "در حال تصرف…",
  "CAPTURE {pct}%": "تصرف {pct}٪",
  "{n} HP": "{n} جان",
  ENRAGED: "خشمگین",
  "⚠ BEAM INCOMING — MOVE!": "⚠ پرتو داره میاد — حرکت کن!",
  RELOADING: "در حال پر کردن",
  "Exit full screen": "خروج از تمام‌صفحه",
  "Full screen": "تمام‌صفحه",
  "✕ Leave": "✕ خروج",
  "Click to fight": "کلیک کن تا بجنگی",
  "WASD move · Shift sprint · Mouse aim · Click shoot · R reload · Esc release": "W A S D: حرکت · Shift: دویدن · ماوس: نشونه‌گیری · کلیک: شلیک · R: پر کردن · Esc: آزاد کردن ماوس",
  "💀 You're down — no respawns this round": "💀 زمین‌گیر شدی — این دور دوباره زنده نمی‌شی",
  FIRE: "شلیک",

  // ---- phone controls
  "👈 Left thumb: move · push to the edge to sprint": "👈 انگشت چپ: حرکت · تا لبه هل بده تا بدوی",
  "Right thumb: aim · hold FIRE and drag to aim while shooting 👉": "انگشت راست: نشونه‌گیری · شلیک رو نگه دار و موقع شلیک بکش تا نشونه بگیری 👉",
  "📱↻ Turn your phone sideways for a wider view": "📱↻ گوشی رو افقی کن تا دید بازتری داشته باشی",

  // ---- result
  VICTORY: "پیروزی",
  DEFEAT: "شکست",
  "The boss is down. Loot goes to everyone who hit it.": "غول از پا افتاد. غنیمت به همهٔ کسانی که بهش زدن می‌رسه.",
  "The boss survived — its damage stays, come back with a crew.": "غول زنده موند — آسیبش می‌مونه، با اکیپ برگرد.",
  "Base breached! Your share of the loot is in.": "پایگاه نفوذ شد! سهمت از غنیمت اضافه شد.",
  "The defense held.": "دفاع ایستاد.",
  "You held the base!": "پایگاه رو نگه داشتی!",
  "The base was breached.": "پایگاه نفوذ شد.",
  "Kills: {n}": "کشته‌ها: {n}",
};

export default fps;
