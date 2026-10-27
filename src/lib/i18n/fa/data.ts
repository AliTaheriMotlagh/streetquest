// Game data: factions, buildings, units, research, items, gear, classes, quests,
// achievements, story runs, bosses, towers… (the tables in src/lib).
const data: Record<string, string> = {

  // ---- items
  "Cash Stack": "دسته اسکناس",
  "Crumpled bills. Spend them well.": "اسکناس‌های مچاله. خوب خرجشون کن.",
  "Glazed Donut": "دونات شکری",
  "Fuel for long runs.": "سوخت دویدن‌های طولانی.",
  "Street Burger": "همبرگر خیابونی",
  "Greasy. Glorious. Fills you up.": "چرب. محشر. حسابی سیرت می‌کنه.",
  "Field Ration": "جیرهٔ صحرایی",
  "Military issue. Keeps forever.": "سهمیهٔ ارتشی. هیچ‌وقت خراب نمی‌شه.",
  "Spray Can": "اسپری رنگ",
  "Tag the city.": "شهر رو امضا کن.",
  Keycard: "کارت‌کلید",
  "Opens doors you shouldn't.": "درهایی رو باز می‌کنه که نباید.",
  "Old Compass": "قطب‌نمای قدیمی",
  "Always points to trouble.": "همیشه سمت دردسر رو نشون می‌ده.",
  Skateboard: "اسکیت‌برد",
  "Daylight cruiser.": "مخصوص گشت‌وگذار روز.",
  "Sun Stone": "سنگ خورشید",
  "Only drops at high noon-ish.": "فقط حوالی ظهر پیدا می‌شه.",
  "Moon Shard": "تکهٔ ماه",
  "Glows after dark. Night owls only.": "بعد از تاریکی می‌درخشه. فقط برای شب‌زنده‌دارها.",
  "Gold Watch": "ساعت طلا",
  "Golden-hour exclusive.": "مخصوص ساعت طلایی.",
  Diamond: "الماس",
  "The big score.": "شکار بزرگ.",
  "Street Crown": "تاج خیابون",
  "Kingpin material.": "درخور سرکردهٔ محله.",

  // ---- gear
  // Affix words come after the noun in Persian: «تفنگ تهاجمی مرگبار».

  // ---- hero bonuses
  XP: "تجربه",

  // ---- level titles
  Rookie: "تازه‌کار",
  Hustler: "زبل",
  Runner: "دونده",
  Enforcer: "گردن‌کلفت",
  Kingpin: "سرکرده",
  "Street Legend": "اسطورهٔ خیابون",

  // ---- achievements
  "First Score": "اولین شکار",
  "Collect your first spawn": "اولین غنیمتت رو بردار",
  Collector: "کلکسیونر",
  "Collect 25 spawns": "۲۵ غنیمت بردار",
  Hoarder: "انباردار",
  "Collect 250 spawns": "۲۵۰ غنیمت بردار",
  Safecracker: "گاوصندوق‌باز",
  "Crack 10 chests": "۱۰ صندوق رو باز کن",
  Wheelman: "رانندهٔ حرفه‌ای",
  "Finish 5 timed runs": "۵ مأموریت زمان‌دار رو تموم کن",
  "Night Owl": "جغد شب",
  "Collect something at night": "شب یه چیزی بردار",
  Explorer: "کاوشگر",
  "Collect in 10 different areas": "تو ۱۰ منطقهٔ مختلف غنیمت بردار",
  Courier: "پیک",
  "Deliver a real package": "یه بستهٔ واقعی تحویل بده",
  "Logistics Boss": "سلطان ترابری",
  "Deliver 10 real packages": "۱۰ بستهٔ واقعی تحویل بده",
  "Give a player a ride": "یه بازیکن رو برسون",
  "Road King": "شاه جاده",
  "Give 10 rides": "۱۰ مسافر برسون",
  Jackpot: "جکپات",
  "Win a lottery": "یه قرعه‌کشی رو ببر",
  "Have 5 friends": "۵ دوست داشته باش",
  "Showed Up": "حاضر!",
  "Check in at an event": "تو یه رویداد حضورت رو ثبت کن",
  Dedicated: "پای‌کار",
  "7-day login streak": "۷ روز پشت‌سرهم بیا",
  Graffiti: "گرافیتی",
  "Leave a message at a location": "یه پیام تو یه مکان بذار",
  "Street Photographer": "عکاس خیابونی",
  "Pin a photo to a real place": "یه عکس به یه جای واقعی سنجاق کن",
  "Local Legend": "اسطورهٔ محله",
  "Get 10 likes on one post": "برای یه پست ۱۰ لایک بگیر",
  "Claim Staker": "مدعی زمین",
  "Plant a flag": "یه پرچم بکار",
  "Flag Thief": "دزد پرچم",
  "Capture a rival's flag": "پرچم یه رقیب رو تصرف کن",
  "Bounty Hunter": "شکارچی جایزه",
  "Collect a bounty": "یه جایزهٔ سر بگیر",
  "First Blood": "اولین خون",
  "Down a rival commander in the street": "یه فرماندهٔ رقیب رو تو خیابون زمین‌گیر کن",
  Fortifier: "سنگرساز",
  "Build your first tower": "اولین برجت رو بساز",
  "Hold the Line": "خط رو نگه دار",
  "Stop a raider wave without a single leak": "یه موج غارتگر رو بدون حتی یه نفوذ متوقف کن",
  "Top Gun": "تاپ‌گان",
  Doomsday: "روز رستاخیز",
  "Fire your faction's superweapon": "ابرسلاح جناحت رو شلیک کن",
  Shopkeeper: "مغازه‌دار",
  "First Sale": "اولین فروش",
  "Hand over your first order": "اولین سفارشت رو تحویل بده",

  // ---- daily quests
  "Leave Your Mark": "ردت رو بذار",
  "Pin a message or photo somewhere": "یه پیام یا عکس یه جایی سنجاق کن",

  // ---- timed runs
  "Dead Drop": "صندوق مخفی",

  // ---- life sim
  Social: "معاشرت",

  // ---- towers, raiders, pings
  Drone: "پهپاد",

  // ---- ride status
  "🟡 Looking for a driver": "🟡 دنبال راننده",
  "🔵 Driver on the way": "🔵 راننده در راهه",
  "🟣 On the road": "🟣 در مسیر",
  "✅ Arrived": "✅ رسیدیم",
  "⚫ Cancelled": "⚫ لغو شد",
};

export default data;
