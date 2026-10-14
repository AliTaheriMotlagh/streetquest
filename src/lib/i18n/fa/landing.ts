// The home page for visitors who aren't logged in yet (src/app/page.tsx): what the game is,
// the features, the FAQ and the call to action. Written to sell the game, not to explain it.
const landing: Record<string, string> = {
  // ---- features
  "Build a base on your street": "پایگاهت رو تو خیابون خودت بساز",
  "Pick a faction, plant your base where you really are, then build power, supply lines, barracks, factories and turrets on real timers.":
    "جناحت رو انتخاب کن، پایگاهت رو همون‌جایی بساز که واقعاً هستی، بعد با تایمرهای واقعی برق، خطوط تدارکات، پادگان، کارخونه و برج‌های دفاعی بساز.",
  "Command an army": "ارتش فرماندهی کن",
  "Train rangers, tanks, artillery and jets. Capture oil derricks in person and siege rival bases up to 5 km away.": "رنجر، تانک، توپخانه و جت آموزش بده. دکل‌های نفت رو حضوری تصرف کن و پایگاه‌های رقیب رو تا ۵ کیلومتری محاصره کن.",
  "Drop into first person": "وارد اول‌شخص شو",
  "Walk up to an enemy base while players are online and the fight turns into a live FPS breach — capture their Command Center.":
    "وقتی بازیکن‌ها آنلاین‌ان، به پایگاه دشمن نزدیک شو تا درگیری تبدیل بشه به نفوذ زندهٔ اول‌شخص — مقر فرماندهی‌شون رو تصرف کن.",
  "World bosses": "غول‌های جهانی",
  "Mechs and warlords roam the map with shared HP. Raid them in first person with your crew or bombard them with your army.":
    "ربات‌های جنگی و جنگ‌سالارها با جان مشترک توی نقشه می‌گردن. با اکیپت اول‌شخص بهشون یورش ببر یا با ارتشت بمبارونشون کن.",
  "A life to look after": "یه زندگی که باید مراقبش باشی",
  "Your commander gets hungry, tired and lonely. Eat, sleep at base and hang out with nearby players — a good mood means more XP.":
    "فرماندهت گرسنه، خسته و تنها می‌شه. غذا بخور، توی پایگاه بخواب و با بازیکن‌های نزدیک دورهمی کن — حال خوب یعنی تجربهٔ بیشتر.",
  "Your streets, your map": "خیابون‌های تو، نقشهٔ تو",
  "Real GPS, real places. Missions, items and chests spawn around you wherever you are on Earth.": "GPS واقعی، جاهای واقعی. مأموریت، آیتم و صندوق هرجا روی زمین که باشی دورت پیدا می‌شن.",
  "GTA-style timed runs": "مأموریت‌های زمان‌دار به سبک GTA",
  "Getaways, street races and dead drops — reach the target before the clock hits zero.": "فرار، مسابقهٔ خیابونی و تحویل مخفی — قبل از صفر شدن ساعت به هدف برس.",
  "Chests & mini-games": "صندوق‌ها و مینی‌گیم‌ها",
  "Crack locks, win arcade challenges and score rare loot — some only appear at night.": "قفل‌ها رو باز کن، چالش‌های آرکید رو ببر و غنیمت‌های کمیاب بگیر — بعضی‌هاشون فقط شب پیدا می‌شن.",
  "Real package deliveries": "تحویل بسته‌های واقعی",
  "Players post real delivery requests. Carry them across town, hand over with a secret code, get paid.": "بازیکن‌ها درخواست تحویل واقعی می‌ذارن. بسته‌ها رو توی شهر ببر، با کد مخفی تحویل بده و پولت رو بگیر.",
  "Messages at places": "پیام‌ها توی مکان‌ها",
  "Leave notes pinned to real locations. Only people who physically show up can read them.": "یادداشت‌ها رو به مکان‌های واقعی سنجاق کن. فقط کسانی که واقعاً اونجا حاضر بشن می‌تونن بخونن.",
  "Crews & live events": "اکیپ‌ها و رویدادهای زنده",
  "Add friends, see who's online, chat, and set up group quests with squad XP bonuses.": "دوست اضافه کن، ببین کی آنلاینه، گپ بزن و مأموریت گروهی با پاداش تجربهٔ جوخه راه بنداز.",
  "Time matters": "زمان مهمه",
  "Day, dusk and night change what spawns. Golden hour doubles XP — wherever your timezone is.": "روز، غروب و شب چیزهایی که پیدا می‌شن رو عوض می‌کنن. ساعت طلایی تجربه رو دوبرابر می‌کنه — هرجا که منطقهٔ زمانی‌ت باشه.",
  "Levels, streaks, ranks": "سطح، رکورد روزهای پیاپی، رتبه",
  "Level up from Rookie to Street Legend, keep daily streaks and climb global and crew leaderboards.": "از تازه‌کار تا اسطورهٔ خیابون سطح بگیر، رکورد روزهای پیاپی نگه دار و توی جدول جهانی و جدول اکیپ بالا برو.",

  // ---- FAQ
  "Is StreetQuest free?": "آیا StreetQuest رایگانه؟",
  "Does it work in my city?": "آیا توی شهر من هم کار می‌کنه؟",
  "How do real package deliveries work?": "تحویل بسته‌های واقعی چطور کار می‌کنه؟",
  "Is my location shared?": "آیا موقعیتم با بقیه به اشتراک گذاشته می‌شه؟",
  "How is this different from Pokémon GO?": "این بازی با Pokémon GO چه فرقی داره؟",
  "When does a fight turn first-person?": "کی نبرد به حالت اول‌شخص تبدیل می‌شه؟",
  "Yes. StreetQuest is free to play in any modern mobile browser — no app store download needed. You can add it to your home screen like an app.":
    "بله. StreetQuest توی هر مرورگر موبایل مدرنی رایگانه — نیازی به دانلود از فروشگاه نیست. مثل یه برنامه می‌تونی توی صفحهٔ اصلی گوشی‌ت بذاریش.",
  "Yes. The world is generated from GPS coordinates, so missions and items spawn everywhere on Earth, from big cities to small towns.":
    "بله. دنیای بازی از مختصات GPS ساخته می‌شه، پس مأموریت‌ها و آیتم‌ها هرجای زمین پیدا می‌شن، از شهرهای بزرگ تا روستاهای کوچیک.",
  "A player posts a request with pickup and drop-off points and a coin reward held in escrow. A courier accepts, checks in at the pickup with GPS, and completes the delivery by entering a secret handover code the recipient receives from the sender.":
    "بازیکن یه درخواست با نقطهٔ تحویل گرفتن و تحویل دادن و جایزهٔ سکه ثبت می‌کنه که امانت نگه داشته می‌شه. پیک قبولش می‌کنه، با GPS توی نقطهٔ تحویل گرفتن ثبت حضور می‌کنه و با وارد کردن کد مخفی تحویل که گیرنده از فرستنده می‌گیره، تحویل رو کامل می‌کنه.",
  "Only friends see your precise position while you are online. Other players see an approximate location, and you can stop sharing anytime by closing the game.":
    "وقتی آنلاینی، فقط دوستات موقعیت دقیقت رو می‌بینن. بقیهٔ بازیکن‌ها موقعیت تقریبی می‌بینن و هر وقت بخوای با بستن بازی می‌تونی اشتراک موقعیت رو قطع کنی.",
  "StreetQuest is a strategy war game on real streets: you build a base, train an army and siege rivals, fight live first-person battles when players meet near a base, raid world bosses together, and keep your commander fed, rested and happy.":
    "StreetQuest یه بازی جنگی راهبردی توی خیابون‌های واقعیه: پایگاه می‌سازی، ارتش آموزش می‌دی و رقبا رو محاصره می‌کنی، وقتی بازیکن‌ها نزدیک پایگاه همدیگه رو ببینن نبرد زندهٔ اول‌شخص راه می‌افته، با هم به غول‌های جهانی یورش می‌برید و فرماندهت رو سیر، استراحت‌کرده و خوشحال نگه می‌داری.",
  "When you're within 200 m of an enemy base or a boss and other players are online nearby. Otherwise battles are auto-resolved with your army, Generals-style.":
    "وقتی تا ۲۰۰ متری پایگاه دشمن یا یه غول باشی و بازیکن‌های دیگه‌ای هم نزدیک آنلاین باشن. وگرنه نبردها با ارتشت خودکار حل می‌شن، مثل بازی Generals.",

  // ---- how it works
  "Open the map": "نقشه رو باز کن",
  "Allow location. The world around you fills with loot, chests, runs and players.": "موقعیت رو مجاز کن. دنیای دورت پر می‌شه از غنیمت، صندوق، مأموریت و بازیکن.",
  "Walk there": "برو اونجا",
  "Get within 40 m to interact. Crack locks, play mini-games, race the clock.": "برای تعامل، تا ۴۰ متری برو. قفل‌ها رو باز کن، مینی‌گیم بازی کن و با ساعت مسابقه بده.",
  "Level up together": "با هم سطح بگیرید",
  "Add friends, chat, join events and climb the leaderboards.": "دوست اضافه کن، گپ بزن، توی رویدادها شرکت کن و جدول‌ها رو بالا ببر.",

  // ---- hero & closing
  "Real-world GPS war game": "بازی جنگی GPS در دنیای واقعی",
  "Your city is": "شهرت می‌شه",
  "the game map.": "نقشهٔ بازی.",
  "Build a base on your actual street, train an army and siege your rivals. Get close while they're online and it turns into a first-person firefight. Hunt world bosses with your crew, and keep your commander fed, rested and happy.":
    "توی خیابون واقعی‌ت پایگاه بساز، ارتش آموزش بده و رقباتو محاصره کن. وقتی آنلاین‌ان نزدیک‌شون شو تا تبدیل بشه به تیراندازی اول‌شخص. با اکیپت دنبال غول‌های جهانی برو و فرماندهت رو سیر، استراحت‌کرده و خوشحال نگه دار.",
  "▶ Play now — no sign-up": "▶ همین حالا بازی کن — بدون ثبت‌نام",
  "Browse events": "رویدادها رو ببین",
  "{n, plural, one {# player} other {# players}}": "{n} بازیکن",
  "{n} live & upcoming events": "{n} رویداد زنده و در پیش",
  "Works in your browser": "توی مرورگرت کار می‌کنه",
  "StreetQuest gameplay trailer": "تریلر گیم‌پلی StreetQuest",
  Features: "امکانات",
  "How it works": "چطور کار می‌کنه",
  FAQ: "پرسش‌های متداول",
  "The streets are waiting.": "خیابون‌ها منتظرن.",
  "Create your player": "بازیکنت رو بساز",
  "Play safe: stay aware of your surroundings, respect private property and traffic laws.": "با احتیاط بازی کن: مراقب اطرافت باش، به ملک خصوصی و قوانین رانندگی احترام بذار.",
  "Missions · Chests · Real deliveries · Live events": "مأموریت · صندوق · تحویل واقعی · رویدادهای زنده",
};

export default landing;
