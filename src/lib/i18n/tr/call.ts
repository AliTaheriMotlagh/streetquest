// Video and voice calls (Call.tsx): call states, permission problems and the call screen.
const call: Record<string, string> = {
  // ---- call states
  "Call ended": "Arama bitti",
  Declined: "Reddedildi",
  "No answer": "Cevap yok",
  Busy: "Meşgul",
  "Connection lost": "Bağlantı koptu",
  "Couldn't connect — the network blocked the call": "Bağlanamadı — ağ aramayı engelledi",
  "Couldn't connect — this network blocks the call relay. Try Wi-Fi or another SIM": "Bağlanamadı — bu ağ arama rölesini engelliyor. Wi-Fi'yi ya da başka bir SIM'i dene",
  "Missed call": "Cevapsız arama",

  // ---- permission and device problems
  "Camera & mic are blocked": "Kamera ve mikrofon engelli",
  "Camera is busy": "Kamera meşgul",
  "Open in your browser": "Tarayıcında aç",
  "Calls need https": "Aramalar https gerektiriyor",
  "No camera found — voice only": "Kamera bulunamadı — yalnızca ses",
  "No camera or mic found — you can still watch and listen": "Kamera ya da mikrofon bulunamadı — yine de izleyip dinleyebilirsin",
  "Still blocked — check the steps above": "Hâlâ engelli — yukarıdaki adımlara bak",
  "Couldn't switch camera": "Kamera değiştirilemedi",
  "Another app is using the camera, or camera access is switched off in your phone's quick settings. Close the other app (or turn access on), then tap Try again.":
    "Başka bir uygulama kamerayı kullanıyor ya da telefonunun hızlı ayarlarında kamera erişimi kapalı. Diğer uygulamayı kapat (ya da erişimi aç), sonra «Tekrar dene»ye dokun.",
  "You opened the game inside {app}, which can't use the camera.": "Oyunu {app} içinde açtın, orası kamerayı kullanamıyor.",
  "Tap ••• or the share icon → Open in browser.": "••• ya da paylaş simgesine dokun → Open in browser.",
  "Open it in Chrome to make calls.": "Arama yapmak için Chrome'da aç.",
  "Browsers only allow the camera on https:// pages. Open the game through its https link.": "Tarayıcılar kamerayı yalnızca https:// sayfalarında açar. Oyunu https bağlantısından aç.",
  "Open in Chrome": "Chrome'da aç",
  "Continue voice only": "Yalnızca sesle devam et",
  "Continue without camera": "Kamerasız devam et",
  "Microphone is blocked": "Mikrofon engelli",
  "No mic found — you can still listen": "Mikrofon bulunamadı — yine de dinleyebilirsin",
  "Continue without mic": "Mikrofonsuz devam et",

  // ---- the call screen
  "📹 Incoming video call": "📹 Gelen görüntülü arama",
  "📹 Answer": "📹 Yanıtla",
  "📞 Incoming voice call": "📞 Gelen sesli arama",
  "📞 Answer": "📞 Yanıtla",
  "Calling…": "Aranıyor…",
  "Connecting…": "Bağlanıyor…",
  "Video call with {name}": "{name} ile görüntülü arama",
  "Voice call with {name}": "{name} ile sesli arama",
  "Camera off": "Kamera kapalı",
  Answer: "Yanıtla",
  Unmute: "Sesi aç",
  "Camera on": "Kamerayı aç",
  "Switch camera": "Kamerayı değiştir",
  "Minimize — keep playing": "Küçült — oynamaya devam et",
  "Hang up": "Kapat",
};

export default call;
