// The Hero screen (Hero.tsx): class, attributes, gear, campaign and command powers —
// and the commander's life: food, rest and hangouts (Life.tsx).
const hero: Record<string, string> = {
  // ---- class & attributes
  "Choose a class. It shapes how you fight in first person, how your army performs and how your economy runs. (Changing later costs {n} 🪙.)":
    "کلاس انتخاب کن. کلاس تعیین می‌کنه توی اول‌شخص چطور بجنگی، ارتشت چطور عمل کنه و اقتصادت چطور بچرخه. (بعداً عوض کردنش {n} 🪙 هزینه داره.)",
  Choose: "انتخاب",
  "⚡ Power": "⚡ قدرت",
  "Max HP": "حداکثر جان",
  "FPS weapon": "سلاح اول‌شخص",
  "📯 Active": "📯 فعال",
  Attributes: "ویژگی‌ها",
  "{n, plural, one {# point} other {# points}} to spend!": "{n} امتیاز برای خرج کردن داری!",
  "Reset all attribute points for {n} coins?": "امتیاز همهٔ ویژگی‌ها برای {n} سکه ریست بشه؟",
  Reset: "ریست",
  "↺ Respec": "↺ بازتوزیع",
  "{effect} per point": "{effect} به‌ازای هر امتیاز",

  // ---- equipment
  Equipment: "تجهیزات",
  "Open stash →": "باز کردن انبار ←",
  "🔫 Combat": "🔫 نبرد",
  "Health (street & FPS)": "جان (خیابون و اول‌شخص)",
  "Weapon damage": "آسیب سلاح",
  "Headshot bonus": "پاداش تیر به سر",
  "Street shot": "شلیک خیابونی",
  "{n} dmg": "{n} آسیب",
  "🎖️ Army": "🎖️ ارتش",
  "Vehicle armor": "زرهٔ وسیله‌نقلیه",
  "Fewer casualties": "تلفات کمتر",
  "💰 Economy": "💰 اقتصاد",
  "Income & tribute": "درآمد و خراج",
  "Raid loot": "غنیمت یورش",
  "XP gain": "افزایش تجربه",

  // ---- service record
  "📜 Service record": "📜 سابقهٔ خدمت",
  Walked: "پیاده‌روی",
  "Battles won · {pct}%": "نبردهای پیروز · {pct}٪",
  "FPS kills": "کشته در اول‌شخص",
  "Boss damage": "آسیب به غول",
  "Raiders stopped": "غارتگرهای دفع‌شده",
  "Items collected": "آیتم‌های جمع‌آوری‌شده",
  Troops: "نیروها",
  "Outposts held": "پاسگاه‌های تحت کنترل",
  "Flags held": "پرچم‌های تحت کنترل",
  Towers: "برج‌ها",
  "Story chapters": "فصل‌های داستان",
  "GPS games won": "بازی‌های GPS برده‌شده",
  Achievements: "دستاوردها",
  "Day streak": "رکورد روزهای پیاپی",
  "Research done": "تحقیقات انجام‌شده",
  "Days served": "روزهای خدمت",
  "All bonus sources (class + attributes + gear + research)": "همهٔ منابع پاداش (کلاس + ویژگی‌ها + تجهیزات + تحقیقات)",

  // ---- gear slots & stash
  "No weapon": "بدون سلاح",
  "No armor": "بدون زره",
  "No gadget": "بدون گجت",
  "🔫 Weapon": "🔫 سلاح",
  "🦺 Armor": "🦺 زره",
  "📻 Gadget": "📻 گجت",
  "🔩 {n} scrap": "🔩 {n} قراضه",
  "{n}/{max} in stash": "{n}/{max} توی انبار",
  Equipped: "تجهیز شده",
  "{slot} · {rarity}": "{slot} · {rarity}",
  "{dmg} dmg, {mag} rounds": "{dmg} آسیب، {mag} گلوله",
  Unequip: "درآوردن",
  Equip: "تجهیز کن",
  "🔨 Forge {scrap}🔩 {coins}🪙": "🔨 ارتقا {scrap}🔩 {coins}🪙",
  "Salvage {item} for scrap?": "{item} رو برای گرفتن قراضه خرد کنی؟",
  Salvage: "خرد کردن",
  "No gear yet. Loot drops from chests, derricks, outposts, raids, boss kills and quests.":
    "هنوز تجهیزاتی نداری. غنیمت از صندوق‌ها، دکل‌ها، پاسگاه‌ها، یورش‌ها، کشتن غول‌ها و مأموریت‌ها پیدا می‌شه.",

  // ---- campaign & daily orders
  "Reward: {xp} XP · {coins} 🪙 · {gems} 💎": "جایزه: {xp} تجربه · {coins} 🪙 · {gems} 💎",
  "📜 Campaign · chapter {n}": "📜 داستان · فصل {n}",
  "Campaign complete — you're a legend. Daily orders keep coming.": "داستان تموم شد — تو یه افسانه‌ای! دستورهای روزانه هم همچنان میان.",
  "🗓️ Daily orders (reset at your midnight)": "🗓️ دستورهای روزانه (نیمه‌شب خودت ریست می‌شن)",

  // ---- command powers
  "Each hero level earns a ⭐ Command Point. Spend them to unlock and rank up General's Powers.":
    "هر سطح قهرمان یه ⭐ امتیاز فرماندهی می‌ده. باهاشون قدرت‌های سردار رو باز کن و ارتقا بده.",
  "You have": "امتیاز فرماندهی‌ت الان:",
  "Targeted powers are used from a base, outpost or boss card on the map.": "قدرت‌های هدفمند از کارت پایگاه، پاسگاه یا غول روی نقشه استفاده می‌شن.",
  "Tier {n}": "رده {n}",
  "Rank {n}": "رتبهٔ {n}",
  "Hero level {n}": "سطح قهرمان {n}",
  "Rank up": "ارتقای رتبه",
  Unlock: "باز کردن",
  Use: "استفاده",
  "Ready · on map": "آماده · روی نقشه",

  // ---- Life: food, rest and hangouts
  "Mood: {mood}": "حال: {mood}",
  "mood {n}": "حال {n}",
  "XP ×{xp} · combat HP ×{hp}": "تجربه ×{xp} · جان نبرد ×{hp}",
  "−{n}/h": "−{n}/ساعت",
  Eat: "غذا خوردن",
  "🍲 Mess hall · {n} 🪙": "🍲 آشپزخانهٔ پایگاه · {n} 🪙",
  "No food in your bag — 🍩🍔🥫 spawn around the city.": "توی کیفت غذا نداری — 🍩🍔🥫 توی شهر پیدا می‌شن.",
  Rest: "استراحت",
  "Rested — {n} min": "استراحت کردی — {n} دقیقه",
  "Sleep at base": "خوابیدن توی پایگاه",
  "Plant a base first.": "اول یه پایگاه بساز.",
  "Home is {d} away.": "خونه {d} دوره.",
  "Hang out (players within 150 m)": "دورهمی (بازیکن‌های تا ۱۵۰ متری)",
  "Nobody close by right now. Chatting with your crew also helps a little.": "الان کسی نزدیکت نیست. گپ زدن با اکیپت هم کمی کمک می‌کنه.",
  "Next hangout in {n} min.": "دورهمی بعدی تا {n} دقیقهٔ دیگه.",
};

export default hero;
