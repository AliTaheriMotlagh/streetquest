// Squad-run lobbies (Lobby.tsx, server/lobby.ts).
const lobbies: Record<string, string> = {
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
  "You win!": "تو بردی!",
  "You placed #{n}": "رتبهٔ #{n} شدی",
  "Round over": "دور تموم شد",
  DNF: "نرسید",

  // ---- supply crates (server)
  "a supply crate": "یه صندوق تدارکاتی",
  "+{n} 🪙": "+{n} 🪙",
};

export default lobbies;
