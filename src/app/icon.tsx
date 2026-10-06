import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ff2e88,#7a2bff)", borderRadius: 110, fontSize: 300 }}>
        📍
      </div>
    ),
    size,
  );
}
