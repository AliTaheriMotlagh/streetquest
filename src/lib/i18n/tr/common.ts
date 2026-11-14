// Shared UI words, units, errors and the site copy.
const common: Record<string, string> = {
  // ---- navigation & everyday words
  Language: "Dil",
  Nearby: "Yakında",
  Play: "Oyna",
  Market: "Pazar",
  Jobs: "İşler",
  Crew: "Ekip",
  Go: "Git",
  "Go here": "Buraya git",
  "Go there": "Oraya git",
  Stop: "Dur",
  Close: "Kapat",
  Open: "Açık",
  Closed: "Kapalı",
  Attack: "Saldır",
  Join: "Katıl",
  "Check in": "Yoklama ver",
  Chat: "Sohbet",
  Collect: "Topla",
  Abandon: "Vazgeç",
  Message: "Mesaj",
  "Video call": "Görüntülü arama",
  "Voice call": "Sesli arama",
  HP: "can",
  Range: "Menzil",
  "Level {n}": "Seviye {n}",
  "Lv {n}": "Sv {n}",
  ", ": ", ",
  "How this works": "Bu nasıl çalışıyor?",
  "Previous tabs": "Önceki sekmeler",
  "More tabs": "Daha fazla sekme",

  // ---- units
  "{n} m": "{n} m",
  "{n} km": "{n} km",
  "{n} km/h": "{n} km/sa",

  // ---- rarity
  Common: "Yaygın",
  Rare: "Nadir",
  Epic: "Destansı",
  Legendary: "Efsanevi",

  // ---- connection & server errors
  "Couldn't start a game ({status})": "Oyun başlatılamadı ({status})",
  "The server is taking too long — check your connection and try again": "Sunucu çok uzun sürüyor — bağlantını kontrol edip tekrar dene",
  "You're offline — try again when you're back online": "Çevrimdışısın — internete tekrar bağlanınca dene",
  "Couldn't reach the server — check your connection and try again": "Sunucuya ulaşılamadı — bağlantını kontrol edip tekrar dene",
  "Request failed ({status})": "İstek başarısız oldu ({status})",
  "Something you entered isn't valid ({field})": "Girdiğin bir şey geçerli değil ({field})",
  "That's no longer there — refresh and try again": "Bu artık orada değil — sayfayı yenileyip tekrar dene",
  "That was already done": "Bu zaten yapılmıştı",
  "Server error — please try again": "Sunucu hatası — lütfen tekrar dene",
  "Photos must be JPEG, WebP or PNG": "Fotoğraflar JPEG, WebP veya PNG olmalı",
  "Photo is too large": "Fotoğraf çok büyük",
  "That file isn't an image": "Bu dosya bir resim değil",
  "That callsign is taken": "Bu takma ad alınmış",

  // ---- the site (marketing copy: polite written Persian)
  "Your city is the game map.": "Şehrin, oyunun haritası.",
  "GPS game": "GPS oyunu",
  "location-based game": "konum tabanlı oyun",
  "real world game": "gerçek dünya oyunu",
  "AR game": "AR oyunu",
  "Pokémon GO alternative": "Pokémon GO alternatifi",
  "city exploration game": "şehir keşif oyunu",
  geocaching: "GPS hazine avı",
  "outdoor game": "açık hava oyunu",
  "courier game": "kurye oyunu",

  // ---- dialogs
  Cancel: "İptal",
  OK: "Tamam",
  Unauthorized: "Yetkisiz erişim",
  "Cloudflare TURN {status}": "Cloudflare TURN hatası {status}",
  "Metered TURN {status}": "TURN servisi hatası (Metered) {status}",
};

export default common;
