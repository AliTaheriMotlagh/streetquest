import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE.name} — ${SITE.tagline}`;

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#07070d 40%,#3a0a2a)", color: "white" }}>
        <div style={{ fontSize: 40, color: "#22e3ff", fontWeight: 800 }}>{`📍 ${SITE.name.toUpperCase()}`}</div>
        <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.05, marginTop: 20 }}>Your city is</div>
        <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.05, color: "#ffd23f" }}>the game map.</div>
        <div style={{ fontSize: 32, color: "#b8b8cc", marginTop: 30 }}>Missions · Chests · Real deliveries · Live events</div>
      </div>
    ),
    size,
  );
}
