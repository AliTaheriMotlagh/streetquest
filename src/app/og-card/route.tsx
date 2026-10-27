// The link-preview card (og:image). Crawlers send no language cookie, so each page points
// here with its own ?lang=. Persian is a picture rendered once from the Vazirmatn font
// (public/og/fa.png): the built-in renderer can't shape Persian text. English is drawn here.
import { ImageResponse } from "next/og";
import { msg } from "@/lib/i18n";
import { SITE } from "@/lib/site";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("lang") === "fa") return Response.redirect(new URL("/og/fa.png", req.url), 302);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#0b0e14 40%,#3a2a0e)", color: "white" }}>
        <div style={{ fontSize: 40, color: "#63b3f2", fontWeight: 800 }}>{`📍 ${SITE.name.toUpperCase()}`}</div>
        <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.05, marginTop: 20 }}>{msg("Your city is")}</div>
        <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.05, color: "#f0c05a" }}>{msg("the game map.")}</div>
        <div style={{ fontSize: 32, color: "#b8b8cc", marginTop: 30 }}>{msg("Missions · Chests · Real deliveries · Live events")}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
