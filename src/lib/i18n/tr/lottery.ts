// Lotteries (Lottery.tsx): buying tickets at a spot, the draw, and hosting your own.
const lottery: Record<string, string> = {
  now: "şimdi",

  // ---- a lottery card
  "Cancel this lottery?": "Bu çekilişi iptal edeyim mi?",
  "Only possible while nobody else has bought tickets.": "Yalnızca kimse bilet almamışken mümkün.",
  "Cancel lottery": "Çekilişi iptal et",
  "POT PAID OUT": "ÖDÜL ÖDENDİ",
  JACKPOT: "JACKPOT",
  "🪙 / ticket": "🪙 / bilet",
  players: "oyuncu",
  done: "bitti",
  "until draw": "çekilişe kadar",
  draw: "çekiliş",
  "Draw {when}": "Çekiliş {when}",
  "hosted by you": "düzenleyen: sen",
  "hosted by {name}": "düzenleyen: {name}",
  "⭐ official": "⭐ resmi",
  "🎟️ You hold {mine} of {total} tickets · {pct}% chance": "🎟️ {total} biletin {mine} tanesi sende · {pct}% şans",
  "🎉 YOU WON {n} 🪙!": "🎉 {n} 🪙 KAZANDIN!",
  "🏆 Winner:": "🏆 Kazanan:",
  "Called off — every ticket was refunded.": "İptal edildi — tüm biletlerin parası iade edildi.",
  "🎲 Drawing the winner…": "🎲 Kazanan çekiliyor…",

  // ---- buying
  "Fewer tickets": "Daha az bilet",
  "{n, plural, one {# ticket} other {# tickets}}": "{n, plural, one {# bilet} other {# bilet}}",
  "More tickets": "Daha fazla bilet",
  "→ {pct}% chance": "→ {pct}% şans",
  "🎟️ Buy {n} · {cost} 🪙": "🎟️ {n} al · {cost} 🪙",
  "Go there to buy · {d}": "Almak için oraya git · {d}",
  "Be within {r} m to buy · {d}": "Almak için {r} m içinde ol · {d}",
  "Not enough coins — you have {n}.": "Yeterli jeton yok — {n} jetonun var.",
  "You've bought the maximum {n} tickets. Good luck!": "En fazla {n} bilet aldın. Bol şans!",

  // ---- the lottery list
  "Go to a lottery spot, buy tickets, and at the draw time one random ticket wins the whole pot. More tickets, better odds.":
    "Bir çekiliş noktasına git, bilet al; çekiliş saatinde rastgele bir bilet tüm ödülü kazanır. Daha fazla bilet, daha fazla şans.",
  "No lotteries near you yet — host the first one!": "Yakınında henüz çekiliş yok — ilkini sen düzenle!",
  "Your lotteries": "Çekilişlerin",
  "🎉 won": "🎉 kazandı",
  "Pot {n} 🪙": "Ödül {n} 🪙",
  "your tickets: {mine}/{total}": "biletlerin: {mine}/{total}",

  // ---- hosting one
  "🎰 Host a lottery": "🎰 Çekiliş düzenle",
  "Host a lottery": "Çekiliş düzenle",
  Name: "Ad",
  "Friday Night Jackpot": "Cuma Gecesi Jackpot'u",
  "Where players buy tickets": "Oyuncuların bilet aldığı yer",
  "Ticket price 🪙": "Bilet fiyatı 🪙",
  "Max tickets / player": "Oyuncu başına en fazla bilet",
  "Draw time": "Çekiliş saati",
  "{n} h": "{n} sa",
  "1 day": "1 gün",
  "Players must stand within {r} m of the spot to buy. It needs at least 2 players, otherwise everyone is refunded. The winner takes everything.":
    "Oyuncuların bilet almak için noktaya {r} m içinde olması gerekir. En az 2 oyuncu lazım, yoksa herkesin parası iade edilir. Kazanan her şeyi alır.",
  "Start lottery": "Çekilişi başlat",
};

export default lottery;
