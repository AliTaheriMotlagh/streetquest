// Lotteries (Lottery.tsx): buying tickets at a spot, the draw, and hosting your own.
const lottery: Record<string, string> = {
  now: "الان",

  // ---- a lottery card
  "Cancel this lottery?": "این قرعه‌کشی رو لغو کنم؟",
  "Only possible while nobody else has bought tickets.": "فقط تا وقتی ممکنه که هنوز کسی بلیت نخریده.",
  "Cancel lottery": "لغو قرعه‌کشی",
  "POT PAID OUT": "جایزه پرداخت شد",
  JACKPOT: "جک‌پات",
  "🪙 / ticket": "🪙 / بلیت",
  players: "بازیکن",
  done: "تمام",
  "until draw": "تا قرعه‌کشی",
  draw: "قرعه‌کشی",
  "Draw {when}": "قرعه‌کشی {when}",
  "hosted by you": "میزبان: تو",
  "hosted by {name}": "میزبان: {name}",
  "⭐ official": "⭐ رسمی",
  "🎟️ You hold {mine} of {total} tickets · {pct}% chance": "🎟️ تو {mine} از {total} بلیت داری · شانس {pct}٪",
  "🎉 YOU WON {n} 🪙!": "🎉 تو {n} 🪙 بردی!",
  "🏆 Winner:": "🏆 برنده:",
  "Called off — every ticket was refunded.": "لغو شد — پول همهٔ بلیت‌ها برگشت.",
  "🎲 Drawing the winner…": "🎲 در حال قرعه‌کشی برنده…",

  // ---- buying
  "Fewer tickets": "بلیت کمتر",
  "{n, plural, one {# ticket} other {# tickets}}": "{n} بلیت",
  "More tickets": "بلیت بیشتر",
  "→ {pct}% chance": "← شانس {pct}٪",
  "🎟️ Buy {n} · {cost} 🪙": "🎟️ خرید {n} · {cost} 🪙",
  "Go there to buy · {d}": "برای خرید برو اونجا · {d}",
  "Be within {r} m to buy · {d}": "برای خرید تا {r} متری بمون · {d}",
  "Not enough coins — you have {n}.": "سکهٔ کافی نداری — {n} سکه داری.",
  "You've bought the maximum {n} tickets. Good luck!": "حداکثر {n} بلیت خریدی. موفق باشی!",

  // ---- the lottery list
  "Go to a lottery spot, buy tickets, and at the draw time one random ticket wins the whole pot. More tickets, better odds.":
    "برو یه نقطهٔ قرعه‌کشی، بلیت بخر و سر وقت قرعه‌کشی، یه بلیت تصادفی کل جایزه رو می‌بره. بلیت بیشتر، شانس بیشتر.",
  "No lotteries near you yet — host the first one!": "هنوز قرعه‌کشی‌ای نزدیکت نیست — اولی رو تو برگزار کن!",
  "Your lotteries": "قرعه‌کشی‌های تو",
  "🎉 won": "🎉 برنده شد",
  "Pot {n} 🪙": "جایزه {n} 🪙",
  "your tickets: {mine}/{total}": "بلیت‌های تو: {mine}/{total}",

  // ---- hosting one
  "🎰 Host a lottery": "🎰 برگزاری قرعه‌کشی",
  "Host a lottery": "برگزاری قرعه‌کشی",
  Name: "نام",
  "Friday Night Jackpot": "جک‌پات جمعهٔ شب",
  "Where players buy tickets": "جایی که بازیکن‌ها بلیت می‌خرن",
  "Ticket price 🪙": "قیمت بلیت 🪙",
  "Max tickets / player": "حداکثر بلیت / بازیکن",
  "Draw time": "زمان قرعه‌کشی",
  "{n} h": "{n} ساعت",
  "1 day": "۱ روز",
  "Players must stand within {r} m of the spot to buy. It needs at least 2 players, otherwise everyone is refunded. The winner takes everything.":
    "بازیکن‌ها برای خرید باید تا {r} متری نقطه باشن. حداقل ۲ بازیکن لازمه، وگرنه پول همه برمی‌گرده. برنده همه‌چی رو می‌بره.",
  "Start lottery": "شروع قرعه‌کشی",
};

export default lottery;
