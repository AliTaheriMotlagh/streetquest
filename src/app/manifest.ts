import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { dirOf } from "@/lib/i18n";
import { getT } from "@/server/i18n";

// Installable app: opens straight into the game, full screen, with shortcuts. Its words
// follow the language of the browser that asks for it (the language cookie).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, locale } = await getT();
  return {
    id: "/play",
    name: SITE.name,
    short_name: SITE.name,
    description: t(SITE.description),
    start_url: "/play?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#07070d",
    theme_color: "#07070d",
    lang: locale,
    dir: dirOf(locale),
    categories: ["games", "travel", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("Play"), short_name: t("Play"), url: "/play?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("Story missions"), short_name: t("Story"), url: "/play?panel=play", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("My base"), short_name: t("Base"), url: "/play?panel=base", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    screenshots: [
      { src: "/screens/map.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: t("Your city is the map") },
      { src: "/screens/beacon.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: t("Story missions on real streets") },
      { src: "/screens/goals.jpg", sizes: "540x960", type: "image/jpeg", form_factor: "narrow", label: t("Weekly goals with your crew") },
    ],
  };
}
