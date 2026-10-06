// Marketing attribution: remember ?ref= and UTM params for 30 days so they can
// be credited at signup, and gate private areas behind a session cookie.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { searchParams, pathname } = req.nextUrl;
  if ((pathname.startsWith("/play") || pathname.startsWith("/admin")) && !req.cookies.get("sq_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
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

export const config = { matcher: ["/((?!api|_next|rt|.*\\..*).*)"] };
