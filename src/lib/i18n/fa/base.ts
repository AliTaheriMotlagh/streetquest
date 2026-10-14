// Your base: planting it, buildings, units, research, outposts, raider defense and
// squads (BasePanel.tsx, Defense.tsx).
const base: Record<string, string> = {
  // ---- battle types & times
  "{m}m {s}s": "{m} د {s} ث",
  "{s}s": "{s} ث",
  "Superweapon strike": "حملهٔ ابرسلاح",
  Raid: "یورش",
  "Derrick raid": "یورش به دکل نفت",
  Bombarded: "بمباران‌شده",
  "Boss raid (FPS)": "یورش به غول (اول‌شخص)",
  "Outpost assault": "حمله به پاسگاه",
  Skirmish: "درگیری کوچک",
  "Raider wave": "موج غارتگران",

  // ---- choosing a side & planting the base
  "Choose your side": "طرفت رو انتخاب کن",
  "Your faction shapes your army. Build a base on a real street, train an army, take derricks and outposts, raid rivals for stars and trophies — and when they're online nearby, fight it out in first person.":
    "جناحت شکل ارتشت رو تعیین می‌کنه. یه پایگاه تو یه خیابون واقعی بساز، ارتش آموزش بده، دکل‌ها و پاسگاه‌ها رو تصرف کن، برای ستاره و جام به رقبا یورش ببر — و وقتی نزدیکن و آنلاینن، اول‌شخص تا آخرش بجنگ.",
  "ATK ×{atk} · HP ×{hp} · cost ×{cost}": "حمله ×{atk} · جان ×{hp} · هزینه ×{cost}",
  "no power grid": "بدون شبکهٔ برق",
  "Plant your base": "پایگاهت رو بساز",
  "Your base goes exactly where you're standing. Pick somewhere you visit often — you rest and eat there, and rivals have to come to it in person to breach it.":
    "پایگاهت دقیقاً همون‌جایی ساخته می‌شه که وایستادی. جایی رو انتخاب کن که زیاد می‌ری — اونجا استراحت و غذا می‌خوری و رقبا باید خودشون بیان اونجا تا نفوذ کنن.",
  "Base name": "اسم پایگاه",
  "Fort Midnight": "قلعهٔ نیمه‌شب",
  "🏛️ Establish base here": "🏛️ همین‌جا پایگاه بساز",

  // ---- status line
  "Trophies & league": "جام‌ها و لیگ",
  "Scrap (from salvaged gear)": "قراضه (از تجهیزات خرد‌شده)",
  "Builders busy / total": "بنّاهای مشغول / کل",
  "Army Camp housing": "ظرفیت اردوگاه ارتش",
  Power: "برق",
  "Low power!": "برق کم!",
  "No grid": "بدون شبکه",
  "Coins safe": "سکه‌های در امان",
  "📦 Collect {n} 🪙": "📦 برداشتن {n} 🪙",
  "🔧 Repair ({n} 🪙)": "🔧 تعمیر ({n} 🪙)",
  "🛡️ Shield {time}": "🛡️ سپر {time}",
  "🏠 You're home": "🏠 اینجا خونه‌ته",

  // ---- tabs
  Buildings: "ساختمان‌ها",
  "🗼 Defense": "🗼 دفاع",
  "Army ({n})": "ارتش ({n})",
  Research: "تحقیقات",
  Territory: "قلمرو",
  Reports: "گزارش‌ها",

  // ---- buildings
  "🚧 Building Lv {n} · {time}": "🚧 در حال ساخت سطح {n} · {time}",
  "HQ {n}": "ستاد {n}",
  MAX: "حداکثر",
  "HQ ↑": "ستاد ↑",
  Build: "ساخت",
  "All builders busy — rush with 💎 or build a Builder's Hut.": "همهٔ بنّاها مشغولن — با 💎 تسریع کن یا یه کلبهٔ بنّا بساز.",
  "{n, plural, one {# builder} other {# builders}} free.": "{n} بنّا آزاد.",
  "Keep power positive or everything slows down.": "برق کافی داشته باش وگرنه همه‌چی کند می‌شه.",
  "Move {name} to where you're standing for {n} coins?": "{name} رو برای {n} سکه به جایی که وایستادی منتقل کنم؟",
  "Move base": "جابه‌جایی پایگاه",
  "🚚 Move base here ({n} 🪙)": "🚚 پایگاه رو همین‌جا ببر ({n} 🪙)",

  // ---- units & training
  Units: "یگان‌ها",
  "+{n} training": "+{n} در حال آموزش",
  "Strong vs {good} · weak vs {bad}": "قوی در برابر {good} · ضعیف در برابر {bad}",
  "ATK {atk} · HP {hp}": "حمله {atk} · جان {hp}",
  "Needs {building} Lv {n}": "نیاز به {building} سطح {n}",
  "Training queue": "صف آموزش",
  "next {a} · all {b}": "بعدی {a} · همه {b}",
  "Counters matter: Rangers shred infantry, Rockets kill tanks and jets, Artillery wrecks bases. Units that survive battles rank up ⭐ (Veteran → Elite → Heroic). New recruits dilute a stack's rank.":
    "نقش‌ها مهمن: رنجرها پیاده‌نظام رو خرد می‌کنن، موشک‌ها تانک و جت رو از پا درمیارن، توپخانه پایگاه‌ها رو ویران می‌کنه. یگان‌هایی که از نبرد زنده بیرون میان ⭐ ارتقا می‌گیرن (کهنه‌کار ← نخبه ← قهرمان). نیروی تازه‌وارد رتبهٔ دسته رو پایین میاره.",

  // ---- research
  "Research costs coins and 🔩 scrap (salvage gear in Hero → Gear). One project at a time.":
    "تحقیقات سکه و 🔩 قراضه هزینه داره (تجهیزات رو از قهرمان ← تجهیزات خرد کن). هر بار فقط یه پروژه می‌شه.",
  "✓ Done": "✓ تمام",

  // ---- outposts & faction war
  "🚩 Your outposts ({n})": "🚩 پاسگاه‌های تو ({n})",
  "Collect {n} 🪙": "برداشتن {n} 🪙",
  "no garrison!": "بدون پادگان!",
  "Tap a 🏴 outpost on the map and assault it with your army. Held outposts pay tribute every hour — garrison them or rivals will take them.":
    "روی یه پاسگاه 🏴 روی نقشه بزن و با ارتشت بهش حمله کن. پاسگاه‌های تحت کنترلت هر ساعت خراج می‌دن — پادگان بذار وگرنه رقبا می‌گیرنشون.",
  "Faction war": "جنگ جناح‌ها",
  "{n, plural, one {# outpost} other {# outposts}}": "{n} پاسگاه",
  "Held off {name}": "دفع حملهٔ {name}",
  "Raided by {name}": "مورد یورش {name}",
  "Send your army for revenge on {name}?": "ارتشت رو برای انتقام از {name} بفرستم؟",
  "⚔️ Revenge": "⚔️ انتقام",
  "No battles yet.": "هنوز نبردی نداشتی.",

  // ---- Defense: raider waves
  tower: "برج",
  squad: "جوخه",
  base: "پایگاه",
  outpost: "پاسگاه",
  "🏴‍☠️ Raider waves": "🏴‍☠️ موج‌های غارتگر",
  "Quiet for now. Raiders show up every hour or two.": "فعلاً آرومه. غارتگرها هر یک یا دو ساعت یه بار می‌آن.",
  "Raiders start hitting bases at Command Center level 2. Provoke them early for bounties.":
    "غارتگرها از سطح ۲ مقر فرماندهی به پایگاه‌ها حمله می‌کنن. برای گرفتن جایزه، زودتر تحریکشون کن.",
  "Next wave in {time}": "موج بعدی تا {time}",
  "provoked ×1.5 bounty": "تحریک‌شده، جایزه ×۱٫۵",
  "⚠️ Wave in progress! {time} left": "⚠️ موج در جریانه! {time} مونده",
  "Provoke a raider wave against your base in 60 s? Bounties ×1.5, but leaked raiders still steal coins.":
    "تو ۶۰ ثانیه یه موج غارتگر به پایگاهت تحریک کنم؟ جایزه‌ها ×۱٫۵ می‌شه، ولی غارتگرهایی که رد می‌شن هنوز سکه می‌دزدن.",
  Provoke: "تحریک",
  "📯 Provoke": "📯 تحریک",
  "Raiders march in from 550 m out. Towers, guard squads and your base turrets shoot them — your crew's too. Be within 400 m of the base to call in ✈️ airstrikes. Leakers steal coins (the 🏦 Vault protects some).":
    "غارتگرها از ۵۵۰ متری راه می‌افتن. برج‌ها، جوخه‌های نگهبان و توپ‌های پایگاه بهشون شلیک می‌کنن — اکیپت هم همین‌طور. برای فراخوانی ✈️ بمباران هوایی باید تا ۴۰۰ متری پایگاه باشی. کسانی که رد می‌شن سکه می‌دزدن (🏦 گاوصندوق بعضیا رو نگه می‌داره).",

  // ---- Defense: towers
  "🗼 Towers ({n}/{max})": "🗼 برج‌ها ({n}/{max})",
  "📍 {d} from base — you can build here": "📍 {d} تا پایگاه — اینجا می‌تونی بسازی",
  "Walk within {n} km of your base to build": "برای ساختن، تا {n} کیلومتری پایگاهت برو",
  "{n} dps": "{n} آسیب/ثانیه",
  "Towers go up exactly where you stand. They shoot any rival commander who walks into range (players below level 3 are spared) and every raider that passes. 🔫 shreds raiders on foot, 💣 kills technicals, 🚀 swats drones, 🎯 punishes players.":
    "برج‌ها دقیقاً همون‌جایی بالا میان که وایستادی. به هر فرماندهٔ رقیبی که وارد برد بشه شلیک می‌کنن (بازیکن‌های زیر سطح ۳ بخشیده می‌شن) و به هر غارتگری که رد بشه. 🔫 غارتگرهای پیاده رو خرد می‌کنه، 💣 وانت‌های مسلح رو نابود می‌کنه، 🚀 پهپادها رو می‌زنه، 🎯 بازیکن‌ها رو تنبیه می‌کنه.",
  "{hp}/{max} HP · range {r} m · {dps} dps": "جان {hp}/{max} · برد {r} متر · {dps} آسیب/ثانیه",
  "Demolish this {tower}? You get 30% back.": "این {tower} رو تخریب کنم؟ ۳۰٪ هزینه‌اش برمی‌گرده.",
  Demolish: "تخریب",

  // ---- Defense: field squads
  "🎖️ Field squads ({n}/{max})": "🎖️ جوخه‌های میدانی ({n}/{max})",
  "At home:": "توی پایگاه:",
  nobody: "هیچ‌کس",
  "Attacking a {target}": "حمله به {target}",
  Moving: "در حال حرکت",
  "arrives in {time}": "تا {time} می‌رسه",
  "Guarding · {d} from base": "نگهبانی · {d} تا پایگاه",
  "📍 Move": "📍 جابه‌جایی",
  "↩️ Recall": "↩️ فراخوانی",
  "Deploy a squad": "یه جوخه اعزام کن",
  "(all units at home)": "(همهٔ یگان‌ها توی پایگاه)",
  "🛡️ Guard where I stand": "🛡️ همین‌جا نگهبانی بده",
  "Tap where the squad should take position": "روی جایی که جوخه باید مستقر بشه بزن",
  "📍 Guard a spot": "📍 نگهبانی یه نقطه",
  "Squads march at their slowest unit (🚶 3 m/s · 🚙 8 m/s · ✈️ 25 m/s) and everyone sees them on the map. Guards shoot rival commanders within {r} m, defend against raiders and reinforce nearby bases and outposts.":
    "جوخه‌ها با کندترین یگانشون حرکت می‌کنن (🚶 ۳ متر بر ثانیه · 🚙 ۸ · ✈️ ۲۵) و همه روی نقشه می‌بینن‌شون. نگهبان‌ها فرماندهان رقیب رو تا {r} متری می‌زنن، از غارتگرها دفاع می‌کنن و به پایگاه‌ها و پاسگاه‌های نزدیک کمک می‌رسونن.",
  "To attack, tap an enemy 🗼 tower, squad, 🏰 base or 🚩 outpost on the map →":
    "برای حمله، روی یه 🗼 برج، جوخه، 🏰 پایگاه یا 🚩 پاسگاه دشمن روی نقشه بزن ←",
  "Train units in the Army tab, then deploy them onto the map.": "یگان‌ها رو توی تب ارتش آموزش بده، بعد روی نقشه اعزامشون کن.",
};

export default base;
