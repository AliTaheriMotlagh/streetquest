// Store menus, catalogs and prices from other sites — Snappfood, Torob, Divar
// (StoreInfo.tsx, server/localData.ts, the "Menus on the map" filter).
const local: Record<string, string> = {
  // ---- map filter
  "Menus on the map": "منوها روی نقشه",
  "Show all": "نشون دادن همه",
  "Hide all": "مخفی کردن همه",
  "Real menus and catalogs from Snappfood — tap a sign to see it.": "منو و کاتالوگ واقعی از اسنپ‌فود — روی تابلو بزن تا ببینی.",
  Restaurants: "رستوران‌ها",
  Cafés: "کافه‌ها",
  "Bakeries & sweets": "نانوایی و شیرینی",
  "Supermarkets & shops": "سوپرمارکت و فروشگاه",

  // ---- store card
  "Looking up the menu and prices…": "در حال پیدا کردن منو و قیمت‌ها…",
  "No online menu found for this place yet.": "هنوز منوی آنلاینی برای اینجا پیدا نشد.",
  Catalog: "کاتالوگ",
  "Search the menu": "جستجو توی منو",
  "Nothing matches": "چیزی پیدا نشد",
  "From Snappfood · updated {when}": "از اسنپ‌فود · به‌روزرسانی {when}",
  "Order on Snappfood": "سفارش از اسنپ‌فود",
  "Shop on Torob": "خرید از ترب",
  "See the ad on Divar": "دیدن آگهی در دیوار",
  "Prices on Torob": "قیمت‌ها در ترب",
  "Search a product's price": "قیمت یه کالا رو جستجو کن",
  "Nothing found on Torob": "توی ترب چیزی پیدا نشد",
  "{shop} on Torob": "{shop} در ترب",
  "{n} products": "{n} کالا",
  "In this store": "توی همین فروشگاه",
  "All of Torob": "همه‌ی ترب",
  "Search this store's products": "جستجو توی کالاهای همین فروشگاه",
  "from {n} toman": "از {n} تومان",
  "Out of stock": "ناموجود",
  "Couldn't load the menu — try again in a moment": "منو باز نشد — چند لحظه دیگه دوباره امتحان کن",
  "Shop not found": "مغازه پیدا نشد",

  // ---- owner forms
  "Your store on other sites": "فروشگاهت در سایت‌های دیگه",
  "Players see your real menu, prices and ad right on your store. Leave empty and we'll look for your Snappfood menu by name and location.":
    "بازیکن‌ها منوی واقعی، قیمت‌ها و آگهی‌ات رو همون‌جا روی فروشگاهت می‌بینن. خالی بذاری، منوی اسنپ‌فودت رو از روی اسم و مکان پیدا می‌کنیم.",
  "Snappfood menu link": "لینک منو در اسنپ‌فود",
  "Torob shop link": "لینک فروشگاه در ترب",
  "Divar ad link": "لینک آگهی در دیوار",
  "Paste your Snappfood menu link (snappfood.ir/…)": "لینک منوی اسنپ‌فودت رو بذار (snappfood.ir/…)",
  "Paste a link to your shop on torob.com": "لینک فروشگاهت در torob.com رو بذار",
  "Paste a link to your ad on divar.ir": "لینک آگهی‌ات در divar.ir رو بذار",

  // ---- admin settings
  "Menus & prices from Snappfood and Torob": "منو و قیمت از اسنپ‌فود و ترب",
  "Store cards show the real menu or catalog (Snappfood) and online prices (Torob), and the map can show Snappfood vendors. Owners can paste their own links.":
    "کارت فروشگاه‌ها منو یا کاتالوگ واقعی (اسنپ‌فود) و قیمت آنلاین (ترب) رو نشون می‌ده و نقشه می‌تونه فروشنده‌های اسنپ‌فود رو نشون بده. صاحب‌ها می‌تونن لینک خودشون رو بذارن.",
};

export default local;
