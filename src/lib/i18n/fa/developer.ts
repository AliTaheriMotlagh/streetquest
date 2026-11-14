// The Developer screen (/developers) and its key API (api/developer/route.ts).
const developer: Record<string, string> = {
  Developers: "توسعه‌دهنده‌ها",
  "A read-only data API for other apps: the stores, deals, cinemas, ads and products StreetQuest knows. It answers from our cache, with each source credited.":
    "یک API فقط‌خواندنی برای برنامه‌های دیگر: فروشگاه‌ها، تخفیف‌ها، سینماها، آگهی‌ها و کالاهایی که استریت‌کوئست می‌شناسد. جواب را از حافظهٔ خودمان می‌دهد و منبع هر داده را ذکر می‌کند.",
  "Your API keys": "کلیدهای API تو",
  "What is it for? (optional)": "برای چی می‌خواهی؟ (اختیاری)",
  "Make a key": "ساخت کلید",
  "Copy your key now — it won't be shown again.": "کلیدت را همین حالا کپی کن — دیگر نشان داده نمی‌شود.",
  "Everyone's keys (admin)": "کلیدهای همه (مدیر)",
  "No keys yet.": "هنوز کلیدی نداری.",
  "{n} requests, {limit}/min": "{n} درخواست، {limit} در دقیقه",
  Revoked: "باطل‌شده",
  Revoke: "باطل کردن",
  Limit: "سقف",
  "Requests per minute": "درخواست در دقیقه",
  "You already have {n} active keys — revoke one first": "همین حالا {n} کلید فعال داری — اول یکی را باطل کن",
  "How to call it": "طرز استفاده",
  "Each key may make 60 requests a minute; over that you get a 429 with Retry-After. Only GET is allowed, from any origin.":
    "هر کلید در دقیقه ۶۰ درخواست می‌تواند بزند؛ بیشتر از آن خطای ۴۲۹ با Retry-After می‌گیری. فقط GET مجاز است، از هر مبدأیی.",
  "Sources and licences": "منابع و مجوزها",
};
export default developer;
