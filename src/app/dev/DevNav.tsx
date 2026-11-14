"use client";
// The bar over every developer tool: where you are, and the way to the others.
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dev/voices", label: "🗣️ Voices" },
  { href: "/dev/sounds", label: "🔊 Sounds" },
  { href: "/developers", label: "🔑 Data API" },
  { href: "/play", label: "🎮 Back to the game" },
];

export function DevNav() {
  const path = usePathname();
  return (
    <header className="dev-top">
      <span className="brand">StreetQuest · dev</span>
      <nav aria-label="Developer tools">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</a>
        ))}
      </nav>
    </header>
  );
}
