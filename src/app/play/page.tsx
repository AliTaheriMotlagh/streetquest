import type { Metadata, Viewport } from "next";
import Game from "@/components/game/Game";

export const metadata: Metadata = { title: "Play", robots: { index: false } };
// The map handles pinch-zoom itself; page zoom would fight it. Marketing pages stay zoomable.
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

export default function PlayPage() {
  return <Game />;
}
