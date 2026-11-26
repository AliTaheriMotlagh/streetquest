// A click on a house ad: counted, then on to the advertiser's link (only links checked when it was bought).
import { NextResponse } from "next/server";
import { clickAd } from "@/server/houseAds";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.slice(0, 40) ?? "";
  const url = id ? await clickAd(id).catch(() => null) : null;
  return NextResponse.redirect(new URL(url || "/", req.url), 302);
}
