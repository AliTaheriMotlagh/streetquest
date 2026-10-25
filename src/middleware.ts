// Marketing attribution: remember ?ref= and UTM params for 30 days so they can be
// credited when the visitor's guest account is created. There is no login gate.
// Language: ?lang=fa|en picks the language for this page and remembers it (links
// shared in Persian open in Persian; search engines index both versions).
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, LOCALE_HEADER } from "@/lib/i18n";

export function middleware(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang");
  let res: NextResponse;
  if (isLocale(lang)) {
    const headers = new Headers(req.headers);
    headers.set(LOCALE_HEADER, lang);
    res = NextResponse.next({ request: { headers } });
    res.cookies.set(LOCALE_COOKIE, lang, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  } else res = NextResponse.next();
  const opts = { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax" as const };
  const ref = searchParams.get("ref");
  if (ref) res.cookies.set("sq_ref", ref.slice(0, 32), opts);
  const utm = {
    source: searchParams.get("utm_source"),
    medium: searchParams.get("utm_medium"),
    campaign: searchParams.get("utm_campaign"),
  };
  if (utm.source || utm.campaign) res.cookies.set("sq_utm", JSON.stringify(utm).slice(0, 300), opts);
  return res;
}

export const config = { matcher: ["/((?!api|_next|rt|shop-img|post-img|fonts|.*\\..*).*)"] };
