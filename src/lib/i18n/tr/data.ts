// Game data: factions, buildings, units, research, items, gear, classes, quests,
// achievements, story runs, bosses, towers… (the tables in src/lib).
const data: Record<string, string> = {

  // ---- items
  "Cash Stack": "Para Destesi",
  "Crumpled bills. Spend them well.": "Buruşuk banknotlar. İyi harca bunları.",
  "Glazed Donut": "Şekerli Donut",
  "Fuel for long runs.": "Uzun koşular için yakıt.",
  "Street Burger": "Sokak Burgeri",
  "Greasy. Glorious. Fills you up.": "Yağlı. Muazzam. Karnını doyurur.",
  "Field Ration": "Saha Erzakı",
  "Military issue. Keeps forever.": "Askeri malzeme. Sonsuza dek dayanır.",
  "Spray Can": "Sprey Boya",
  "Tag the city.": "Şehri damgala.",
  Keycard: "Kart Anahtarı",
  "Opens doors you shouldn't.": "Açmaman gereken kapıları açar.",
  "Old Compass": "Eski Pusula",
  "Always points to trouble.": "Her zaman belaya işaret eder.",
  Skateboard: "Kaykay",
  "Daylight cruiser.": "Gündüz gezintisi için.",
  "Sun Stone": "Güneş Taşı",
  "Only drops at high noon-ish.": "Sadece öğle vakti civarı düşer.",
  "Moon Shard": "Ay Parçası",
  "Glows after dark. Night owls only.": "Karanlıktan sonra parlar. Sadece gece kuşları için.",
  "Gold Watch": "Altın Saat",
  "Golden-hour exclusive.": "Altın saate özel.",
  Diamond: "Elmas",
  "The big score.": "Büyük ganimet.",
  "Street Crown": "Sokak Tacı",
  "Kingpin material.": "Sokak babasına yakışır.",

  // ---- gear
  // Affix words come after the noun in Persian: «تفنگ تهاجمی مرگبار».

  // ---- hero bonuses
  XP: "TP",

  // ---- level titles
  Rookie: "Acemi",
  Hustler: "Kurnaz",
  Runner: "Koşucu",
  Enforcer: "Zorba",
  Kingpin: "Patron",
  "Street Legend": "Sokak Efsanesi",

  // ---- achievements
  "First Score": "İlk Ganimet",
  "Collect your first spawn": "İlk ganimetini topla",
  Collector: "Koleksiyoncu",
  "Collect 25 spawns": "25 ganimet topla",
  Hoarder: "Biriktirici",
  "Collect 250 spawns": "250 ganimet topla",
  Safecracker: "Kasa Kıran",
  "Crack 10 chests": "10 sandık aç",
  Wheelman: "Usta Sürücü",
  "Finish 5 timed runs": "5 zamanlı görevi bitir",
  "Night Owl": "Gece Kuşu",
  "Collect something at night": "Geceleyin bir şey topla",
  Explorer: "Kaşif",
  "Collect in 10 different areas": "10 farklı bölgede ganimet topla",
  Courier: "Kurye",
  "Deliver a real package": "Gerçek bir paketi teslim et",
  "Logistics Boss": "Lojistik Patronu",
  "Deliver 10 real packages": "10 gerçek paket teslim et",
  "Give a player a ride": "Bir oyuncuya lift ver",
  "Road King": "Yol Kralı",
  "Give 10 rides": "10 kişiye lift ver",
  Jackpot: "Büyük İkramiye",
  "Win a lottery": "Bir çekilişi kazan",
  "Have 5 friends": "5 arkadaşın olsun",
  "Showed Up": "Buradayım!",
  "Check in at an event": "Bir etkinliğe giriş yap",
  Dedicated: "Azimli",
  "7-day login streak": "7 gün üst üste gel",
  Graffiti: "Grafiti",
  "Leave a message at a location": "Bir yere mesaj bırak",
  "Street Photographer": "Sokak Fotoğrafçısı",
  "Pin a photo to a real place": "Gerçek bir yere fotoğraf iliştir",
  "Local Legend": "Mahalle Efsanesi",
  "Get 10 likes on one post": "Tek bir gönderiye 10 beğeni al",
  "Claim Staker": "Bölge Sahibi",
  "Plant a flag": "Bir bayrak dik",
  "Flag Thief": "Bayrak Hırsızı",
  "Capture a rival's flag": "Bir rakibin bayrağını ele geçir",
  "Bounty Hunter": "Ödül Avcısı",
  "Collect a bounty": "Bir ödül topla",
  "First Blood": "İlk Kan",
  "Down a rival commander in the street": "Sokakta bir rakip komutanı yere ser",
  Fortifier: "Savunmacı",
  "Build your first tower": "İlk kulesini inşa et",
  "Hold the Line": "Hattı Tut",
  "Stop a raider wave without a single leak": "Bir baskın dalgasını tek bir sızıntı olmadan durdur",
  "Top Gun": "Top Gun",
  Doomsday: "Kıyamet",
  "Fire your faction's superweapon": "Fraksiyonunun süper silahını ateşle",
  Shopkeeper: "Dükkâncı",
  "First Sale": "İlk Satış",
  "Hand over your first order": "İlk siparişini teslim et",

  // ---- daily quests
  "Leave Your Mark": "İzini Bırak",
  "Pin a message or photo somewhere": "Bir yere mesaj ya da fotoğraf iliştir",

  // ---- timed runs
  "Dead Drop": "Gizli Bırakma",

  // ---- life sim
  Social: "Sosyal",

  // ---- towers, raiders, pings
  Drone: "Dron",

  // ---- ride status
  "🟡 Looking for a driver": "🟡 Sürücü aranıyor",
  "🔵 Driver on the way": "🔵 Sürücü yolda",
  "🟣 On the road": "🟣 Yolda",
  "✅ Arrived": "✅ Vardı",
  "⚫ Cancelled": "⚫ İptal edildi",
};

export default data;
