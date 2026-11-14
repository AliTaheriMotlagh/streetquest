// Public pages and the screens that catch failures: the events list and event pages,
// the site header, the offline page and the error screens.
const pages: Record<string, string> = {
  // ---- site header
  "Play now": "Hemen oyna",

  // ---- events list
  "Live & upcoming real-world events": "Canlı ve yaklaşan gerçek dünya etkinlikleri",
  "Join StreetQuest group quests near you. Meet up, check in with GPS and earn squad XP bonuses.": "Yakınındaki StreetQuest grup görevlerine katıl. Buluş, GPS ile check-in yap ve ekip TP bonusu kazan.",
  "No public events right now — create one in the game!": "Şu an herkese açık etkinlik yok — oyunda bir tane oluştur!",
  "{n}/{max} going · by {name}": "{n}/{max} katılıyor · düzenleyen: {name}",
  Official: "Resmi",

  // ---- one event (public page)
  "Real-world group quest on {name}. Show up, check in, earn squad XP.": "{name} üzerinde gerçek dünya grup görevi. Gel, check-in yap, ekip TP kazan.",
  "⭐ Official event": "⭐ Resmi etkinlik",
  Going: "Katılıyor",
  "Join in game": "Oyuna katıl",
  "Open map": "Haritayı aç",
  "Hosted by {name}. Check in with GPS within {r} m of the meeting point.": "Düzenleyen: {name}. Buluşma noktasının {r} metre içinde GPS ile check-in yap.",

  // ---- offline page (shown by the service worker)
  "You're offline": "Çevrimdışısın",
  "StreetQuest needs a connection to sync your moves with other players. The map you've already visited is saved on this phone — open the game to see it, and everything syncs when you're back online.":
    "StreetQuest, hareketlerini diğer oyuncularla eşitlemek için internet bağlantısına ihtiyaç duyar. Daha önce gezdiğin harita bu telefonda kayıtlı — görmek için oyunu aç; tekrar çevrimiçi olduğunda her şey eşitlenir.",
  "Open the game": "Oyunu aç",

  // ---- error screens
  "Something went wrong": "Bir şeyler ters gitti",
  "Something broke": "Bir sorun çıktı",
  "The game hit an error. Your progress is saved on the server.": "Oyunda bir hata oluştu. İlerlemen sunucuda kayıtlı.",

  // ---- credits (the map and the street cars' 3D models)
  Credits: "Katkıda bulunanlar",
  "Map data": "Harita verileri",
  "OpenStreetMap contributors": "OpenStreetMap katkıda bulunanları",
  "3D cars": "3D arabalar",
  "3D weapons": "3D silahlar",
  "3D street furniture and trees": "3D sokak eşyaları ve ağaçlar",
  "3D people": "3D insanlar",
  "Sound effects": "Ses efektleri",
  "Cut, layered and evened out for the game.": "Oyun için kesildi, katmanlandı ve dengelendi.",
  "Made lighter for phones, recoloured and given new names in the game.": "Telefonlar için hafifletildi, yeniden renklendirildi ve oyunda yeni adlar verildi.",
  "Made lighter for phones and recoloured for the game.": "Telefonlar için hafifletildi ve oyun için yeniden renklendirildi.",
};

export default pages;
