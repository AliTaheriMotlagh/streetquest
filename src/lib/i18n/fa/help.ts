// "How this works" cards, the first-run tour, and map labels.
const help: Record<string, string> = {
  // ---- help cards
  "{title}: how it works": "{title}: چطور کار می‌کنه",
  "Got it": "فهمیدم",
  Gems: "جم‌ها",
  Events: "رویدادها",
  "Story: chapters played on real streets. A gold beacon on the map shows where to go next.": "داستان: فصل‌هایی که تو خیابون‌های واقعی بازی می‌شن. یه چراغ طلایی روی نقشه نشون می‌ده بعدش کجا بری.",
  "Some steps hide the target: search the gold circle and follow the hot/cold detector.": "بعضی مرحله‌ها هدف رو پنهون می‌کنن: دایرهٔ طلایی رو بگرد و دنبال ردیاب داغ/سرد برو.",
  "GPS games: treasure hunt, street sprint and checkpoint rally — quick rounds with rewards.": "بازی‌های GPS: گنج‌یابی، دوی سرعت خیابونی و رالی ایست‌بازرسی — دورهای کوتاه با جایزه.",
  "Lottery: buy tickets at the 🎰 spot on the map. At the draw time one random ticket wins the whole pot.": "قرعه‌کشی: از نقطهٔ 🎰 روی نقشه بلیت بخر. سر وقت قرعه‌کشی، یه بلیت تصادفی کل جایزه رو می‌بره.",
  "Shops run by players at real places. Browse the ones around you, search, and catch the deals.": "مغازه‌هایی که بازیکن‌ها تو جاهای واقعی باز کردن. مغازه‌های اطرافت رو ببین، جستجو کن و تخفیف‌ها رو از دست نده.",
  "Buying holds your coins safely. Go to the shop, show your pickup code, and the seller hands it over.": "موقع خرید، سکه‌هات امانت نگه داشته می‌شه. برو مغازه، کد تحویلت رو نشون بده و فروشنده جنس رو تحویلت می‌ده.",
  "Open your own shop in My shop: add products with photos, set prices and discounts, and fill your shop window.": "از «مغازهٔ من» مغازهٔ خودت رو باز کن: محصول با عکس اضافه کن، قیمت و تخفیف بذار و ویترینت رو بچین.",
  "A shop stays open for a month at a time. Renew it before it closes to keep selling.": "هر مغازه یه ماه باز می‌مونه. قبل از بسته شدن تمدیدش کن تا فروشت ادامه داشته باشه.",
  "Free gems: watch a short sponsor spot (a few per day).": "جم رایگان: یه تبلیغ کوتاه ببین (روزی چند بار).",
  "You also earn gems from levels, quests, achievements, goals and story chapters.": "از بالا رفتن سطح، مأموریت‌ها، دستاوردها، هدف‌ها و فصل‌های داستان هم جم می‌گیری.",
  "Real deliveries posted by players nearby. Accept one, pick it up, hand it over with the code.": "تحویل بستهٔ واقعی که بازیکن‌های نزدیک ثبت کردن. یکی رو قبول کن، بسته رو بگیر و با کد تحویل بده.",
  "Rides: request a car and set your fare, or drive a waiting rider. The rider tells the driver a 4-digit PIN at pickup.": "سفرها: ماشین درخواست بده و کرایه‌ات رو تعیین کن، یا یه مسافر منتظر رو برسون. موقع سوار شدن، مسافر یه رمز ۴ رقمی به راننده می‌گه.",
  "The driver is paid when both of you reach the drop-off, or when the rider taps “I've arrived”.": "وقتی هر دوتون به مقصد برسین، یا مسافر «رسیدم» رو بزنه، کرایهٔ راننده پرداخت می‌شه.",
  "Coins are held in escrow, so couriers and drivers always get paid — and you're refunded if nobody takes the job.": "سکه‌ها امانت نگه داشته می‌شن، پس پیک و راننده همیشه پولشون رو می‌گیرن — و اگه کسی کار رو قبول نکنه، پولت برمی‌گرده.",
  "Chat with your crew, nearby players or everyone.": "با اکیپت، بازیکن‌های نزدیک یا همه گپ بزن.",
  "Meet-ups at real places. Join, show up, check in for rewards.": "دورهمی تو جاهای واقعی. ثبت‌نام کن، برو و برای جایزه حضورت رو ثبت کن.",
  "Official events pay extra.": "رویدادهای رسمی جایزهٔ بیشتری دارن.",
  "Tap ✕ to dismiss one, or Clear all.": "برای حذف هر کدوم ✕ رو بزن، یا «پاک کردن همه».",

  // ---- first-run tour
  Tutorial: "آموزش",
  "Your reach": "محدودهٔ دسترسیت",
  "Shops run by players around you — buy with coins, or open your own shop and sell.": "مغازه‌های بازیکن‌های اطرافت — با سکه خرید کن، یا مغازهٔ خودت رو باز کن و بفروش.",
  "How do you want to play?": "چطوری می‌خوای بازی کنی؟",
  "I'll walk": "پیاده میام",
  "Play from home": "بازی از خونه",
  Skip: "رد شو",
  "Let's go!": "بزن بریم!",
  Next: "بعدی",

  // ---- map labels
  refunded: "پول برگشت",
  "GO HERE": "برو اینجا",
  "GO HERE · {n}/{total}": "برو اینجا · {n}/{total}",
  "SEARCH HERE · {n}/{total}": "اینجا رو بگرد · {n}/{total}",
  "HOLD HERE · {n}/{total}": "اینجا بمون · {n}/{total}",

  // ---- outposts: "Outpost Bravo-3" (radio call-signs, as Persian speakers say them)
  Hotel: "هتل",
};

export default help;
