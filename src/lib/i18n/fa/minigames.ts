// Mini-games (MiniGames.tsx), multiplayer race lobbies (Lobby.tsx) and the supply-crate
// spawns (server/lobby.ts).
const minigames: Record<string, string> = {
  // ---- colors of the wires
  red: "قرمز",
  blue: "آبی",
  yellow: "زرد",
  green: "سبز",
  white: "سفید",
  purple: "بنفش",

  // ---- arcade HUD & rules
  SCORE: "امتیاز",
  COMBO: "کمبو",
  SEC: "ثانیه",
  "Window {n}": "پنجرهٔ {n}",
  "⟳ RELOAD!": "⟳ پرکن!",
  "⟳ Reload": "⟳ پر کردن",
  "Hostiles +10 · 😈 boss +30 · civilians −25 · combos add up to +10": "دشمن +۱۰ · 😈 غول +۳۰ · غیرنظامی −۲۵ · کمبو تا +۱۰ امتیاز اضافه می‌کنه",
  "Defuse the crate": "صندوق رو خنثی کن",
  "ROUND {n}/{total}": "دور {n}/{total}",
  "Cut the {color} wire": "سیم {color} رو قطع کن",
  "👀 Watch the detonator…": "👀 به چاشنی نگاه کن…",
  "Get ready…": "آماده باش…",
  "✂️ Cut the wires in the order shown": "✂️ سیم‌ها رو به ترتیبی که نشون داده می‌شه قطع کن",

  // ---- race lobby
  "GO GO GO!": "بدو بدو بدو!",
  "Your squad is on the map — first to the 🎯 wins": "جوخه‌ات روی نقشه‌ست — هرکی اول به 🎯 برسه می‌بره",
  HOST: "میزبان",
  "waiting…": "منتظر…",
  "Players nearby were pinged · auto-start in {s}s": "به بازیکن‌های نزدیک خبر داده شد · {s} ثانیهٔ دیگه شروع می‌شه",
  "Start ({n} players)": "شروع ({n} بازیکن)",
  "Play solo now": "همین الان تنها بازی کن",
  "Waiting for the host…": "منتظر میزبان…",
  "Starting…": "در حال شروع…",
  "Waiting for the others": "منتظر بقیه",
  "You win!": "تو بردی!",
  "You placed #{n}": "رتبهٔ #{n} شدی",
  "Round over": "دور تموم شد",
  DNF: "نرسید",
  "playing…": "در حال بازی…",

  // ---- supply crates (server)
  "The spawn expired": "این صندوق منقضی شد",
  "Didn't finish": "تمام نشد",
  "💥 BOOM — the crate stayed shut. Try again!": "💥 بوم! — صندوق بسته موند. دوباره امتحان کن!",
  "Already opened": "قبلاً باز شده",
  "a supply crate": "یه صندوق تدارکاتی",
  "Flawless!": "بی‌نقص!",
  "+{n} 🪙": "+{n} 🪙",
  "🏆 winner bonus": "🏆 جایزهٔ برنده",
  "Already played": "قبلاً بازی کردی",
};

export default minigames;
