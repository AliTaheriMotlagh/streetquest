import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Installable app: opens straight into the game, full screen, with shortcuts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/play",
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/play?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#07070d",
    theme_color: "#07070d",
    lang: "en",
    categories: ["games", "travel", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Play", short_name: "Play", url: "/play?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Story missions", short_name: "Story", url: "/play?panel=play", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My base", short_name: "Base", url: "/play?panel=base", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    screenshots: [
      { src: "/screens/map.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: "Your city is the map" },
      { src: "/screens/beacon.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: "Story missions on real streets" },
      { src: "/screens/goals.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: "Weekly goals with your crew" },
    ],
  };
}
