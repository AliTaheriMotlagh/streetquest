import type { Metadata } from "next";
import Game from "@/components/game/Game";

export const metadata: Metadata = { title: "Play", robots: { index: false } };

export default function PlayPage() {
  return <Game />;
}
